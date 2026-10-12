"""Orchestrates Full Lakehouse Embedding for Tier 1 Landmarks (3k) and Tier 2 Near-Past (30.1k).

Features:
1. GPU CUDA Acceleration via Nomic Embed v1.5 (95+ chunks/sec on RTX 4060).
2. Purges stale mixed Tier 1 vectors, replacing them with genuine 2013-2021 landmark vectors.
3. Incrementally embeds un-embedded Tier 2 papers (~15.7k papers) without duplicating existing vectors.
4. LanceDB table 'scientific_papers_gold' batch insertion.
5. Builds IVF-PQ Index for lightning-fast ANN vector retrieval.
6. Synchronizes Gold vector table to Cloudflare R2.
"""

import argparse
import datetime
import gc
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Set

import duckdb
import lancedb
import pandas as pd
import torch

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config.settings import settings
from src.indexing.embedder import NomicEmbedder
from src.indexing.lancedb_manager import LanceDBManager
from src.storage.r2_client import R2Client
from src.utils.logger import setup_pipeline_logging

logger, log_file = setup_pipeline_logging("full_lakehouse_embedding")


class LakehouseVectorizer:
    def __init__(self, sync_r2: bool = True, batch_size: int = 128):
        self.batch_size = batch_size
        self.sync_r2 = sync_r2
        self.r2 = R2Client() if sync_r2 else None
        self.db_manager = LanceDBManager(r2_client=self.r2)
        self.db = lancedb.connect(str(settings.ROOT_DIR / "data" / "gold" / "lancedb"))
        self.embedder = NomicEmbedder()

    def process_tier1(self) -> int:
        """Embeds all 3,000 genuine historical landmark papers (2013-2021)."""
        logger.info("=" * 80)
        logger.info(">>> [STEP 1/3] EMBEDDING TIER 1 TRUE HISTORICAL LANDMARKS (3,000 PAPERS)")
        logger.info("=" * 80)

        tbl = self.db.open_table("scientific_papers_gold")

        # 1. Purge stale Tier 1 vectors
        logger.info("[TIER 1] Deleting previous mixed Tier 1 vectors from LanceDB...")
        try:
            tbl.delete("tier = 'tier1'")
            logger.info("[TIER 1] Purged old Tier 1 records successfully.")
        except Exception as e:
            logger.warning("[TIER 1] Delete warning: %s", e)

        # 2. Read new 3,000 landmark papers from Parquet
        t1_path = settings.ROOT_DIR / "data" / "silver" / "tier1" / "landmark_papers.parquet"
        df_t1 = pd.read_parquet(t1_path)
        logger.info("[TIER 1] Loaded %d landmark papers from %s", len(df_t1), t1_path)

        # Prepare chunks
        chunks = []
        for _, row in df_t1.iterrows():
            p_id = str(row["paper_id"])
            title = str(row.get("title", "")).strip()
            abstract = str(row.get("abstract", "")).strip() or title
            authors = row.get("authors", [])
            auth_list = authors.tolist() if hasattr(authors, "tolist") else (authors if isinstance(authors, list) else [str(authors)])
            source = str(row.get("source", "arxiv"))

            chunks.append({
                "chunk_id": f"{p_id}_abs",
                "paper_id": p_id,
                "title": title,
                "authors": auth_list,
                "primary_category": str(row.get("primary_category", "cs.AI")),
                "section_title": "Abstract",
                "section_type": "abstract",
                "text": abstract,
                "context_text": f"Title: {title}\nAbstract: {abstract}",
                "word_count": len(abstract.split()),
                "source": source,
                "tier": "tier1",
                "content_origin": str(row.get("content_origin", "academic")),
            })

        logger.info("[TIER 1] Prepared %d chunks. Running GPU embeddings...", len(chunks))
        self._embed_and_insert(tbl, chunks)
        return len(chunks)

    def process_tier2_incremental(self) -> int:
        """Incrementally embeds un-embedded Tier 2 papers (~15.7k papers)."""
        logger.info("=" * 80)
        logger.info(">>> [STEP 2/3] EMBEDDING TIER 2 NEAR-PAST TRENDING (INCREMENTAL TO 30.1K)")
        logger.info("=" * 80)

        tbl = self.db.open_table("scientific_papers_gold")

        # 1. Query existing embedded paper_ids in Tier 2
        df_existing = tbl.search().where("tier = 'tier2'").select(["paper_id"]).limit(50000).to_pandas()
        embedded_ids = set(df_existing["paper_id"])
        logger.info("[TIER 2] Found %d papers already embedded in LanceDB.", len(embedded_ids))

        # 2. Read consolidated 30.1k Tier 2 Parquet
        t2_path = settings.ROOT_DIR / "data" / "silver" / "tier2" / "near_past_papers.parquet"
        df_t2 = pd.read_parquet(t2_path)
        logger.info("[TIER 2] Total papers in Tier 2 Parquet: %d", len(df_t2))

        # Filter un-embedded papers
        df_missing = df_t2[~df_t2["paper_id"].isin(embedded_ids)]
        logger.info("[TIER 2] Papers needing embedding: %d", len(df_missing))

        if df_missing.empty:
            logger.info("[TIER 2] All Tier 2 papers are already embedded!")
            return 0

        # Prepare chunks
        chunks = []
        for _, row in df_missing.iterrows():
            p_id = str(row["paper_id"])
            title = str(row.get("title", "")).strip()
            abstract = str(row.get("abstract", "")).strip() or title
            authors = row.get("authors", [])
            auth_list = authors.tolist() if hasattr(authors, "tolist") else (authors if isinstance(authors, list) else [str(authors)])
            source = str(row.get("source", "arxiv"))

            chunks.append({
                "chunk_id": f"{p_id}_abs",
                "paper_id": p_id,
                "title": title,
                "authors": auth_list,
                "primary_category": str(row.get("primary_category", "cs.AI")),
                "section_title": "Abstract",
                "section_type": "abstract",
                "text": abstract,
                "context_text": f"Title: {title}\nAbstract: {abstract}",
                "word_count": len(abstract.split()),
                "source": source,
                "tier": "tier2",
                "content_origin": str(row.get("content_origin", "academic")),
            })

        logger.info("[TIER 2] Prepared %d chunks. Running GPU embeddings...", len(chunks))
        self._embed_and_insert(tbl, chunks)
        return len(chunks)

    def _embed_and_insert(self, tbl: Any, chunks: List[Dict[str, Any]]):
        """Batch-embeds chunks on GPU and inserts into LanceDB."""
        t0 = time.time()
        total = len(chunks)
        insert_batch_size = 500

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
            # Retain only table schema columns
            target_cols = [c for c in df_sub.columns if c in tbl.schema.names]
            df_sub = df_sub[target_cols]

            tbl.add(df_sub)

            elapsed = time.time() - t0
            done = end_idx
            speed = done / max(elapsed, 0.1)
            eta = (total - done) / max(speed, 0.1)
            logger.info(
                "  [PROGRESS] %d/%d chunks embedded & stored (%.1f%%) | Speed: %.1f chunks/s | ETA: %.1fs",
                done,
                total,
                (done / total) * 100,
                speed,
                eta,
            )

        logger.info("[COMPLETED BATCH] Finished %d chunks in %.2fs.", total, time.time() - t0)

    def build_ivf_pq_index(self):
        """Builds IVF-PQ Index on LanceDB vector table for fast sub-millisecond retrieval."""
        logger.info("=" * 80)
        logger.info(">>> [STEP 3/3] CREATING IVF-PQ VECTOR INDEX ON GOLD TABLE")
        logger.info("=" * 80)

        tbl = self.db.open_table("scientific_papers_gold")
        t0 = time.time()
        try:
            logger.info("[IVF-PQ] Indexing 768-D vectors (num_partitions=128, num_sub_vectors=96)...")
            tbl.create_index(
                metric="cosine",
                num_partitions=128,
                num_sub_vectors=96,
                vector_column_name="vector",
                replace=True,
            )
            duration = round(time.time() - t0, 2)
            logger.info("[IVF-PQ SUCCESS] Index built in %.2fs!", duration)
        except Exception as e:
            logger.warning("[IVF-PQ NOTE] Could not build IVF-PQ index (%s). Retaining flat search.", e)

    def sync_gold_to_r2(self):
        """Uploads updated LanceDB Gold vector directory to Cloudflare R2."""
        if not self.sync_r2 or not self.r2:
            return
        logger.info("[R2 SYNC] Synchronizing updated LanceDB Gold directory to Cloudflare R2...")
        try:
            gold_dir = settings.ROOT_DIR / "data" / "gold" / "lancedb" / "scientific_papers_gold.lance"
            uploaded = 0
            for fpath in gold_dir.rglob("*"):
                if fpath.is_file():
                    rel_key = f"gold/lancedb/scientific_papers_gold.lance/{fpath.relative_to(gold_dir).as_posix()}"
                    self.r2.upload_file(fpath, rel_key)
                    uploaded += 1
            logger.info("[R2 SYNC SUCCESS] Uploaded %d LanceDB files to Cloudflare R2.", uploaded)
        except Exception as e:
            logger.warning("[R2 SYNC ERROR] %s", e)

    def generate_final_report(self) -> Dict[str, Any]:
        """Queries and returns authoritative final metrics on LanceDB Gold table."""
        tbl = self.db.open_table("scientific_papers_gold")
        total_vectors = len(tbl)

        df_meta = tbl.search().select(["paper_id", "tier", "source"]).limit(total_vectors).to_pandas()
        distinct_papers = df_meta["paper_id"].nunique()
        tier_counts = df_meta["tier"].value_counts().to_dict()
        source_counts = df_meta["source"].value_counts().to_dict()
        indices = [str(idx.name) for idx in tbl.list_indices()] if hasattr(tbl, "list_indices") else []

        report = {
            "total_vectors": total_vectors,
            "distinct_papers": distinct_papers,
            "tier_distribution": tier_counts,
            "source_distribution": source_counts,
            "indices": indices,
        }
        return report


def main():
    parser = argparse.ArgumentParser(description="Embed Full Lakehouse (Tier 1 & Tier 2).")
    parser.add_argument("--batch-size", type=int, default=128, help="Inference batch size on GPU.")
    parser.add_argument("--skip-ivf-pq", action="store_true", help="Skip IVF-PQ index building.")
    parser.add_argument("--skip-r2-sync", action="store_true", help="Skip Cloudflare R2 remote sync.")
    args = parser.parse_args()

    sync_r2 = not args.skip_r2_sync
    vectorizer = LakehouseVectorizer(sync_r2=sync_r2, batch_size=args.batch_size)

    t0 = time.time()
    t1_added = vectorizer.process_tier1()
    t2_added = vectorizer.process_tier2_incremental()

    if not args.skip_ivf_pq:
        vectorizer.build_ivf_pq_index()

    if sync_r2:
        vectorizer.sync_gold_to_r2()

    report = vectorizer.generate_final_report()
    total_time = round(time.time() - t0, 2)

    print("\n" + "=" * 80)
    print(f"LAKEHOUSE VECTORIZATION COMPLETE IN {total_time}s")
    print(f"Total Vectors in Gold Table: {report['total_vectors']:,}")
    print(f"Distinct Papers Represented: {report['distinct_papers']:,}")
    print(f"Tier Distribution: {report['tier_distribution']}")
    print(f"Source Distribution: {report['source_distribution']}")
    print(f"Indices: {report['indices']}")
    print("=" * 80)


if __name__ == "__main__":
    main()
