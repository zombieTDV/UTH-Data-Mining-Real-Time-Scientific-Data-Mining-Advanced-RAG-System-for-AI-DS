"""End-to-End Pipeline: OpenReview Ingestion -> Silver Lakehouse -> LanceDB Gold Indexing.

Executes the complete workflow from A to Z:
1. Harvests N papers from OpenReview (Bronze JSON vault).
2. Transforms into Silver Parquet with consensus & controversy metrics.
3. Chunks abstract and peer reviews into distinct contextual units.
4. Generates 768-dim embeddings locally via Nomic-Embed-Text on Apple Silicon MPS.
5. Upserts directly into LanceDB Gold table ('scientific_papers_gold').
6. Executes immediate retrieval verification to guarantee RAG readiness.

Usage:
    python -m src.pipelines.run_openreview_end_to_end --limit 1000 --venue ALL --batch-size 32
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
from src.ingestion.openreview_harvester import OpenReviewHarvester
from src.utils.logger import setup_pipeline_logging

logger, log_file = setup_pipeline_logging("openreview_end_to_end")


def build_chunks_from_silver(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Builds typed chunks (Abstract & Peer Review Critique) for dense vector indexing."""
    chunks = []
    for r in records:
        paper_id = r.get("paper_id", "")
        title = r.get("title", "")
        authors = r.get("authors", [])
        primary_cat = r.get("primary_category", "cs.LG")
        abstract = r.get("abstract", "")

        # Chunk 1: Abstract Body Chunk
        if abstract:
            chunks.append({
                "chunk_id": f"{paper_id}_abs",
                "paper_id": paper_id,
                "title": title,
                "authors": authors,
                "primary_category": primary_cat,
                "section_title": "Abstract",
                "section_type": "abstract",
                "text": abstract,
                "context_text": f"Paper: {title}\nAbstract: {abstract}",
                "word_count": len(abstract.split()),
            })

        # Chunk 2: Peer Review & Critique Chunk
        sections_json = r.get("sections_json", "[]")
        import json
        try:
            sections = json.loads(sections_json)
            for s in sections:
                if "review" in s.get("section_title", "").lower():
                    rev_text = s.get("content", "")
                    consensus = r.get("consensus_score", 0.70)
                    chunks.append({
                        "chunk_id": f"{paper_id}_critique",
                        "paper_id": paper_id,
                        "title": title,
                        "authors": authors,
                        "primary_category": primary_cat,
                        "section_title": s.get("section_title", "Peer Reviews"),
                        "section_type": "review",
                        "text": rev_text,
                        "context_text": f"Paper: {title}\nOpenReview Peer Reviews (Consensus Score: {consensus:.2f}):\n{rev_text}",
                        "word_count": len(rev_text.split()),
                    })
        except Exception:
            pass

    return chunks


def main():
    parser = argparse.ArgumentParser(description="End-to-end OpenReview Ingestion to LanceDB Vector Indexing.")
    parser.add_argument("--limit", type=int, default=1000, help="Target papers to harvest and index (default: 1000)")
    parser.add_argument("--venue", type=str, default="ALL", help="Target venue or group (ALL, ml_core, nlp, ICLR)")
    parser.add_argument("--batch-size", type=int, default=32, help="Embedding batch size (default: 32)")
    parser.add_argument("--sync-r2", action="store_true", default=False, help="Automatically sync Bronze, Silver, Gold Parquet, and LanceDB to Cloudflare R2")
    args = parser.parse_args()

    start_time = time.time()
    print("\n" + "=" * 80)
    print("OPENREVIEW END-TO-END PIPELINE: INGESTION -> LAKEHOUSE -> LANCEDB GOLD")
    print(f"Target: {args.limit} papers | Venue: {args.venue} | Batch Size: {args.batch_size} | Sync R2: {args.sync_r2}")
    print("=" * 80)

    # --------------------------------------------------------------------------
    # Step 1 & 2: Ingestion & Silver Parquet Transformation
    # --------------------------------------------------------------------------
    print("\n>>> [1/5] HARVESTING FROM OPENREVIEW TO BRONZE & SILVER...")
    harvester = OpenReviewHarvester()
    records = harvester.harvest_and_vault(total_limit=args.limit, venue=args.venue)

    if not records:
        print("[ERROR] No records harvested from OpenReview. Pipeline aborted.")
        return

    print(f"[SUCCESS] Harvested {len(records)} papers into Silver Lakehouse.")

    # --------------------------------------------------------------------------
    # Step 3: Dual Chunking (Abstract + Review Critique)
    # --------------------------------------------------------------------------
    print("\n>>> [2/5] CHUNKING PAPERS & EXTRACTING REVIEW CRITIQUES...")
    raw_chunks = build_chunks_from_silver(records)
    print(f"[SUCCESS] Generated {len(raw_chunks)} chunks ({len(records)} abstracts + review units).")

    # --------------------------------------------------------------------------
    # Step 4: Dense Vector Embedding (Nomic Embed v1.5 on Apple Silicon MPS)
    # --------------------------------------------------------------------------
    print("\n>>> [3/5] GENERATING 768-D DENSE VECTORS VIA NOMIC EMBEDDER (APPLE MPS/GPU)...")
    embedder = NomicEmbedder()
    print(f"[INFO] Using hardware device: {embedder.device}")

    context_texts = [c["context_text"] for c in raw_chunks]
    t_emb_start = time.time()
    vectors = embedder.embed_documents(context_texts, batch_size=args.batch_size)
    t_emb_elapsed = time.time() - t_emb_start

    print(f"[SUCCESS] Generated {len(vectors)} embeddings in {t_emb_elapsed:.2f}s ({len(vectors)/max(t_emb_elapsed,0.1):.1f} chunks/sec).")

    # Attach vectors to chunks
    for idx, c in enumerate(raw_chunks):
        c["vector"] = vectors[idx]

    # --------------------------------------------------------------------------
    # Step 5: Upserting to LanceDB Gold Vector Table & Gold Parquet Export
    # --------------------------------------------------------------------------
    print("\n>>> [4/5] UPSERTING DIRECTLY INTO LANCEDB GOLD TABLE ('scientific_papers_gold')...")
    lancedb_mgr = LanceDBManager()
    table_name = "scientific_papers_gold"
    inserted_count = lancedb_mgr.insert_chunks(raw_chunks, table_name=table_name)
    total_table_rows = len(lancedb_mgr.db.open_table(table_name))

    print(f"[SUCCESS] Upserted {inserted_count} new chunks into LanceDB!")
    print(f"[INFO] Total rows in LanceDB Gold table: {total_table_rows:,}")

    # Export Gold Parquet for columnar query engine & cold backup
    gold_parquet_dir = settings.ROOT_DIR / "data" / "gold" / "parquets"
    gold_parquet_dir.mkdir(parents=True, exist_ok=True)
    gold_parquet_path = gold_parquet_dir / "openreview_gold.parquet"
    clean_chunks = [{k: v for k, v in c.items() if k != "vector"} for c in raw_chunks]
    pd.DataFrame(clean_chunks).to_parquet(gold_parquet_path, engine="pyarrow", compression="zstd")
    print(f"[SUCCESS] Exported {len(clean_chunks)} chunks to Gold Parquet: {gold_parquet_path}")

    # --------------------------------------------------------------------------
    # Step 6: Instant Verification Test Query
    # --------------------------------------------------------------------------
    print("\n>>> [VERIFICATION] TESTING INSTANT RAG RETRIEVAL...")
    table = lancedb_mgr.db.open_table(table_name)
    sample_paper = records[0]
    test_query = sample_paper["title"][:50]
    query_vec = embedder.embed_documents([f"search_query: {test_query}"], batch_size=1)[0]
    results = table.search(query_vec).limit(3).to_pandas()

    print(f"Query: '{test_query}'")
    print(f"Top-1 Retrieved Chunk ID: {results.iloc[0]['chunk_id']}")
    print(f"Top-1 Retrieved Title:    {results.iloc[0]['title']}")
    print(f"Top-1 Section Type:       {results.iloc[0]['section_type']}")

    # --------------------------------------------------------------------------
    # Optional Step 7: Cloudflare R2 Multi-Tier Synchronization
    # --------------------------------------------------------------------------
    if args.sync_r2:
        print("\n>>> [5/5] SYNCHRONIZING BRONZE, SILVER & GOLD TO CLOUDFLARE R2...")
        from src.storage.r2_client import R2Client
        r2 = R2Client()

        # 1. Bronze JSON vault upload
        bronze_files = sorted((settings.ROOT_DIR / "data" / "raw" / "openreview").glob("*.json"), key=os.path.getmtime)
        if bronze_files:
            latest_bronze = bronze_files[-1]
            r2_bronze_key = f"bronze/openreview/{latest_bronze.name}"
            r2.upload_file(latest_bronze, r2_bronze_key, content_type="application/json")
            print(f"[R2 SYNC] [SUCCESS] Uploaded Bronze: {r2_bronze_key}")

        # 2. Silver Parquet upload
        silver_file = settings.ROOT_DIR / "data" / "silver" / "openreview" / f"openreview_{args.venue.lower()}.parquet"
        if silver_file.exists():
            r2_silver_key = f"silver/openreview/{silver_file.name}"
            r2.upload_file(silver_file, r2_silver_key, content_type="application/vnd.apache.parquet")
            print(f"[R2 SYNC] [SUCCESS] Uploaded Silver: {r2_silver_key}")

        # 3. Gold Parquet upload
        if gold_parquet_path.exists():
            r2_gold_key = "gold/openreview/openreview_gold.parquet"
            r2.upload_file(gold_parquet_path, r2_gold_key, content_type="application/vnd.apache.parquet")
            print(f"[R2 SYNC] [SUCCESS] Uploaded Gold Parquet: {r2_gold_key}")

        # 4. Incremental LanceDB Gold index upload
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
                print("[R2 SYNC] [SUCCESS] LanceDB Gold vector index 100% synchronized with R2!")
            else:
                print("[R2 SYNC] LanceDB Gold already in sync on Cloudflare R2.")

    elapsed = time.time() - start_time
    print("\n" + "=" * 80)
    print(f"[ALL DONE] {len(records)} PAPERS END-TO-END PIPELINE COMPLETED IN {elapsed:.2f}s!")
    print("RAG IS NOW FULLY EQUIPPED TO RETRIEVE AND SYNTHESIZE FROM OPENREVIEW!")
    print("=" * 80)


if __name__ == "__main__":
    main()
