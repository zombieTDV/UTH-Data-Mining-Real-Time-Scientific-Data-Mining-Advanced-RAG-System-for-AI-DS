"""Master Orchestrator: Unified 3-Tier Data Mining & Harvester Architecture.

Integrates and controls the complete 3-Tier academic ingestion pipeline across 4 canonical sources:
(arXiv, OpenReview, CVF, Zenodo) with Marker PDF LaTeX extraction & paper_id deduplication against Silver:

- Tier 1: Live Real-Time Forward Stream (zero-day preprints, daily 02:00 ICT).
- Tier 2: Near-Past Trending (arXiv, 2024 to present, newest first, daily 02:10 ICT, Airflow DAG only).
- Tier 3: Historical Archive (seminal milestone AI/DS papers; already harvested, never crawled again).

Usage:
    python -m src.pipelines.run_tier1_realtime_stream --limit 20
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
from src.pipelines.run_tier1_realtime_stream import Tier1RealtimeStreamer
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

    t3_hist = _parquet_rows(fs, bucket, "silver/tier3/landmark_papers.parquet")
    t2_silver = _parquet_rows(fs, bucket, "silver/tier2/near_past_papers.parquet")
    t1_stream = sum(
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
        "total_silver_papers": t1_stream + t2_silver + t3_hist,
        "qdrant_gold_vectors": qdrant_count,
        "tier1": tier("Tier 1: Live Real-Time Forward Stream (silver/papers/)", count_json("bronze/papers/"), t1_stream),
        "tier2": tier("Tier 2: Near-Past Trending (2024-Present)", count_json("bronze/tier2/"), t2_silver),
        "tier3": tier("Tier 3: Historical Archive (Landmarks)", count_json("bronze/tier3/"), t3_hist),
    }


def print_status_table():
    """Prints a clear tabular status of the 3-Tier Data Lakehouse."""
    st = get_architecture_status()
    print("\n" + "=" * 80)
    print("  3-TIER SCIENTIFIC DATA ARCHITECTURE: LAKEHOUSE & VECTOR STATUS")
    print(f"  Qdrant Gold Vectors: {st['qdrant_gold_vectors']:,}")
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
    sync_r2: bool = False,
) -> Dict[str, Any]:
    """Runs designated tiers in the 3-tier architecture."""
    results: Dict[str, Any] = {}
    tier_choice = tier.lower().strip()

    print("\n" + "=" * 80)
    print(f"  LAUNCHING 3-TIER DATA PIPELINE (Tier: {tier_choice.upper()})")
    print("=" * 80)

    # Tier 1: live real-time stream (producer only; the queue consumer writes Bronze/Silver/Gold)
    if tier_choice in ["1", "tier1", "all"]:
        t1_limit = limit or 20
        print(f"\n>>> [1/3] EXECUTING TIER 1: LIVE REAL-TIME FORWARD STREAM (Target: {t1_limit} papers)...")
        results["tier1"] = Tier1RealtimeStreamer().process_batch(limit=t1_limit)

    # Tier 2 (arXiv, newest -> past) runs only as the Airflow DAG dag_tier2_near_past_harvest, which publishes to RabbitMQ.
    if tier_choice in ["2", "tier2"]:
        print("\n>>> TIER 2 runs in Airflow (dag_tier2_near_past_harvest). Trigger it with: airflow dags trigger dag_tier2_near_past_harvest --conf '{\"target\": 1000}'")

    # Tier 3 is the historical archive that was already harvested: nothing to crawl.
    if tier_choice in ["3", "tier3"]:
        print("\n>>> TIER 3 (historical archive) is already harvested; there is nothing to crawl. Use --status to inspect it.")

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
        sync_r2=args.sync_r2,
    )


if __name__ == "__main__":
    main()
