"""Offline smoke test for the conference pipeline (no network).

Exercises:
    - ConferenceIngestionPipeline.run() in dry-run mode
    - Each adapter's discover() and validate()
    - Checkpoint + DLQ + dedup logic via in-memory stubs
"""

from pathlib import Path
from typing import Any, Dict

import pytest


@pytest.fixture(autouse=True)
def _isolate_checkpoints(tmp_path):
    """Redirect the pipeline's MANIFEST_DIR to a temp dir for isolation.

    We patch the singleton `settings` in place; the pipeline reads
    `settings.MANIFEST_DIR` at construction time, so this is sufficient.
    """
    from src.config.settings import settings

    original = settings.MANIFEST_DIR
    settings.MANIFEST_DIR = tmp_path / "manifests"
    yield
    settings.MANIFEST_DIR = original


def _make_paper(pid: str, year: int, venue: str, source: str = "openalex") -> Dict[str, Any]:
    return {
        "paper_id": pid,
        "title": f"Paper {pid}",
        "abstract": f"Abstract for {pid}",
        "authors": ["Alice", "Bob"],
        "year": year,
        "venue": venue,
        "source": source,
        "pdf_url": f"https://example.org/{pid}.pdf",
        "doi": f"10.0000/{pid}",
        "keywords": ["data mining", "ML"],
        "citation_count": 10,
    }


def test_pipeline_dry_run_with_stubbed_adapters():
    """Verify the pipeline coordinates strategies + dedup + checkpoint offline."""
    from src.ingestion.conference_pipeline import ConferenceIngestionPipeline
    from src.ingestion.sources.openalex_adapter import OpenAlexAdapter
    from src.ingestion.sources.kdd_adapter import KddAdapter
    from src.ingestion.sources.openreview_adapter import OpenReviewAdapter
    from src.ingestion.sources.icml_adapter import IcmlAdapter
    from src.ingestion.sources.neurips_adapter import NeuripsAdapter

    def fake_fetch(self, target):
        venue, year = target.split(":")
        return [
            _make_paper(f"{venue}-{year}-{i}", int(year), venue, self.source_id)
            for i in range(3)
        ]

    for cls in (OpenAlexAdapter, KddAdapter, OpenReviewAdapter, IcmlAdapter, NeuripsAdapter):
        cls.fetch_metadata = fake_fetch

    pipeline = ConferenceIngestionPipeline(
        venues=["KDD", "ICML", "ICLR", "NeurIPS"],
        year_from=2024,
        year_to=2024,
        local_only=True,
        dry_run=True,
    )
    results = pipeline.run()
    for v, r in results["venues"].items():
        assert r["fetched"] == 3, f"{v} got {r}"
        assert r["completed_years"] == [2024]


def test_dedup_across_strategies():
    """Same paper returned by OpenAlex + HTML should be deduped."""
    from src.ingestion.conference_pipeline import ConferenceIngestionPipeline
    from src.ingestion.sources.openalex_adapter import OpenAlexAdapter
    from src.ingestion.sources.kdd_adapter import KddAdapter

    def fake_openalex(self, target):
        venue, year = target.split(":")
        return [_make_paper(f"{venue}-{year}-0", int(year), venue, "openalex")]

    def fake_kdd(self, target):
        venue, year = target.split(":")
        return [_make_paper(f"{venue}-{year}-0", int(year), venue, "kdd_html")]

    OpenAlexAdapter.fetch_metadata = fake_openalex
    KddAdapter.fetch_metadata = fake_kdd

    pipeline = ConferenceIngestionPipeline(
        venues=["KDD"],
        year_from=2024,
        year_to=2024,
        local_only=True,
        dry_run=True,
    )
    results = pipeline.run()
    # Even though both strategies return 1 paper, dedup should keep only 1.
    assert results["venues"]["KDD"]["fetched"] == 1


def test_adapters_discover_years():
    from src.ingestion.sources.openalex_adapter import OpenAlexAdapter
    from src.ingestion.sources.openreview_adapter import OpenReviewAdapter
    from src.ingestion.sources.kdd_adapter import KddAdapter
    from src.ingestion.sources.icml_adapter import IcmlAdapter
    from src.ingestion.sources.neurips_adapter import NeuripsAdapter

    a = OpenAlexAdapter("KDD", 2020, 2024)
    assert a.discover() == ["KDD:2020", "KDD:2021", "KDD:2022", "KDD:2023", "KDD:2024"]

    b = KddAdapter(2022, 2024)
    assert b.discover() == ["KDD:2022", "KDD:2023", "KDD:2024"]
    b.close()

    c = IcmlAdapter(2023, 2024)
    assert c.discover() == ["ICML:2023", "ICML:2024"]
    c.close()

    d = NeuripsAdapter(2022, 2024)
    # NeurIPSAdapter stores self.venue="NeurIPS" (preserved case)
    assert d.discover() == ["NeurIPS:2022", "NeurIPS:2023", "NeurIPS:2024"]
    d.close()

    e = OpenReviewAdapter("ICLR", 2023, 2024)
    assert e.discover() == ["ICLR:2023", "ICLR:2024"]
    e.close()


def test_required_field_validation():
    from src.ingestion.sources.base import REQUIRED_FIELDS
    from src.ingestion.sources.openalex_adapter import OpenAlexAdapter

    a = OpenAlexAdapter("KDD", 2020, 2024)
    full = _make_paper("X", 2024, "KDD")
    assert a.validate(full) is True
    for f in REQUIRED_FIELDS:
        bad = dict(full)
        bad[f] = ""
        assert a.validate(bad) is False
    out = dict(full)
    out["year"] = 2010
    assert a.validate(out) is False
