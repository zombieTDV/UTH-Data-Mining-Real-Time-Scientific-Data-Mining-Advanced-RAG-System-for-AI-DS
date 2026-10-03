"""CLI entry point for the conference ingestion pipeline.

Run with:
    python -m src.pipelines.run_conference_ingest --help

Examples (the four "tuần tự" commands sếp requested):
    # 1) KDD via OpenAlex (1 adapter, 4 venues)
    python -m src.pipelines.run_conference_ingest --venue KDD --year-from 2020

    # 2) ICML
    python -m src.pipelines.run_conference_ingest --venue ICML --year-from 2020

    # 3) ICLR (OpenReview first, OpenAlex fallback)
    python -m src.pipelines.run_conference_ingest --venue ICLR --year-from 2020

    # 4) NeurIPS
    python -m src.pipelines.run_conference_ingest --venue NeurIPS --year-from 2020

    # All 4 in one go (sequential, not parallel — by design)
    python -m src.pipelines.run_conference_ingest --all --year-from 2020

    # Dry run (no network, no storage)
    python -m src.pipelines.run_conference_ingest --venue KDD --year-from 2024 --dry-run

    # Local store (skip R2, write to data/local/...)
    python -m src.pipelines.run_conference_ingest --venue KDD --year-from 2024 --local
"""

import argparse
import json
import sys
from typing import List

from src.config.settings import settings
from src.ingestion.conference_pipeline import ConferenceIngestionPipeline
from src.utils.logger import setup_pipeline_logging


def parse_args(argv: List[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Conference Ingestion (KDD / ICML / ICLR / NeurIPS)",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--venue",
        choices=["KDD", "ICML", "ICLR", "NeurIPS"],
        help="Single venue to ingest",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Ingest all venues from settings.CONFERENCE_SOURCES in sequence",
    )
    parser.add_argument(
        "--year-from",
        type=int,
        default=settings.CONFERENCE_YEAR_FROM,
        help="Start year (inclusive)",
    )
    parser.add_argument(
        "--year-to",
        type=int,
        default=settings.CONFERENCE_YEAR_TO,
        help="End year (inclusive)",
    )
    parser.add_argument(
        "--local",
        action="store_true",
        help="Write to local object store instead of R2",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Skip all network and storage I/O; only exercise the pipeline",
    )
    parser.add_argument(
        "--reset-checkpoint",
        action="store_true",
        help="Clear existing checkpoints for the selected venues before running",
    )
    parser.add_argument(
        "--parallel",
        action="store_true",
        help="Run venues concurrently (4 worker threads). Within a venue, "
        "years are still processed sequentially to preserve per-source order.",
    )
    return parser.parse_args(argv)


def main(argv: List[str] | None = None) -> int:
    args = parse_args(argv)
    logger, log_path = setup_pipeline_logging(pipeline_name="conference_ingest")
    logger.info(
        "Conference ingest starting: venues=%s year_from=%d year_to=%d local=%s dry_run=%s",
        args.venue or ("ALL" if args.all else settings.CONFERENCE_SOURCES),
        args.year_from,
        args.year_to,
        args.local,
        args.dry_run,
    )

    if not args.venue and not args.all:
        args.all = True

    venues: List[str]
    if args.all:
        venues = list(settings.CONFERENCE_SOURCES)
    else:
        venues = [args.venue]

    if args.reset_checkpoint:
        from src.storage.conference_checkpoint_store import ConferenceCheckpointStore
        from src.ingestion.conference_pipeline import VENUE_STRATEGY
        ckpt = ConferenceCheckpointStore(base_dir=settings.MANIFEST_DIR / "conferences")
        for v in venues:
            _factory, primary_label = VENUE_STRATEGY[v][0]
            ckpt._store(primary_label, v).clear()
            logger.info("checkpoint reset for %s:%s", primary_label, v)

    pipeline = ConferenceIngestionPipeline(
        venues=venues,
        year_from=args.year_from,
        year_to=args.year_to,
        local_only=args.local,
        dry_run=args.dry_run,
    )
    if args.parallel:
        results = pipeline.run_parallel()
    else:
        results = pipeline.run()
    summary = json.dumps(results, indent=2, ensure_ascii=False, default=str)
    logger.info("Conference ingest finished.\n%s", summary)
    print(summary)
    return 0


if __name__ == "__main__":
    sys.exit(main())
