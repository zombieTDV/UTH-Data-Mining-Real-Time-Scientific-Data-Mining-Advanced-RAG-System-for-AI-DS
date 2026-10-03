"""Tests for the improvements (R1, R2, R5, JSONL, parallel).

These tests run fully offline against in-memory fakes for the object store
and HTTP client. They cover the new behaviors that were added after the
initial conference pipeline landed.
"""

import json
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest


# ----------------------------- R1: Retry with Retry-After -----------------------------

def test_transient_http_error_carries_retry_after():
    from src.ingestion.common.backoff import TransientHttpError

    e = TransientHttpError("rate limited", status_code=429, retry_after="30")
    assert e.status_code == 429
    assert e.retry_after == "30"


def test_parse_retry_after_integer_and_date():
    from src.ingestion.common.backoff import parse_retry_after

    assert parse_retry_after("30") == 30.0
    assert parse_retry_after("0") == 0.0
    assert parse_retry_after("garbage") is None
    assert parse_retry_after(None) is None


def test_http_with_retries_succeeds_after_one_429():
    """http_with_retries should honor Retry-After and retry on TransientHttpError."""
    from src.ingestion.common.backoff import (
        BackoffError,
        TransientHttpError,
        http_with_retries,
    )

    attempts = {"n": 0}

    def fetch():
        attempts["n"] += 1
        if attempts["n"] < 2:
            raise TransientHttpError("rate limited", status_code=429, retry_after="0")
        return {"ok": True}

    out = http_with_retries(
        fetch, max_retries=3, base_delay=0.001, max_delay=0.01, label="t"
    )
    assert out == {"ok": True}
    assert attempts["n"] == 2


def test_http_with_retries_exhausts_then_raises():
    from src.ingestion.common.backoff import (
        BackoffError,
        TransientHttpError,
        http_with_retries,
    )

    def fetch():
        raise TransientHttpError("fail", status_code=503, retry_after="0")

    with pytest.raises(BackoffError):
        http_with_retries(
            fetch,
            max_retries=2,
            base_delay=0.001,
            max_delay=0.01,
            label="t",
        )


# ----------------------------- R2: AdaptiveThrottle integrated -----------------------------

def test_openalex_throttle_is_recorded_per_page(monkeypatch):
    """OpenAlexAdapter._fetch_year should call self._throttle.record for each page.

    The test stubs the HTTP layer so no network is touched, then asserts the
    throttle received two records (one per page).
    """
    from src.ingestion.sources import openalex_adapter
    monkeypatch.setattr(openalex_adapter, "OPENALEX_PER_PAGE", 2)
    from src.ingestion.sources.openalex_adapter import OpenAlexAdapter

    adapter = OpenAlexAdapter("KDD", 2020, 2024)

    def fake_paper(pid: str, year: int):
        return {
            "id": f"https://openalex.org/{pid}",
            "title": f"Paper {pid}",
            "publication_year": year,
            "abstract_inverted_index": None,
            "abstract": "An abstract for testing.",
            "doi": f"10.0000/{pid}",
            "authorships": [{"author": {"display_name": "Alice"}}],
            "primary_location": {
                "source": {"display_name": "KDD"},
                "pdf_url": f"https://example.org/{pid}.pdf",
            },
            "concepts": [{"display_name": "data mining", "score": 0.9}],
            "cited_by_count": 0,
        }

    from unittest.mock import MagicMock

    page1 = {
        "results": [fake_paper("W1", 2020), fake_paper("W3", 2020)],
        "meta": {"next_cursor": "abc"},
    }
    page2 = {
        "results": [fake_paper("W2", 2020), fake_paper("W4", 2020)],
        "meta": {"next_cursor": None},
    }
    responses = [page1, page2]

    def fake_get(url, params=None, use_cache=True):
        body = responses.pop(0)
        r = MagicMock()
        r.status_code = 200
        r.headers = {}
        r.json.return_value = body
        r.raise_for_status.return_value = None
        return (r, False)

    adapter._http.get = fake_get
    papers = adapter._fetch_year(year=2020, source_id="S123")
    assert len(papers) == 4, papers
    snap = adapter._throttle.snapshot()
    assert snap["samples"] == 2
    assert snap["error_rate"] == 0.0
    adapter.close()


# ----------------------------- R5: Idempotent skip from Silver -----------------------------

def test_silver_has_venue_year_detects_existing_data(tmp_path: Path):
    """When Silver already contains rows for (venue, year), skip the fetch."""
    import pyarrow as pa
    import pyarrow.parquet as pq

    from src.ingestion.conference_pipeline import ConferenceIngestionPipeline
    from src.config.settings import settings

    silver_dir = tmp_path / "silver"
    year_dir = silver_dir / "year=2024"
    year_dir.mkdir(parents=True)
    table = pa.table(
        {
            "paper_id": ["openalex:W1", "openalex:W2"],
            "journal_ref": ["KDD (source=openalex, year=2024)", "KDD (source=openalex, year=2024)"],
        }
    )
    pq.write_table(table, year_dir / "papers.parquet")

    settings.SILVER_DIR = silver_dir
    pipeline = ConferenceIngestionPipeline(venues=["KDD"], year_from=2024, year_to=2024, dry_run=True)
    assert pipeline._silver_has_venue_year("KDD", 2024) is True
    assert pipeline._silver_has_venue_year("KDD", 2020) is False  # year dir missing


def test_silver_has_venue_year_returns_false_for_other_venue(tmp_path: Path):
    """Make sure ICML data doesn't satisfy a KDD query."""
    import pyarrow as pa
    import pyarrow.parquet as pq

    from src.ingestion.conference_pipeline import ConferenceIngestionPipeline
    from src.config.settings import settings

    silver_dir = tmp_path / "silver"
    year_dir = silver_dir / "year=2024"
    year_dir.mkdir(parents=True)
    table = pa.table(
        {
            "paper_id": ["openalex:W1"],
            "journal_ref": ["ICML (source=openalex, year=2024)"],
        }
    )
    pq.write_table(table, year_dir / "papers.parquet")

    settings.SILVER_DIR = silver_dir
    pipeline = ConferenceIngestionPipeline(venues=["KDD"], year_from=2024, year_to=2024, dry_run=True)
    assert pipeline._silver_has_venue_year("KDD", 2024) is False


# ----------------------------- JSONL Bronze writer -----------------------------

class _FakeObjectStore:
    def __init__(self):
        self.uploads: List[Dict[str, Any]] = []
        self._lock = threading.Lock()

    def upload_bytes(self, data, key, content_type=None, metadata=None):
        with self._lock:
            self.uploads.append(
                {"key": key, "size": len(data), "content_type": content_type, "metadata": metadata or {}}
            )
        return {
            "bucket": "fake",
            "key": key,
            "size_bytes": len(data),
            "sha256": "deadbeef",
            "uri": f"s3://fake/{key}",
        }

    def upload_json(self, payload, key, metadata=None):
        return self.upload_bytes(
            json.dumps(payload).encode("utf-8"), key, "application/json", metadata
        )


def test_jsonl_writer_batches_by_count():
    from src.ingestion.common.jsonl_bronze import JsonlBronzeWriter

    store = _FakeObjectStore()
    writer = JsonlBronzeWriter(
        object_store=store,
        base_prefix="bronze/test",
        max_batch_size=3,
        venue="KDD",
    )
    flushed = 0
    for i in range(7):
        summary = writer.add({"paper_id": f"P{i}", "year": 2024, "title": f"T{i}"})
        if summary is not None:
            flushed += 1
    final = writer.flush()
    # First 3 -> flush; next 3 -> flush; remaining 1 -> flush on close = 3 total
    assert flushed == 2
    assert final is not None and final["paper_count"] == 1
    assert writer.total_papers == 7
    assert writer.total_flushed == 3
    # 3 JSONL batches + 3 manifest sidecars = 6 uploads
    assert len(store.uploads) == 6
    jsonl_uploads = [u for u in store.uploads if u["key"].endswith(".jsonl")]
    manifest_uploads = [u for u in store.uploads if "_manifest" in u["key"]]
    assert len(jsonl_uploads) == 3
    assert len(manifest_uploads) == 3


def test_jsonl_writer_emits_manifest_per_batch():
    from src.ingestion.common.jsonl_bronze import JsonlBronzeWriter

    store = _FakeObjectStore()
    writer = JsonlBronzeWriter(
        object_store=store, base_prefix="bronze/test", max_batch_size=2, venue="KDD"
    )
    # 2 papers triggers an auto-flush on the 2nd add()
    s1 = writer.add({"paper_id": "P1", "year": 2024})
    s2 = writer.add({"paper_id": "P2", "year": 2024})
    assert s1 is None  # buffer has 1 paper, no flush yet
    assert s2 is not None  # buffer hit max_batch_size=2, flushed
    assert s2["paper_count"] == 2
    # Look for the manifest upload in the store
    manifest_uploads = [u for u in store.uploads if "_manifest" in u["key"]]
    assert len(manifest_uploads) == 1
    # Metadata should include paper_count and sha256
    batch_upload = [u for u in store.uploads if u["key"].endswith(".jsonl")][0]
    assert batch_upload["metadata"]["paper_count"] == "2"
    assert batch_upload["metadata"]["venue"] == "KDD"


def test_jsonl_writer_respects_byte_threshold():
    from src.ingestion.common.jsonl_bronze import JsonlBronzeWriter

    store = _FakeObjectStore()
    # Tiny 100-byte cap so a single small paper triggers a flush.
    writer = JsonlBronzeWriter(
        object_store=store,
        base_prefix="bronze/test",
        max_batch_size=10_000,
        max_batch_bytes=100,
        venue="KDD",
    )
    s1 = writer.add({"paper_id": "P1", "year": 2024, "title": "X" * 50})
    s2 = writer.add({"paper_id": "P2", "year": 2024, "title": "X" * 50})
    # First paper fits under cap; second pushes us over -> flush after second.
    assert s1 is None
    assert s2 is not None
    assert s2["paper_count"] == 2


# ----------------------------- Async / parallel -----------------------------

@pytest.fixture(autouse=True)
def _isolate_checkpoints(tmp_path):
    from src.config.settings import settings

    original = settings.MANIFEST_DIR
    settings.MANIFEST_DIR = tmp_path / "manifests"
    yield
    settings.MANIFEST_DIR = original


def test_run_parallel_executes_all_venues(tmp_path: Path):
    """Ensure run_parallel fans out to all venues and aggregates results."""
    from src.ingestion.conference_pipeline import ConferenceIngestionPipeline
    from src.ingestion.sources.openalex_adapter import OpenAlexAdapter
    from src.ingestion.sources.openreview_adapter import OpenReviewAdapter

    def fake_fetch(self, target):
        venue, year = target.split(":")
        return [
            {
                "paper_id": f"{venue}-{year}-{i}",
                "title": f"Paper {venue}-{year}-{i}",
                "abstract": f"Abstract for {venue}-{year}-{i}",
                "authors": ["Alice", "Bob"],
                "year": int(year),
                "venue": venue,
                "source": self.source_id,
                "pdf_url": f"https://example.org/{venue}-{year}-{i}.pdf",
                "doi": f"10.0000/{venue}-{year}-{i}",
                "keywords": ["data mining"],
                "citation_count": 0,
            }
            for i in range(2)
        ]

    OpenAlexAdapter.fetch_metadata = fake_fetch
    OpenReviewAdapter.fetch_metadata = fake_fetch

    pipeline = ConferenceIngestionPipeline(
        venues=["KDD", "ICLR"],
        year_from=2024,
        year_to=2024,
        local_only=True,
        dry_run=True,
    )
    results = pipeline.run_parallel(max_workers=2)
    assert "KDD" in results["venues"]
    assert "ICLR" in results["venues"]
    assert results["venues"]["KDD"]["fetched"] == 2
    assert results["venues"]["ICLR"]["fetched"] == 2
