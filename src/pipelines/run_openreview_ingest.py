"""CLI Runner for OpenReview Peer-Reviewed Papers & Reviews Ingestion.

Workflow:
1. Harvests accepted papers and multi-reviewer ratings/critiques from OpenReview (ICLR/NeurIPS).
2. Vaults raw payload to Lakehouse Bronze layer (data/raw/openreview/).
3. Transforms into Silver Parquet (data/silver/openreview/) with structured review sections.

Usage:
    python -m src.pipelines.run_openreview_ingest --limit 50 --venue ICLR
"""

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.ingestion.openreview_harvester import OpenReviewHarvester


def main():
    parser = argparse.ArgumentParser(description="Ingest peer-reviewed papers from OpenReview.")
    parser.add_argument("--limit", type=int, default=50, help="Number of papers to harvest (default: 50)")
    parser.add_argument("--venue", type=str, default="ICLR", help="Target conference venue (default: ICLR)")
    args = parser.parse_args()

    print("\n" + "=" * 80)
    print(f"[PIPELINE] OPENREVIEW PEER-REVIEWED INGESTION ({args.venue})")
    print("=" * 80)

    harvester = OpenReviewHarvester()
    records = harvester.harvest_and_vault(total_limit=args.limit, venue=args.venue)

    print(f"\n[DONE] Successfully processed {len(records)} papers from OpenReview into Bronze & Silver Lakehouse!")


if __name__ == "__main__":
    main()
