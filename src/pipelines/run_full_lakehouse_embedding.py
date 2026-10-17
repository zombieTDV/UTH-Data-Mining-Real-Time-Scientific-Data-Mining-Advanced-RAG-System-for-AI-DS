"""Orchestrates Deep Multi-Section Lakehouse Embedding for Tier 1 Landmarks (3k) and Tier 2 Near-Past (100k).

Features:
1. Deep Multi-Section Chunking via AcademicChunker:
   - Extracts Abstract, Introduction, Methodology, Experiments, Results, Conclusion, and Body parts.
   - Semantic heading recognition and contextual paragraph slicing.
2. GPU CUDA Acceleration via Nomic Embed v1.5 with FP16 batch inference (~100-115 chunks/s on RTX 4060).
3. Incremental Chunk Vectorization: Preserves already-indexed chunks and embeds new section chunks.
4. LanceDB table 'scientific_papers_gold' batch streaming insertion (1,000 chunks/batch).
5. Option 2 High-Fidelity IVF-PQ Index: 1024 Voronoi clusters, 192 sub-vectors, cosine distance.
6. Parallel Cloudflare R2 synchronization via ThreadPoolExecutor.
"""

import argparse
import concurrent.futures
import datetime
import gc
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import duckdb
import httpx
import lancedb
import pandas as pd
import torch

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config.settings import settings
from src.indexing.chunker import AcademicChunker
from src.indexing.embedder import NomicEmbedder
from src.indexing.qdrant_manager import QdrantManager as LanceDBManager
from src.storage.minio_client import StorageClient as R2Client
from src.utils.logger import setup_pipeline_logging

logger, log_file = setup_pipeline_logging("deep_multisection_embedding")


def broadcast_telemetry(payload: dict):
    """Sends telemetry pulse to local FastAPI SSE bridge."""
    try:
        httpx.post("http://localhost:8000/api/ingestion/broadcast", json=payload, timeout=0.25)
    except Exception:
        pass


class DeepLakehouseVectorizer:
    def __init__(self, sync_r2: bool = True, batch_size: int = 128):
        self.batch_size = batch_size
        self.sync_r2 = sync_r2
        self.r2 = R2Client() if sync_r2 else None
        self.db_path = settings.ROOT_DIR / "data" / "gold" / "lancedb"
        self.db = lancedb.connect(str(self.db_path))
        self.embedder = NomicEmbedder()
        self.chunker = AcademicChunker(max_chunk_words=300, overlap_words=50)

    def get_or_create_table(self):
        """Opens or initializes the scientific_papers_gold table."""
        tbl_res = self.db.list_tables()
        table_names = tbl_res.tables if hasattr(tbl_res, "tables") else list(tbl_res)
        if "scientific_papers_gold" in table_names:
            return self.db.open_table("scientific_papers_gold")
        else:
            raise RuntimeError("scientific_papers_gold table does not exist. Please initialize it.")

    def run_deep_embedding(self, force_reset: bool = False, max_papers: Optional[int] = None) -> Dict[str, Any]:
        """Executes full Deep Multi-Section Chunking and Embedding across Tier 1 and Tier 2."""
        tbl = self.get_or_create_table()

        if force_reset:
            logger.warning("[RESET] Purging all existing records in scientific_papers_gold...")
            try:
                tbl.delete("paper_id IS NOT NULL")
            except Exception as e:
                logger.warning("[RESET NOTE] %s", e)

        # 1. Fetch existing chunk IDs in LanceDB to prevent duplicate embeddings
        existing_chunks: Set[str] = set()
        if not force_reset:
            logger.info("[SCAN] Scanning existing chunks in LanceDB table...")
            total_current = len(tbl)
            if total_current > 0:
                df_curr = tbl.search().select(["chunk_id"]).limit(total_current + 1000).to_pandas()
                existing_chunks = set(df_curr["chunk_id"])
            logger.info("[SCAN] Found %d chunks already indexed in LanceDB.", len(existing_chunks))

        # 2. Load Tier 1 Landmarks and Tier 2 Near-Past
        t1_path = settings.ROOT_DIR / "data" / "silver" / "tier1" / "landmark_papers.parquet"
        t2_path = settings.ROOT_DIR / "data" / "silver" / "tier2" / "near_past_papers.parquet"

        logger.info("[LOAD] Loading Tier 1 landmark papers from %s...", t1_path)
        df_t1 = pd.read_parquet(t1_path) if t1_path.exists() else pd.DataFrame()

        logger.info("[LOAD] Loading Tier 2 near-past papers from %s...", t2_path)
        df_t2 = pd.read_parquet(t2_path) if t2_path.exists() else pd.DataFrame()

        if max_papers:
            df_t2 = df_t2.head(max_papers)
            logger.info("[LIMIT] Constrained to first %d papers for testing.", max_papers)

        # Combine datasets
        papers_to_process = []
        if not df_t1.empty:
            for _, r in df_t1.iterrows():
                d = r.to_dict()
                d["tier"] = "tier1"
                papers_to_process.append(d)
        if not df_t2.empty:
            for _, r in df_t2.iterrows():
                d = r.to_dict()
                d["tier"] = "tier2"
                papers_to_process.append(d)

        total_papers = len(papers_to_process)
        logger.info("[CHUNKING] Processing %d total papers with Deep Multi-Section Chunking...", total_papers)

        # 3. Stream chunking and GPU embedding in batches
        all_new_chunks: List[Dict[str, Any]] = []
        total_extracted = 0
        skipped_already_indexed = 0

        t0_chunk = time.time()
        for idx, paper in enumerate(papers_to_process):
            paper_chunks = self.chunker.chunk_paper(paper)
            total_extracted += len(paper_chunks)

            for c in paper_chunks:
                cid = c["chunk_id"]
                if cid in existing_chunks:
                    skipped_already_indexed += 1
                else:
                    all_new_chunks.append(c)

            if (idx + 1) % 10000 == 0 or (idx + 1) == total_papers:
                logger.info(
                    "  [CHUNKER PROGRESS] %d/%d papers parsed | %d total chunks extracted | %d new chunks to embed | %d skipped (already indexed)",
                    idx + 1,
                    total_papers,
                    total_extracted,
                    len(all_new_chunks),
                    skipped_already_indexed,
                )

        logger.info(
            "[CHUNKING COMPLETE] Extracted %d chunks across %d papers (avg %.2f chunks/paper) in %.2fs.",
            total_extracted,
            total_papers,
            total_extracted / max(total_papers, 1),
            time.time() - t0_chunk,
        )
        logger.info("[CHUNKING] New chunks requiring GPU embedding: %d", len(all_new_chunks))

        if not all_new_chunks:
            logger.info("[COMPLETE] All extracted chunks are already embedded in LanceDB!")
        else:
            self._embed_and_insert_stream(tbl, all_new_chunks)

        return {
            "total_papers": total_papers,
            "total_extracted_chunks": total_extracted,
            "new_embedded_chunks": len(all_new_chunks),
            "final_table_rows": len(tbl),
        }

    def _embed_and_insert_stream(self, tbl: Any, chunks: List[Dict[str, Any]], insert_batch_size: int = 1000):
        """Batch-embeds chunks on GPU (FP16 batch size 128) and inserts in 1,000-chunk increments."""
        t0 = time.time()
        total = len(chunks)
        logger.info("[GPU VECTORIZATION] Starting embedding of %d chunks on RTX 4060 GPU...", total)

        for start_idx in range(0, total, insert_batch_size):
            end_idx = min(start_idx + insert_batch_size, total)
            sub_chunks = chunks[start_idx:end_idx]

            # 1. Embed on GPU
            texts_to_embed = [c["context_text"] for c in sub_chunks]
            vectors = self.embedder.embed_documents(texts_to_embed, batch_size=self.batch_size)

            # 2. Attach vectors
            for idx, vec in enumerate(vectors):
                sub_chunks[idx]["vector"] = vec

            # 3. Add to LanceDB table
            df_sub = pd.DataFrame(sub_chunks)
            target_cols = [c for c in df_sub.columns if c in tbl.schema.names]
            df_sub = df_sub[target_cols]

            tbl.add(df_sub)

            elapsed = time.time() - t0
            done = end_idx
            speed = done / max(elapsed, 0.1)
            eta = (total - done) / max(speed, 0.1)

            logger.info(
                "  [PROGRESS] %d/%d chunks embedded & stored (%.1f%%) | Speed: %.1f chunks/s | ETA: %.1fs (%.1fm)",
                done,
                total,
                (done / total) * 100,
                speed,
                eta,
                eta / 60,
            )

            # SSE Telemetry pulse
            broadcast_telemetry({
                "stage": "VECTORIZE",
                "status": "EMBEDDING_DEEP_SECTIONS",
                "vectors_synced": done,
                "total_vectors_target": total,
                "speed_ppm": round(speed * 60, 1),
                "latency_ms": round(1000.0 / max(speed, 0.1), 1),
                "message": f"Embedding Deep Multi-Section chunks on RTX 4060: {done:,}/{total:,} ({round((done/total)*100, 1)}%) | Speed: {round(speed, 1)} chunks/s | ETA: {round(eta/60, 1)}m",
            })

            # Cleanup
            del texts_to_embed, vectors, df_sub
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            gc.collect()

        logger.info("[COMPLETED GPU EMBEDDING] Vectorized %d chunks in %.2fs (%.1f min).", total, time.time() - t0, (time.time() - t0) / 60)

    def build_option2_ivf_pq_index(self):
        """Builds Option 2 High-Fidelity IVF-PQ Index on LanceDB vector table."""
        logger.info("=" * 80)
        logger.info(">>> CREATING OPTION 2 HIGH-FIDELITY IVF-PQ INDEX (1024 clusters, 192 sub-vectors)")
        logger.info("=" * 80)

        tbl = self.get_or_create_table()
        total_rows = len(tbl)
        logger.info("[IVF-PQ] Indexing %d 768-D vectors...", total_rows)

        num_partitions = 1024 if total_rows >= 200000 else 512
        t0 = time.time()
        try:
            logger.info("[IVF-PQ] Training %d partition centroids and 192 sub-vector codebooks...", num_partitions)
            tbl.create_index(
                metric="cosine",
                num_partitions=num_partitions,
                num_sub_vectors=192,
                vector_column_name="vector",
                replace=True,
            )
            duration = round(time.time() - t0, 2)
            logger.info("[IVF-PQ SUCCESS] High-Fidelity Index built in %.2fs across %d vectors!", duration, total_rows)
        except Exception as e:
            logger.warning("[IVF-PQ NOTE] Could not build IVF-PQ index (%s). Retaining flat search.", e)

    def parallel_sync_to_r2(self, max_workers: int = 16):
        """Fast multi-threaded incremental synchronization of LanceDB files to Cloudflare R2."""
        if not self.sync_r2 or not self.r2:
            return
        logger.info("=" * 80)
        logger.info(">>> PARALLEL R2 SYNCHRONIZATION (max_workers=%d)", max_workers)
        logger.info("=" * 80)

        gold_dir = settings.ROOT_DIR / "data" / "gold" / "lancedb" / "scientific_papers_gold.lance"
        if not gold_dir.exists():
            return

        # 1. Inspect existing objects in R2
        logger.info("[R2 SCAN] Scanning existing files in Cloudflare R2 bucket...")
        r2_objs = {}
        paginator = self.r2.s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.r2.bucket_name, Prefix="gold/lancedb/scientific_papers_gold.lance/"):
            for obj in page.get("Contents", []):
                r2_objs[obj["Key"]] = obj["Size"]

        # 2. Identify missing or size-mismatched files
        files_to_upload = []
        for fpath in gold_dir.rglob("*"):
            if fpath.is_file():
                rel_key = f"gold/lancedb/scientific_papers_gold.lance/{fpath.relative_to(gold_dir).as_posix()}"
                local_size = fpath.stat().st_size
                if rel_key not in r2_objs or r2_objs[rel_key] != local_size:
                    files_to_upload.append((fpath, rel_key, local_size))

        logger.info("[R2 SCAN] %d local files | %d already in R2 | %d new/modified files to upload", len(list(gold_dir.rglob("*"))), len(r2_objs), len(files_to_upload))

        if not files_to_upload:
            logger.info("[R2 SYNC] Cloudflare R2 is already 100% up to date!")
            return

        # 3. Parallel upload via ThreadPoolExecutor
        total_upload_bytes = sum(x[2] for x in files_to_upload)
        logger.info("[R2 PARALLEL] Uploading %d files (%.2f MB) using %d concurrent threads...", len(files_to_upload), total_upload_bytes / (1024 * 1024), max_workers)

        t0_sync = time.time()
        uploaded_count = 0

        def _upload_worker(item):
            loc_path, key, sz = item
            self.r2.upload_file(loc_path, key)
            return sz

        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [executor.submit(_upload_worker, item) for item in files_to_upload]
            for future in concurrent.futures.as_completed(futures):
                try:
                    future.result()
                    uploaded_count += 1
                    if uploaded_count % 50 == 0 or uploaded_count == len(files_to_upload):
                        logger.info("  [R2 UPLOAD] %d/%d files synced (%.1f%%)...", uploaded_count, len(files_to_upload), (uploaded_count / len(files_to_upload)) * 100)
                except Exception as e:
                    logger.warning("[R2 UPLOAD ERROR] %s", e)

        logger.info("[R2 SYNC SUCCESS] Uploaded %d files in %.2fs!", uploaded_count, time.time() - t0_sync)


def main():
    parser = argparse.ArgumentParser(description="Deep Multi-Section Lakehouse Vectorization.")
    parser.add_argument("--batch-size", type=int, default=128, help="GPU forward inference batch size.")
    parser.add_argument("--force-reset", action="store_true", help="Reset and purge existing vectors before embedding.")
    parser.add_argument("--max-papers", type=int, default=None, help="Limit number of papers for testing.")
    parser.add_argument("--skip-ivf-pq", action="store_true", help="Skip IVF-PQ index creation.")
    parser.add_argument("--skip-r2-sync", action="store_true", help="Skip Cloudflare R2 cloud sync.")
    args = parser.parse_args()

    vectorizer = DeepLakehouseVectorizer(sync_r2=not args.skip_r2_sync, batch_size=args.batch_size)

    t0_start = time.time()
    res = vectorizer.run_deep_embedding(force_reset=args.force_reset, max_papers=args.max_papers)

    if not args.skip_ivf_pq:
        vectorizer.build_option2_ivf_pq_index()

    if not args.skip_r2_sync:
        vectorizer.parallel_sync_to_r2()

    total_time = round(time.time() - t0_start, 2)
    print("\n" + "=" * 80)
    print(f"DEEP MULTI-SECTION LAKEHOUSE EMBEDDING COMPLETE IN {total_time}s ({round(total_time/60, 1)}m)")
    print(f"Total Papers Processed: {res['total_papers']:,}")
    print(f"Total Chunks Extracted: {res['total_extracted_chunks']:,}")
    print(f"New Chunks Embedded: {res['new_embedded_chunks']:,}")
    print(f"Final Gold Table Vectors: {res['final_table_rows']:,}")
    print("=" * 80)


if __name__ == "__main__":
    main()
