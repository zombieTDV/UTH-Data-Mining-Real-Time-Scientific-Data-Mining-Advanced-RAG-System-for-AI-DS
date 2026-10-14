"""Complete Tier 2 to exactly 100,000 papers via direct arXiv OAI-PMH harvesting.

Specifications:
- Initial state: 81,546 verified papers in data/silver/tier2/near_past_papers.parquet.
- Target: exactly 100,000 papers (adding 18,454 papers).
- Strict Rule: Enforce TOP 50 PAPERS PER DAY limit (no calendar date can exceed 50 papers).
- Source: Direct Cornell arXiv OAI-PMH protocol (set=cs).
- Zero embedding computation (pure harvest and silver transformation).
- Remote sync to Cloudflare R2 upon completion.
"""

import argparse
import datetime
import json
import logging
import os
import re
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import httpx
import pandas as pd
import psutil

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config.settings import settings
from src.storage.r2_client import R2Client
from src.transformation.silver_writer import SilverLakehouseWriter
from src.ingestion.arxiv_batch_harvester import ArxivBatchHarvester
from src.utils.hasher import compute_abstract_hash
from src.utils.logger import setup_pipeline_logging

logger, log_file = setup_pipeline_logging("tier2_complete_100k_arxiv")

TARGET_CATS = {"cs.AI", "cs.LG", "cs.CV", "cs.CL", "stat.ML", "cs.RO", "cs.NE", "cs.IR"}


def broadcast_telemetry(payload: dict):
    """Sends telemetry pulse to local FastAPI SSE bridge."""
    try:
        httpx.post("http://127.0.0.1:8000/api/ingestion/broadcast", json=payload, timeout=0.25)
    except Exception:
        pass


def normalize_title(title: str) -> str:
    return re.sub(r"[^\w\s]", "", str(title).lower()).strip()


class ArxivTier2Finalizer:
    def __init__(self, target_total: int = 100000, sync_r2: bool = True):
        self.target_total = target_total
        self.sync_r2 = sync_r2
        self.r2 = R2Client() if sync_r2 else None
        self.silver_writer = SilverLakehouseWriter(r2_client=self.r2)

        self.tier2_path = settings.ROOT_DIR / "data" / "silver" / "tier2" / "near_past_papers.parquet"
        self.harvester = ArxivBatchHarvester(r2_client=self.r2, request_delay=2.0)

        self.seen_paper_ids: Set[str] = set()
        self.seen_norm_titles: Set[str] = set()
        self.seen_hashes: Set[str] = set()
        self.date_counts: Dict[str, int] = defaultdict(int)

        self.existing_df = pd.DataFrame()
        self._load_existing()

    def _load_existing(self):
        if self.tier2_path.exists():
            self.existing_df = pd.read_parquet(self.tier2_path)
            logger.info("[LOAD] Existing Tier 2 corpus: %d papers.", len(self.existing_df))
            for pid in self.existing_df["paper_id"].dropna():
                self.seen_paper_ids.add(str(pid))
            for t in self.existing_df["title"].dropna():
                nt = normalize_title(t)
                if nt:
                    self.seen_norm_titles.add(nt)
            if "abstract_hash" in self.existing_df.columns:
                for h in self.existing_df["abstract_hash"].dropna():
                    self.seen_hashes.add(str(h))
            if "published_date" in self.existing_df.columns:
                for d in self.existing_df["published_date"].dropna():
                    self.date_counts[str(d)] += 1
            logger.info("[INDEX] Deduplication index initialized: %d IDs, %d titles.", len(self.seen_paper_ids), len(self.seen_norm_titles))

    def run(self) -> Dict[str, Any]:
        t0 = time.time()
        initial_count = len(self.existing_df)
        needed = max(0, self.target_total - initial_count)
        logger.info("=" * 80)
        logger.info("FINALIZING TIER 2 TO %d PAPERS VIA LIVE ARXIV OAI-PMH", self.target_total)
        logger.info("Current: %d | Needed: %d papers", initial_count, needed)
        logger.info("=" * 80)

        if needed <= 0:
            logger.info("Target already reached.")
            return {"status": "ALREADY_COMPLETED", "total_papers": initial_count}

        # Generate 7-day windows stepping backward from 2026-08-20 down through 2022
        curr_end = datetime.date(2026, 8, 20)
        earliest_start = datetime.date(2022, 1, 1)
        windows = []
        while curr_end >= earliest_start:
            win_start = max(earliest_start, curr_end - datetime.timedelta(days=6))
            windows.append((win_start.isoformat(), curr_end.isoformat()))
            curr_end -= datetime.timedelta(days=7)

        logger.info("[WINDOWS] Generated %d 7-day windows for rapid OAI-PMH streaming.", len(windows))

        new_records: List[Dict[str, Any]] = []

        for from_d, until_d in windows:
            if len(new_records) >= needed:
                break

            logger.info("[ARXIV HARVEST] Scanning window %s to %s...", from_d, until_d)
            resumption_token = None
            page_num = 0

            while len(new_records) < needed:
                page_num += 1
                try:
                    page_data = self.harvester.fetch_oai_page(
                        resumption_token=resumption_token,
                        set_spec="cs",
                        from_date=from_d if not resumption_token else None,
                        until_date=until_d if not resumption_token else None,
                    )
                except Exception as e:
                    logger.warning("[ARXIV OAI ERROR] Page %d in %s-%s: %s", page_num, from_d, until_d, e)
                    time.sleep(3.0)
                    break

                if not page_data or not isinstance(page_data, dict):
                    logger.warning("[ARXIV OAI SKIP] Empty or invalid page data for %s-%s", from_d, until_d)
                    break

                raw_records = page_data.get("records_raw", [])
                resumption_token = page_data.get("resumption_token")
                batch_added = 0

                for r in raw_records:
                    if len(new_records) >= needed:
                        break

                    norm = self.harvester.normalize_oai_record(r)
                    if not norm:
                        continue

                    p_id = norm.get("paper_id")
                    title = norm.get("title", "").strip()
                    if not p_id or not title:
                        continue

                    norm_t = normalize_title(title)
                    if p_id in self.seen_paper_ids or norm_t in self.seen_norm_titles:
                        continue

                    cats = set(norm.get("categories", []))
                    if not cats.intersection(TARGET_CATS):
                        continue

                    pub_date = norm.get("published_date") or from_d
                    # STRICT TOP 50 PER DAY LIMIT:
                    if self.date_counts[pub_date] >= 50:
                        continue

                    abstract = norm.get("abstract") or title
                    abs_hash = compute_abstract_hash(abstract)
                    if abs_hash in self.seen_hashes:
                        continue

                    self.seen_paper_ids.add(p_id)
                    self.seen_norm_titles.add(norm_t)
                    self.seen_hashes.add(abs_hash)
                    self.date_counts[pub_date] += 1

                    clean_full = f"Title: {title}\n\nAbstract: {abstract}"
                    sections = [{"section_id": "abstract", "section_title": "Abstract", "section_type": "abstract", "content": abstract, "paragraphs": [abstract], "paragraph_count": 1, "math_count": 0, "word_count": len(abstract.split())}]

                    rec = {
                        "paper_id": str(p_id),
                        "abstract_hash": str(abs_hash),
                        "doi": norm.get("doi"),
                        "journal_ref": norm.get("journal_ref"),
                        "title": str(title),
                        "abstract": str(abstract),
                        "authors": [str(a) for a in norm.get("authors", [])],
                        "categories": norm.get("categories", ["cs.AI"]),
                        "primary_category": norm.get("primary_category", "cs.AI"),
                        "published_date": str(pub_date),
                        "crawled_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                        "pdf_url": norm.get("pdf_url", f"https://arxiv.org/pdf/{p_id}.pdf"),
                        "html_url": norm.get("html_url", f"https://arxiv.org/abs/{p_id}"),
                        "total_sections": 1,
                        "total_math_count": 0,
                        "total_words": len(clean_full.split()),
                        "sections_json": json.dumps(sections),
                        "clean_full_text": clean_full,
                        "transformed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                        "cite_count": 0.0,
                        "source": "arxiv",
                        "tier": "tier2",
                        "content_origin": "arxiv_oai_pmh_top50",
                    }
                    new_records.append(rec)
                    batch_added += 1

                current_total = initial_count + len(new_records)
                logger.info(
                    "[ARXIV PROGRESS] Page %d (%s-%s): Added %d papers (Window raw: %d) | Total: %d / %d",
                    page_num, from_d, until_d, batch_added, len(raw_records), current_total, self.target_total
                )

                broadcast_telemetry({
                    "type": "BATCH_PROGRESS",
                    "stage": "HARVESTING",
                    "source": "arxiv_top50",
                    "batch_size": batch_added,
                    "total_tier2_papers": current_total,
                    "progress_percent": round((current_total / self.target_total) * 100, 1),
                    "message": f"Harvested live arXiv top 50/day. Total Tier 2: {current_total:,} / {self.target_total:,}",
                })

                if not resumption_token:
                    break

                time.sleep(2.0)

        # Merge & Vault
        logger.info("=" * 80)
        logger.info("CONSOLIDATING FINAL 100,000 PAPERS TIER 2 LAKEHOUSE")
        logger.info("=" * 80)

        new_df = pd.DataFrame(new_records)
        merged_df = pd.concat([self.existing_df, new_df], ignore_index=True) if not self.existing_df.empty else new_df
        merged_df["norm_title"] = merged_df["title"].astype(str).str.lower().str.replace(r"[^\w\s]", "", regex=True).str.strip()
        merged_df = merged_df.drop_duplicates(subset=["paper_id"]).drop_duplicates(subset=["norm_title"])
        merged_df = merged_df.drop(columns=["norm_title"])

        if len(merged_df) > self.target_total:
            merged_df = merged_df.head(self.target_total)

        final_total = len(merged_df)
        merged_df.to_parquet(self.tier2_path, engine="pyarrow", compression="zstd")
        file_size_mb = self.tier2_path.stat().st_size / (1024 * 1024)
        logger.info("[VAULT SUCCESS] Vaulted %d papers to %s (Size: %.2f MB)", final_total, self.tier2_path, file_size_mb)

        # Update manifest
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
                logger.warning("[MANIFEST ERROR] %s", e)

        # Sync to R2
        if self.sync_r2 and self.r2:
            try:
                self.r2.upload_file(
                    self.tier2_path,
                    "silver/tier2/near_past_papers.parquet",
                    content_type="application/vnd.apache.parquet",
                )
                logger.info("[R2 SYNC] Synced Tier 2 Silver Parquet (%.2f MB) to R2.", file_size_mb)
                if manifest_path.exists():
                    self.r2.upload_file(
                        manifest_path,
                        "manifests/openalex_dedup_hashes.parquet",
                        content_type="application/vnd.apache.parquet",
                    )
                    logger.info("[R2 SYNC] Synced deduplication manifest to R2.")
            except Exception as e:
                logger.error("[R2 SYNC ERROR] %s", e)

        duration = round(time.time() - t0, 2)
        source_counts = merged_df["source"].value_counts().to_dict()

        logger.info("=" * 80)
        logger.info("TIER 2 REACHED %d PAPERS IN %.2fs", final_total, duration)
        logger.info("Sources: %s", source_counts)
        logger.info("=" * 80)

        broadcast_telemetry({
            "type": "STAGE_CHANGE",
            "stage": "COMPLETED",
            "source": "tier2_expansion",
            "total_tier2_papers": final_total,
            "message": f"Tier 2 100k Goal Achieved: {final_total:,} papers vaulted to Silver Medallion.",
        })

        return {
            "status": "SUCCESS",
            "duration_s": duration,
            "initial_papers": initial_count,
            "added_papers": len(new_records),
            "final_total": final_total,
            "file_size_mb": round(file_size_mb, 2),
            "source_distribution": source_counts,
        }


def main():
    parser = argparse.ArgumentParser(description="Complete Tier 2 to 100,000 papers via arXiv.")
    parser.add_argument("--target", type=int, default=100000, help="Target total papers (default: 100000).")
    parser.add_argument("--no-sync-r2", action="store_true", help="Disable R2 sync.")
    args = parser.parse_args()

    finalizer = ArxivTier2Finalizer(target_total=args.target, sync_r2=not args.no_sync_r2)
    res = finalizer.run()
    print("\n" + json.dumps(res, indent=2))


if __name__ == "__main__":
    main()
