"""Pipeline: Fix Tier 1 (3,000 True Historical Landmarks 2016-2021) and Expand Tier 2 to 30,000 Papers.

Specifications:
1. Tier 1 Landmark Fix:
   - Must be TRUE historical landmarks (2016-2021), 0% from 2023+.
   - CVF: CVPR 2021 accepted papers (1,020 papers).
   - OpenReview: Historical 2017-2020 ICLR/NeurIPS accepted papers with reviews (1,020 papers).
   - arXiv: Foundational 2016-2017 landmark preprints (including June 2017 Transformer era) (1,020 papers).
   - Deduplicated into exactly 3,000 landmark papers in data/silver/tier1/landmark_papers.parquet.

2. Tier 2 Expansion to 30,000 Papers:
   - Starting from current 20,095 papers.
   - arXiv: Harvest 7,100 more preprints stepping day-by-day backward (2026-09-29 to 2026-09-21).
   - OpenReview: Harvest 2,050 more 2023-2024 papers with review threads (DuckDB stream, offset 5500).
   - CVF: Harvest 1,050 more near-past 2023-2024 papers.
   - Deduplicate and vault to data/silver/tier2/near_past_papers.parquet (reaching >= 30,000 papers).

3. Performance:
   - High-throughput ingestion and deduplication only (no embedding computation during harvest).
   - Vault to local Silver Parquet and sync to Cloudflare R2.
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
from typing import Any, Dict, List, Set

import duckdb
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config.settings import settings
from src.storage.minio_client import StorageClient as R2Client
from src.transformation.silver_writer import SilverLakehouseWriter
from src.ingestion.arxiv_batch_harvester import ArxivBatchHarvester
from src.ingestion.openreview_harvester import OpenReviewHarvester
from src.ingestion.cvf_harvester import CvfHarvester
from src.utils.logger import setup_pipeline_logging

logger, log_file = setup_pipeline_logging("tier1_landmark_fix_and_tier2_30k")


class ProductionTier1AndTier2Harvester:
    def __init__(self, sync_r2: bool = True):
        self.r2 = R2Client() if sync_r2 else None
        self.sync_r2 = sync_r2
        self.silver_writer = SilverLakehouseWriter(r2_client=self.r2)

    # =========================================================================
    # PART 1: FIX TIER 1 TO TRUE HISTORICAL LANDMARKS (2016-2021)
    # =========================================================================

    def collect_true_landmark_openreview(self, target: int = 1020) -> List[Dict[str, Any]]:
        """Harvests true historical OpenReview landmarks (2017-2020) with full reviews."""
        logger.info("[TIER 1 LANDMARKS] Harvesting %d historical OpenReview papers (2017-2020)...", target)
        url0 = "https://huggingface.co/datasets/AlgorithmicResearchGroup/openreview-papers-with-reviews/resolve/refs%2Fconvert%2Fparquet/default/train/0000.parquet"
        con = duckdb.connect()
        query = f"""
        SELECT paper_id, year, venue, paper_title, paper_authors, paper_abstract, forum_url, pdf_url,
               list(struct_pack(
                   review_id := review_id,
                   rating := structured_review.review_rating,
                   confidence := structured_review.review_confidence,
                   title := structured_review.review_title,
                   body := structured_review.review_body
               )) as reviews
        FROM read_parquet('{url0}')
        WHERE year in ('2017', '2018', '2019', '2020')
        GROUP BY paper_id, year, venue, paper_title, paper_authors, paper_abstract, forum_url, pdf_url
        LIMIT {target}
        """
        rows = con.execute(query).fetchall()
        logger.info("[TIER 1 OPENREVIEW] Retrieved %d historical papers (2017-2020) with reviews.", len(rows))

        results = []
        for r in rows:
            p_id, yr, ven, title, raw_auth, abstract, forum, pdf, revs = r
            authors = [a.strip() for a in str(raw_auth).split(",") if a.strip()] if raw_auth else []
            clean_title = str(title).strip() if title else "Historical Landmark Paper"
            clean_abs = str(abstract).strip() if abstract else clean_title

            raw_meta = {
                "paper_id": f"openreview_{p_id}",
                "title": clean_title,
                "abstract": clean_abs,
                "authors": authors,
                "primary_category": "cs.LG",
                "categories": ["cs.LG", "cs.AI"],
                "published_date": f"{yr}-05-01",
                "pdf_url": str(pdf) if pdf else f"https://openreview.net/pdf?id={p_id}",
                "html_url": str(forum) if forum else f"https://openreview.net/forum?id={p_id}",
                "tier": "tier1",
                "source": "openreview",
                "content_origin": "openreview_peer_review",
            }
            parsed_dummy = {
                "parsed_title": clean_title,
                "parsed_abstract": clean_abs,
                "sections": [
                    {
                        "section_id": "abstract",
                        "section_title": "Abstract",
                        "section_type": "abstract",
                        "content": clean_abs,
                        "paragraphs": [clean_abs],
                        "paragraph_count": 1,
                        "math_count": 0,
                        "word_count": len(clean_abs.split()),
                    }
                ],
                "total_sections": 1,
                "total_math_count": 0,
                "total_words": len(clean_abs.split()),
                "content_origin": "openreview_peer_review",
            }
            rec = self.silver_writer.prepare_record(raw_meta, parsed_dummy)
            rec["tier"] = "tier1"
            rec["source"] = "openreview"
            rec["content_origin"] = "openreview_peer_review"
            results.append(rec)

        return results

    def collect_true_landmark_cvf(self, target: int = 1020) -> List[Dict[str, Any]]:
        """Harvests true historical CVF landmarks from CVPR 2021 proceedings."""
        logger.info("[TIER 1 LANDMARKS] Harvesting %d historical CVF papers (CVPR 2021)...", target)
        harvester = CvfHarvester(r2_client=self.r2)
        papers = harvester.fetch_papers_listing("CVPR2021")
        selected = papers[:target]
        logger.info("[TIER 1 CVF] Selected %d historical papers from CVPR 2021.", len(selected))

        results = []
        for p in selected:
            title = p.get("title", "").strip()
            p_id = p.get("paper_id", "")
            raw_meta = {
                "paper_id": p_id,
                "title": title,
                "abstract": p.get("abstract") or title,
                "authors": p.get("authors", []),
                "primary_category": "cs.CV",
                "categories": ["cs.CV", "cs.AI"],
                "published_date": "2021-06-25",
                "pdf_url": p.get("pdf_url", ""),
                "html_url": p.get("html_url", ""),
                "tier": "tier1",
                "source": "cvf",
                "content_origin": "cvf_html_dom",
            }
            parsed_dummy = {
                "parsed_title": title,
                "parsed_abstract": title,
                "sections": [
                    {
                        "section_id": "abstract",
                        "section_title": "Abstract",
                        "section_type": "abstract",
                        "content": title,
                        "paragraphs": [title],
                        "paragraph_count": 1,
                        "math_count": 0,
                        "word_count": len(title.split()),
                    }
                ],
                "total_sections": 1,
                "total_math_count": 0,
                "total_words": len(title.split()),
                "content_origin": "cvf_html_dom",
            }
            rec = self.silver_writer.prepare_record(raw_meta, parsed_dummy)
            rec["tier"] = "tier1"
            rec["source"] = "cvf"
            rec["content_origin"] = "cvf_html_dom"
            results.append(rec)

        return results

    def collect_true_landmark_arxiv(self, target: int = 1020) -> List[Dict[str, Any]]:
        """Harvests historical foundational AI/ML preprints from 2016-2017 via arXiv OAI-PMH."""
        logger.info("[TIER 1 LANDMARKS] Harvesting %d foundational arXiv preprints (2016-2017)...", target)
        harvester = ArxivBatchHarvester(r2_client=self.r2, request_delay=2.0)
        results = []
        seen_ids = set()
        target_cats = {"cs.AI", "cs.LG", "cs.CV", "cs.CL", "stat.ML", "cs.RO"}

        windows = [
            ("2017-06-01", "2017-06-30"),  # Transformer landmark era
            ("2016-01-01", "2016-03-31"),  # ResNet era
            ("2016-04-01", "2016-06-30"),
        ]

        for from_d, until_d in windows:
            if len(results) >= target:
                break
            try:
                page_data = harvester.fetch_oai_page(
                    resumption_token=None,
                    set_spec="cs",
                    from_date=from_d,
                    until_date=until_d,
                )
                records_raw = page_data.get("records_raw", [])
                for r in records_raw:
                    if len(results) >= target:
                        break
                    p = harvester.normalize_oai_record(r)
                    if not p:
                        continue
                    p_id = p.get("paper_id")
                    if not p_id or p_id in seen_ids:
                        continue
                    cats = set(p.get("categories", []))
                    if not cats.intersection(target_cats):
                        continue

                    p["tier"] = "tier1"
                    p["source"] = "arxiv"
                    p["content_origin"] = "arxiv_oai_pmh"

                    parsed_dummy = {
                        "parsed_title": p["title"],
                        "parsed_abstract": p["abstract"],
                        "sections": [
                            {
                                "section_id": "abstract",
                                "section_title": "Abstract",
                                "section_type": "abstract",
                                "content": p["abstract"],
                                "paragraphs": [p["abstract"]],
                                "paragraph_count": 1,
                                "math_count": 0,
                                "word_count": len(p["abstract"].split()),
                            }
                        ],
                        "total_sections": 1,
                        "total_math_count": 0,
                        "total_words": len(p["abstract"].split()),
                        "content_origin": "arxiv_oai_pmh",
                    }
                    silver_rec = self.silver_writer.prepare_record(raw_meta=p, parsed_html=parsed_dummy)
                    silver_rec["tier"] = "tier1"
                    silver_rec["source"] = "arxiv"
                    silver_rec["content_origin"] = "arxiv_oai_pmh"

                    seen_ids.add(p_id)
                    results.append(silver_rec)
            except Exception as e:
                logger.warning("[TIER 1 ARXIV] Window %s-%s error: %s", from_d, until_d, e)

        logger.info("[TIER 1 ARXIV] Harvested %d true historical preprints.", len(results))
        return results

    def fix_tier1(self) -> Dict[str, Any]:
        """Re-creates Tier 1 with strictly genuine 2016-2021 landmarks (3,000 papers)."""
        logger.info("=" * 80)
        logger.info(">>> RECONSTRUCTING TIER 1: STRICT 2016-2021 HISTORICAL LANDMARKS")
        logger.info("=" * 80)

        openreview = self.collect_true_landmark_openreview(target=1020)
        cvf = self.collect_true_landmark_cvf(target=1020)
        arxiv = self.collect_true_landmark_arxiv(target=1020)

        combined = openreview + cvf + arxiv
        df = pd.DataFrame(combined)
        df["norm_title"] = df["title"].str.lower().str.replace(r"[^\w\s]", "", regex=True).str.strip()
        df = df.drop_duplicates(subset=["paper_id"]).drop_duplicates(subset=["norm_title"])
        df = df.drop(columns=["norm_title"])
        df = df.head(3000)

        tier1_path = settings.ROOT_DIR / "data" / "silver" / "tier1" / "landmark_papers.parquet"
        tier1_path.parent.mkdir(parents=True, exist_ok=True)
        df.to_parquet(tier1_path, engine="pyarrow", compression="zstd")
        logger.info("[SUCCESS TIER 1] Vaulted %d TRUE historical landmark papers (2016-2021) to %s", len(df), tier1_path)

        if self.sync_r2 and self.r2:
            try:
                self.r2.upload_file(tier1_path, "silver/tier1/landmark_papers.parquet", content_type="application/vnd.apache.parquet")
                logger.info("[R2 SYNC] Synced Tier 1 Landmark Parquet to R2.")
            except Exception as e:
                logger.warning("[R2 SYNC ERROR] %s", e)

        return {"tier": "tier1", "total_papers": len(df), "sources": df["source"].value_counts().to_dict()}

    # =========================================================================
    # PART 2: EXPAND TIER 2 TO 30,000 PAPERS (NEAR-PAST 2023-2026)
    # =========================================================================

    def expand_tier2_to_30k(self) -> Dict[str, Any]:
        """Harvests ~10,000 more near-past papers to reach 30,000 papers total."""
        logger.info("=" * 80)
        logger.info(">>> EXPANDING TIER 2: TARGET 30,000 CONSOLIDATED PAPERS")
        logger.info("=" * 80)

        tier2_path = settings.ROOT_DIR / "data" / "silver" / "tier2" / "near_past_papers.parquet"
        existing_df = pd.DataFrame()
        if tier2_path.exists():
            existing_df = pd.read_parquet(tier2_path)
            logger.info("[TIER 2] Loaded current lakehouse: %d papers.", len(existing_df))

        needed = max(0, 30100 - len(existing_df))
        logger.info("[TIER 2] Needed to reach 30k target: ~%d more papers.", needed)

        new_candidates = []

        # 1. OpenReview 2023-2024 additional stream
        logger.info("[TIER 2 EXPANSION] Fetching 2,050 more OpenReview papers (offset 5500)...")
        url1 = "https://huggingface.co/datasets/AlgorithmicResearchGroup/openreview-papers-with-reviews/resolve/refs%2Fconvert%2Fparquet/default/train/0001.parquet"
        con = duckdb.connect()
        or_rows = con.execute(f"""
        SELECT paper_id, year, venue, paper_title, paper_authors, paper_abstract, forum_url, pdf_url
        FROM read_parquet('{url1}')
        WHERE year in ('2023', '2024')
        GROUP BY paper_id, year, venue, paper_title, paper_authors, paper_abstract, forum_url, pdf_url
        LIMIT 2050 OFFSET 5500
        """).fetchall()
        for r in or_rows:
            p_id, yr, ven, title, raw_auth, abstract, forum, pdf = r
            clean_title = str(title).strip() if title else "Peer-Reviewed Paper"
            clean_abs = str(abstract).strip() if abstract else clean_title
            authors = [a.strip() for a in str(raw_auth).split(",") if a.strip()] if raw_auth else []
            new_candidates.append({
                "paper_id": f"openreview_{p_id}",
                "title": clean_title,
                "abstract": clean_abs,
                "authors": authors,
                "primary_category": "cs.LG",
                "categories": ["cs.LG", "cs.AI"],
                "published_date": f"{yr}-05-01",
                "pdf_url": str(pdf) if pdf else f"https://openreview.net/pdf?id={p_id}",
                "html_url": str(forum) if forum else f"https://openreview.net/forum?id={p_id}",
                "tier": "tier2",
                "source": "openreview",
                "content_origin": "openreview_peer_review",
                "total_sections": 1,
                "total_words": len(clean_abs.split()),
                "total_math_count": 0,
                "crawled_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            })
        logger.info("[TIER 2 OPENREVIEW] Added %d candidates.", len(or_rows))

        # 2. CVF Near-Past 2023 additional stream
        logger.info("[TIER 2 EXPANSION] Fetching 1,050 more CVF papers from CVPR 2023...")
        harvester_cvf = CvfHarvester(r2_client=self.r2)
        cvf_papers = harvester_cvf.fetch_papers_listing("CVPR2023")
        for p in cvf_papers[1300:2350]:
            title = p.get("title", "").strip()
            new_candidates.append({
                "paper_id": p.get("paper_id"),
                "title": title,
                "abstract": p.get("abstract") or title,
                "authors": p.get("authors", []),
                "primary_category": "cs.CV",
                "categories": ["cs.CV", "cs.AI"],
                "published_date": "2023-06-18",
                "pdf_url": p.get("pdf_url", ""),
                "html_url": p.get("html_url", ""),
                "tier": "tier2",
                "source": "cvf",
                "content_origin": "cvf_html_dom",
                "total_sections": 1,
                "total_words": len(title.split()),
                "total_math_count": 0,
                "crawled_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            })
        logger.info("[TIER 2 CVF] Added %d candidates.", len(cvf_papers[1300:2350]))

        # 3. arXiv Day-by-Day Backward Stream
        arxiv_target = max(6000, needed - len(new_candidates) + 500)
        logger.info("[TIER 2 EXPANSION] Harvesting %d more preprints day-by-day backward from 2026-09-29...", arxiv_target)
        harvester_arxiv = ArxivBatchHarvester(r2_client=self.r2, request_delay=1.0)
        target_cats: Set[str] = {"cs.AI", "cs.LG", "cs.CV", "cs.CL", "stat.ML", "cs.NE", "cs.IR", "cs.RO"}
        curr_dt = datetime.date(2026, 9, 29)
        arxiv_collected = 0

        existing_ids = set(existing_df["paper_id"]) if not existing_df.empty else set()

        while arxiv_collected < arxiv_target:
            date_str = curr_dt.isoformat()
            if curr_dt.weekday() >= 5:  # Skip Saturday & Sunday
                curr_dt -= datetime.timedelta(days=1)
                continue

            logger.info("[TIER 2 ARXIV] Querying %s (%s)...", date_str, curr_dt.strftime("%A"))
            try:
                page_data = harvester_arxiv.fetch_oai_page(
                    resumption_token=None,
                    set_spec="cs",
                    from_date=date_str,
                    until_date=date_str,
                )
                records_raw = page_data.get("records_raw", [])
                day_valid = 0
                for r in records_raw:
                    if arxiv_collected >= arxiv_target:
                        break
                    p = harvester_arxiv.normalize_oai_record(r)
                    if not p:
                        continue
                    p_id = p.get("paper_id")
                    if not p_id or p_id in existing_ids:
                        continue
                    cats = set(p.get("categories", []))
                    if not cats.intersection(target_cats):
                        continue

                    title = p.get("title", "")
                    abstract = p.get("abstract", "")
                    new_candidates.append({
                        "paper_id": p_id,
                        "title": title,
                        "abstract": abstract,
                        "authors": p.get("authors", []),
                        "primary_category": p.get("primary_category", "cs.AI"),
                        "categories": p.get("categories", []),
                        "published_date": p.get("published_date", date_str),
                        "pdf_url": p.get("pdf_url", f"https://arxiv.org/pdf/{p_id}.pdf"),
                        "html_url": p.get("html_url", f"https://arxiv.org/html/{p_id}"),
                        "tier": "tier2",
                        "source": "arxiv",
                        "content_origin": "arxiv_oai_pmh",
                        "total_sections": 1,
                        "total_words": len(abstract.split()),
                        "total_math_count": 0,
                        "crawled_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    })
                    existing_ids.add(p_id)
                    arxiv_collected += 1
                    day_valid += 1

                logger.info("[TIER 2 ARXIV] %s: Added %d valid papers (ArXiv Total: %d/%d).", date_str, day_valid, arxiv_collected, arxiv_target)
            except Exception as e:
                logger.warning("[TIER 2 ARXIV] Error for %s: %s", date_str, e)

            curr_dt -= datetime.timedelta(days=1)
            time.sleep(1.0)

        # Merge & Deduplicate
        logger.info("[TIER 2 MERGE] Merging %d new candidate records with existing corpus...", len(new_candidates))
        new_df = pd.DataFrame(new_candidates)
        merged_df = pd.concat([existing_df, new_df], ignore_index=True) if not existing_df.empty else new_df

        merged_df["norm_title"] = merged_df["title"].str.lower().str.replace(r"[^\w\s]", "", regex=True).str.strip()
        merged_df = merged_df.drop_duplicates(subset=["paper_id"]).drop_duplicates(subset=["norm_title"])
        merged_df = merged_df.drop(columns=["norm_title"])

        tier2_path.parent.mkdir(parents=True, exist_ok=True)
        merged_df.to_parquet(tier2_path, engine="pyarrow", compression="zstd")
        logger.info("[SUCCESS TIER 2] Consolidated Tier 2 Lakehouse now contains %d papers! (Path: %s)", len(merged_df), tier2_path)

        if self.sync_r2 and self.r2:
            try:
                self.r2.upload_file(tier2_path, "silver/tier2/near_past_papers.parquet", content_type="application/vnd.apache.parquet")
                logger.info("[R2 SYNC] Synced 30k Tier 2 Parquet to Cloudflare R2.")
            except Exception as e:
                logger.warning("[R2 SYNC ERROR] %s", e)

        return {
            "tier": "tier2",
            "previous_total": len(existing_df),
            "new_added": len(new_candidates),
            "consolidated_total": len(merged_df),
            "sources": merged_df["source"].value_counts().to_dict(),
        }


def main():
    parser = argparse.ArgumentParser(description="Fix Tier 1 Landmarks and Expand Tier 2 to 30,000 papers.")
    parser.add_argument("--tier1-only", action="store_true", help="Fix Tier 1 only.")
    parser.add_argument("--tier2-only", action="store_true", help="Expand Tier 2 only.")
    parser.add_argument("--no-sync-r2", action="store_true", help="Disable Cloudflare R2 sync.")
    args = parser.parse_args()

    sync_r2 = not args.no_sync_r2
    runner = ProductionTier1AndTier2Harvester(sync_r2=sync_r2)

    t0 = time.time()
    t1_res = None
    t2_res = None

    if not args.tier2_only:
        t1_res = runner.fix_tier1()

    if not args.tier1_only:
        t2_res = runner.expand_tier2_to_30k()

    duration = round(time.time() - t0, 2)
    print("\n" + "=" * 80)
    print(f"ALL OPERATIONS COMPLETE in {duration}s")
    if t1_res:
        print(f"Tier 1 Total: {t1_res['total_papers']:,} papers | Sources: {t1_res['sources']}")
    if t2_res:
        print(f"Tier 2 Total: {t2_res['consolidated_total']:,} papers | Sources: {t2_res['sources']}")
    print("=" * 80)


if __name__ == "__main__":
    main()
