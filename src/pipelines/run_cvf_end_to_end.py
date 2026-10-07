"""End-to-End Pipeline: CVF Open Access (CVPR 2024) Ingestion -> Silver -> LanceDB Gold.

Workflow:
1. Harvests N papers from CVF Open Access (CVPR2024 / ICCV).
2. Enriches each paper with full abstract from HTML DOM and BibTeX.
3. Vaults raw payload into Lakehouse Bronze (data/raw/cvf/) and Silver Parquet (data/silver/cvf/).
4. Chunks abstract and citation metadata into contextual units.
5. Generates 768-D dense vectors locally via Nomic-Embed-Text on Apple Silicon MPS.
6. Upserts directly into LanceDB Gold table ('scientific_papers_gold').
7. Executes immediate RAG verification query.

Usage:
    python -m src.pipelines.run_cvf_end_to_end --limit 1000 --venue CVPR2024 --delay 0.05 --batch-size 32
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
from src.ingestion.cvf_harvester import CvfHarvester
from src.utils.logger import setup_pipeline_logging

logger, log_file = setup_pipeline_logging("cvf_end_to_end")


def build_chunks_from_cvf(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Builds typed chunks (Abstract & BibTeX metadata) for dense vector indexing."""
    chunks = []
    for r in records:
        paper_id = r.get("paper_id", "")
        title = r.get("title", "")
        authors = r.get("authors", [])
        primary_cat = r.get("primary_category", "cs.CV")
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

        # Chunk 2: BibTeX & Citation Details Chunk
        sections_json = r.get("sections_json", "[]")
        import json
        try:
            sections = json.loads(sections_json)
            for s in sections:
                if "bibtex" in s.get("section_title", "").lower():
                    bib_text = s.get("content", "")
                    chunks.append({
                        "chunk_id": f"{paper_id}_bib",
                        "paper_id": paper_id,
                        "title": title,
                        "authors": authors,
                        "primary_category": primary_cat,
                        "section_title": s.get("section_title", "BibTeX Citation"),
                        "section_type": "bibtex",
                        "text": bib_text,
                        "context_text": f"Paper: {title}\nPublication Details & BibTeX:\n{bib_text}",
                        "word_count": len(bib_text.split()),
                    })
        except Exception:
            pass

    return chunks


def broadcast_telemetry(payload: dict):
    try:
        import httpx
        httpx.post("http://localhost:8000/api/ingestion/broadcast", json=payload, timeout=0.25)
    except Exception:
        pass


def main():
    parser = argparse.ArgumentParser(description="End-to-End CVPR Ingestion to LanceDB Vector Indexing.")
    parser.add_argument("--limit", type=int, default=1000, help="Target papers to harvest and index (default: 1000)")
    parser.add_argument("--venue", type=str, default="CVPR2024", help="Target venue (default: CVPR2024, or CVPR2023, ICCV2023)")
    parser.add_argument("--delay", type=float, default=0.05, help="Polite delay between requests in seconds (default: 0.05)")
    parser.add_argument("--batch-size", type=int, default=32, help="Embedding batch size (default: 32)")
    parser.add_argument("--sync-r2", action="store_true", default=False, help="Automatically sync Bronze, Silver, Gold Parquet, and LanceDB to Cloudflare R2")
    args = parser.parse_args()

    start_time = time.time()
    print("\n" + "=" * 80)
    print("CVF / CVPR END-TO-END PIPELINE: INGESTION -> LAKEHOUSE -> LANCEDB GOLD")
    print(f"Target: {args.limit} papers | Venue: {args.venue} | Delay: {args.delay}s | Batch Size: {args.batch_size} | Sync R2: {args.sync_r2}")
    print("=" * 80)

    # --------------------------------------------------------------------------
    # Step 1 & 2: Ingestion & Silver Parquet Transformation
    # --------------------------------------------------------------------------
    print("\n>>> [1/5] HARVESTING FROM CVF OPEN ACCESS TO BRONZE & SILVER...")
    broadcast_telemetry({
        "type": "STAGE_CHANGE",
        "stage": "harvest",
        "title": f"Harvesting {args.limit} papers from CVF Open Access ({args.venue})",
        "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
    })

    harvester = CvfHarvester(request_delay=args.delay)
    records = harvester.harvest_and_vault(total_limit=args.limit, venue=args.venue)

    if not records:
        print("[ERROR] No records harvested from CVF. Pipeline aborted.")
        return

    print(f"[SUCCESS] Harvested {len(records)} papers into Silver Lakehouse.")

    # --------------------------------------------------------------------------
    # Step 3: Chunking (Abstract + BibTeX Metadata)
    # --------------------------------------------------------------------------
    print("\n>>> [2/5] CHUNKING PAPERS & EXTRACTING CITATION UNITS...")
    broadcast_telemetry({
        "type": "STAGE_CHANGE",
        "stage": "duckdb",
        "title": f"Chunking & Transforming {len(records)} CVF papers into Silver Parquet",
        "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
    })
    raw_chunks = build_chunks_from_cvf(records)
    print(f"[SUCCESS] Generated {len(raw_chunks)} chunks from {len(records)} papers.")

    # --------------------------------------------------------------------------
    # Step 4: Dense Vector Embedding (Nomic Embed v1.5 on Apple Silicon MPS)
    # --------------------------------------------------------------------------
    print("\n>>> [3/5] GENERATING 768-D DENSE VECTORS VIA NOMIC EMBEDDER (APPLE MPS/GPU)...")
    broadcast_telemetry({
        "type": "STAGE_CHANGE",
        "stage": "parallel",
        "title": f"Nomic Embed v1.5 (Apple MPS): Embedding {len(raw_chunks)} chunks into 768-D vectors",
        "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
    })
    embedder = NomicEmbedder()
    print(f"[INFO] Using hardware device: {embedder.device}")

    context_texts = [c["context_text"] for c in raw_chunks]
    t_emb_start = time.time()
    vectors = embedder.embed_documents(context_texts, batch_size=args.batch_size)
    t_emb_elapsed = time.time() - t_emb_start

    print(f"[SUCCESS] Generated {len(vectors)} embeddings in {t_emb_elapsed:.2f}s ({len(vectors)/max(t_emb_elapsed,0.1):.1f} chunks/sec).")

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

    # Emit completion pulse to Frontend UI if FastAPI server is active
    try:
        import httpx
        httpx.post(
            "http://localhost:8000/api/ingestion/broadcast",
            json={
                "type": "PAPER_INGESTED",
                "paper_id": f"cvpr_batch_{len(records)}",
                "title": f"CVPR 2024 Gold Sync: {len(records)} papers, {inserted_count} vectors",
                "category": "cs.CV",
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

    # Export Gold Parquet for columnar query engine & cold backup
    gold_parquet_dir = settings.ROOT_DIR / "data" / "gold" / "parquets"
    gold_parquet_dir.mkdir(parents=True, exist_ok=True)
    gold_parquet_path = gold_parquet_dir / "cvpr2024_gold.parquet"
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
        broadcast_telemetry({
            "type": "STAGE_CHANGE",
            "stage": "r2_sync",
            "title": "Synchronizing Bronze, Silver, Gold Parquet & LanceDB to Cloudflare R2",
            "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
        })
        from src.storage.r2_client import R2Client
        r2 = R2Client()

        # 1. Bronze JSON vault upload
        bronze_files = sorted((settings.ROOT_DIR / "data" / "raw" / "cvf").glob("*.json"), key=os.path.getmtime)
        if bronze_files:
            latest_bronze = bronze_files[-1]
            r2_bronze_key = f"bronze/cvf/{latest_bronze.name}"
            r2.upload_file(latest_bronze, r2_bronze_key, content_type="application/json")
            print(f"[R2 SYNC] [SUCCESS] Uploaded Bronze: {r2_bronze_key}")

        # 2. Silver Parquet upload
        silver_file = settings.ROOT_DIR / "data" / "silver" / "cvf" / f"{args.venue.lower()}.parquet"
        if silver_file.exists():
            r2_silver_key = f"silver/cvf/{silver_file.name}"
            r2.upload_file(silver_file, r2_silver_key, content_type="application/vnd.apache.parquet")
            print(f"[R2 SYNC] [SUCCESS] Uploaded Silver: {r2_silver_key}")

        # 3. Gold Parquet upload
        if gold_parquet_path.exists():
            r2_gold_key = f"gold/cvf/{args.venue.lower()}_gold.parquet"
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

    broadcast_telemetry({
        "type": "STAGE_CHANGE",
        "stage": "completed",
        "title": f"CVPR Pipeline Finished: {len(records)} papers & {inserted_count} Gold vectors synced",
        "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
    })

    elapsed = time.time() - start_time
    print("\n" + "=" * 80)
    print(f"[ALL DONE] {len(records)} CVPR PAPERS END-TO-END PIPELINE COMPLETED IN {elapsed:.2f}s!")
    print("RAG IS NOW FULLY EQUIPPED TO RETRIEVE AND SYNTHESIZE FROM CVPR 2024!")
    print("=" * 80)


if __name__ == "__main__":
    main()
