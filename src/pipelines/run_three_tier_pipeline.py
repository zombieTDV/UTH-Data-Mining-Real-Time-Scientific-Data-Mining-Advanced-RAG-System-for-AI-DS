"""Master Orchestrator: Unified 3-Tier Data Mining & Harvester Architecture.

Integrates and controls the complete 3-Tier academic ingestion pipeline across 4 canonical sources:
(arXiv, OpenReview, CVF, Zenodo) with Marker PDF LaTeX extraction & Abstract Hash Deduplication:

- Tier 1: Historical Core (Seminal milestone AI/DS papers sorted by cite_count DESC, 3,000 target).
- Tier 2: Near-Past Trending (2024 to present window, daily/interval slices, cite_count DESC).
- Tier 3: Live Real-Time Forward Stream (Continuous zero-day preprints from present moment onwards).

Usage:
    python -m src.pipelines.run_three_tier_pipeline --tier 1 --limit 50
    python -m src.pipelines.run_tier2_near_past_harvest --limit 50
    python -m src.pipelines.run_tier3_realtime_stream --limit 20
    python -m src.pipelines.run_three_tier_pipeline --tier all --limit 10
    python -m src.pipelines.run_three_tier_pipeline --status
"""

import argparse
import datetime
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from tabulate import tabulate

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config.settings import settings
from src.pipelines.run_tier1_historical_core import Tier1HistoricalHarvester
from src.pipelines.run_tier2_near_past_harvest import Tier2NearPastHarvester
from src.pipelines.run_tier3_realtime_stream import Tier3RealtimeStreamer
from src.transformation.lakehouse_deduplicator import LakehouseDeduplicator
from src.utils.logger import setup_pipeline_logging

logger, log_file = setup_pipeline_logging("three_tier_master_pipeline")


def get_architecture_status() -> Dict[str, Any]:
    """Inspects lakehouse volumes, unique hashes, and tier data partitions."""
    dedup = LakehouseDeduplicator()
    total_hashes = len(dedup)

    silver_dir = settings.ROOT_DIR / "data" / "silver"
    raw_dir = settings.ROOT_DIR / "data" / "raw"

    t1_parquet = silver_dir / "tier1" / "landmark_papers.parquet"
    t2_parquet = silver_dir / "tier2" / "near_past_papers.parquet"
    t3_parquet = silver_dir / "tier3" / "realtime_papers.parquet"

    def count_parquet(path: Path) -> int:
        if path.exists():
            try:
                import pyarrow.parquet as pq
                return pq.read_metadata(path).num_rows
            except Exception:
                return 0
        return 0

    def count_raw_json(path: Path) -> int:
        if path.exists():
            return len(list(path.glob("*.json")))
        return 0

    t1_silver_count = count_parquet(t1_parquet)
    t2_silver_count = count_parquet(t2_parquet)
    t3_silver_count = count_parquet(t3_parquet)

    t1_raw_count = count_raw_json(raw_dir / "tier1")
    t2_raw_count = count_raw_json(raw_dir / "tier2")
    t3_raw_count = count_raw_json(raw_dir / "tier3")

    # Global silver partitioned counts
    total_silver_papers = 0
    for p_file in silver_dir.glob("**/papers.parquet"):
        total_silver_papers += count_parquet(p_file)

    # LanceDB Gold Count
    lancedb_count = 0
    gold_dir = settings.ROOT_DIR / "data" / "gold" / "lancedb"
    if gold_dir.exists():
        try:
            import lancedb
            db = lancedb.connect(str(gold_dir))
            if "scientific_papers_gold" in db.table_names():
                tbl = db.open_table("scientific_papers_gold")
                lancedb_count = tbl.count_rows()
        except Exception:
            pass

    return {
        "total_unique_abstract_hashes": total_hashes,
        "total_silver_papers": total_silver_papers,
        "lancedb_gold_vectors": lancedb_count,
        "tier1": {
            "name": "Tier 1: Historical Core (Landmarks)",
            "raw_bronze": t1_raw_count,
            "silver_parquet": t1_silver_count,
            "status": "HEALTHY" if t1_silver_count > 0 else "READY",
        },
        "tier2": {
            "name": "Tier 2: Near-Past Trending (2024-Present)",
            "raw_bronze": t2_raw_count,
            "silver_parquet": t2_silver_count,
            "status": "HEALTHY" if t2_silver_count > 0 else "READY",
        },
        "tier3": {
            "name": "Tier 3: Live Real-Time Forward Stream",
            "raw_bronze": t3_raw_count,
            "silver_parquet": t3_silver_count,
            "status": "HEALTHY" if t3_silver_count > 0 else "READY",
        },
    }


def print_status_table():
    """Prints a clear tabular status of the 3-Tier Data Lakehouse."""
    st = get_architecture_status()
    print("\n" + "=" * 80)
    print("  3-TIER SCIENTIFIC DATA ARCHITECTURE: LAKEHOUSE & VECTOR STATUS")
    print(f"  Indexed Abstract Hashes: {st['total_unique_abstract_hashes']:,} | LanceDB Gold Vectors: {st['lancedb_gold_vectors']:,}")
    print("=" * 80)

    rows = []
    for tier_key in ["tier1", "tier2", "tier3"]:
        t = st[tier_key]
        rows.append([
            tier_key.upper(),
            t["name"],
            f"{t['raw_bronze']:,} JSONs",
            f"{t['silver_parquet']:,} Rows",
            f"🟢 {t['status']}",
        ])

    headers = ["Tier", "Description", "Bronze (Raw)", "Silver (Parquet)", "Status"]
    print(tabulate(rows, headers=headers, tablefmt="fancy_grid") + "\n")


def run_pipeline(
    tier: str = "all",
    limit: Optional[int] = None,
    use_marker: bool = True,
    sync_r2: bool = False,
) -> Dict[str, Any]:
    """Runs designated tiers in the 3-tier architecture."""
    results: Dict[str, Any] = {}
    tier_choice = tier.lower().strip()

    print("\n" + "=" * 80)
    print(f"  LAUNCHING 3-TIER DATA PIPELINE (Tier: {tier_choice.upper()}, Use Marker: {use_marker})")
    print("=" * 80)

    # 1. Tier 1 Execution
    if tier_choice in ["1", "tier1", "all"]:
        t1_limit = limit or 50
        print(f"\n>>> [1/3] EXECUTING TIER 1: HISTORICAL CORE (Target: {t1_limit} papers)...")
        h1 = Tier1HistoricalHarvester(target_total=t1_limit, use_marker=use_marker, sync_r2=sync_r2)
        results["tier1"] = h1.run()

    # 2. Tier 2 Execution
    if tier_choice in ["2", "tier2", "all"]:
        t2_limit = limit or 50
        print(f"\n>>> [2/3] EXECUTING TIER 2: NEAR-PAST TRENDING (Target: {t2_limit} papers)...")
        h2 = Tier2NearPastHarvester(start_date="2024-01-01", max_total=t2_limit, use_marker=use_marker, sync_r2=sync_r2)
        results["tier2"] = h2.run()

    # 3. Tier 3 Execution
    if tier_choice in ["3", "tier3", "all"]:
        t3_limit = limit or 20
        print(f"\n>>> [3/3] EXECUTING TIER 3: LIVE REAL-TIME FORWARD STREAM (Target: {t3_limit} papers)...")
        h3 = Tier3RealtimeStreamer(use_marker=use_marker, sync_r2=sync_r2)
        results["tier3"] = h3.process_batch(limit=t3_limit)

    print("\n" + "=" * 80)
    print("  3-TIER EXECUTION FINISHED SUMMARY:")
    for k, v in results.items():
        print(f"  - {k.upper()}: {v.get('status')} | Ingested: {v.get('newly_ingested', 0)} | Skipped Dups: {v.get('dedup_skipped', 0)} | Duration: {v.get('duration_s', 0)}s")
    print("=" * 80 + "\n")

    return results


def main():
    parser = argparse.ArgumentParser(description="Master Orchestrator for 3-Tier Scientific Data Mining Architecture.")
    parser.add_argument("--tier", type=str, default="all", choices=["1", "2", "3", "tier1", "tier2", "tier3", "all"], help="Tier to execute (1, 2, 3, or all)")
    parser.add_argument("--limit", type=int, default=None, help="Target paper limit per tier")
    parser.add_argument("--no-marker", action="store_true", help="Disable Marker neural extraction (use resilient fallback)")
    parser.add_argument("--sync-r2", action="store_true", help="Synchronize Bronze, Silver, Gold to Cloudflare R2")
    parser.add_argument("--status", action="store_true", help="Display current 3-Tier Lakehouse status table")
    args = parser.parse_args()

    if args.status:
        print_status_table()
        return

    run_pipeline(
        tier=args.tier,
        limit=args.limit,
        use_marker=not args.no_marker,
        sync_r2=args.sync_r2,
    )


if __name__ == "__main__":
    main()
