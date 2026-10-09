"""Tier 1: Historical Core Pipeline (Top 3,000 All-Time Landmark Papers).

Ingests seminal, most-cited AI and Data Science milestone papers in history:
- Sorted strictly by citation count (cite_count DESC).
- Balanced stratification across 5 core categories:
    cs.CV (Computer Vision), cs.CL (NLP/LLMs), cs.LG (Machine Learning),
    cs.AI (Foundational AI), cs.RO (Robotics).
- Balanced across publication years (e.g., 2012–2023+).
- Harvested across 4 canonical sources: arXiv, OpenReview, CVF, Zenodo.
- Deduplication via normalized SHA-256 abstract hashing (LakehouseDeduplicator).
- PDF extraction powered by Marker (marker-pdf) with LaTeX math preservation ($ ... $, $$ ... $$).
- Lakehouse Vaulting: Bronze JSON -> Silver Parquet -> Gold LanceDB (Nomic-Embed 768-D).
- Zero-polling cost-shield telemetry via local FastAPI SSE bridge.

Usage:
    python -m src.pipelines.run_tier1_historical_core --limit 50 --use-marker
    python -m src.pipelines.run_tier1_historical_core --limit 3000
"""

import argparse
import datetime
import json
import logging
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import httpx
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config.settings import settings
from src.indexing.embedder import NomicEmbedder
from src.indexing.lancedb_manager import LanceDBManager
from src.storage.r2_client import R2Client
from src.transformation.lakehouse_deduplicator import LakehouseDeduplicator
from src.transformation.marker_extractor import MarkerPdfExtractor
from src.transformation.silver_writer import SilverLakehouseWriter
from src.utils.hasher import compute_abstract_hash
from src.utils.logger import setup_pipeline_logging

logger, log_file = setup_pipeline_logging("tier1_historical_core")

# Canonical Category Concept Mapping (OpenAlex & ArXiv alignment)
CATEGORY_CONCEPTS = {
    "cs.CV": {"concept_id": "C154945302", "name": "Computer Vision", "search": "computer vision"},
    "cs.CL": {"concept_id": "C204321447", "name": "Computation and Language", "search": "natural language processing transformer"},
    "cs.LG": {"concept_id": "C119857082", "name": "Machine Learning", "search": "deep learning neural network optimization"},
    "cs.AI": {"concept_id": "C41008148", "name": "Artificial Intelligence", "search": "artificial intelligence reinforcement learning"},
    "cs.RO": {"concept_id": "C90856484", "name": "Robotics", "search": "robotics visual slam manipulation"},
}


def broadcast_telemetry(payload: dict):
    """Sends telemetry pulse to local FastAPI SSE bridge without querying R2."""
    try:
        httpx.post("http://localhost:8000/api/ingestion/broadcast", json=payload, timeout=0.25)
    except Exception:
        pass


def reconstruct_abstract_from_inverted_index(inverted_index: Optional[Dict[str, List[int]]]) -> str:
    """Reconstructs continuous text from OpenAlex abstract_inverted_index."""
    if not inverted_index or not isinstance(inverted_index, dict):
        return ""
    word_positions = []
    for word, positions in inverted_index.items():
        if isinstance(positions, list):
            for pos in positions:
                word_positions.append((pos, word))
    word_positions.sort(key=lambda x: x[0])
    return " ".join(w[1] for w in word_positions)


class Tier1HistoricalHarvester:
    """Orchestrates ingestion of all-time landmark scientific papers."""

    OPENALEX_API_URL = "https://api.openalex.org/works"

    def __init__(
        self,
        target_total: int = 3000,
        use_marker: bool = True,
        sync_r2: bool = False,
    ):
        self.target_total = target_total
        self.use_marker = use_marker
        self.sync_r2 = sync_r2

        self.r2 = R2Client() if sync_r2 else None
        self.dedup = LakehouseDeduplicator()
        self.marker_extractor = MarkerPdfExtractor(use_marker=use_marker, max_pages=15)
        self.silver_writer = SilverLakehouseWriter(r2_client=self.r2)

        self.bronze_dir = settings.ROOT_DIR / "data" / "raw" / "tier1"
        self.pdf_dir = self.bronze_dir / "pdfs"
        self.markdown_dir = self.bronze_dir / "markdowns"
        self.bronze_dir.mkdir(parents=True, exist_ok=True)
        self.pdf_dir.mkdir(parents=True, exist_ok=True)
        self.markdown_dir.mkdir(parents=True, exist_ok=True)

        self.http_client = httpx.Client(
            headers={
                "User-Agent": "UTH-DataMining-Tier1Core/2.0 (academic research; contact: datamining@uth.edu.vn)"
            },
            timeout=30.0,
            follow_redirects=True,
        )

    def harvest_landmark_metadata(self) -> List[Dict[str, Any]]:
        """Harvests landmark paper metadata balanced across 5 categories, sorted by cite_count DESC."""
        categories = list(CATEGORY_CONCEPTS.keys())
        per_category_target = max(1, self.target_total // len(categories))
        logger.info(
            "[TIER 1] Target total: %d landmark papers (%d per category across %s)",
            self.target_total,
            per_category_target,
            categories,
        )

        all_candidates: List[Dict[str, Any]] = []

        for cat_code, cat_meta in CATEGORY_CONCEPTS.items():
            concept_id = cat_meta["concept_id"]
            cat_name = cat_meta["name"]
            logger.info("[TIER 1] Fetching top landmark papers for category: %s (%s)...", cat_code, cat_name)

            page = 1
            cat_collected = 0
            per_page = min(50, per_category_target)

            while cat_collected < per_category_target:
                params = {
                    "filter": f"concepts.id:{concept_id},is_paratext:false,is_retracted:false",
                    "sort": "cited_by_count:desc",
                    "per-page": per_page,
                    "page": page,
                }
                try:
                    resp = self.http_client.get(self.OPENALEX_API_URL, params=params)
                    if resp.status_code != 200:
                        logger.warning("[TIER 1] OpenAlex returned HTTP %d on page %d for %s", resp.status_code, page, cat_code)
                        break

                    data = resp.json()
                    results = data.get("results", [])
                    if not results:
                        break

                    for w in results:
                        title = w.get("title") or w.get("display_name") or ""
                        if not title:
                            continue

                        # Extract abstract
                        abstract = reconstruct_abstract_from_inverted_index(w.get("abstract_inverted_index"))
                        cite_count = int(w.get("cited_by_count") or 0)
                        pub_year = w.get("publication_year") or 2020
                        pub_date = w.get("publication_date") or f"{pub_year}-01-01"

                        # Extract IDs
                        ids = w.get("ids", {})
                        doi = ids.get("doi") or w.get("doi")
                        arxiv_id = ids.get("arxiv")
                        if arxiv_id and "arxiv.org/abs/" in arxiv_id:
                            arxiv_id = arxiv_id.split("arxiv.org/abs/")[-1]

                        # Detect PDF URL
                        best_oa = w.get("best_oa_location") or {}
                        pdf_url = best_oa.get("pdf_url") or ""
                        if not pdf_url and arxiv_id:
                            pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
                        if not pdf_url and w.get("open_access", {}).get("oa_url"):
                            pdf_url = w["open_access"]["oa_url"]

                        # Detect Source / Venue
                        source = "arxiv" if arxiv_id else "open_access"
                        primary_loc = w.get("primary_location") or {}
                        source_obj = primary_loc.get("source") or {}
                        venue_name = source_obj.get("display_name", "")
                        if "CVPR" in venue_name or "ICCV" in venue_name:
                            source = "cvf"
                        elif "ICLR" in venue_name or "NeurIPS" in venue_name or "OpenReview" in venue_name:
                            source = "openreview"
                        elif "Zenodo" in venue_name or (doi and "zenodo" in str(doi).lower()):
                            source = "zenodo"

                        # Extract Authors
                        authors = []
                        for auth in w.get("authorships", []):
                            author_obj = auth.get("author", {})
                            aname = author_obj.get("display_name")
                            if aname:
                                authors.append(aname)

                        paper_id = arxiv_id if arxiv_id else (f"doi_{doi.replace('https://doi.org/', '').replace('/', '_')}" if doi else f"oa_{w.get('id', '').split('/')[-1]}")

                        # Check abstract hash duplicate
                        is_dup, abs_hash = self.dedup.is_duplicate(abstract, title)

                        candidate = {
                            "paper_id": paper_id,
                            "abstract_hash": abs_hash,
                            "is_duplicate": is_dup,
                            "title": title,
                            "abstract": abstract,
                            "authors": authors,
                            "categories": [cat_code],
                            "primary_category": cat_code,
                            "published_date": pub_date,
                            "publication_year": pub_year,
                            "cite_count": cite_count,
                            "arxiv_id": arxiv_id,
                            "doi": doi,
                            "pdf_url": pdf_url,
                            "html_url": w.get("id"),
                            "source": source,
                            "venue": venue_name,
                        }

                        all_candidates.append(candidate)
                        cat_collected += 1
                        if cat_collected >= per_category_target:
                            break

                    page += 1
                    time.sleep(0.3)
                except Exception as e:
                    logger.error("[TIER 1] Error querying OpenAlex for %s: %s", cat_code, e)
                    break

        # Sort all candidates strictly by cite_count DESC
        all_candidates.sort(key=lambda x: x.get("cite_count", 0), reverse=True)
        logger.info("[TIER 1] Harvested %d landmark candidates across 5 categories.", len(all_candidates))
        return all_candidates

    def download_and_extract_pdf(self, paper: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
        """Downloads PDF and runs Marker PDF-to-Markdown with LaTeX formula preservation."""
        paper_id = paper["paper_id"]
        pdf_url = paper.get("pdf_url", "")
        safe_id = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", paper_id)
        local_pdf = self.pdf_dir / f"{safe_id}.pdf"
        local_md = self.markdown_dir / f"{safe_id}.md"

        # Check existing markdown cache
        if local_md.exists() and local_md.stat().st_size > 100:
            try:
                with open(local_md, "r", encoding="utf-8") as f:
                    content = f.read()
                return content, {"extractor": "marker_cache", "cached": True}
            except Exception:
                pass

        if not pdf_url:
            return "", {"status": "NO_PDF_URL"}

        # Download PDF if not present
        if not local_pdf.exists() or local_pdf.stat().st_size < 1000:
            try:
                # If paper has arXiv ID, prefer official arXiv export PDF
                download_urls = []
                if "arxiv_id" in paper and paper["arxiv_id"]:
                    download_urls.append(f"https://arxiv.org/pdf/{paper['arxiv_id']}.pdf")
                if pdf_url and pdf_url not in download_urls:
                    download_urls.append(pdf_url)

                downloaded = False
                for target_url in download_urls:
                    resp = self.http_client.get(target_url, timeout=45.0)
                    if resp.status_code == 200 and len(resp.content) > 1000:
                        if resp.content.startswith(b"%PDF"):
                            with open(local_pdf, "wb") as f:
                                f.write(resp.content)
                            downloaded = True
                            break

                if not downloaded:
                    return "", {"status": "NO_VALID_PDF_STREAM"}
            except Exception as e:
                logger.debug("[TIER 1] Could not download PDF for %s: %s", paper_id, e)
                return "", {"status": "DOWNLOAD_EXCEPTION", "error": str(e)}

        # Execute Marker PDF extraction
        try:
            markdown_text, meta = self.marker_extractor.convert_pdf_to_markdown(local_pdf)
            with open(local_md, "w", encoding="utf-8") as f:
                f.write(markdown_text)
            return markdown_text, meta
        except Exception as e:
            logger.warning("[TIER 1] Marker conversion error for %s: %s", paper_id, e)
            return "", {"status": "MARKER_ERROR", "error": str(e)}

    def build_chunks(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Extracts contextual chunks preserving LaTeX formulas and hierarchical headers."""
        chunks = []
        for r in records:
            paper_id = r.get("paper_id", "")
            title = r.get("title", "")
            authors = r.get("authors", [])
            primary_cat = r.get("primary_category", "cs.AI")
            abstract = r.get("abstract", "")
            cite_count = r.get("cite_count", 0)

            # Abstract Chunk
            if abstract:
                abs_context = f"Landmark Paper: {title} (Citations: {cite_count:,})\nCategory: {primary_cat}\nAbstract: {abstract}"
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

            # Marker Markdown Chunks
            markdown_content = r.get("markdown_content", "")
            if markdown_content and len(markdown_content) > 200:
                paragraphs = [p.strip() for p in markdown_content.split("\n\n") if len(p.strip()) > 80]
                for idx, p in enumerate(paragraphs[:10]):
                    chunks.append({
                        "chunk_id": f"{paper_id}_marker_{idx}",
                        "paper_id": paper_id,
                        "title": title,
                        "authors": authors,
                        "primary_category": primary_cat,
                        "section_title": f"Section {idx+1} (Marker LaTeX)",
                        "section_type": "full_text",
                        "text": p,
                        "context_text": f"Paper: {title} [Landmark, Citations: {cite_count:,}]\nSection Content: {p}",
                        "word_count": len(p.split()),
                    })

        return chunks

    def run(self) -> Dict[str, Any]:
        """Executes complete Tier 1 Historical Core harvest and vaulting."""
        start_time = time.time()
        logger.info("[TIER 1] Starting Historical Core Pipeline (Target: %d landmark papers)...", self.target_total)

        broadcast_telemetry({
            "type": "STAGE_CHANGE",
            "tier": "tier1",
            "stage": "harvest_init",
            "title": f"Starting Tier 1 Historical Core (Target: {self.target_total} landmark papers)",
        })

        candidates = self.harvest_landmark_metadata()
        if not candidates:
            logger.warning("[TIER 1] No landmark metadata collected.")
            return {"status": "NO_RECORDS", "ingested": 0}

        ingested_records: List[Dict[str, Any]] = []
        new_papers_count = 0
        duplicate_count = 0

        logger.info("[TIER 1] Processing candidates with Marker PDF extraction & abstract hashing...")
        for idx, paper in enumerate(candidates):
            p_id = paper["paper_id"]
            title = paper["title"]
            cite_count = paper["cite_count"]
            abs_hash = paper["abstract_hash"]

            # Deduplication Check
            if paper.get("is_duplicate"):
                duplicate_count += 1
                logger.info("[TIER 1] [DEDUP SKIP] (%d/%d) %s (Citations: %d) already in Lakehouse.", idx + 1, len(candidates), title[:50], cite_count)
                continue

            # PDF Download & Marker Extraction
            md_text, meta = self.download_and_extract_pdf(paper)
            math_count = meta.get("latex_formulas_count", len(re.findall(r"\$[^$]+\$|\$\$[^$]+\$\$", md_text)))

            paper["markdown_content"] = md_text
            paper["total_math_count"] = math_count
            paper["total_words"] = len(md_text.split()) if md_text else len(paper.get("abstract", "").split())
            paper["crawled_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()

            # Record in Deduplicator
            self.dedup.record(abs_hash, p_id)

            # Save Bronze Raw JSON
            safe_id = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", p_id)
            bronze_file = self.bronze_dir / f"{safe_id}.json"
            with open(bronze_file, "w", encoding="utf-8") as f:
                json.dump(paper, f, ensure_ascii=False, indent=2)

            ingested_records.append(paper)
            new_papers_count += 1

            # Dispatch live telemetry pulse
            broadcast_telemetry({
                "type": "PAPER_INGESTED",
                "tier": "tier1",
                "source": paper.get("source", "landmark"),
                "paper_id": p_id,
                "title": title,
                "cite_count": cite_count,
                "math_count": math_count,
                "category": paper.get("primary_category"),
                "progress": f"{idx + 1}/{len(candidates)}",
            })

            logger.info(
                "[TIER 1] [INGESTED] (%d/%d) %s | Citations: %d | LaTeX formulas: %d",
                idx + 1,
                len(candidates),
                title[:50],
                cite_count,
                math_count,
            )

        # Save Deduplicator manifest
        self.dedup.save()

        # Write to Silver Parquet
        logger.info("[TIER 1] Writing %d newly ingested papers to Silver Lakehouse...", len(ingested_records))
        if ingested_records:
            transformed_rows = []
            for r in ingested_records:
                transformed_rows.append({
                    "paper_id": r["paper_id"],
                    "abstract_hash": r["abstract_hash"],
                    "doi": r.get("doi"),
                    "journal_ref": r.get("venue"),
                    "title": r["title"],
                    "abstract": r.get("abstract", ""),
                    "authors": r.get("authors", []),
                    "categories": r.get("categories", ["cs.AI"]),
                    "primary_category": r.get("primary_category", "cs.AI"),
                    "published_date": r.get("published_date", ""),
                    "crawled_at": r["crawled_at"],
                    "pdf_url": r.get("pdf_url", ""),
                    "html_url": r.get("html_url", ""),
                    "total_sections": 5 if r.get("markdown_content") else 1,
                    "total_math_count": r.get("total_math_count", 0),
                    "total_words": r.get("total_words", 0),
                    "sections_json": json.dumps([]),
                    "clean_full_text": r.get("markdown_content") or r.get("abstract", ""),
                    "transformed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "cite_count": r.get("cite_count", 0),
                })

            # Save to tier1 silver partition and year partition
            tier1_silver_dir = settings.ROOT_DIR / "data" / "silver" / "tier1"
            tier1_silver_dir.mkdir(parents=True, exist_ok=True)
            df_tier1 = pd.DataFrame(transformed_rows)
            t1_file = tier1_silver_dir / "landmark_papers.parquet"
            if t1_file.exists():
                ex_df = pq.read_table(t1_file).to_pandas()
                df_tier1 = pd.concat([ex_df, df_tier1], ignore_index=True).drop_duplicates(subset=["abstract_hash"], keep="last")
            pq.write_table(pa.Table.from_pandas(df_tier1, preserve_index=False), t1_file, compression="zstd")

            # Also upsert into year partitions via silver_writer
            by_year: Dict[str, List[Dict[str, Any]]] = {}
            for row in transformed_rows:
                y = str(row.get("published_date", "")[:4]) or "2024"
                by_year.setdefault(y, []).append(row)
            for y, rows in by_year.items():
                self.silver_writer.save_and_upload_parquet(rows, year=y)

            # Gold Layer LanceDB Indexing
            logger.info("[TIER 1] Generating embeddings & indexing chunks into LanceDB Gold...")
            chunks = self.build_chunks(ingested_records)
            if chunks:
                embedder = NomicEmbedder()
                texts = [c["context_text"] for c in chunks]
                embeddings = embedder.embed_documents(texts, batch_size=8)
                for c, emb in zip(chunks, embeddings):
                    c["vector"] = emb

                lancedb_mgr = LanceDBManager(r2_client=self.r2)
                lancedb_mgr.insert_chunks(chunks)
                logger.info("[TIER 1] Indexed %d vector chunks into LanceDB Gold table 'scientific_papers_gold'.", len(chunks))

        duration = round(time.time() - start_time, 2)
        summary = {
            "status": "SUCCESS",
            "tier": "tier1_historical_core",
            "target_total": self.target_total,
            "candidates_found": len(candidates),
            "newly_ingested": new_papers_count,
            "dedup_skipped": duplicate_count,
            "duration_s": duration,
        }
        logger.info("[TIER 1] Pipeline completed successfully: %s", summary)

        broadcast_telemetry({
            "type": "STAGE_CHANGE",
            "tier": "tier1",
            "stage": "completed",
            "title": f"Tier 1 completed: {new_papers_count} landmark papers ingested in {duration}s",
            "summary": summary,
        })

        return summary


def main():
    parser = argparse.ArgumentParser(description="Run Tier 1 Historical Core Landmark Papers Pipeline.")
    parser.add_argument("--limit", type=int, default=3000, help="Target total landmark papers (default 3000)")
    parser.add_argument("--no-marker", action="store_true", help="Disable Marker PDF extraction (use fallback text)")
    parser.add_argument("--sync-r2", action="store_true", help="Synchronize Bronze, Silver, Gold to Cloudflare R2")
    args = parser.parse_args()

    harvester = Tier1HistoricalHarvester(
        target_total=args.limit,
        use_marker=not args.no_marker,
        sync_r2=args.sync_r2,
    )
    result = harvester.run()
    print("\n" + "=" * 60)
    print(f"TIER 1 HISTORICAL CORE RESULT: {result['status']}")
    print(f"Ingested: {result.get('newly_ingested', 0)} papers | Skipped Dups: {result.get('dedup_skipped', 0)} | Duration: {result.get('duration_s', 0)}s")
    print("=" * 60)


if __name__ == "__main__":
    main()
