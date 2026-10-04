"""CLI entry point for the OpenAlex V2 collector."""

from __future__ import annotations

import argparse
import logging
import sys
import uuid
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config.settings import settings
from src.ingestion.openalex_v2 import OpenAlexScope
from src.ingestion.openalex_v2.collector import collect, CollectorConfig
from src.ingestion.openalex_v2.preflight import build_filter_string, run_preflight
from src.ingestion.openalex_v2.request import RequestConfig
from src.ingestion.openalex_v2.retry import RetryConfig
from src.storage.r2_client import R2Client
from src.utils.logger import setup_pipeline_logging


def _parse_subfield_ids(value: str) -> list[str]:
    ids = [s.strip() for s in value.split(",") if s.strip()]
    if not ids:
        raise argparse.ArgumentTypeError("At least one subfield ID is required")
    return ids


def _parse_years(value: str) -> list[int]:
    years: list[int] = []
    for item in value.split(","):
        item = item.strip()
        if not item:
            continue
        try:
            years.append(int(item))
        except ValueError as exc:
            raise argparse.ArgumentTypeError(f"Invalid year: {item}") from exc
        if int(item) < 2017 or int(item) > 2026:
            raise argparse.ArgumentTypeError(f"Year must be between 2017 and 2026: {item}")
    if not years:
        raise argparse.ArgumentTypeError("At least one year is required")
    return sorted(set(years))


def _parse_per_page(value: str) -> int:
    n = int(value)
    if n < 1 or n > 200:
        raise argparse.ArgumentTypeError("per-page must be between 1 and 200")
    return n


def main() -> int:
    parser = argparse.ArgumentParser(
        description="OpenAlex V2 collector - resumable, idempotent, with commit manifests."
    )
    parser.add_argument(
        "--years",
        type=_parse_years,
        default=[2024],
        help="Comma-separated years (default: 2024).",
    )
    parser.add_argument(
        "--subfield-ids",
        type=_parse_subfield_ids,
        default=settings.OPENALEX_SUBFIELDS or ["1203", "1702"],
        help="Comma-separated OpenAlex subfield IDs (default: settings.OPENALEX_SUBFIELDS).",
    )
    parser.add_argument(
        "--mode",
        choices=["backfill", "sync"],
        default="backfill",
        help="Crawl mode: backfill=historical, sync=daily update (default: backfill).",
    )
    parser.add_argument(
        "--subfield-mode",
        choices=["any_topic", "primary_topic"],
        default="any_topic",
        help="Subfield match mode (default: any_topic).",
    )
    parser.add_argument(
        "--per-page",
        type=_parse_per_page,
        default=100,
        help="Records per page (default: 100, max: 200).",
    )
    parser.add_argument(
        "--checkpoint-path",
        type=Path,
        default=None,
        help="Path for local checkpoint file. "
             "(default: settings.ROOT_DIR / data / manifests / openalex_v2_checkpoint.json)",
    )
    parser.add_argument(
        "--run-id",
        type=str,
        default=None,
        help="Unique run identifier. (default: auto-generated UUID)",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=None,
        help="Stop after N pages (for testing/debugging).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate scope and print planned filter without network writes.",
    )
    parser.add_argument(
        "--skip-preflight",
        action="store_true",
        help="Skip the API preflight check.",
    )
    parser.add_argument(
        "--preflight-only",
        action="store_true",
        help="Run preflight check only and exit.",
    )
    args = parser.parse_args()

    _, log_file = setup_pipeline_logging(pipeline_name="openalex_v2_collector")
    logging.basicConfig(
        level=settings.LOG_LEVEL,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    run_id = args.run_id or f"run-{uuid.uuid4().hex[:8]}"

    scope = OpenAlexScope(
        entity="works",
        mode=args.mode,
        start_date=f"{min(args.years):04d}-01-01",
        end_date=f"{max(args.years):04d}-12-31",
        subfield_ids=args.subfield_ids,
        subfield_mode=args.subfield_mode,
        per_page=args.per_page,
    )

    print(f"[OPENALEX-V2] run_id: {run_id}")
    print(f"[OPENALEX-V2] log file: {log_file}")
    print(f"[OPENALEX-V2] scope: {scope}")
    print(f"[OPENALEX-V2] mode: {args.mode}, subfield_mode: {args.subfield_mode}")
    print(f"[OPENALEX-V2] per-page: {args.per_page}")

    if args.checkpoint_path:
        cp_path = args.checkpoint_path
    else:
        cp_path = settings.ROOT_DIR / "data" / "manifests" / "openalex_v2_checkpoint.json"
    print(f"[OPENALEX-V2] checkpoint: {cp_path}")
    cp_path.parent.mkdir(parents=True, exist_ok=True)

    r2 = R2Client()

    if args.dry_run or args.preflight_only:
        if not settings.OPENALEX_API_KEY:
            raise SystemExit("OPENALEX_API_KEY is not configured")
        print(f"[OPENALEX-V2] filter: {build_filter_string(scope)}")
        if not args.preflight_only:
            print("[OPENALEX-V2] dry-run validation passed")
            return 0
        print("[OPENALEX-V2] running preflight check...")
        result = run_preflight(scope=scope, api_key=settings.OPENALEX_API_KEY)
        print(f"[OPENALEX-V2] healthy: {result.healthy}")
        count_str = f"{result.estimated_count:,}" if result.estimated_count is not None else "N/A"
        pages_str = f"{result.estimated_pages:,}" if result.estimated_pages is not None else "N/A"
        print(f"[OPENALEX-V2] estimated records: {count_str}")
        print(f"[OPENALEX-V2] estimated pages: {pages_str}")
        print(f"[OPENALEX-V2] rate-limit remaining: {result.budget.remaining}")
        if result.warnings:
            print(f"[OPENALEX-V2] warnings: {result.warnings}")
        if result.errors:
            print(f"[OPENALEX-V2] errors: {result.errors}")
            return 1
        return 0

    api_key = settings.OPENALEX_API_KEY
    if not api_key:
        raise SystemExit("OPENALEX_API_KEY is not configured")

    if not args.skip_preflight:
        print("[OPENALEX-V2] running preflight check...")
        result = run_preflight(scope=scope, api_key=api_key)
        print(f"[OPENALEX-V2] preflight: healthy={result.healthy}, "
              f"count={result.estimated_count:,}, pages={result.estimated_pages:,}")
        if result.errors:
            for err in result.errors:
                print(f"[OPENALEX-V2] ERROR: {err}")
            raise SystemExit(1)
        if result.warnings:
            for warn in result.warnings:
                print(f"[OPENALEX-V2] WARNING: {warn}")

    cfg = CollectorConfig(
        run_id=run_id,
        layout_version="v2",
        field_policy_version="v1",
        collector_version="v2",
        request_config=RequestConfig(
            retry=RetryConfig(
                max_attempts=3,
                base_delay_seconds=1.0,
                cap_delay_seconds=60.0,
                jitter_full=True,
            ),
        ),
    )

    print("[OPENALEX-V2] starting collection...")
    try:
        checkpoint = collect(
            scope=scope,
            api_key=api_key,
            r2=r2,
            config=cfg,
            checkpoint_path=cp_path,
            max_pages=args.max_pages,
        )
    except KeyboardInterrupt:
        print("[OPENALEX-V2] interrupted - checkpoint preserved, resume with same command")
        return 130

    print(f"[OPENALEX-V2] final state: {checkpoint.state}")
    print(f"[OPENALEX-V2] pages committed: {checkpoint.page_number - 1}")
    print(f"[OPENALEX-V2] terminal: {checkpoint.terminal}")
    print("[OPENALEX-V2] collection completed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
