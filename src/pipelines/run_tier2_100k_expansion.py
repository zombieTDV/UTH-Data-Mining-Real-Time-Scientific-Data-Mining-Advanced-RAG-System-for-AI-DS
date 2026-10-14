"""Tier 2 100k Expansion Pipeline: Scaling Near-Past Medallion Lakehouse to 100,000 Papers.

Engineering Specifications:
1. Target:
   - Starting from existing 30,100 papers in data/silver/tier2/near_past_papers.parquet.
   - Expand to exactly 100,000 verified papers (adding ~69,900 papers).
   - Zero embedding computation during collection (pure Silver Medallion harvest).

2. Ingestion Principles:
   - Part 1: Top Conference Proceedings (CVF: CVPR 2023, ICCV 2023, WACV 2024).
   - Part 2: Daily Top 50 Crawl (2022-2026):
     * Strictly enforce TOP 50 PAPERS OF EACH DAY.
     * Sourced across core AI/ML categories (cs.CV, cs.CL, cs.LG, cs.AI, cs.RO).
     * Sorted strictly by cited_by_count DESC.
   - Deduplication: strict uniqueness on paper_id, normalized title, and SHA-256 abstract hash.

3. Lakehouse Vaulting & Sync:
   - Output: data/silver/tier2/near_past_papers.parquet (Zstandard compressed).
   - Remote: Sync to Cloudflare R2 silver/tier2/near_past_papers.parquet.
   - Live Telemetry: SSE broadcast to http://127.0.0.1:8000/api/ingestion/broadcast.
"""

import argparse
import asyncio
import datetime
import json
import logging
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import httpx
import pandas as pd
import psutil

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config.settings import settings
from src.storage.r2_client import R2Client
from src.transformation.silver_writer import SilverLakehouseWriter
from src.ingestion.cvf_harvester import CvfHarvester
from src.utils.hasher import compute_abstract_hash
from src.utils.logger import setup_pipeline_logging

logger, log_file = setup_pipeline_logging("tier2_100k_expansion")

# Canonical OpenAlex concepts for CS & AI/ML
AI_CS_CONCEPTS = "C154945302|C204321447|C119857082|C41008148|C90856484"


def broadcast_telemetry(payload: dict):
    """Sends telemetry pulse to local FastAPI SSE bridge."""
    try:
        httpx.post("http://127.0.0.1:8000/api/ingestion/broadcast", json=payload, timeout=0.25)
    except Exception:
        pass


def reconstruct_abstract(inverted_index: Optional[Dict[str, List[int]]]) -> str:
    """Reconstructs continuous text from OpenAlex abstract_inverted_index."""
    if not inverted_index or not isinstance(inverted_index, dict):
        return ""
    pos_words = []
    for word, positions in inverted_index.items():
        if isinstance(positions, list):
            for pos in positions:
                pos_words.append((pos, word))
    pos_words.sort(key=lambda x: x[0])
    return " ".join(w[1] for w in pos_words)


def normalize_title(title: str) -> str:
    """Normalizes title for collision detection."""
    return re.sub(r"[^\w\s]", "", str(title).lower()).strip()


class Tier2ScaleUpHarvester:
    """Manages high-throughput harvesting of Near-Past papers to reach 100,000 papers."""

    OPENALEX_API_URL = "https://api.openalex.org/works"
    MIN_FREE_DISK_GB = 15.0

    def __init__(self, target_total: int = 100000, sync_r2: bool = True):
        self.target_total = target_total
        self.sync_r2 = sync_r2
        self.r2 = R2Client() if sync_r2 else None
        self.silver_writer = SilverLakehouseWriter(r2_client=self.r2)

        self.tier2_path = settings.ROOT_DIR / "data" / "silver" / "tier2" / "near_past_papers.parquet"
        self.tier2_path.parent.mkdir(parents=True, exist_ok=True)

        self.checkpoint_path = settings.ROOT_DIR / "data" / "manifests" / "tier2_100k_checkpoint.parquet"
        self.checkpoint_path.parent.mkdir(parents=True, exist_ok=True)

        self.seen_paper_ids: Set[str] = set()
        self.seen_norm_titles: Set[str] = set()
        self.seen_hashes: Set[str] = set()

        self.existing_df = pd.DataFrame()
        self._load_existing_corpus()

    def check_disk_space(self) -> float:
        """Verifies disk space guardrail."""
        free_bytes = psutil.disk_usage(str(settings.ROOT_DIR)).free
        free_gb = free_bytes / (1024**3)
        if free_gb < self.MIN_FREE_DISK_GB:
            raise RuntimeError(f"Disk space guardrail breached: {free_gb:.2f} GB free (min: {self.MIN_FREE_DISK_GB} GB).")
        return free_gb

    def _load_existing_corpus(self):
        """Loads current Tier 2 corpus and builds fast deduplication sets."""
        if self.tier2_path.exists():
            try:
                self.existing_df = pd.read_parquet(self.tier2_path)
                logger.info("[TIER 2 LOAD] Loaded existing corpus: %d papers from %s", len(self.existing_df), self.tier2_path)
                for pid in self.existing_df["paper_id"].dropna():
                    self.seen_paper_ids.add(str(pid))
                for t in self.existing_df["title"].dropna():
                    nt = normalize_title(t)
                    if nt:
                        self.seen_norm_titles.add(nt)
                if "abstract_hash" in self.existing_df.columns:
                    for h in self.existing_df["abstract_hash"].dropna():
                        self.seen_hashes.add(str(h))
                logger.info("[DEDUP INDEX] Initialized with %d IDs and %d titles.", len(self.seen_paper_ids), len(self.seen_norm_titles))
            except Exception as e:
                logger.error("[TIER 2 LOAD ERROR] Failed to load %s: %s", self.tier2_path, e)

    def harvest_cvf_conferences(self, target_needed: int) -> List[Dict[str, Any]]:
        """Harvests peer-reviewed conference proceedings from CVF Open Access (CVPR 2023, ICCV 2023, WACV)."""
        logger.info("=" * 80)
        logger.info(">>> PHASE 1: HARVESTING CVF PEER-REVIEWED PROCEEDINGS (CVPR/ICCV/WACV)")
        logger.info("=" * 80)

        results: List[Dict[str, Any]] = []
        harvester = CvfHarvester(r2_client=self.r2)

        conferences = [
            ("CVPR2023", "2023-06-18"),
            ("ICCV2023", "2023-10-04"),
            ("WACV2024", "2024-01-08"),
            ("WACV2023", "2023-01-07"),
        ]

        for venue, pub_date in conferences:
            if len(results) >= target_needed:
                break
            try:
                logger.info("[CVF CRAWL] Fetching accepted papers for %s...", venue)
                papers = harvester.fetch_papers_listing(venue)
                logger.info("[CVF CRAWL] %s returned %d papers. Filtering duplicates...", venue, len(papers))

                added_for_venue = 0
                for p in papers:
                    if len(results) >= target_needed:
                        break
                    p_id = p.get("paper_id")
                    title = p.get("title", "").strip()
                    if not p_id or not title:
                        continue

                    norm_t = normalize_title(title)
                    if p_id in self.seen_paper_ids or norm_t in self.seen_norm_titles:
                        continue

                    abstract = p.get("abstract") or title
                    abs_hash = compute_abstract_hash(abstract)
                    if abs_hash in self.seen_hashes:
                        continue

                    self.seen_paper_ids.add(p_id)
                    self.seen_norm_titles.add(norm_t)
                    self.seen_hashes.add(abs_hash)

                    clean_full = f"Title: {title}\n\nAbstract: {abstract}"
                    sections = [{"section_id": "abstract", "section_title": "Abstract", "section_type": "abstract", "content": abstract, "paragraphs": [abstract], "paragraph_count": 1, "math_count": 0, "word_count": len(abstract.split())}]

                    rec = {
                        "paper_id": p_id,
                        "abstract_hash": abs_hash,
                        "doi": None,
                        "journal_ref": f"{venue} Proceedings",
                        "title": title,
                        "abstract": abstract,
                        "authors": p.get("authors", []),
                        "categories": ["cs.CV", "cs.AI"],
                        "primary_category": "cs.CV",
                        "published_date": pub_date,
                        "crawled_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                        "pdf_url": p.get("pdf_url", ""),
                        "html_url": p.get("html_url", ""),
                        "total_sections": 1,
                        "total_math_count": 0,
                        "total_words": len(clean_full.split()),
                        "sections_json": json.dumps(sections),
                        "clean_full_text": clean_full,
                        "transformed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                        "cite_count": 0.0,
                        "source": "cvf",
                        "tier": "tier2",
                        "content_origin": "cvf_html_dom",
                    }
                    results.append(rec)
                    added_for_venue += 1

                logger.info("[CVF CRAWL] Added %d new verified papers from %s. (Phase 1 Total: %d)", added_for_venue, venue, len(results))
            except Exception as e:
                logger.warning("[CVF CRAWL ERROR] Failed %s: %s", venue, e)

        return results

    async def _fetch_openalex_day(self, client: httpx.AsyncClient, date_str: str, semaphore: asyncio.Semaphore) -> List[Dict[str, Any]]:
        """Queries OpenAlex for exactly the TOP 50 papers of a given day sorted by cited_by_count DESC."""
        async with semaphore:
            params = {
                "filter": f"has_abstract:true,concepts.id:{AI_CS_CONCEPTS},from_publication_date:{date_str},to_publication_date:{date_str},is_paratext:false,is_retracted:false",
                "sort": "cited_by_count:desc",
                "per-page": 50,
            }
            for attempt in range(3):
                try:
                    resp = await client.get(self.OPENALEX_API_URL, params=params)
                    if resp.status_code == 200:
                        data = resp.json()
                        return data.get("results", [])
                    elif resp.status_code in (429, 500, 502, 503):
                        await asyncio.sleep(1.5 * (attempt + 1))
                except Exception:
                    await asyncio.sleep(1.0)
            return []

    async def harvest_daily_top50(self, target_needed: int) -> List[Dict[str, Any]]:
        """Steps backward day-by-day across 2022-2026, strictly taking the TOP 50 PAPERS of each day."""
        logger.info("=" * 80)
        logger.info(">>> PHASE 2: DAILY TOP 50 HARVEST (STRICTLY 50 PAPERS/DAY SORTED BY CITES DESC)")
        logger.info("=" * 80)

        results: List[Dict[str, Any]] = []
        # Start stepping backward from September 20, 2026 down through 2025, 2024, 2023, 2022
        curr_dt = datetime.date(2026, 9, 20)
        earliest_dt = datetime.date(2021, 6, 1)

        semaphore = asyncio.Semaphore(8)  # Polite concurrency
        headers = {"User-Agent": "UTH-DataMining-Tier2Scale/2.0 (mailto:datamining@uth.edu.vn; academic research)"}

        # Generate date list
        all_dates: List[str] = []
        while curr_dt >= earliest_dt:
            all_dates.append(curr_dt.isoformat())
            curr_dt -= datetime.timedelta(days=1)

        logger.info("[DAILY CRAWL] Generated %d calendar dates (from %s to %s).", len(all_dates), all_dates[0], all_dates[-1])

        batch_size = 20  # 20 days per concurrent burst (up to 1,000 papers/burst)
        async with httpx.AsyncClient(headers=headers, timeout=20.0, limits=httpx.Limits(max_connections=20, max_keepalive_connections=10)) as client:
            for i in range(0, len(all_dates), batch_size):
                if len(results) >= target_needed:
                    break

                self.check_disk_space()
                chunk_dates = all_dates[i:i + batch_size]
                t0 = time.time()
                tasks = [self._fetch_openalex_day(client, d, semaphore) for d in chunk_dates]
                days_data = await asyncio.gather(*tasks)

                batch_added = 0
                for date_str, raw_works in zip(chunk_dates, days_data):
                    # Sort day's papers by cite_count descending and strictly cap at 50
                    raw_works.sort(key=lambda w: int(w.get("cited_by_count") or 0), reverse=True)
                    day_top50 = raw_works[:50]

                    day_accepted = 0
                    for w in day_top50:
                        if len(results) >= target_needed:
                            break

                        title = w.get("title") or ""
                        if not title:
                            continue

                        norm_t = normalize_title(title)
                        if norm_t in self.seen_norm_titles:
                            continue

                        abstract = reconstruct_abstract(w.get("abstract_inverted_index"))
                        if not abstract or len(abstract.strip()) < 40:
                            continue

                        abs_hash = compute_abstract_hash(abstract)
                        if abs_hash in self.seen_hashes:
                            continue

                        ids = w.get("ids", {})
                        doi = ids.get("doi") or w.get("doi")
                        arxiv_id = ids.get("arxiv")
                        if arxiv_id and "arxiv.org/abs/" in arxiv_id:
                            arxiv_id = arxiv_id.split("arxiv.org/abs/")[-1]

                        # Provenance and source classification
                        primary_loc = w.get("primary_location") or {}
                        source_obj = primary_loc.get("source") or {}
                        venue_name = source_obj.get("display_name", "")

                        if arxiv_id:
                            source = "arxiv"
                            paper_id = arxiv_id
                        elif "CVPR" in venue_name or "ICCV" in venue_name or "CVF" in venue_name:
                            source = "cvf"
                            paper_id = f"cvf_{w.get('id', '').split('/')[-1]}"
                        elif "ICLR" in venue_name or "NeurIPS" in venue_name or "OpenReview" in venue_name or "ICML" in venue_name:
                            source = "openreview"
                            paper_id = f"openreview_{w.get('id', '').split('/')[-1]}"
                        elif doi and "zenodo" in str(doi).lower():
                            source = "zenodo"
                            paper_id = f"doi_{doi.replace('https://doi.org/', '').replace('/', '_')}"
                        else:
                            source = "openalex"
                            paper_id = f"oa_{w.get('id', '').split('/')[-1]}"

                        if paper_id in self.seen_paper_ids:
                            continue

                        self.seen_paper_ids.add(paper_id)
                        self.seen_norm_titles.add(norm_t)
                        self.seen_hashes.add(abs_hash)

                        # Primary category extraction
                        concepts = w.get("concepts", [])
                        cat = "cs.AI"
                        if concepts:
                            cname = concepts[0].get("display_name", "").lower()
                            if "vision" in cname:
                                cat = "cs.CV"
                            elif "language" in cname or "nlp" in cname or "linguistics" in cname:
                                cat = "cs.CL"
                            elif "learning" in cname:
                                cat = "cs.LG"
                            elif "robot" in cname:
                                cat = "cs.RO"

                        # Authors extraction
                        authors = []
                        for auth in w.get("authorships", []):
                            aname = auth.get("author", {}).get("display_name")
                            if aname:
                                authors.append(aname)

                        cite_count = float(w.get("cited_by_count") or 0.0)
                        best_oa = w.get("best_oa_location") or {}
                        pdf_url = best_oa.get("pdf_url") or (f"https://arxiv.org/pdf/{arxiv_id}.pdf" if arxiv_id else "")
                        html_url = w.get("id") or (f"https://arxiv.org/abs/{arxiv_id}" if arxiv_id else "")

                        clean_full = f"Title: {title}\n\nAbstract: {abstract}"
                        sections = [{"section_id": "abstract", "section_title": "Abstract", "section_type": "abstract", "content": abstract, "paragraphs": [abstract], "paragraph_count": 1, "math_count": 0, "word_count": len(abstract.split())}]

                        rec = {
                            "paper_id": str(paper_id),
                            "abstract_hash": str(abs_hash),
                            "doi": str(doi) if doi else None,
                            "journal_ref": str(venue_name) if venue_name else None,
                            "title": str(title),
                            "abstract": str(abstract),
                            "authors": [str(a) for a in authors],
                            "categories": [cat],
                            "primary_category": cat,
                            "published_date": str(date_str),
                            "crawled_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                            "pdf_url": str(pdf_url),
                            "html_url": str(html_url),
                            "total_sections": 1,
                            "total_math_count": 0,
                            "total_words": len(clean_full.split()),
                            "sections_json": json.dumps(sections),
                            "clean_full_text": clean_full,
                            "transformed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                            "cite_count": cite_count,
                            "source": source,
                            "tier": "tier2",
                            "content_origin": f"{source}_daily_top50",
                        }
                        results.append(rec)
                        day_accepted += 1
                        batch_added += 1

                elapsed = time.time() - t0
                current_total = len(self.existing_df) + len(results)
                logger.info(
                    "[DAILY PROGRESS] Batch %d-%d (%s to %s): Added %d papers in %.2fs | Tier 2 Total: %d / %d",
                    i, i + batch_size, chunk_dates[0], chunk_dates[-1], batch_added, elapsed, current_total, self.target_total
                )

                # Broadcast live telemetry
                broadcast_telemetry({
                    "type": "BATCH_PROGRESS",
                    "stage": "HARVESTING",
                    "source": "tier2_expansion",
                    "batch_size": batch_added,
                    "total_tier2_papers": current_total,
                    "progress_percent": round((current_total / self.target_total) * 100, 1),
                    "message": f"Crawled top 50 papers/day ({chunk_dates[0]} to {chunk_dates[-1]}). Total: {current_total:,}/{self.target_total:,}",
                })

                # Checkpoint every 5,000 papers
                if len(results) % 5000 < batch_size and len(results) > 0:
                    try:
                        pd.DataFrame(results).to_parquet(self.checkpoint_path, compression="zstd")
                        logger.info("[CHECKPOINT] Vaulted %d candidates to %s", len(results), self.checkpoint_path)
                    except Exception as e:
                        logger.warning("[CHECKPOINT ERROR] %s", e)

                # Polite pause between batches
                await asyncio.sleep(0.5)

        return results

    def run(self) -> Dict[str, Any]:
        """Executes full Tier 2 expansion pipeline to 100,000 papers."""
        t0 = time.time()
        initial_count = len(self.existing_df)
        needed = max(0, self.target_total - initial_count)
        logger.info("=" * 80)
        logger.info("TIER 2 100K EXPANSION INGESTION PIPELINE")
        logger.info("Initial Corpus: %d papers | Target: %d papers | Needed: %d papers", initial_count, self.target_total, needed)
        logger.info("=" * 80)

        if needed <= 0:
            logger.info("Corpus already meets or exceeds target of %d papers.", self.target_total)
            return {"status": "ALREADY_COMPLETED", "total_papers": initial_count}

        new_candidates: List[Dict[str, Any]] = []

        # Phase 1: CVF Accepted Proceedings
        cvf_papers = self.harvest_cvf_conferences(target_needed=needed)
        new_candidates.extend(cvf_papers)
        logger.info("[PHASE 1 COMPLETE] Collected %d CVF conference papers.", len(cvf_papers))

        # Phase 2: Daily Top 50 Crawl (2022-2026)
        remaining_needed = needed - len(new_candidates)
        if remaining_needed > 0:
            daily_papers = asyncio.run(self.harvest_daily_top50(target_needed=remaining_needed))
            new_candidates.extend(daily_papers)
            logger.info("[PHASE 2 COMPLETE] Collected %d Daily Top 50 papers.", len(daily_papers))

        # Phase 3: Consolidate & Vault to Silver Parquet
        logger.info("=" * 80)
        logger.info(">>> PHASE 3: CONSOLIDATING AND VAULTING TO SILVER PARQUET")
        logger.info("=" * 80)

        new_df = pd.DataFrame(new_candidates)
        logger.info("[MERGE] Merging %d new candidate records with existing %d records...", len(new_df), len(self.existing_df))

        merged_df = pd.concat([self.existing_df, new_df], ignore_index=True) if not self.existing_df.empty else new_df
        # Deduplication check
        merged_df["norm_title"] = merged_df["title"].astype(str).str.lower().str.replace(r"[^\w\s]", "", regex=True).str.strip()
        merged_df = merged_df.drop_duplicates(subset=["paper_id"]).drop_duplicates(subset=["norm_title"])
        merged_df = merged_df.drop(columns=["norm_title"])

        # Cap strictly at target_total if exceeded
        if len(merged_df) > self.target_total:
            merged_df = merged_df.head(self.target_total)

        final_total = len(merged_df)
        logger.info("[DEDUP SUCCESS] Cleaned and deduplicated Tier 2 corpus contains %d papers!", final_total)

        # Write to local Silver Parquet
        merged_df.to_parquet(self.tier2_path, engine="pyarrow", compression="zstd")
        file_size_mb = self.tier2_path.stat().st_size / (1024 * 1024)
        logger.info("[VAULT SUCCESS] Vaulted %d papers to %s (Size: %.2f MB)", final_total, self.tier2_path, file_size_mb)

        # Clean checkpoint file
        if self.checkpoint_path.exists():
            try:
                self.checkpoint_path.unlink()
            except Exception:
                pass

        # Update deduplication manifest so backend storage stats immediately reflect the new corpus
        manifest_path = settings.ROOT_DIR / "data" / "manifests" / "openalex_dedup_hashes.parquet"
        if manifest_path.exists():
            try:
                manifest_df = pd.read_parquet(manifest_path)
                existing_manifest_ids = set(manifest_df["paper_id"])
                new_manifest_rows = []
                for _, row in merged_df.iterrows():
                    pid = str(row["paper_id"])
                    if pid not in existing_manifest_ids:
                        norm_title = normalize_title(str(row["title"]))
                        title_sha = compute_abstract_hash(norm_title)
                        pub_yr = int(str(row["published_date"])[:4]) if row.get("published_date") and len(str(row["published_date"])) >= 4 else 2024
                        new_manifest_rows.append({
                            "paper_id": pid,
                            "openalex_id": str(row.get("doi") or pid),
                            "doi": str(row.get("doi") or ""),
                            "normalized_title": norm_title,
                            "title_sha256": title_sha,
                            "year": pub_yr,
                            "source": str(row.get("source") or "arxiv"),
                        })
                if new_manifest_rows:
                    combined_manifest = pd.concat([manifest_df, pd.DataFrame(new_manifest_rows)], ignore_index=True)
                    combined_manifest.to_parquet(manifest_path, compression="zstd")
                    logger.info("[MANIFEST UPDATE] Updated %s to %d total records.", manifest_path, len(combined_manifest))
            except Exception as e:
                logger.warning("[MANIFEST UPDATE ERROR] %s", e)

        # Phase 4: Remote Sync to Cloudflare R2
        if self.sync_r2 and self.r2:
            logger.info("=" * 80)
            logger.info(">>> PHASE 4: SYNCHRONIZING TO CLOUDFLARE R2 BUCKET")
            logger.info("=" * 80)
            try:
                self.r2.upload_file(
                    self.tier2_path,
                    "silver/tier2/near_past_papers.parquet",
                    content_type="application/vnd.apache.parquet",
                )
                logger.info("[R2 SYNC SUCCESS] Synced Tier 2 Silver Parquet (%.2f MB, %d papers) to R2.", file_size_mb, final_total)
                if manifest_path.exists():
                    self.r2.upload_file(
                        manifest_path,
                        "manifests/openalex_dedup_hashes.parquet",
                        content_type="application/vnd.apache.parquet",
                    )
                    logger.info("[R2 SYNC SUCCESS] Synced deduplication manifest to R2.")
            except Exception as e:
                logger.error("[R2 SYNC ERROR] Failed to upload to R2: %s", e)

        duration = round(time.time() - t0, 2)
        source_counts = merged_df["source"].value_counts().to_dict()

        logger.info("=" * 80)
        logger.info("TIER 2 100K EXPANSION COMPLETED SUCCESSFULLY IN %.2fs", duration)
        logger.info("Initial: %d | Added: %d | Final Total: %d", initial_count, len(new_candidates), final_total)
        logger.info("Source Distribution: %s", source_counts)
        logger.info("=" * 80)

        # Final SSE notification
        broadcast_telemetry({
            "type": "STAGE_CHANGE",
            "stage": "COMPLETED",
            "source": "tier2_expansion",
            "total_tier2_papers": final_total,
            "message": f"Successfully completed Tier 2 expansion: {final_total:,} papers vaulted to Silver Medallion.",
        })

        return {
            "status": "SUCCESS",
            "duration_s": duration,
            "initial_papers": initial_count,
            "added_papers": len(new_candidates),
            "final_total": final_total,
            "file_size_mb": round(file_size_mb, 2),
            "source_distribution": source_counts,
        }


def main():
    parser = argparse.ArgumentParser(description="Expand Tier 2 Near-Past Medallion Lakehouse to 100,000 papers.")
    parser.add_argument("--target", type=int, default=100000, help="Target total papers in Tier 2 (default: 100000).")
    parser.add_argument("--no-sync-r2", action="store_true", help="Disable Cloudflare R2 upload.")
    args = parser.parse_args()

    sync_r2 = not args.no_sync_r2
    harvester = Tier2ScaleUpHarvester(target_total=args.target, sync_r2=sync_r2)
    res = harvester.run()
    print("\n" + json.dumps(res, indent=2))


if __name__ == "__main__":
    main()
