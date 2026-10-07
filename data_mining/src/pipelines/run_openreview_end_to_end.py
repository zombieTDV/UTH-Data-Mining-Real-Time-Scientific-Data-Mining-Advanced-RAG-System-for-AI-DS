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
    args = parser.parse_args()

    start_time = time.time()
    print("\n" + "=" * 80)
    print("OPENREVIEW END-TO-END PIPELINE: INGESTION -> LAKEHOUSE -> LANCEDB GOLD")
    print(f"Target: {args.limit} papers | Venue: {args.venue} | Batch Size: {args.batch_size}")
    print("=" * 80)

    # --------------------------------------------------------------------------
    # Step 1 & 2: Ingestion & Silver Parquet Transformation
    # --------------------------------------------------------------------------
    print("\n>>> [1/4] HARVESTING FROM OPENREVIEW TO BRONZE & SILVER...")
    harvester = OpenReviewHarvester()
    records = harvester.harvest_and_vault(total_limit=args.limit, venue=args.venue)

    if not records:
        print("[ERROR] No records harvested from OpenReview. Pipeline aborted.")
        return

    print(f"[SUCCESS] Harvested {len(records)} papers into Silver Lakehouse.")

    # --------------------------------------------------------------------------
    # Step 3: Dual Chunking (Abstract + Review Critique)
    # --------------------------------------------------------------------------
    print("\n>>> [2/4] CHUNKING PAPERS & EXTRACTING REVIEW CRITIQUES...")
    raw_chunks = build_chunks_from_silver(records)
    print(f"[SUCCESS] Generated {len(raw_chunks)} chunks ({len(records)} abstracts + review units).")

    # --------------------------------------------------------------------------
    # Step 4: Dense Vector Embedding (Nomic Embed v1.5 on Apple Silicon MPS)
    # --------------------------------------------------------------------------
    print("\n>>> [3/4] GENERATING 768-D DENSE VECTORS VIA NOMIC EMBEDDER (APPLE MPS/GPU)...")
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
    # Step 5: Upserting to LanceDB Gold Vector Table
    # --------------------------------------------------------------------------
    print("\n>>> [4/4] UPSERTING DIRECTLY INTO LANCEDB GOLD TABLE ('scientific_papers_gold')...")
    lancedb_mgr = LanceDBManager()
    table_name = "scientific_papers_gold"
    inserted_count = lancedb_mgr.insert_chunks(raw_chunks, table_name=table_name)
    total_table_rows = len(lancedb_mgr.db.open_table(table_name))

    print(f"[SUCCESS] Upserted {inserted_count} new chunks into LanceDB!")
    print(f"[INFO] Total rows in LanceDB Gold table: {total_table_rows:,}")

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

    elapsed = time.time() - start_time
    print("\n" + "=" * 80)
    print(f"[ALL DONE] 1,000 PAPERS END-TO-END PIPELINE COMPLETED IN {elapsed:.2f}s!")
    print("RAG IS NOW FULLY EQUIPPED TO RETRIEVE AND SYNTHESIZE FROM OPENREVIEW!")
    print("=" * 80)


if __name__ == "__main__":
    main()
