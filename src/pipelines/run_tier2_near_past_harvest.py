"""Tier 2: Near-Past Trending Pipeline (2024 to Present) — Hardened & Batch-Oriented.

Harvests influential and trending papers published in the last 2 years (2024-01-01 to Present):
- Sliced by time window (daily / interval) with top papers per slice sorted by cite_count DESC.
- Balanced across 5 core categories:
    cs.CV (Computer Vision), cs.CL (NLP/LLMs), cs.LG (Machine Learning),
    cs.AI (Foundational AI), cs.RO (Robotics).
- Ingested across 4 canonical sources: arXiv, OpenReview, CVF, Zenodo / OpenAlex.
- Deduplication via normalized SHA-256 abstract hashing (LakehouseDeduplicator).
- HTML-First Waterfall extraction (arXiv HTML5 -> ar5iv HTML5 -> PDF via Marker -> Abstract).
- Zero-Leak Guardrails: immediate temporary binary PDF purging with < 15 GB disk abort protection.
- Lakehouse Vaulting: Bronze JSON -> Silver Parquet (tier2/near_past_papers.parquet) -> Gold LanceDB.
- Zero-polling cost-shield telemetry via local FastAPI SSE bridge.

Usage:
    python -m src.pipelines.run_tier2_near_past_harvest --days 1 --per-day 10 --batch-size 25
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
import psutil
import pyarrow as pa
import pyarrow.parquet as pq

try:
    import torch
except ImportError:
    torch = None

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config.settings import settings
from src.indexing.embedder import NomicEmbedder
from src.indexing.lancedb_manager import LanceDBManager
from src.storage.r2_client import R2Client
from src.transformation.lakehouse_deduplicator import LakehouseDeduplicator
from src.transformation.silver_writer import SilverLakehouseWriter
from src.transformation.unified_content_resolver import UnifiedContentResolver
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
    MIN_FREE_DISK_GB = 15.0

    def __init__(
        self,
        start_date: str = "2024-01-01",
        end_date: Optional[str] = None,
        per_day_limit: int = 50,
        max_total: Optional[int] = None,
        num_days: int = 1,
        batch_size: int = 25,
        use_marker: bool = True,
        sync_r2: bool = False,
    ):
        self.start_date = start_date
        self.end_date = end_date or datetime.date.today().isoformat()
        self.per_day_limit = per_day_limit
        self.max_total = max_total
        self.num_days = num_days
        self.batch_size = batch_size
        self.use_marker = use_marker
        self.sync_r2 = sync_r2

        self.r2 = R2Client() if sync_r2 else None
        self.dedup = LakehouseDeduplicator()
        self.silver_writer = SilverLakehouseWriter(r2_client=self.r2)

        self.bronze_dir = settings.ROOT_DIR / "data" / "raw" / "tier2"
        self.pdf_dir = self.bronze_dir / "pdfs"
        self.markdown_dir = self.bronze_dir / "markdowns"
        self.bronze_dir.mkdir(parents=True, exist_ok=True)
        self.pdf_dir.mkdir(parents=True, exist_ok=True)
        self.markdown_dir.mkdir(parents=True, exist_ok=True)
        self.checkpoint_file = settings.ROOT_DIR / "data" / "manifests" / "tier2_daily_checkpoint.json"
        self.checkpoint_file.parent.mkdir(parents=True, exist_ok=True)

        self.temp_pdf_dir = self.bronze_dir / "temp_pdfs"
        self.temp_pdf_dir.mkdir(parents=True, exist_ok=True)

        self.content_resolver = UnifiedContentResolver(
            r2_client=self.r2,
            sync_r2=self.sync_r2,
            use_marker_fallback=self.use_marker,
            local_cache_dir=self.markdown_dir,
            temp_pdf_dir=self.temp_pdf_dir,
        )

        self.http_client = httpx.Client(
            headers={
                "User-Agent": "UTH-DataMining-Tier2NearPast/2.0 (academic research; contact: datamining@uth.edu.vn)"
            },
            timeout=30.0,
            follow_redirects=True,
        )

    def check_disk_space(self) -> float:
        """Returns free disk space in GB; raises RuntimeError if below guardrail."""
        free_bytes = psutil.disk_usage(str(settings.ROOT_DIR)).free
        free_gb = free_bytes / (1024**3)
        if free_gb < self.MIN_FREE_DISK_GB:
            raise RuntimeError(
                f"Disk space guardrail breached: {free_gb:.2f} GB free "
                f"(min required: {self.MIN_FREE_DISK_GB:.2f} GB). Execution halted."
            )
        return free_gb

    def purge_temp_pdfs(self):
        """Zero-leak policy: cleans any residual temporary PDFs from buffer."""
        if not self.pdf_dir.exists():
            return
        purged = 0
        for f in self.pdf_dir.glob("*.pdf"):
            try:
                f.unlink(missing_ok=True)
                purged += 1
            except Exception:
                pass
        if purged > 0:
            logger.debug("[TIER 2 ZERO LEAK] Purged %d residual PDFs from buffer.", purged)

    def load_checkpoint(self) -> Dict[str, Any]:
        """Loads last processed timeline date from checkpoint."""
        if self.checkpoint_file.exists():
            try:
                with open(self.checkpoint_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {
            "last_processed_date": None,
            "total_days_processed": 0,
            "total_papers_harvested": 0,
        }

    def save_checkpoint(self, last_date: str, days_increment: int = 1, papers_increment: int = 0):
        """Saves daily crawl progress to checkpoint."""
        data = self.load_checkpoint()
        data["last_processed_date"] = last_date
        data["total_days_processed"] = data.get("total_days_processed", 0) + days_increment
        data["total_papers_harvested"] = data.get("total_papers_harvested", 0) + papers_increment
        data["updated_at"] = datetime.datetime.now().isoformat()
        with open(self.checkpoint_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def harvest_near_past_candidates(self, num_days: int = 1) -> List[Dict[str, Any]]:
        """Harvests papers day-by-day backwards along the 2-year timeline."""
        chk = self.load_checkpoint()
        last_date_str = chk.get("last_processed_date")

        if last_date_str:
            try:
                start_dt = datetime.datetime.strptime(last_date_str, "%Y-%m-%d").date() - datetime.timedelta(days=1)
            except ValueError:
                start_dt = datetime.date.today()
        else:
            start_dt = datetime.date.today()

        earliest_dt = datetime.date(2024, 1, 1)
        categories = list(CATEGORY_CONCEPTS.keys())
        all_candidates: List[Dict[str, Any]] = []
        seen_paper_ids: set = set()
        seen_hashes: set = set()

        logger.info(
            "[TIER 2] DAY-BY-DAY HARVEST: Stepping %d days backwards starting from %s (Earliest limit: %s)",
            num_days,
            start_dt.isoformat(),
            earliest_dt.isoformat(),
        )

        curr_dt = start_dt
        days_harvested = 0

        while days_harvested < num_days and curr_dt >= earliest_dt:
            date_str = curr_dt.isoformat()
            logger.info("[TIER 2] Harvesting date: %s (Target: up to %d papers, sorted by cite_count DESC)...", date_str, self.per_day_limit)

            day_candidates: List[Dict[str, Any]] = []
            per_cat_quota = max(1, self.per_day_limit // len(categories))

            for cat_code in categories:
                concept_id = CATEGORY_CONCEPTS[cat_code]["concept_id"]

                params = {
                    "filter": f"concepts.id:{concept_id},from_publication_date:{date_str},to_publication_date:{date_str},is_paratext:false,is_retracted:false",
                    "sort": "cited_by_count:desc",
                    "per-page": per_cat_quota,
                }

                try:
                    resp = self.http_client.get(self.OPENALEX_API_URL, params=params)
                    if resp.status_code != 200:
                        continue

                    data = resp.json()
                    results = data.get("results", [])

                    for w in results:
                        title = w.get("title") or w.get("display_name") or ""
                        if not title:
                            continue

                        abstract = reconstruct_abstract_from_inverted_index(w.get("abstract_inverted_index"))
                        cite_count = int(w.get("cited_by_count") or 0)
                        pub_date = date_str
                        pub_year = int(date_str[:4])

                        ids = w.get("ids", {})
                        doi = ids.get("doi") or w.get("doi")
                        arxiv_id = ids.get("arxiv")
                        if arxiv_id and "arxiv.org/abs/" in arxiv_id:
                            arxiv_id = arxiv_id.split("arxiv.org/abs/")[-1]

                        candidate_pdf_urls: List[str] = []
                        if arxiv_id:
                            candidate_pdf_urls.append(f"https://arxiv.org/pdf/{arxiv_id}.pdf")

                        best_oa = w.get("best_oa_location") or {}
                        best_pdf = best_oa.get("pdf_url")
                        if best_pdf and best_pdf not in candidate_pdf_urls:
                            candidate_pdf_urls.append(best_pdf)

                        for loc in w.get("locations", []):
                            pu = loc.get("pdf_url")
                            if pu and pu not in candidate_pdf_urls:
                                candidate_pdf_urls.append(pu)

                        source = "arxiv" if arxiv_id else "openalex"
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

                        # Filter cross-category and existing duplicates immediately
                        if is_dup or paper_id in seen_paper_ids or (abs_hash and abs_hash in seen_hashes):
                            continue

                        seen_paper_ids.add(paper_id)
                        if abs_hash:
                            seen_hashes.add(abs_hash)

                        day_candidates.append({
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
                            "pdf_urls": candidate_pdf_urls,
                            "pdf_url": candidate_pdf_urls[0] if candidate_pdf_urls else "",
                            "html_url": w.get("id"),
                            "source": source,
                            "tier": "tier2",
                            "venue": venue_name or "Trending AI",
                        })

                    time.sleep(0.15)
                except Exception as e:
                    logger.error("[TIER 2] Error querying %s on %s: %s", cat_code, date_str, e)

            # Sort the day's candidate papers strictly by cite_count DESC
            day_candidates.sort(key=lambda x: x.get("cite_count", 0), reverse=True)
            if len(day_candidates) > self.per_day_limit:
                day_candidates = day_candidates[:self.per_day_limit]

            all_candidates.extend(day_candidates)
            self.save_checkpoint(last_date=date_str, days_increment=1, papers_increment=len(day_candidates))

            days_harvested += 1
            curr_dt -= datetime.timedelta(days=1)

            if self.max_total and len(all_candidates) >= self.max_total:
                all_candidates = all_candidates[:self.max_total]
                break

        logger.info("[TIER 2] Day-by-day harvest collected %d candidates across %d days.", len(all_candidates), days_harvested)
        return all_candidates

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
            source = r.get("source", "near_past")
            tier = r.get("tier", "tier2")
            content_origin = r.get("content_origin", "unknown")

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
                    "source": source,
                    "tier": tier,
                    "content_origin": content_origin,
                })

            markdown_content = r.get("clean_full_text") or r.get("markdown_content", "")
            if markdown_content and len(markdown_content) > 200:
                paragraphs = [p.strip() for p in markdown_content.split("\n\n") if len(p.strip()) > 80]
                for idx, p in enumerate(paragraphs[:8]):
                    chunks.append({
                        "chunk_id": f"{paper_id}_section_{idx}",
                        "paper_id": paper_id,
                        "title": title,
                        "authors": authors,
                        "primary_category": primary_cat,
                        "section_title": f"Section {idx+1}",
                        "section_type": "full_text",
                        "text": p,
                        "context_text": f"Paper: {title} [Trending, Citations: {cite_count:,}]\nSection: {p}",
                        "word_count": len(p.split()),
                        "source": source,
                        "tier": tier,
                        "content_origin": content_origin,
                    })

        # Strict deduplication on chunk_id
        seen_chunk_ids: set = set()
        deduped_chunks: List[Dict[str, Any]] = []
        for c in chunks:
            cid = c.get("chunk_id")
            if cid and cid not in seen_chunk_ids:
                seen_chunk_ids.add(cid)
                deduped_chunks.append(c)
        return deduped_chunks

    def run(self) -> Dict[str, Any]:
        """Runs the hardened Tier 2 near-past trending pipeline in concurrent batches."""
        start_time = time.time()
        initial_disk_gb = self.check_disk_space()
        logger.info("=" * 80)
        logger.info("[TIER 2 HARVEST] Launching Near-Past Trending Pipeline [%s -> %s]", self.start_date, self.end_date)
        logger.info("[TIER 2 HARVEST] Initial free disk space: %.2f GB (Batch size: %d)", initial_disk_gb, self.batch_size)
        logger.info("=" * 80)

        broadcast_telemetry({
            "type": "STAGE_CHANGE",
            "tier": "tier2",
            "stage": "harvest_init",
            "title": f"Starting Tier 2 Near-Past Harvest ({self.start_date} to {self.end_date})",
        })

        candidates = self.harvest_near_past_candidates(num_days=self.num_days)
        if not candidates:
            logger.warning("[TIER 2] No candidates found in timeline.")
            return {"status": "NO_RECORDS", "ingested": 0}

        # Filter duplicates in memory before batching
        unique_candidates: List[Dict[str, Any]] = []
        dup_skipped = 0
        for p in candidates:
            if p.get("is_duplicate"):
                dup_skipped += 1
            else:
                unique_candidates.append(p)

        logger.info(
            "[TIER 2] Candidates harvested: %d | Duplicates skipped: %d | Unique to process: %d",
            len(candidates),
            dup_skipped,
            len(unique_candidates),
        )

        if not unique_candidates:
            return {"status": "ALL_DUPLICATES", "ingested": 0, "dedup_skipped": dup_skipped}

        all_ingested: List[Dict[str, Any]] = []
        embedder = NomicEmbedder()
        lancedb_mgr = LanceDBManager(r2_client=self.r2)

        num_batches = (len(unique_candidates) + self.batch_size - 1) // self.batch_size

        for b_idx in range(num_batches):
            b_start = b_idx * self.batch_size
            b_end = min(b_start + self.batch_size, len(unique_candidates))
            batch = unique_candidates[b_start:b_end]

            b_t0 = time.time()
            free_disk = self.check_disk_space()
            logger.info("\n>>> [TIER 2 BATCH %d/%d] Processing papers %d to %d (Disk Free: %.2f GB)...", b_idx + 1, num_batches, b_start + 1, b_end, free_disk)

            # 1. HTML-First Waterfall Resolution (arXiv HTML5 -> ar5iv -> PDF Marker Fallback -> Abstract)
            extracted_records = self.content_resolver.resolve_batch_concurrent(batch, max_workers=6)
            self.purge_temp_pdfs()

            origins = {}
            for r in extracted_records:
                orig = r.get("content_origin", "unknown")
                origins[orig] = origins.get(orig, 0) + 1
            logger.info("[TIER 2 BATCH %d/%d] Resolved %d papers in %.1fs: %s", b_idx + 1, num_batches, len(extracted_records), time.time() - b_t0, origins)

            # 2. Record hashes in deduplicator
            for r in extracted_records:
                self.dedup.record(r["abstract_hash"], r["paper_id"])

            # 3. Save Bronze JSONs
            for r in extracted_records:
                safe_id = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", r["paper_id"])
                b_file = self.bronze_dir / f"{safe_id}.json"
                with open(b_file, "w", encoding="utf-8") as bf:
                    json.dump(r, bf, ensure_ascii=False, indent=2)

            # 4. Append to Silver Parquet (Strict 23-column Lakehouse Schema)
            tier2_silver_dir = settings.ROOT_DIR / "data" / "silver" / "tier2"
            tier2_silver_dir.mkdir(parents=True, exist_ok=True)
            t2_file = tier2_silver_dir / "near_past_papers.parquet"

            silver_rows = []
            for r in extracted_records:
                silver_rows.append({
                    "paper_id": r["paper_id"],
                    "abstract_hash": r["abstract_hash"],
                    "doi": r.get("doi"),
                    "journal_ref": r.get("venue"),
                    "title": r["title"],
                    "abstract": r.get("abstract", ""),
                    "authors": r.get("authors", []),
                    "categories": r.get("categories", ["cs.AI"]),
                    "primary_category": r.get("primary_category", "cs.AI"),
                    "published_date": r.get("published_date") or r.get("publication_date", ""),
                    "crawled_at": r.get("crawled_at") or datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "pdf_url": r.get("pdf_urls", [""])[0] if r.get("pdf_urls") else (r.get("pdf_url") or ""),
                    "html_url": r.get("html_url", ""),
                    "total_sections": r.get("total_sections", 1),
                    "total_math_count": r.get("total_math_count", 0),
                    "total_words": r.get("total_words", 0),
                    "sections_json": r.get("sections_json") or "[]",
                    "clean_full_text": r.get("clean_full_text") or r.get("markdown_content") or r.get("abstract", ""),
                    "transformed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "cite_count": r.get("cite_count", 0),
                    "source": r.get("source", "openalex"),
                    "tier": "tier2",
                    "content_origin": r.get("content_origin", "unknown"),
                })

            df_new = pd.DataFrame(silver_rows)
            if t2_file.exists():
                ex_df = pq.read_table(t2_file).to_pandas()
                for c, d in [("source", "openalex"), ("tier", "tier2"), ("content_origin", "unknown")]:
                    if c not in ex_df.columns:
                        ex_df[c] = d
                df_combined = pd.concat([ex_df, df_new], ignore_index=True).drop_duplicates(subset=["abstract_hash"], keep="last")
            else:
                df_combined = df_new
            pq.write_table(pa.Table.from_pandas(df_combined, preserve_index=False), t2_file, compression="zstd")

            # 5. Batch Chunking, Embedding, and LanceDB Upsert
            chunks = self.build_chunks(extracted_records)
            if chunks:
                texts = [c["context_text"] for c in chunks]
                embeddings = embedder.embed_documents(texts, batch_size=32)
                for c, emb in zip(chunks, embeddings):
                    c["vector"] = emb
                lancedb_mgr.insert_chunks(chunks)
                logger.info("[TIER 2 BATCH %d/%d] Indexed %d vector chunks into LanceDB Gold.", b_idx + 1, num_batches, len(chunks))

            all_ingested.extend(extracted_records)
            batch_duration = time.time() - b_t0
            speed_ppm = round(len(extracted_records) / (batch_duration / 60.0), 1) if batch_duration > 0 else 0.0

            # 6. Telemetry Pulses
            for r in extracted_records:
                broadcast_telemetry({
                    "type": "PAPER_INGESTED",
                    "stage": "GOLD",
                    "tier": "tier2",
                    "source": r.get("source", "openalex"),
                    "paper_id": r["paper_id"],
                    "title": r["title"],
                    "category": r.get("primary_category", "cs.AI"),
                    "cite_count": r.get("cite_count", 0),
                    "math_count": r.get("total_math_count", 0),
                    "vectors_synced": 4,
                    "speed_ppm": speed_ppm,
                })

            broadcast_telemetry({
                "type": "STAGE_CHANGE",
                "tier": "tier2",
                "stage": "BATCH_PROGRESS",
                "batch_index": b_idx + 1,
                "total_batches": num_batches,
                "batch_papers": len(extracted_records),
                "total_ingested": len(all_ingested),
                "speed_ppm": speed_ppm,
                "free_disk_gb": round(self.check_disk_space(), 2),
            })

            self.dedup.save()

        duration = round(time.time() - start_time, 2)
        summary = {
            "status": "SUCCESS",
            "tier": "tier2_near_past_harvest",
            "start_date": self.start_date,
            "end_date": self.end_date,
            "candidates_found": len(candidates),
            "newly_ingested": len(all_ingested),
            "dedup_skipped": dup_skipped,
            "duration_s": duration,
        }
        logger.info("[TIER 2] Completed successfully: %s", summary)

        broadcast_telemetry({
            "type": "STAGE_CHANGE",
            "tier": "tier2",
            "stage": "completed",
            "title": f"Tier 2 completed: {len(all_ingested)} trending papers ingested in {duration}s",
            "summary": summary,
        })

        return summary


def main():
    parser = argparse.ArgumentParser(description="Run Hardened Tier 2 Near-Past Trending Pipeline (2024 to Present).")
    parser.add_argument("--days", type=int, default=1, help="Number of days backwards to harvest (default 1)")
    parser.add_argument("--per-day", type=int, default=50, help="Max papers per day (default 50)")
    parser.add_argument("--start-date", type=str, default="2024-01-01", help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end-date", type=str, default=None, help="End date (default today)")
    parser.add_argument("--limit", type=int, default=None, help="Max total papers to harvest across all days")
    parser.add_argument("--batch-size", type=int, default=25, help="Batch size for concurrent processing (default 25)")
    parser.add_argument("--no-marker", action="store_true", help="Disable Marker PDF extraction")
    parser.add_argument("--sync-r2", action="store_true", help="Synchronize to Cloudflare R2")
    args = parser.parse_args()

    harvester = Tier2NearPastHarvester(
        start_date=args.start_date,
        end_date=args.end_date,
        per_day_limit=args.per_day,
        max_total=args.limit,
        num_days=args.days,
        batch_size=args.batch_size,
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
