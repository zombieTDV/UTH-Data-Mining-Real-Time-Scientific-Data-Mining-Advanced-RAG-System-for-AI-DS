"""CLI entry point for the resumable OpenAlex metadata collector."""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config.settings import settings  # noqa: E402
from src.ingestion.openalex import (  # noqa: E402
    OPENALEX_END_DATE,
    OPENALEX_START_DATE,
    collect_openalex,
)
from src.utils.logger import setup_pipeline_logging  # noqa: E402


def _parse_years(value: str) -> tuple[int, ...]:
    years: set[int] = set()
    for item in value.split(","):
        item = item.strip()
        if not item:
            continue
        try:
            year = int(item)
        except ValueError as exc:
            raise argparse.ArgumentTypeError(f"Invalid year: {item}") from exc
        if year < 2017 or year > 2026:
            raise argparse.ArgumentTypeError(
                f"Year must be between 2017 and 2026: {year}"
            )
        years.add(year)
    if not years:
        raise argparse.ArgumentTypeError("At least one year is required")
    return tuple(sorted(years))


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Collect OpenAlex Work metadata into R2 Bronze Parquet storage."
    )
    parser.add_argument(
        "--years",
        type=_parse_years,
        default=tuple(range(2017, 2027)),
        help="Comma-separated years to crawl (default: 2017-2026).",
    )
    parser.add_argument(
        "--checkpoint-dir",
        type=Path,
        default=settings.MANIFEST_DIR,
        help="Directory for the resumable checkpoint and local dedup registry.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate configuration and print the selected scope without network writes.",
    )
    args = parser.parse_args()

    _, log_file = setup_pipeline_logging(
        pipeline_name="openalex_collector",
    )
    logging.basicConfig(
        level=settings.LOG_LEVEL,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    print("[OPENALEX] metadata-only collector")
    print(f"[OPENALEX] log file: {log_file}")
    print(f"[OPENALEX] years to collect: {','.join(str(year) for year in args.years)}")
    print(f"[OPENALEX] date range allowed: {OPENALEX_START_DATE} -> {OPENALEX_END_DATE}")
    print(f"[OPENALEX] checkpoint directory: {args.checkpoint_dir}")

    if args.dry_run:
        if not settings.OPENALEX_API_KEY:
            raise SystemExit("OPENALEX_API_KEY is not configured")
        print("[OPENALEX] dry-run validation passed")
        return 0

    result = collect_openalex(
        checkpoint_dir=args.checkpoint_dir,
        years=args.years,
    )
    print(f"[OPENALEX] deduplicated keys: {result['count']:,}")
    print("[OPENALEX] crawl completed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
