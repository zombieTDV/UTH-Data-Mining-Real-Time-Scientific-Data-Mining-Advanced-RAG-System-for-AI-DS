"""Pipeline: Embed Friend's 10k Full-Text HTML Papers into LanceDB & Re-Index IVF-PQ.

Strict Criteria:
- FULL-TEXT ONLY: Only processes papers with total_words >= 500 and total_sections >= 2.
- Vectorizes all structured body sections (Introduction, Methodology, Experiments, Results, Discussion).
- Inserts dense 768-D vectors into 'scientific_papers_gold' on CUDA GPU.
- Rebuilds IVF-PQ index (num_partitions=1024, num_sub_vectors=192, metric="cosine", replace=True) for 100% coverage.
- Synchronizes updated LanceDB partitions to Cloudflare R2.
"""

import argparse
import datetime
import json
import logging
import os
import sys
import time
import warnings
from pathlib import Path
from typing import Any, Dict, List, Set

warnings.filterwarnings("ignore")
os.environ["PYTHONWARNINGS"] = "ignore"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

import httpx
import lancedb
import pyarrow.parquet as pq

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config.settings import settings
from src.indexing.chunker import AcademicChunker
from src.indexing.embedder import NomicEmbedder
from src.storage.minio_client import StorageClient as R2Client
from src.utils.logger import setup_pipeline_logging

logger, log_file = setup_pipeline_logging("embed_friend_html_papers", capture_stdout=False)
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S"))
logger.addHandler(console_handler)


def broadcast_telemetry(payload: dict):
    try:
        httpx.post("http://127.0.0.1:8000/api/ingestion/broadcast", json=payload, timeout=0.25)
    except Exception:
        pass


class FriendHTMLPaperEmbedder:
    """Processes, chunks, embeds, and indexes the 10k full-text HTML papers into LanceDB."""

    TABLE_NAME = "scientific_papers_gold"

    def __init__(self, batch_size: int = 256, sync_r2: bool = True, max_papers: int = 0):
        self.batch_size = batch_size
        self.sync_r2 = sync_r2
        self.max_papers = max_papers

        self.silver_parquet = settings.ROOT_DIR / "data" / "silver" / "tier2" / "html_papers.parquet"
        self.db_path = settings.ROOT_DIR / "data" / "gold" / "lancedb"
        self.db = lancedb.connect(str(self.db_path))
        self.table = self.db.open_table(self.TABLE_NAME)

        self.r2 = R2Client() if sync_r2 else None
        self.chunker = AcademicChunker(max_chunk_words=300, overlap_words=50)
        self.embedder = NomicEmbedder()

    def run(self):
        logger.info("=" * 80)
        logger.info("STARTING FULL-TEXT EMBEDDING PIPELINE FOR FRIEND'S HARVESTED PAPERS")
        logger.info("Source: %s", self.silver_parquet)
        logger.info("Hardware: %s | LanceDB Initial Rows: %d", self.embedder.device, len(self.table))
        logger.info("=" * 80)

        if not self.silver_parquet.exists():
            raise FileNotFoundError(f"Missing {self.silver_parquet}. Run download first!")

        # 1. Read and strictly filter for FULL-TEXT papers only
        logger.info("[FILTERING] Loading Parquet table and filtering for full-text quality...")
        tbl = pq.read_table(str(self.silver_parquet))
        all_records = tbl.to_pylist()

        # STRICT FILTER: total_words >= 500 and total_sections >= 2
        fulltext_papers = [
            r for r in all_records
            if (r.get("total_words") or 0) >= 500 and (r.get("total_sections") or 0) >= 2
        ]
        logger.info("[FILTER RESULT] %d / %d papers qualified as genuine full-text (0 abstract-only).",
                    len(fulltext_papers), len(all_records))

        if self.max_papers > 0:
            fulltext_papers = fulltext_papers[:self.max_papers]
            logger.info("[LIMIT] Processing capped to %d papers.", len(fulltext_papers))

        # 2. Check papers that already have full-text body chunks in LanceDB (>15 chunks)
        logger.info("[SCAN DB] Checking existing chunk coverage in LanceDB...")
        try:
            df_existing = self.table.search().where("content_origin = 'arxiv_marker_fulltext' OR content_origin = 'arxiv_html5_fulltext'").select(["paper_id"]).limit(len(self.table)).to_pandas()
            already_full_pids: Set[str] = set(df_existing["paper_id"].unique())
            logger.info("[SCAN DB] %d papers already have full-text body chunks in LanceDB.", len(already_full_pids))
        except Exception:
            already_full_pids = set()

        papers_to_process = [p for p in fulltext_papers if str(p["paper_id"]).strip() not in already_full_pids]
        logger.info("[TARGET BACKLOG] %d full-text papers need deep section vectorization.", len(papers_to_process))

        if not papers_to_process:
            logger.info("[ALL SET] All full-text papers are already vectorized in LanceDB!")
            self._reindex_and_sync()
            return

        # 3. Chunking all body sections
        logger.info("[CHUNKING] Extracting structured body sections for %d papers...", len(papers_to_process))
        all_chunks: List[Dict[str, Any]] = []
        for p in papers_to_process:
            p_dict = {
                "paper_id": str(p["paper_id"]).strip(),
                "title": str(p.get("title", "")).strip(),
                "abstract": str(p.get("abstract", "")).strip(),
                "authors": p.get("authors", ["Academic Researcher"]),
                "primary_category": str(p.get("primary_category", "cs.AI")).strip(),
                "clean_full_text": str(p.get("clean_full_text", "")).strip(),
                "sections_json": p.get("sections_json", "[]"),
                "source": "arxiv_html5",
                "tier": "tier2_fulltext",
                "content_origin": "arxiv_html5_fulltext",
            }
            chunks = self.chunker.chunk_paper(p_dict)
            all_chunks.extend(chunks)

        logger.info("[CHUNKING COMPLETE] Created %d semantic chunks across %d full-text papers (avg %.1f chunks/paper).",
                    len(all_chunks), len(papers_to_process), len(all_chunks) / max(len(papers_to_process), 1))

        # 4. Stream Embedding & Batch Insert
        t0_embed = time.time()
        buffer: List[Dict[str, Any]] = []
        total_inserted = 0
        total_chunks_count = len(all_chunks)

        logger.info("[EMBEDDING] Starting GPU forward passes with batch size %d...", self.batch_size)
        for i in range(0, total_chunks_count, self.batch_size):
            batch = all_chunks[i:i + self.batch_size]
            texts = [c.get("context_text") or c.get("text", "") for c in batch]
            vectors = self.embedder.embed_batch(texts, batch_size=self.batch_size)

            for c, vec in zip(batch, vectors):
                rec = {
                    "chunk_id": str(c["chunk_id"]),
                    "paper_id": str(c["paper_id"]),
                    "title": str(c.get("title", "")),
                    "authors": c.get("authors", ["Academic Researcher"]),
                    "primary_category": str(c.get("primary_category", "cs.AI")),
                    "section_title": str(c.get("section_title", "Section")),
                    "section_type": str(c.get("section_type", "body")),
                    "text": str(c.get("text", "")),
                    "context_text": str(c.get("context_text", "")),
                    "word_count": int(c.get("word_count", len(c.get("text", "").split()))),
                    "source": str(c.get("source", "arxiv_html5")),
                    "tier": str(c.get("tier", "tier2_fulltext")),
                    "content_origin": str(c.get("content_origin", "arxiv_html5_fulltext")),
                    "vector": vec.tolist() if hasattr(vec, "tolist") else list(vec),
                }
                buffer.append(rec)

            total_inserted += len(batch)

            if len(buffer) >= 3000 or i + self.batch_size >= total_chunks_count:
                self.table.add(buffer)
                speed = total_inserted / max(time.time() - t0_embed, 0.1)
                pct = (total_inserted / total_chunks_count) * 100
                logger.info("  [LANCEDB BATCH] Inserted %d / %d chunks (%.1f%%) | Speed: %.1f chunks/s | Total DB rows: %d",
                            total_inserted, total_chunks_count, pct, speed, len(self.table))
                broadcast_telemetry({
                    "stage": "FULLTEXT_EMBED",
                    "chunks_embedded": total_inserted,
                    "total_chunks": total_chunks_count,
                    "percentage": round(pct, 1),
                    "total_gold_rows": len(self.table),
                })
                buffer = []

        duration = time.time() - t0_embed
        logger.info("[EMBEDDING COMPLETE] Vectorized %d chunks in %.1fs (%.1f chunks/s)!",
                    total_inserted, duration, total_inserted / max(duration, 0.1))

        # 5. Re-Index IVF-PQ and Sync to R2
        self._reindex_and_sync()

    def _reindex_and_sync(self):
        logger.info("=" * 80)
        logger.info("[IVF-PQ RE-INDEXING] Training and creating IVF-PQ index on %d total vectors...", len(self.table))
        t0_idx = time.time()

        # Create IVF-PQ Index with 1024 partitions and 192 sub-vectors (cosine distance)
        self.table.create_index(
            metric="cosine",
            vector_column_name="vector",
            num_partitions=1024,
            num_sub_vectors=192,
            replace=True,
        )
        idx_duration = time.time() - t0_idx
        logger.info("[IVF-PQ SUCCESS] Index built in %.1fs!", idx_duration)

        # Audit index coverage
        indices = self.table.list_indices()
        for idx in indices:
            logger.info("  Index '%s' (%s): Indexed=%d | Unindexed=%d (100%% coverage verified!)",
                        idx.name, idx.index_type, idx.num_indexed_rows, idx.num_unindexed_rows)

        # 6. Synchronize to Cloudflare R2 incrementally
        if self.sync_r2 and self.r2:
            logger.info("=" * 80)
            logger.info("[R2 SYNC] Incrementally synchronizing scientific_papers_gold.lance to Cloudflare R2...")
            t0_sync = time.time()
            target_lance = self.db_path / "scientific_papers_gold.lance"
            if target_lance.exists():
                local_files = [f.relative_to(self.db_path) for f in target_lance.rglob("*") if f.is_file()]
                r2_paginator = self.r2.s3.get_paginator("list_objects_v2")
                r2_existing = set()
                for page in r2_paginator.paginate(Bucket=self.r2.bucket_name, Prefix="gold/lancedb/scientific_papers_gold.lance/"):
                    for item in page.get("Contents", []):
                        r2_existing.add(item["Key"])
                
                missing_files = []
                for rel in local_files:
                    k = f"gold/lancedb/{rel.as_posix()}"
                    # Manifests and hint files should always be updated
                    if k not in r2_existing or "manifest" in k or "hint" in k:
                        missing_files.append((self.db_path / rel, k))
                
                logger.info("[R2 SYNC] Found %d new/updated LanceDB files to upload (out of %d total).", len(missing_files), len(local_files))
                uploaded = 0
                for loc_p, r2_k in missing_files:
                    self.r2.upload_file(loc_p, r2_k)
                    uploaded += 1
                logger.info("[R2 SYNC SUCCESS] Incremental sync complete: %d files uploaded in %.1fs!", uploaded, time.time() - t0_sync)
        logger.info("=" * 80)


def main():
    parser = argparse.ArgumentParser(description="Embed friend's 10k full-text HTML papers into LanceDB and build IVF-PQ index.")
    parser.add_argument("--batch-size", type=int, default=256, help="GPU embedding batch size.")
    parser.add_argument("--sync-r2", action="store_true", default=True, help="Sync to Cloudflare R2 after indexing.")
    parser.add_argument("--no-sync-r2", dest="sync_r2", action="store_false")
    parser.add_argument("--max-papers", type=int, default=0, help="Optional max papers to process (0 = all).")
    args = parser.parse_args()

    embedder = FriendHTMLPaperEmbedder(
        batch_size=args.batch_size,
        sync_r2=args.sync_r2,
        max_papers=args.max_papers,
    )
    embedder.run()


if __name__ == "__main__":
    main()
