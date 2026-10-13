"""Unified Multi-Source Academic Harvester CLI.

Entry point to execute end-to-end lakehouse harvesting across 4 sources:
- arxiv:       arXiv OAI-PMH preprints -> Bronze -> Silver -> 768-D Gold LanceDB
- openreview:  OpenReview peer-reviewed papers & reviews -> Silver -> Gold LanceDB
- zenodo:      Zenodo Open Science (Marker PDF Engine) -> Silver -> Gold LanceDB
- cvf:         CVPR & ICCV conference proceedings -> Silver -> Gold LanceDB
- all:         All 4 sources in sequence with combined telemetry pulses

Usage:
    python -m src.pipelines.run_multi_source_harvest --source arxiv --limit 200
    python -m src.pipelines.run_multi_source_harvest --source openreview --limit 100 --sync-r2
    python -m src.pipelines.run_multi_source_harvest --source zenodo --limit 50 --sync-r2
    python -m src.pipelines.run_multi_source_harvest --source cvf --limit 100 --sync-r2
    python -m src.pipelines.run_multi_source_harvest --source all --sync-r2
"""

import argparse
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.scheduler.adaptive_scheduler import scheduler_instance, SCHEDULE_CONFIGS


def main():
    parser = argparse.ArgumentParser(description="Unified Multi-Source Academic Harvester Runner.")
    parser.add_argument(
        "--source",
        type=str,
        required=True,
        choices=["arxiv", "openreview", "zenodo", "cvf", "all"],
        help="Target academic data source to harvest.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional override for target paper count per source.",
    )
    parser.add_argument(
        "--sync-r2",
        action="store_true",
        default=False,
        help="Automatically sync Bronze, Silver, Gold Parquet & LanceDB to Cloudflare R2.",
    )
    args = parser.parse_args()

    start_time = time.time()
    print("=" * 80)
    print(f"STARTING UNIFIED MULTI-SOURCE HARVESTER: SOURCE = {args.source.upper()}")
    print(f"Sync Cloudflare R2: {args.sync_r2} | Paper Limit: {args.limit or 'Default'}")
    print("=" * 80)

    res = scheduler_instance.trigger_source(args.source, limit=args.limit, sync_r2=args.sync_r2)
    elapsed = round(time.time() - start_time, 2)

    print("\n" + "=" * 80)
    print(f"[FINISHED] Harvester run completed in {elapsed}s.")
    print("=" * 80)
    scheduler_instance.print_status_table()


if __name__ == "__main__":
    main()
