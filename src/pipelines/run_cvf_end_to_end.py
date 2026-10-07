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


def main():
    parser = argparse.ArgumentParser(description="End-to-End CVPR Ingestion to LanceDB Vector Indexing.")
    parser.add_argument("--limit", type=int, default=1000, help="Target papers to harvest and index (default: 1000)")
    parser.add_argument("--venue", type=str, default="CVPR2024", help="Target venue (default: CVPR2024, or CVPR2023, ICCV2023)")
    parser.add_argument("--delay", type=float, default=0.05, help="Polite delay between requests in seconds (default: 0.05)")
    parser.add_argument("--batch-size", type=int, default=32, help="Embedding batch size (default: 32)")
    args = parser.parse_args()

    start_time = time.time()
    print("\n" + "=" * 80)
    print("CVF / CVPR END-TO-END PIPELINE: INGESTION -> LAKEHOUSE -> LANCEDB GOLD")
    print(f"Target: {args.limit} papers | Venue: {args.venue} | Delay: {args.delay}s | Batch Size: {args.batch_size}")
    print("=" * 80)

    # --------------------------------------------------------------------------
    # Step 1 & 2: Ingestion & Silver Parquet Transformation
    # --------------------------------------------------------------------------
    print("\n>>> [1/4] HARVESTING FROM CVF OPEN ACCESS TO BRONZE & SILVER...")
    harvester = CvfHarvester(request_delay=args.delay)
    records = harvester.harvest_and_vault(total_limit=args.limit, venue=args.venue)

    if not records:
        print("[ERROR] No records harvested from CVF. Pipeline aborted.")
        return

    print(f"[SUCCESS] Harvested {len(records)} papers into Silver Lakehouse.")

    # --------------------------------------------------------------------------
    # Step 3: Chunking (Abstract + BibTeX Metadata)
    # --------------------------------------------------------------------------
    print("\n>>> [2/4] CHUNKING PAPERS & EXTRACTING CITATION UNITS...")
    raw_chunks = build_chunks_from_cvf(records)
    print(f"[SUCCESS] Generated {len(raw_chunks)} chunks from {len(records)} papers.")

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
    print(f"[ALL DONE] {len(records)} CVPR PAPERS END-TO-END PIPELINE COMPLETED IN {elapsed:.2f}s!")
    print("RAG IS NOW FULLY EQUIPPED TO RETRIEVE AND SYNTHESIZE FROM CVPR 2024!")
    print("=" * 80)


if __name__ == "__main__":
    main()
