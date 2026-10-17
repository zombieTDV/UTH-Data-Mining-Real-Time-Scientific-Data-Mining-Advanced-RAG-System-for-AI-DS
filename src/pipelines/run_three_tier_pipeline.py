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


def _parquet_rows(fs, bucket: str, key: str) -> int:
    """Row count from the Parquet footer only (S3 range reads, no full download)."""
    import pyarrow.parquet as pq

    try:
        with fs.open_input_file(f"{bucket}/{key}") as f:
            return pq.ParquetFile(f).metadata.num_rows
    except Exception:
        return 0


def get_architecture_status() -> Dict[str, Any]:
    """Inspects lakehouse volumes, unique hashes, and tier partitions directly in MinIO."""
    from urllib.parse import urlparse

    import pyarrow.fs as pafs
    from src.storage.minio_client import StorageClient

    storage = StorageClient()
    bucket = storage.bucket_name
    endpoint = urlparse(settings.MINIO_ENDPOINT_URL)
    fs = pafs.S3FileSystem(
        access_key=settings.MINIO_ACCESS_KEY_ID,
        secret_key=settings.MINIO_SECRET_ACCESS_KEY,
        endpoint_override=endpoint.netloc,
        scheme=endpoint.scheme or "http",
        region="us-east-1",
    )

    total_hashes = len(LakehouseDeduplicator())

    t1_silver = _parquet_rows(fs, bucket, "silver/tier1/landmark_papers.parquet")
    t2_silver = _parquet_rows(fs, bucket, "silver/tier2/near_past_papers.parquet")
    t3_silver = sum(
        _parquet_rows(fs, bucket, o["key"])
        for o in storage.list_objects("silver/papers/", max_keys=100000)
        if o["key"].endswith(".parquet")
    )

    def count_json(prefix: str) -> int:
        return sum(1 for o in storage.list_objects(prefix, max_keys=1000000) if o["key"].endswith(".json"))

    # Qdrant Gold Count
    qdrant_count = 0
    try:
        from src.indexing.qdrant_manager import QdrantManager

        qdrant_count = QdrantManager().count()
    except Exception:
        pass

    def tier(name: str, raw: int, silver: int) -> Dict[str, Any]:
        return {"name": name, "raw_bronze": raw, "silver_parquet": silver, "status": "HEALTHY" if silver > 0 else "READY"}

    return {
        "total_unique_abstract_hashes": total_hashes,
        "total_silver_papers": t1_silver + t2_silver + t3_silver,
        "qdrant_gold_vectors": qdrant_count,
        "tier1": tier("Tier 1: Historical Core (Landmarks)", count_json("bronze/tier1/"), t1_silver),
        "tier2": tier("Tier 2: Near-Past Trending (2024-Present)", count_json("bronze/tier2/"), t2_silver),
        "tier3": tier("Tier 3: Live Real-Time Forward Stream (silver/papers/)", count_json("bronze/papers/"), t3_silver),
    }


def print_status_table():
    """Prints a clear tabular status of the 3-Tier Data Lakehouse."""
    st = get_architecture_status()
    print("\n" + "=" * 80)
    print("  3-TIER SCIENTIFIC DATA ARCHITECTURE: LAKEHOUSE & VECTOR STATUS")
    print(f"  Indexed Abstract Hashes: {st['total_unique_abstract_hashes']:,} | Qdrant Gold Vectors: {st['qdrant_gold_vectors']:,}")
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
    days: int = 1,
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
        print(f"\n>>> [2/3] EXECUTING TIER 2: NEAR-PAST TRENDING (Days: {days}, Limit: {t2_limit} papers)...")
        h2 = Tier2NearPastHarvester(start_date="2024-01-01", max_total=t2_limit, num_days=days, use_marker=use_marker, sync_r2=sync_r2)
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
    parser.add_argument("--days", type=int, default=1, help="Number of days backwards to harvest for Tier 2 (default 1)")
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
        days=args.days,
        use_marker=not args.no_marker,
        sync_r2=args.sync_r2,
    )


if __name__ == "__main__":
    main()
