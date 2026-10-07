"""CLI Runner for CVF Open Access (CVPR / ICCV) Peer-Reviewed Paper Ingestion.

Workflow:
1. Scrapes accepted papers from Computer Vision Foundation (CVF).
2. Enriches each paper with full abstract from HTML DOM and BibTeX citations.
3. Vaults raw payload into Lakehouse Bronze (data/raw/cvf/).
4. Transforms and saves to Silver Parquet (data/silver/cvf/cvpr_2024.parquet).

Usage:
    python -m src.pipelines.run_cvf_ingest --limit 20 --venue CVPR2024
"""

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.ingestion.cvf_harvester import CvfHarvester


def main():
    parser = argparse.ArgumentParser(description="Ingest peer-reviewed papers from CVF Open Access (CVPR/ICCV).")
    parser.add_argument("--limit", type=int, default=20, help="Number of papers to harvest (default: 20)")
    parser.add_argument("--venue", type=str, default="CVPR2024", help="Target venue (default: CVPR2024)")
    parser.add_argument("--delay", type=float, default=0.2, help="Delay between requests (seconds)")
    args = parser.parse_args()

    print("\n" + "=" * 80)
    print(f"[PIPELINE] CVF OPEN ACCESS INGESTION ({args.venue})")
    print("=" * 80)

    harvester = CvfHarvester(request_delay=args.delay)
    records = harvester.harvest_and_vault(total_limit=args.limit, venue=args.venue)

    print(f"\n[DONE] Successfully processed {len(records)} papers from {args.venue} into Bronze & Silver Lakehouse!")


if __name__ == "__main__":
    main()
