"""End-to-End Pipeline: OpenAlex Ingestion -> Silver Lakehouse -> LanceDB Gold Indexing.

Executes the complete workflow from A to Z for OpenAlex Works:
1. Harvests N papers from OpenAlex Works API (Bronze JSON vault).
2. Transforms into Silver Parquet with citation intelligence & reconstructed abstracts.
3. Chunks abstract into contextual units.
4. Generates 768-dim embeddings locally via Nomic-Embed-Text on Apple Silicon MPS.
5. Upserts directly into LanceDB Gold table ('scientific_papers_gold').
6. Exports Gold Parquet for fast columnar queries & backup.
7. Optionally synchronizes Bronze, Silver, Gold Parquet & LanceDB to Cloudflare R2.
8. Emits live stage-change telemetry to local frontend dashboard.

Usage:
    python -m src.pipelines.run_openalex_end_to_end --limit 500 --concept "artificial intelligence" --sync-r2
"""

import argparse
import datetime
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config.settings import settings
from src.indexing.embedder import NomicEmbedder
from src.indexing.lancedb_manager import LanceDBManager
from src.ingestion.openalex_harvester import OpenAlexHarvester
from src.utils.logger import setup_pipeline_logging

logger, log_file = setup_pipeline_logging("openalex_end_to_end")


def build_chunks_from_openalex(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Builds typed chunks from OpenAlex records with rich citation & affiliation context."""
    chunks = []
    for r in records:
        paper_id = r.get("paper_id", "")
        title = r.get("title", "")
        authors = r.get("authors", [])
        primary_cat = r.get("primary_category", "Computer Science")
        abstract = r.get("abstract", "")
        cited_by = r.get("cited_by_count", 0)
        institutions = r.get("institutions", [])

        if not abstract:
            continue

        affil_str = f"Affiliations: {', '.join(institutions[:3])}" if institutions else ""
        context = f"Paper: {title}\nPrimary Concept: {primary_cat} | Cited by: {cited_by}\n{affil_str}\nAbstract: {abstract}"

        chunks.append({
            "chunk_id": f"{paper_id}_abs",
            "paper_id": paper_id,
            "title": title,
            "authors": authors,
            "primary_category": primary_cat,
            "section_title": "Abstract",
            "section_type": "abstract",
            "text": abstract,
            "context_text": context,
            "word_count": len(abstract.split()),
        })

    return chunks


def broadcast_telemetry(payload: dict):
    """Sends telemetry pulse to local FastAPI SSE bridge."""
    try:
        import httpx
        httpx.post("http://localhost:8000/api/ingestion/broadcast", json=payload, timeout=0.25)
    except Exception:
        pass


def main():
    parser = argparse.ArgumentParser(description="End-to-end OpenAlex Ingestion to LanceDB Vector Indexing.")
    parser.add_argument("--limit", type=int, default=500, help="Target papers to harvest and index (default: 500)")
    parser.add_argument("--concept", type=str, default="computer science", help="Core concept search filter")
    parser.add_argument("--from-date", type=str, default=None, help="Filter by publication date (e.g., 2024-01-01)")
    parser.add_argument("--batch-size", type=int, default=32, help="Embedding batch size (default: 32)")
    parser.add_argument("--sync-r2", action="store_true", default=False, help="Automatically sync to Cloudflare R2")
    args = parser.parse_args()

    start_time = time.time()
    print("\n" + "=" * 80)
    print("OPENALEX END-TO-END PIPELINE: INGESTION -> LAKEHOUSE -> LANCEDB GOLD")
    print(f"Target: {args.limit} papers | Concept: {args.concept} | Batch Size: {args.batch_size} | Sync R2: {args.sync_r2}")
    print("=" * 80)

    # --------------------------------------------------------------------------
    # Step 1: Harvest from OpenAlex Works API (Bronze & Silver Parquet)
    # --------------------------------------------------------------------------
    print("\n>>> [1/5] HARVESTING PAPERS VIA OPENALEX WORKS API...")
    broadcast_telemetry({
        "type": "STAGE_CHANGE",
        "stage": "harvest",
        "title": f"Harvesting {args.limit} OpenAlex papers ({args.concept})",
        "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
    })

    harvester = OpenAlexHarvester()
    records = harvester.harvest(
        limit=args.limit,
        from_date=args.from_date,
        concept=args.concept,
        upload_to_r2=args.sync_r2,
    )

    if not records:
        print("[WARNING] No records harvested. Exiting.")
        return

    print(f"[SUCCESS] Harvested {len(records)} records from OpenAlex.")

    # --------------------------------------------------------------------------
    # Step 2: Silver Parquet Normalization
    # --------------------------------------------------------------------------
    print("\n>>> [2/5] CHUNKING PAPERS & STRUCTURING METADATA...")
    broadcast_telemetry({
        "type": "STAGE_CHANGE",
        "stage": "duckdb",
        "title": f"Transforming {len(records)} OpenAlex works into Silver Parquet",
        "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
    })

    raw_chunks = build_chunks_from_openalex(records)
    print(f"[SUCCESS] Generated {len(raw_chunks)} chunks from {len(records)} papers.")

    # --------------------------------------------------------------------------
    # Step 3: Dense Vector Embedding (Nomic Embed v1.5 on Apple Silicon MPS)
    # --------------------------------------------------------------------------
    print("\n>>> [3/5] GENERATING 768-D DENSE VECTORS VIA NOMIC EMBEDDER (APPLE MPS)...")
    broadcast_telemetry({
        "type": "STAGE_CHANGE",
        "stage": "parallel",
        "title": f"Nomic Embed v1.5: Embedding {len(raw_chunks)} OpenAlex chunks into 768-D vectors",
        "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
    })

    embedder = NomicEmbedder()
    print(f"[INFO] Using hardware device: {embedder.device}")

    chunk_texts = [c["context_text"] for c in raw_chunks]
    vectors = embedder.embed_batch(chunk_texts, batch_size=args.batch_size)
    print(f"[SUCCESS] Generated {len(vectors)} dense embeddings (dim={len(vectors[0])}).")

    for idx, c in enumerate(raw_chunks):
        c["vector"] = vectors[idx]

    # --------------------------------------------------------------------------
    # Step 4: Upserting to LanceDB Gold Vector Table & Gold Parquet Export
    # --------------------------------------------------------------------------
    print("\n>>> [4/5] UPSERTING DIRECTLY INTO LANCEDB GOLD TABLE ('scientific_papers_gold')...")
    lancedb_mgr = LanceDBManager()
    table_name = "scientific_papers_gold"
    inserted_count = lancedb_mgr.insert_chunks(raw_chunks, table_name=table_name)
    total_table_rows = len(lancedb_mgr.db.open_table(table_name))
    print(f"[SUCCESS] Upserted {inserted_count} new chunks into LanceDB!")
    print(f"[INFO] Total rows in LanceDB Gold table: {total_table_rows:,}")

    # Emit pulse to frontend
    try:
        import httpx
        httpx.post(
            "http://localhost:8000/api/ingestion/broadcast",
            json={
                "type": "PAPER_INGESTED",
                "paper_id": f"openalex_batch_{len(records)}",
                "title": f"OpenAlex Gold Sync: {len(records)} papers, {inserted_count} vectors",
                "category": "OpenAlex",
                "stage": "GOLD",
                "vectors_synced": inserted_count,
                "bronze_bytes_delta": 0,
                "speed_ppm": 120.0,
                "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
            },
            timeout=0.3,
        )
    except Exception:
        pass

    # Export Gold Parquet for fast columnar query
    gold_parquet_dir = settings.ROOT_DIR / "data" / "gold" / "parquets"
    gold_parquet_dir.mkdir(parents=True, exist_ok=True)
    gold_parquet_path = gold_parquet_dir / "openalex_gold.parquet"
    clean_chunks = [{k: v for k, v in c.items() if k != "vector"} for c in raw_chunks]
    pd.DataFrame(clean_chunks).to_parquet(gold_parquet_path, engine="pyarrow", compression="zstd")
    print(f"[SUCCESS] Exported {len(clean_chunks)} chunks to Gold Parquet: {gold_parquet_path}")

    # --------------------------------------------------------------------------
    # Step 5: Instant Retrieval Verification Test
    # --------------------------------------------------------------------------
    print("\n>>> [5/5] VERIFYING SEARCH RETRIEVAL OVER OPENALEX GOLD INDEX...")
    test_query = "large language models deep learning artificial intelligence"
    q_vec = embedder.embed_query(test_query)
    results = lancedb_mgr.vector_search(query_vector=q_vec, table_name=table_name, limit=2)
    print(f"[VERIFY] Top-1 Retrieved Title: {results.iloc[0]['title']}")

    # --------------------------------------------------------------------------
    # Cloudflare R2 Multi-Tier Synchronization (Optional)
    # --------------------------------------------------------------------------
    if args.sync_r2:
        print("\n>>> [R2 SYNC] SYNCHRONIZING BRONZE, SILVER & GOLD TO CLOUDFLARE R2...")
        broadcast_telemetry({
            "type": "STAGE_CHANGE",
            "stage": "r2_sync",
            "title": "Synchronizing OpenAlex Bronze, Silver, Gold Parquet & LanceDB to Cloudflare R2",
            "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
        })
        from src.storage.r2_client import R2Client
        r2 = R2Client()

        # Upload Silver
        silver_file = settings.ROOT_DIR / "data" / "silver" / "openalex" / "openalex_all.parquet"
        if silver_file.exists():
            r2.upload_file(silver_file, "silver/openalex/openalex_all.parquet", content_type="application/vnd.apache.parquet")
            print("[R2 SYNC] [SUCCESS] Uploaded Silver: silver/openalex/openalex_all.parquet")

        # Upload Gold Parquet
        if gold_parquet_path.exists():
            r2.upload_file(gold_parquet_path, "gold/openalex/openalex_gold.parquet", content_type="application/vnd.apache.parquet")
            print("[R2 SYNC] [SUCCESS] Uploaded Gold Parquet: gold/openalex/openalex_gold.parquet")

        # Upload LanceDB Gold index
        local_gold = settings.ROOT_DIR / "data" / "gold" / "lancedb" / "scientific_papers_gold.lance"
        if local_gold.exists():
            local_files = [f.relative_to(local_gold.parent) for f in local_gold.rglob("*") if f.is_file()]
            r2_objs = r2.list_objects(prefix="gold/lancedb/scientific_papers_gold.lance/", max_keys=2000)
            r2_keys = {o["key"] for o in r2_objs}
            missing = [(local_gold.parent / rel, f"gold/lancedb/{rel}") for rel in local_files if f"gold/lancedb/{rel}" not in r2_keys]
            if missing:
                print(f"[R2 SYNC] Uploading {len(missing)} new LanceDB Gold segments...")
                for loc, r2_k in missing:
                    r2.upload_file(loc, r2_k)
                print("[R2 SYNC] [SUCCESS] LanceDB Gold vector index synchronized with Cloudflare R2!")

    broadcast_telemetry({
        "type": "STAGE_CHANGE",
        "stage": "completed",
        "title": f"OpenAlex Pipeline Finished: {len(records)} papers & {inserted_count} Gold vectors synced",
        "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
    })

    elapsed = time.time() - start_time
    print("\n" + "=" * 80)
    print(f"[ALL DONE] {len(records)} OPENALEX PAPERS END-TO-END PIPELINE COMPLETED IN {elapsed:.2f}s!")
    print("=" * 80)


if __name__ == "__main__":
    main()
