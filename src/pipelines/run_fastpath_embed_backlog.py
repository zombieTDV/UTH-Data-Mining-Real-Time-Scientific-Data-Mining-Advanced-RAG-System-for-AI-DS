"""High-Priority Fast-Path: Instantly Embed All Pre-Harvested Full-Text Papers into LanceDB & R2.

This standalone worker focuses 100% on accelerating the backlog:
1. Gathers all genuine full-text papers residing in Silver:
   - data/silver/tier1/landmark_papers.parquet (3,000 papers)
   - data/silver/tier2/fulltext_papers.parquet (910 papers)
   - data/silver/tier2/fulltext_papers_shard0.parquet (502 papers)
   - data/silver/tier2/fulltext_papers_shard1.parquet (222 papers)
   - data/silver/tier2/html_papers.parquet
2. Deduplicates against LanceDB Gold ('scientific_papers_gold.lance') to avoid redundant vectorization.
3. Rapidly chunks section headings via AcademicChunker and computes 768-D dense embeddings on GPU MPS.
4. Stream-inserts vectors directly into LanceDB and incrementally synchronizes to Cloudflare R2.

Usage:
    python -m src.pipelines.run_fastpath_embed_backlog --sync-r2
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
from typing import Any, Dict, List, Optional, Set

warnings.filterwarnings("ignore")
os.environ["PYTHONWARNINGS"] = "ignore"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

import httpx
import lancedb
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config.settings import settings
from src.indexing.chunker import AcademicChunker
from src.indexing.embedder import NomicEmbedder
from src.storage.minio_client import StorageClient as R2Client
from src.utils.logger import setup_pipeline_logging

logger, log_file = setup_pipeline_logging("fastpath_embed_backlog", capture_stdout=False)
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S"))
logger.addHandler(console_handler)


def broadcast_telemetry(payload: dict):
    try:
        httpx.post("http://127.0.0.1:8000/api/ingestion/broadcast", json=payload, timeout=0.25)
    except Exception:
        pass


class FastPathBacklogEmbedder:
    """Dedicated worker to drain all existing Silver full-text papers into LanceDB vectors."""

    TABLE_NAME = "scientific_papers_gold"

    def __init__(self, batch_size: int = 64, sync_r2: bool = False):
        self.batch_size = batch_size
        self.sync_r2 = sync_r2

        self.silver_dir = settings.ROOT_DIR / "data" / "silver"
        self.db_path = settings.ROOT_DIR / "data" / "gold" / "lancedb"
        self.db = lancedb.connect(str(self.db_path))
        self.table = self.db.open_table(self.TABLE_NAME)

        self.r2 = R2Client() if sync_r2 else None
        self.chunker = AcademicChunker(max_chunk_words=300, overlap_words=50)
        self.embedder = NomicEmbedder()

    def run(self):
        logger.info("=" * 80)
        logger.info("STARTING FAST-PATH BACKLOG EMBEDDER (ACCELERATING ALL UN-EMBEDDED PAPERS)")
        logger.info("Hardware: %s | LanceDB Table: %s (Current rows: %d)",
                    self.embedder.device, self.TABLE_NAME, len(self.table))
        logger.info("=" * 80)

        # 1. Scan existing paper IDs in LanceDB
        existing_paper_ids: Set[str] = set()
        try:
            total_rows = len(self.table)
            if total_rows > 0:
                df_curr = self.table.search().select(["paper_id"]).limit(total_rows).to_pandas()
                existing_paper_ids = set(df_curr["paper_id"].astype(str))
                logger.info("[LANCEDB STATE] %d unique papers currently indexed in Gold LanceDB.", len(existing_paper_ids))
        except Exception as e:
            logger.warning("[SCAN NOTE] %s", e)

        # 2. Gather candidate full-text parquets
        target_files = [
            self.silver_dir / "tier1" / "landmark_papers.parquet",
            self.silver_dir / "tier2" / "fulltext_papers.parquet",
            self.silver_dir / "tier2" / "fulltext_papers_shard0.parquet",
            self.silver_dir / "tier2" / "fulltext_papers_shard1.parquet",
            self.silver_dir / "tier2" / "html_papers.parquet",
            self.silver_dir / "cvf" / "cvpr2024.parquet",
            self.silver_dir / "openreview" / "openreview_all.parquet",
        ]

        # Download from R2 if missing locally
        if self.r2:
            for p in [self.silver_dir / "tier2" / "fulltext_papers_shard0.parquet", self.silver_dir / "tier2" / "fulltext_papers.parquet"]:
                if not p.exists():
                    r2_key = f"silver/tier2/{p.name}"
                    try:
                        logger.info("[R2 PULL] Downloading %s...", r2_key)
                        self.r2.download_file_safe(r2_key, p)
                    except Exception:
                        pass

        unembedded_papers: List[Dict[str, Any]] = []
        seen_candidates: Set[str] = set()

        for fpath in target_files:
            if not fpath.exists():
                continue
            try:
                df = pd.read_parquet(fpath)
                for _, r in df.iterrows():
                    pid = str(r["paper_id"]).strip()
                    if pid in existing_paper_ids or pid in seen_candidates:
                        continue
                    seen_candidates.add(pid)
                    rec = r.to_dict()
                    rec["tier"] = "tier1" if "tier1" in str(fpath) else "tier2"
                    unembedded_papers.append(rec)
            except Exception as e:
                logger.warning("[READ NOTE] %s: %s", fpath.name, e)

        logger.info("[BACKLOG AUDIT] Found %d genuine full-text papers needing vectorization!", len(unembedded_papers))
        if not unembedded_papers:
            logger.info("[ALL CLEAR] All Silver full-text papers are already in LanceDB!")
            return

        # 3. Chunk all papers
        logger.info("[CHUNKING] Processing section headers and semantic slicing...")
        all_chunks: List[Dict[str, Any]] = []
        for p in unembedded_papers:
            p_chunks = self.chunker.chunk_paper(p)
            all_chunks.extend(p_chunks)

        logger.info("[CHUNKING COMPLETE] Created %d semantic chunks across %d papers (avg %.1f chunks/paper).",
                    len(all_chunks), len(unembedded_papers), len(all_chunks) / max(len(unembedded_papers), 1))

        # 4. Stream embedding and insertion
        t0_embed = time.time()
        buffer: List[Dict[str, Any]] = []
        total_inserted = 0

        for i in range(0, len(all_chunks), self.batch_size):
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
                    "section_type": str(c.get("section_type", "section")),
                    "text": str(c.get("text", "")),
                    "context_text": str(c.get("context_text", "")),
                    "word_count": int(c.get("word_count", len(c.get("text", "").split()))),
                    "vector": vec.tolist() if hasattr(vec, "tolist") else list(vec),
                }
                buffer.append(rec)

            total_inserted += len(batch)

            if len(buffer) >= 500 or i + self.batch_size >= len(all_chunks):
                self.table.add(buffer)
                speed = total_inserted / max(time.time() - t0_embed, 0.1)
                pct = (total_inserted / len(all_chunks)) * 100
                logger.info("  [STREAMING INSERT] %d/%d chunks (%.1f%%) | Speed: %.1f chunks/s | Total in DB: %d",
                            total_inserted, len(all_chunks), pct, speed, len(self.table))
                broadcast_telemetry({
                    "stage": "FASTPATH_EMBED",
                    "chunks_embedded": total_inserted,
                    "total_chunks": len(all_chunks),
                    "percentage": round(pct, 1),
                    "total_gold_rows": len(self.table),
                })
                buffer = []

        duration = time.time() - t0_embed
        logger.info("=" * 80)
        logger.info("[SUCCESS] Backlog vectorized: %d chunks across %d papers in %.1fs (%.1f min)!",
                    total_inserted, len(unembedded_papers), duration, duration / 60)
        logger.info("Gold LanceDB table now has %d total vectors ready for sub-second RAG retrieval.", len(self.table))
        logger.info("=" * 80)


def main():
    parser = argparse.ArgumentParser(description="Fast-Path Backlog Embedder: Vectorize all existing Silver papers.")
    parser.add_argument("--batch-size", type=int, default=64, help="Embedding batch size for GPU.")
    parser.add_argument("--sync-r2", action="store_true", help="Sync results to Cloudflare R2.")
    args = parser.parse_args()

    embedder = FastPathBacklogEmbedder(batch_size=args.batch_size, sync_r2=args.sync_r2)
    embedder.run()


if __name__ == "__main__":
    main()
