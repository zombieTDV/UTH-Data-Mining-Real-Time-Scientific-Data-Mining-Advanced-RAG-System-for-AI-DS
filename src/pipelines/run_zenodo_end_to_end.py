"""End-to-End Pipeline: Zenodo Ingestion (Marker PDF Engine) -> Silver Lakehouse -> LanceDB Gold Indexing.

Executes the complete workflow from A to Z for Zenodo Open Science Publications:
1. Harvests N publications from Zenodo repository.
2. Downloads PDFs immediately and runs Marker PDF-to-Markdown engine with LaTeX math preservation.
3. Transforms structured text into Silver Parquet (data/silver/zenodo/).
4. Chunks full-text Markdown and abstract retaining equations and section hierarchy.
5. Generates 768-dim embeddings locally via Nomic-Embed-Text.
6. Upserts directly into LanceDB Gold table ('scientific_papers_gold').
7. Exports Gold Parquet for fast columnar analytics & backup.
8. Optionally synchronizes Bronze, Silver, Gold Parquet & LanceDB to Cloudflare R2.
9. Emits live stage-change telemetry to local frontend dashboard.

Usage:
    python -m src.pipelines.run_zenodo_end_to_end --limit 50 --query "machine learning" --sync-r2
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
from src.ingestion.zenodo_harvester import ZenodoHarvester
from src.utils.logger import setup_pipeline_logging

logger, log_file = setup_pipeline_logging("zenodo_end_to_end")


def build_chunks_from_zenodo(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Builds typed chunks from Zenodo publications preserving LaTeX math and sections."""
    chunks = []
    for r in records:
        paper_id = r.get("paper_id", "")
        title = r.get("title", "")
        authors = r.get("authors", [])
        primary_cat = r.get("primary_category", "Open Science")
        abstract = r.get("abstract", "")
        full_text = r.get("full_text", "")
        latex_count = r.get("latex_formulas_count", 0)

        # 1. Abstract Chunk
        if abstract:
            abs_context = f"Paper: {title}\nCategory: {primary_cat}\nAbstract: {abstract}"
            chunks.append({
                "chunk_id": f"{paper_id}_abs",
                "paper_id": paper_id,
                "title": title,
                "authors": authors,
                "primary_category": primary_cat,
                "section_title": "Abstract",
                "section_type": "abstract",
                "text": abstract,
                "context_text": abs_context,
                "word_count": len(abstract.split()),
            })

        # 2. Marker Markdown Chunks (if full-text markdown was extracted)
        markdown_content = r.get("markdown_content", "")
        if markdown_content and len(markdown_content) > 300:
            # Split into section blocks
            paragraphs = [p.strip() for p in markdown_content.split("\n\n") if len(p.strip()) > 80]
            for idx, p in enumerate(paragraphs[:10]):  # Top salient sections
                chunks.append({
                    "chunk_id": f"{paper_id}_marker_{idx}",
                    "paper_id": paper_id,
                    "title": title,
                    "authors": authors,
                    "primary_category": primary_cat,
                    "section_title": f"Section {idx+1} (Marker LaTeX)",
                    "section_type": "full_text",
                    "text": p,
                    "context_text": f"Paper: {title}\nSection Context: {p}",
                    "word_count": len(p.split()),
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
    parser = argparse.ArgumentParser(description="End-to-end Zenodo (Marker PDF) Ingestion to LanceDB Indexing.")
    parser.add_argument("--limit", type=int, default=50, help="Target papers to harvest (default: 50)")
    parser.add_argument("--query", type=str, default=None, help="Search query string")
    parser.add_argument("--batch-size", type=int, default=32, help="Embedding batch size (default: 32)")
    parser.add_argument("--sync-r2", action="store_true", default=False, help="Automatically sync to Cloudflare R2")
    args = parser.parse_args()

    start_time = time.time()
    search_q = args.query or settings.ZENODO_DEFAULT_QUERY
    print("\n" + "=" * 80)
    print("ZENODO END-TO-END PIPELINE: HARVEST -> MARKER PDF -> LAKEHOUSE -> LANCEDB GOLD")
    print(f"Target: {args.limit} papers | Query: {search_q} | Sync R2: {args.sync_r2}")
    print("=" * 80)

    # --------------------------------------------------------------------------
    # Step 1: Harvest and Run Marker on Zenodo Publications
    # --------------------------------------------------------------------------
    print("\n>>> [1/5] HARVESTING PAPERS & EXECUTING MARKER PDF ENGINE...")
    broadcast_telemetry({
        "event": "stage_start",
        "stage": "harvesting",
        "title": f"Harvesting {args.limit} Zenodo papers with Marker PDF engine",
        "timestamp": datetime.datetime.now().isoformat(),
    })

    harvester = ZenodoHarvester()
    records = harvester.harvest(limit=args.limit, query=search_q, upload_to_r2=args.sync_r2)

    if not records:
        print("[WARNING] No records harvested from Zenodo. Pipeline stopped.")
        return

    print(f"[SUCCESS] Harvested {len(records)} records from Zenodo.")

    # --------------------------------------------------------------------------
    # Step 2: Chunking Structured Text & LaTeX Content
    # --------------------------------------------------------------------------
    print("\n>>> [2/5] CHUNKING ZENODO ABSTRACTS & MARKER LATEX SECTIONS...")
    broadcast_telemetry({
        "event": "stage_start",
        "stage": "chunking",
        "title": f"Chunking {len(records)} Zenodo works with LaTeX preservation",
        "timestamp": datetime.datetime.now().isoformat(),
    })

    raw_chunks = build_chunks_from_zenodo(records)
    print(f"[SUCCESS] Constructed {len(raw_chunks)} typed chunks from Zenodo publications.")

    # --------------------------------------------------------------------------
    # Step 3: Embed Chunks Locally via Nomic-Embed-Text
    # --------------------------------------------------------------------------
    print("\n>>> [3/5] VECTOR EMBEDDING VIA LOCAL NOMIC EMBED V1.5 (768-D)...")
    broadcast_telemetry({
        "event": "stage_start",
        "stage": "embedding",
        "title": f"Nomic Embed v1.5: Embedding {len(raw_chunks)} Zenodo chunks into 768-D vectors",
        "timestamp": datetime.datetime.now().isoformat(),
    })

    embedder = NomicEmbedder()
    chunk_texts = [f"search_document: {c['context_text']}" for c in raw_chunks]

    emb_start = time.time()
    embeddings = embedder.embed_documents(chunk_texts, batch_size=args.batch_size)
    emb_duration = time.time() - emb_start

    print(f"[SUCCESS] Generated {len(embeddings)} embeddings in {emb_duration:.2f}s ({len(embeddings)/max(0.1, emb_duration):.1f} chunks/sec).")

    # Combine chunk metadata with vector embeddings
    embedded_chunks = []
    for chunk, emb in zip(raw_chunks, embeddings):
        chunk["vector"] = emb
        embedded_chunks.append(chunk)

    # --------------------------------------------------------------------------
    # Step 4: Upsert Vectors into LanceDB Gold Table
    # --------------------------------------------------------------------------
    print("\n>>> [4/5] UPSERTING INTO LANCEDB GOLD LAYER (TABLE: 'scientific_papers_gold')...")
    lancedb_mgr = LanceDBManager(db_path=settings.ROOT_DIR / "data" / "gold" / "lancedb")

    inserted_count = lancedb_mgr.insert_chunks(
        chunks=embedded_chunks,
        table_name="scientific_papers_gold",
    )
    gold_table = lancedb_mgr.get_or_create_table("scientific_papers_gold")
    total_table_rows = gold_table.count_rows()
    print(f"[SUCCESS] Upserted {inserted_count} Zenodo vectors into LanceDB Gold! Total: {total_table_rows:,} rows.")

    # Export Gold Parquet
    gold_parquet_dir = settings.ROOT_DIR / "data" / "gold" / "parquets"
    gold_parquet_dir.mkdir(parents=True, exist_ok=True)
    gold_parquet_path = gold_parquet_dir / "zenodo_gold.parquet"

    df_gold = pd.DataFrame([{k: v for k, v in c.items() if k != "vector"} for c in embedded_chunks])
    df_gold.to_parquet(gold_parquet_path, index=False)
    print(f"[SUCCESS] Exported Gold Parquet backup: {gold_parquet_path}")

    # --------------------------------------------------------------------------
    # Step 5: Test Search Verification
    # --------------------------------------------------------------------------
    print("\n>>> [5/5] VERIFYING SEARCH RETRIEVAL OVER ZENODO GOLD INDEX...")
    test_query = "search_query: machine learning algorithm neural network"
    test_vec = embedder.embed_query(test_query)
    search_df = lancedb_mgr.vector_search(
        query_vector=test_vec,
        limit=3,
        table_name="scientific_papers_gold",
    )
    print(f"Top 3 retrieved results for query '{test_query}':")
    for idx, row in search_df.iterrows():
        print(f"  [{idx+1}] {str(row.get('title', 'N/A'))[:60]}... | Section: {row.get('section_title', '')}")

    # Optional R2 Sync
    if args.sync_r2:
        from src.storage.r2_client import R2Client
        r2 = R2Client()
        if r2.is_configured:
            silver_file = settings.ROOT_DIR / "data" / "silver" / "zenodo" / "zenodo_all.parquet"
            if silver_file.exists():
                r2.upload_file(silver_file, "silver/zenodo/zenodo_all.parquet", content_type="application/vnd.apache.parquet")
                print("[R2 SYNC] [SUCCESS] Uploaded Silver: silver/zenodo/zenodo_all.parquet")
            if gold_parquet_path.exists():
                r2.upload_file(gold_parquet_path, "gold/zenodo/zenodo_gold.parquet", content_type="application/vnd.apache.parquet")
                print("[R2 SYNC] [SUCCESS] Uploaded Gold: gold/zenodo/zenodo_gold.parquet")

    elapsed = time.time() - start_time
    broadcast_telemetry({
        "event": "stage_end",
        "stage": "complete",
        "title": f"Zenodo Pipeline Complete: {len(records)} papers & {inserted_count} Gold vectors synced",
        "timestamp": datetime.datetime.now().isoformat(),
    })
    print(f"\n[ALL DONE] {len(records)} ZENODO PAPERS END-TO-END PIPELINE COMPLETED IN {elapsed:.2f}s!")


if __name__ == "__main__":
    main()
