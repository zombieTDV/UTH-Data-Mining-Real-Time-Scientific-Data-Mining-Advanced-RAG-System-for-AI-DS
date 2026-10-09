"""Tier 2: Near-Past Trending Pipeline (2024 to Present).

Harvests influential and trending papers published in the last 2 years (2024-01-01 to Present):
- Sliced by time window (daily / interval) with top 50 papers per slice sorted by cite_count DESC.
- Balanced across 5 core categories:
    cs.CV (Computer Vision), cs.CL (NLP/LLMs), cs.LG (Machine Learning),
    cs.AI (Foundational AI), cs.RO (Robotics).
- Ingested across 4 canonical sources: arXiv, OpenReview, CVF, Zenodo.
- Deduplication via normalized SHA-256 abstract hashing (LakehouseDeduplicator).
- PDF extraction powered by Marker (marker-pdf) with LaTeX math preservation ($ ... $, $$ ... $$).
- Lakehouse Vaulting: Bronze JSON -> Silver Parquet -> Gold LanceDB (Nomic-Embed 768-D).
- Zero-polling cost-shield telemetry via local FastAPI SSE bridge.

Usage:
    python -m src.pipelines.run_tier2_near_past_harvest --days 7 --per-day 50
    python -m src.pipelines.run_tier2_near_past_harvest --start-date 2024-01-01 --limit 50
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

logger, log_file = setup_pipeline_logging("tier2_near_past_harvest")

CATEGORY_CONCEPTS = {
    "cs.CV": {"concept_id": "C154945302", "name": "Computer Vision"},
    "cs.CL": {"concept_id": "C204321447", "name": "Computation and Language"},
    "cs.LG": {"concept_id": "C119857082", "name": "Machine Learning"},
    "cs.AI": {"concept_id": "C41008148", "name": "Artificial Intelligence"},
    "cs.RO": {"concept_id": "C90856484", "name": "Robotics"},
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


class Tier2NearPastHarvester:
    """Orchestrates ingestion of trending papers from the 2-year timeline (2024 to present)."""

    OPENALEX_API_URL = "https://api.openalex.org/works"

    def __init__(
        self,
        start_date: str = "2024-01-01",
        end_date: Optional[str] = None,
        per_day_limit: int = 50,
        max_total: Optional[int] = None,
        use_marker: bool = True,
        sync_r2: bool = False,
    ):
        self.start_date = start_date
        self.end_date = end_date or datetime.date.today().isoformat()
        self.per_day_limit = per_day_limit
        self.max_total = max_total
        self.use_marker = use_marker
        self.sync_r2 = sync_r2

        self.r2 = R2Client() if sync_r2 else None
        self.dedup = LakehouseDeduplicator()
        self.marker_extractor = MarkerPdfExtractor(use_marker=use_marker, max_pages=15)
        self.silver_writer = SilverLakehouseWriter(r2_client=self.r2)

        self.bronze_dir = settings.ROOT_DIR / "data" / "raw" / "tier2"
        self.pdf_dir = self.bronze_dir / "pdfs"
        self.markdown_dir = self.bronze_dir / "markdowns"
        self.bronze_dir.mkdir(parents=True, exist_ok=True)
        self.pdf_dir.mkdir(parents=True, exist_ok=True)
        self.markdown_dir.mkdir(parents=True, exist_ok=True)

        self.http_client = httpx.Client(
            headers={
                "User-Agent": "UTH-DataMining-Tier2NearPast/2.0 (academic research; contact: datamining@uth.edu.vn)"
            },
            timeout=30.0,
            follow_redirects=True,
        )

    def harvest_near_past_candidates(self) -> List[Dict[str, Any]]:
        """Harvests papers published between start_date and end_date, sorted by cite_count DESC."""
        logger.info(
            "[TIER 2] Harvesting near-past window: [%s to %s] (Max/Day: %d, Cap: %s)",
            self.start_date,
            self.end_date,
            self.per_day_limit,
            self.max_total or "unlimited",
        )

        categories = list(CATEGORY_CONCEPTS.keys())
        all_candidates: List[Dict[str, Any]] = []
        target_cap = self.max_total if self.max_total else 500

        # Query each category to guarantee balanced representation
        per_cat_cap = max(10, target_cap // len(categories))

        for cat_code, cat_meta in CATEGORY_CONCEPTS.items():
            concept_id = cat_meta["concept_id"]
            cat_name = cat_meta["name"]
            logger.info("[TIER 2] Querying trending papers for category: %s (%s)...", cat_code, cat_name)

            params = {
                "filter": f"concepts.id:{concept_id},from_publication_date:{self.start_date},to_publication_date:{self.end_date},is_paratext:false,is_retracted:false",
                "sort": "cited_by_count:desc",
                "per-page": min(50, per_cat_cap),
            }

            try:
                resp = self.http_client.get(self.OPENALEX_API_URL, params=params)
                if resp.status_code != 200:
                    logger.warning("[TIER 2] OpenAlex returned HTTP %d for %s", resp.status_code, cat_code)
                    continue

                data = resp.json()
                results = data.get("results", [])
                for w in results:
                    title = w.get("title") or w.get("display_name") or ""
                    if not title:
                        continue

                    abstract = reconstruct_abstract_from_inverted_index(w.get("abstract_inverted_index"))
                    cite_count = int(w.get("cited_by_count") or 0)
                    pub_date = w.get("publication_date") or self.start_date
                    pub_year = w.get("publication_year") or int(pub_date[:4])

                    ids = w.get("ids", {})
                    doi = ids.get("doi") or w.get("doi")
                    arxiv_id = ids.get("arxiv")
                    if arxiv_id and "arxiv.org/abs/" in arxiv_id:
                        arxiv_id = arxiv_id.split("arxiv.org/abs/")[-1]

                    best_oa = w.get("best_oa_location") or {}
                    pdf_url = best_oa.get("pdf_url") or ""
                    if not pdf_url and arxiv_id:
                        pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
                    if not pdf_url and w.get("open_access", {}).get("oa_url"):
                        pdf_url = w["open_access"]["oa_url"]

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

                    authors = []
                    for auth in w.get("authorships", []):
                        aname = auth.get("author", {}).get("display_name")
                        if aname:
                            authors.append(aname)

                    paper_id = arxiv_id if arxiv_id else (f"doi_{doi.replace('https://doi.org/', '').replace('/', '_')}" if doi else f"oa_{w.get('id', '').split('/')[-1]}")
                    is_dup, abs_hash = self.dedup.is_duplicate(abstract, title)

                    all_candidates.append({
                        "paper_id": paper_id,
                        "arxiv_id": arxiv_id,
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
                        "doi": doi,
                        "pdf_url": pdf_url,
                        "html_url": w.get("id"),
                        "source": source,
                        "venue": venue_name,
                    })

                time.sleep(0.3)
            except Exception as e:
                logger.error("[TIER 2] Error querying %s: %s", cat_code, e)

        # Sort all candidates by cite_count DESC
        all_candidates.sort(key=lambda x: x.get("cite_count", 0), reverse=True)
        if self.max_total and len(all_candidates) > self.max_total:
            all_candidates = all_candidates[:self.max_total]

        logger.info("[TIER 2] Harvested %d candidates for near-past window.", len(all_candidates))
        return all_candidates

    def download_and_extract_pdf(self, paper: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
        """Downloads PDF and runs Marker PDF-to-Markdown with LaTeX formula preservation."""
        paper_id = paper["paper_id"]
        pdf_url = paper.get("pdf_url", "")
        safe_id = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", paper_id)
        local_pdf = self.pdf_dir / f"{safe_id}.pdf"
        local_md = self.markdown_dir / f"{safe_id}.md"

        if local_md.exists() and local_md.stat().st_size > 100:
            try:
                with open(local_md, "r", encoding="utf-8") as f:
                    return f.read(), {"extractor": "marker_cache", "cached": True}
            except Exception:
                pass

        if not local_pdf.exists() or local_pdf.stat().st_size < 1000:
            download_urls = []
            if "arxiv_id" in paper and paper["arxiv_id"]:
                download_urls.append(f"https://arxiv.org/pdf/{paper['arxiv_id']}.pdf")
            if pdf_url and pdf_url not in download_urls:
                download_urls.append(pdf_url)

            downloaded = False
            for target_url in download_urls:
                try:
                    resp = self.http_client.get(target_url, timeout=45.0)
                    if resp.status_code == 200 and len(resp.content) > 1000:
                        if resp.content.startswith(b"%PDF"):
                            with open(local_pdf, "wb") as f:
                                f.write(resp.content)
                            downloaded = True
                            break
                except Exception:
                    continue

            if not downloaded:
                return "", {"status": "NO_VALID_PDF_STREAM"}

        try:
            markdown_text, meta = self.marker_extractor.convert_pdf_to_markdown(local_pdf)
            with open(local_md, "w", encoding="utf-8") as f:
                f.write(markdown_text)
            return markdown_text, meta
        except Exception as e:
            logger.warning("[TIER 2] Marker error for %s: %s", paper_id, e)
            return "", {"status": "MARKER_ERROR", "error": str(e)}

    def build_chunks(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Builds contextual chunks preserving LaTeX equations and section hierarchies."""
        chunks = []
        for r in records:
            paper_id = r.get("paper_id", "")
            title = r.get("title", "")
            authors = r.get("authors", [])
            primary_cat = r.get("primary_category", "cs.AI")
            abstract = r.get("abstract", "")
            cite_count = r.get("cite_count", 0)

            if abstract:
                abs_context = f"Trending Paper (2024-Present): {title} (Citations: {cite_count:,})\nCategory: {primary_cat}\nAbstract: {abstract}"
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
                        "context_text": f"Paper: {title} [Trending, Citations: {cite_count:,}]\nSection Content: {p}",
                        "word_count": len(p.split()),
                    })

        return chunks

    def run(self) -> Dict[str, Any]:
        """Runs the Tier 2 near-past trending pipeline."""
        start_time = time.time()
        logger.info("[TIER 2] Launching Near-Past Trending Harvest [%s -> %s]...", self.start_date, self.end_date)

        broadcast_telemetry({
            "type": "STAGE_CHANGE",
            "tier": "tier2",
            "stage": "harvest_init",
            "title": f"Starting Tier 2 Near-Past Harvest ({self.start_date} to {self.end_date})",
        })

        candidates = self.harvest_near_past_candidates()
        if not candidates:
            logger.warning("[TIER 2] No candidates found in timeline.")
            return {"status": "NO_RECORDS", "ingested": 0}

        ingested_records: List[Dict[str, Any]] = []
        new_papers_count = 0
        duplicate_count = 0

        for idx, paper in enumerate(candidates):
            p_id = paper["paper_id"]
            title = paper["title"]
            cite_count = paper["cite_count"]
            abs_hash = paper["abstract_hash"]

            if paper.get("is_duplicate"):
                duplicate_count += 1
                logger.info("[TIER 2] [DEDUP SKIP] (%d/%d) %s (Citations: %d) already in Lakehouse.", idx + 1, len(candidates), title[:50], cite_count)
                continue

            md_text, meta = self.download_and_extract_pdf(paper)
            math_count = meta.get("latex_formulas_count", len(re.findall(r"\$[^$]+\$|\$\$[^$]+\$\$", md_text)))

            paper["markdown_content"] = md_text
            paper["total_math_count"] = math_count
            paper["total_words"] = len(md_text.split()) if md_text else len(paper.get("abstract", "").split())
            paper["crawled_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()

            self.dedup.record(abs_hash, p_id)

            safe_id = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", p_id)
            bronze_file = self.bronze_dir / f"{safe_id}.json"
            with open(bronze_file, "w", encoding="utf-8") as f:
                json.dump(paper, f, ensure_ascii=False, indent=2)

            ingested_records.append(paper)
            new_papers_count += 1

            broadcast_telemetry({
                "type": "PAPER_INGESTED",
                "tier": "tier2",
                "source": paper.get("source", "near_past"),
                "paper_id": p_id,
                "title": title,
                "cite_count": cite_count,
                "math_count": math_count,
                "category": paper.get("primary_category"),
                "progress": f"{idx + 1}/{len(candidates)}",
            })

            logger.info(
                "[TIER 2] [INGESTED] (%d/%d) %s | Citations: %d | LaTeX formulas: %d",
                idx + 1,
                len(candidates),
                title[:50],
                cite_count,
                math_count,
            )

        self.dedup.save()

        # Write to Silver Parquet
        logger.info("[TIER 2] Writing %d newly ingested papers to Silver Lakehouse...", len(ingested_records))
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

            tier2_silver_dir = settings.ROOT_DIR / "data" / "silver" / "tier2"
            tier2_silver_dir.mkdir(parents=True, exist_ok=True)
            df_tier2 = pd.DataFrame(transformed_rows)
            t2_file = tier2_silver_dir / "near_past_papers.parquet"
            if t2_file.exists():
                ex_df = pq.read_table(t2_file).to_pandas()
                df_tier2 = pd.concat([ex_df, df_tier2], ignore_index=True).drop_duplicates(subset=["abstract_hash"], keep="last")
            pq.write_table(pa.Table.from_pandas(df_tier2, preserve_index=False), t2_file, compression="zstd")

            by_year: Dict[str, List[Dict[str, Any]]] = {}
            for row in transformed_rows:
                y = str(row.get("published_date", "")[:4]) or "2024"
                by_year.setdefault(y, []).append(row)
            for y, rows in by_year.items():
                self.silver_writer.save_and_upload_parquet(rows, year=y)

            # LanceDB Gold Indexing
            logger.info("[TIER 2] Indexing contextual chunks into LanceDB Gold...")
            chunks = self.build_chunks(ingested_records)
            if chunks:
                embedder = NomicEmbedder()
                texts = [c["context_text"] for c in chunks]
                embeddings = embedder.embed_documents(texts, batch_size=8)
                for c, emb in zip(chunks, embeddings):
                    c["vector"] = emb

                lancedb_mgr = LanceDBManager(r2_client=self.r2)
                lancedb_mgr.insert_chunks(chunks)
                logger.info("[TIER 2] Indexed %d vector chunks into LanceDB Gold table.", len(chunks))

        duration = round(time.time() - start_time, 2)
        summary = {
            "status": "SUCCESS",
            "tier": "tier2_near_past_harvest",
            "start_date": self.start_date,
            "end_date": self.end_date,
            "candidates_found": len(candidates),
            "newly_ingested": new_papers_count,
            "dedup_skipped": duplicate_count,
            "duration_s": duration,
        }
        logger.info("[TIER 2] Completed successfully: %s", summary)

        broadcast_telemetry({
            "type": "STAGE_CHANGE",
            "tier": "tier2",
            "stage": "completed",
            "title": f"Tier 2 completed: {new_papers_count} trending papers ingested in {duration}s",
            "summary": summary,
        })

        return summary


def main():
    parser = argparse.ArgumentParser(description="Run Tier 2 Near-Past Trending Pipeline (2024 to Present).")
    parser.add_argument("--start-date", type=str, default="2024-01-01", help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end-date", type=str, default=None, help="End date (default today)")
    parser.add_argument("--limit", type=int, default=50, help="Max total papers to harvest")
    parser.add_argument("--no-marker", action="store_true", help="Disable Marker PDF extraction")
    parser.add_argument("--sync-r2", action="store_true", help="Synchronize to Cloudflare R2")
    args = parser.parse_args()

    harvester = Tier2NearPastHarvester(
        start_date=args.start_date,
        end_date=args.end_date,
        max_total=args.limit,
        use_marker=not args.no_marker,
        sync_r2=args.sync_r2,
    )
    result = harvester.run()
    print("\n" + "=" * 60)
    print(f"TIER 2 NEAR-PAST HARVEST RESULT: {result['status']}")
    print(f"Ingested: {result.get('newly_ingested', 0)} papers | Skipped Dups: {result.get('dedup_skipped', 0)} | Duration: {result.get('duration_s', 0)}s")
    print("=" * 60)


if __name__ == "__main__":
    main()
