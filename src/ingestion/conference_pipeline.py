"""Conference ingestion pipeline (14-step orchestrator).

The pipeline ties together source adapters, the storage layer, and the
common engineering rules from REFACTOR_STATUS.md.

Pipeline (per source / venue / year):
    [0]  DEFINE SCOPE     -> settings.CONFERENCE_SOURCES / year window
    [1]  SOURCE DISCOVERY -> adapter.discover()
    [2]  ACCESS STRATEGY  -> API -> HTML fallback (auto)
    [3]  SCHEDULER + CHECKPOINT -> ConferenceCheckpointStore
    [4]  REQUEST / FETCH  -> adapter.fetch_metadata()
    [5]  SAVE RAW         -> Bronze JSON (per-paper) in R2 / Local
    [6]  VALIDATE         -> adapter.validate() (required fields + year)
    [7]  PARSE + NORMALIZE-> already done by adapter
    [8]  DEDUPLICATE      -> SHA-256(content_hash) over (title+abstract)
    [9]  DOMAIN FILTER    -> required venue + year scope
    [10] ENRICH           -> (no-op here; would call S2/OpenAlex citations)
    [11] STORE CLEAN DATA -> Silver Parquet (delegated to SilverLakehouseWriter)
    [12] COMMIT CHECKPOINT-> atomic update
    [13] MONITOR          -> adaptive throttle + circuit breaker
"""

import datetime
import json
import logging
from pathlib import Path
from typing import Any, Callable, Dict, List, Tuple

from src.config.settings import settings
from src.ingestion.common.adaptive_throttle import AdaptiveThrottle
from src.ingestion.common.content_hash import compute_sha256
from src.ingestion.common.dead_letter import DeadLetterQueue
from src.ingestion.common.jsonl_bronze import JsonlBronzeWriter
from src.ingestion.sources.base import BaseSourceAdapter
from src.ingestion.sources.icml_adapter import IcmlAdapter
from src.ingestion.sources.kdd_adapter import KddAdapter
from src.ingestion.sources.neurips_adapter import NeuripsAdapter
from src.ingestion.sources.openalex_adapter import OpenAlexAdapter
from src.ingestion.sources.openreview_adapter import OpenReviewAdapter
from src.storage.conference_checkpoint_store import ConferenceCheckpointStore

logger = logging.getLogger(__name__)


# Adapter factory: (venue, year_from, year_to) -> BaseSourceAdapter
AdapterFactory = Callable[[str, int, int], BaseSourceAdapter]


def _openalex_factory(venue: str, yf: int, yt: int) -> OpenAlexAdapter:
    return OpenAlexAdapter(venue, yf, yt)


def _openreview_factory(venue: str, yf: int, yt: int) -> OpenReviewAdapter:
    return OpenReviewAdapter(venue, yf, yt)


def _kdd_factory(_venue: str, yf: int, yt: int) -> KddAdapter:
    return KddAdapter(yf, yt)


def _icml_factory(_venue: str, yf: int, yt: int) -> IcmlAdapter:
    return IcmlAdapter(yf, yt)


def _neurips_factory(_venue: str, yf: int, yt: int) -> NeuripsAdapter:
    return NeuripsAdapter(yf, yt)


# (factory, strategy_label) tuples. The first strategy is preferred; if it
# returns zero papers, the next one is tried.
VENUE_STRATEGY: Dict[str, List[Tuple[AdapterFactory, str]]] = {
    "KDD": [(_openalex_factory, "openalex"), (_kdd_factory, "kdd_html")],
    "ICML": [(_openalex_factory, "openalex"), (_icml_factory, "icml_html")],
    "ICLR": [(_openreview_factory, "openreview"), (_openalex_factory, "openalex")],
    "NeurIPS": [(_openalex_factory, "openalex"), (_neurips_factory, "neurips_html")],
}


def _content_dedup_key(paper: Dict[str, Any]) -> str:
    """Stable hash for (title, abstract, year) to dedupe across sources."""
    t = (paper.get("title") or "").lower().strip()
    a = (paper.get("abstract") or "").lower().strip()
    y = paper.get("year") or ""
    return compute_sha256(f"{t}|{a}|{y}")


class _NoopBronzeWriter:
    """Drop-in replacement for JsonlBronzeWriter during dry-run.

    Records the count but does not write to any object store.
    """

    def __init__(self):
        self._count = 0

    def add(self, paper: Dict[str, Any]) -> None:  # type: ignore[override]
        self._count += 1
        return None

    def extend(self, papers):  # type: ignore[override]
        for p in papers:
            self.add(p)
        return []

    def flush(self) -> None:  # type: ignore[override]
        return None

    @property
    def total_papers(self) -> int:
        return self._count

    @property
    def total_flushed(self) -> int:
        return 0


class ConferenceIngestionPipeline:
    """Top-level orchestrator for one or more venues."""

    def __init__(
        self,
        venues: List[str] | None = None,
        year_from: int | None = None,
        year_to: int | None = None,
        local_only: bool = False,
        dry_run: bool = False,
        object_store=None,
    ):
        # Match against VENUE_STRATEGY keys (case-insensitive) so users can pass
        # either "NeurIPS" or "NEURIPS".
        normalized_venues: list = []
        for raw in venues or settings.CONFERENCE_SOURCES:
            match = next(
                (k for k in VENUE_STRATEGY if k.lower() == raw.lower()),
                None,
            )
            if match is None:
                raise ValueError(f"Unsupported venue: {raw}")
            normalized_venues.append(match)
        self.venues = list(dict.fromkeys(normalized_venues))
        self.year_from = year_from or settings.CONFERENCE_YEAR_FROM
        self.year_to = year_to or settings.CONFERENCE_YEAR_TO
        self.local_only = local_only
        self.dry_run = dry_run

        # Object store (R2 or local) for Bronze + checkpoint mirroring
        if object_store is None and not dry_run:
            if local_only:
                from src.storage.local_client import LocalObjectStore

                self.object_store = LocalObjectStore(root=settings.LOCAL_STORE_DIR)
            else:
                from src.storage.r2_client import R2Client

                self.object_store = R2Client()
        else:
            self.object_store = object_store

        # Checkpoint + DLQ + throttle
        self.checkpoint_store = ConferenceCheckpointStore(
            base_dir=settings.MANIFEST_DIR / "conferences",
            object_store=self.object_store if not dry_run else None,
        )
        self.dlq = DeadLetterQueue() if not dry_run else None
        self.throttle = AdaptiveThrottle()

    # ---------------- Bronze writer (per-paper) ----------------

    def _make_bronze_writer(self, adapter: BaseSourceAdapter) -> JsonlBronzeWriter:
        """Create a JSONL batched Bronze writer for one adapter.

        Returns a writer configured to use the configured object store.
        When dry_run=True, returns a no-op writer whose ``add()`` and
        ``flush()`` return None/empty.
        """
        if self.dry_run:
            return _NoopBronzeWriter()  # type: ignore[return-value]
        return JsonlBronzeWriter(
            object_store=self.object_store,
            base_prefix=settings.CONFERENCE_BRONZE_PREFIX,
            max_batch_size=200,
            max_batch_bytes=5 * 1024 * 1024,
            venue=adapter.venue,
        )

    def _save_bronze(self, adapter: BaseSourceAdapter, paper: Dict[str, Any]) -> str | None:
        """Backward-compat shim: write a single paper to JSONL Bronze.

        For new callers prefer ``_make_bronze_writer(...).add(paper)`` which
        batches 200 papers per upload.
        """
        writer = self._make_bronze_writer(adapter)
        result = writer.add(paper)
        if result is None:
            return None
        return result.get("uri")

    # ---------------- Per-venue ingest ----------------

    def _silver_has_venue_year(self, venue: str, year: int) -> bool:
        """Return True if the local Silver Parquet already has rows for this (venue, year).

        Used as a defense-in-depth check on top of the per-venue checkpoint:
        even if the checkpoint is missing (e.g., first run after upgrade), we
        do not re-fetch a (venue, year) that is already represented locally.
        """
        try:
            import pyarrow.parquet as pq

            silver_dir = Path(settings.SILVER_DIR)
            year_path = silver_dir / f"year={year}" / "papers.parquet"
            logger.debug(
                "[silver-probe] looking for venue=%s year=%s at %s",
                venue, year, year_path,
            )
            if not year_path.exists():
                return False
            table = pq.read_table(year_path, columns=["paper_id", "journal_ref"])
            df = table.to_pandas()
            if df.empty:
                return False
            venue_lower = venue.lower()
            mask = df["journal_ref"].str.lower().str.contains(venue_lower, na=False)
            return bool(mask.any())
        except Exception as exc:  # noqa: BLE001
            # If Silver is unreadable, fall back to checkpoint-only behavior.
            logger.warning("[silver-probe] error reading silver for %s/%d: %s", venue, year, exc)
            return False

    def ingest_venue(self, venue: str) -> Dict[str, Any]:
        if venue not in VENUE_STRATEGY:
            raise ValueError(f"Unsupported venue: {venue}")

        strategies = VENUE_STRATEGY[venue]
        # Load checkpoint for the FIRST strategy (they share the same venue)
        _primary_factory, primary_label = strategies[0]
        ckpt_source = primary_label
        ckpt = self.checkpoint_store.load(ckpt_source, venue)
        completed_years = set(ckpt.get("completed_years", []))

        all_papers: List[Dict[str, Any]] = []
        all_dedup_keys: set = set()
        for year in range(self.year_from, self.year_to + 1):
            if year in completed_years:
                logger.info("[%s:%d] already completed; skipping", venue, year)
                continue
            # R5: defense-in-depth: if Silver already has data for this year,
            # mark it complete without re-fetching.
            if not self.dry_run and self._silver_has_venue_year(venue, year):
                logger.info(
                    "[%s:%d] Silver already has data; marking complete", venue, year
                )
                completed_years.add(year)
                self.checkpoint_store.merge(
                    ckpt_source,
                    venue,
                    {"completed_years": sorted(completed_years)},
                )
                continue
            target = f"{venue}:{year}"
            papers = self._ingest_target(target=target, venue=venue, strategies=strategies)
            # Deduplicate within this run (across strategies)
            new_papers: List[Dict[str, Any]] = []
            for p in papers:
                k = _content_dedup_key(p)
                if k in all_dedup_keys:
                    continue
                all_dedup_keys.add(k)
                new_papers.append(p)
            all_papers.extend(new_papers)
            completed_years.add(year)
            # Commit checkpoint after each year
            self.checkpoint_store.merge(
                ckpt_source, venue, {"completed_years": sorted(completed_years)}
            )
            logger.info(
                "[%s:%d] %d new papers (total this run: %d)",
                venue, year, len(new_papers), len(all_papers),
            )

        # Persist to Silver if we have anything new
        silver_stats: Dict[str, Any] | None = None
        if all_papers and not self.dry_run:
            silver_stats = self._flush_to_silver(venue, all_papers)

        return {
            "venue": venue,
            "fetched": len(all_papers),
            "completed_years": sorted(completed_years),
            "silver": silver_stats,
        }

    def _ingest_target(
        self,
        target: str,
        venue: str,
        strategies: List[Tuple[AdapterFactory, str]],
    ) -> List[Dict[str, Any]]:
        """Try each strategy in order. If the first returns >= 1 paper, stop."""
        for factory, label in strategies:
            adapter = factory(venue, self.year_from, self.year_to)
            try:
                logger.info(
                    "[%s:%s] trying %s", adapter.venue, target, type(adapter).__name__
                )
                papers = adapter.fetch_metadata(target)
                # Validate + enqueue for batched Bronze
                bronze_writer = self._make_bronze_writer(adapter)
                validated: List[Dict[str, Any]] = []
                for p in papers:
                    if not adapter.validate(p):
                        continue
                    bronze_writer.add(p)
                    validated.append(p)
                # Flush whatever's left in the buffer for this adapter
                bronze_writer.flush()
                if validated:
                    logger.info(
                        "[%s:%s] %s returned %d papers (batches=%d)",
                        adapter.venue,
                        target,
                        type(adapter).__name__,
                        len(validated),
                        bronze_writer.total_flushed,
                    )
                    return validated
                logger.info(
                    "[%s:%s] %s returned 0 papers; trying next strategy",
                    adapter.venue, target, type(adapter).__name__,
                )
            except Exception as exc:  # noqa: BLE001
                if self.dlq is not None:
                    self.dlq.push(
                        source=f"{label}:{adapter.venue}",
                        record_id=target,
                        payload={"target": target},
                        error=str(exc),
                        attempts=1,
                    )
                logger.warning(
                    "[%s:%s] %s failed: %s",
                    adapter.venue, target, type(adapter).__name__, exc,
                )
            finally:
                try:
                    adapter.close()
                except Exception:  # noqa: BLE001
                    pass
        return []

    def _flush_to_silver(self, venue: str, papers: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Step 11: hand off the clean records to the existing Silver writer.

        We re-use the schema contract of SilverLakehouseWriter by mapping our
        Research-friendly fields onto the existing columns.
        """
        from src.transformation.silver_writer import SilverLakehouseWriter

        writer = SilverLakehouseWriter(local_only=self.local_only)
        rows = []
        for p in papers:
            rows.append(
                {
                    "paper_id": p.get("paper_id") or "",
                    "doi": p.get("doi") or "",
                    "journal_ref": f"{venue} (source={p.get('source')}, year={p.get('year')})",
                    "title": p.get("title") or "",
                    "abstract": p.get("abstract") or "",
                    "authors": p.get("authors") or [],
                    "categories": [p.get("source") or "", venue.lower()],
                    "primary_category": (p.get("source") or "conference").lower(),
                    "published_date": str(p.get("year") or ""),
                    "crawled_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "pdf_url": p.get("pdf_url") or "",
                    "html_url": "",
                    "total_sections": 0,
                    "total_math_count": 0,
                    "total_words": len((p.get("abstract") or "").split()),
                    "sections_json": json.dumps(
                        [
                            {
                                "section_title": "Keywords",
                                "section_type": "other",
                                "content": ", ".join(p.get("keywords") or []),
                                "order": 0,
                            }
                        ],
                        ensure_ascii=False,
                    ),
                    "clean_full_text": f"Title: {p.get('title') or ''}\n\nAbstract: {p.get('abstract') or ''}",
                    "transformed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                }
            )
        try:
            return writer.save_and_upload_parquet(rows)
        except Exception as exc:  # noqa: BLE001
            logger.error("[silver:%s] flush failed: %s", venue, exc)
            return {"status": "ERROR", "error": str(exc)}

    # ---------------- Top-level entry ----------------

    def run(self) -> Dict[str, Any]:
        """Run all venues sequentially (default).

        Use ``run_parallel`` to fetch all 4 venues concurrently via threads.
        """
        results: Dict[str, Any] = {"venues": {}}
        for venue in self.venues:
            try:
                results["venues"][venue] = self.ingest_venue(venue)
            except Exception as exc:  # noqa: BLE001
                logger.error("[%s] ingestion failed: %s", venue, exc)
                results["venues"][venue] = {"status": "ERROR", "error": str(exc)}
        return results

    def run_parallel(self, max_workers: int | None = None) -> Dict[str, Any]:
        """Run all venues concurrently using a thread pool.

        Each venue still runs sequentially *within* itself (per-year cursor
        pagination must remain ordered per source). But the 4 venues can
        proceed in parallel, which is the right place to scale up:
        per-domain rate limiters and circuit breakers isolate them from each
        other.

        Args:
            max_workers: Cap on the number of venue-level threads. Defaults
                to ``len(self.venues)`` (one per venue) or
                ``settings.CRAWLER_MAX_CONCURRENCY`` if it is smaller.
        """
        import concurrent.futures

        if max_workers is None:
            max_workers = min(len(self.venues), settings.CRAWLER_MAX_CONCURRENCY)
        results: Dict[str, Any] = {"venues": {}}
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as pool:
            future_to_venue = {
                pool.submit(self.ingest_venue, venue): venue for venue in self.venues
            }
            for future in concurrent.futures.as_completed(future_to_venue):
                venue = future_to_venue[future]
                try:
                    results["venues"][venue] = future.result()
                except Exception as exc:  # noqa: BLE001
                    logger.error("[%s] ingestion failed: %s", venue, exc)
                    results["venues"][venue] = {"status": "ERROR", "error": str(exc)}
        return results
