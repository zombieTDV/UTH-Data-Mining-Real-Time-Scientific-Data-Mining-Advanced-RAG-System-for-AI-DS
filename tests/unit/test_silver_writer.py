"""Unit tests for src/transformation/silver_writer.py verifying record preparation,
schema normalization, streaming part append, compaction, and deduplication.
"""
from unittest.mock import MagicMock, patch
import pandas as pd
import pyarrow as pa
import pytest

from src.transformation.silver_writer import SilverLakehouseWriter


@pytest.fixture
def silver_writer():
    mock_storage = MagicMock()
    mock_storage.endpoint_url = "http://localhost:9000"
    mock_storage.bucket = "uth-lakehouse"
    writer = SilverLakehouseWriter(storage_client=mock_storage)
    writer.io = MagicMock()
    return writer


# ==============================================================================
# 1. Record Preparation & Hashing
# ==============================================================================

@pytest.mark.unit
def test_prepare_record_normalizes_fields(silver_writer):
    raw_meta = {
        "paper_id": "2401.00001",
        "title": "Scaling Laws for Language Models",
        "abstract": "We empirically study scaling laws.",
        "authors": ["Alice Smith", "Bob Jones"],
        "categories": ["cs.CL", "cs.AI"],
        "primary_category": "cs.CL",
        "published_date": "2024-01-15",
        "crawled_at": "2024-01-16T00:00:00Z",
        "pdf_url": "https://arxiv.org/pdf/2401.00001",
        "html_url": "https://arxiv.org/html/2401.00001",
        "doi": "10.1234/test.doi",
        "journal_ref": None,
        "cite_count": 42,
        "source": "arxiv",
        "tier": "tier1",
    }
    parsed_html = {
        "parsed_title": "Scaling Laws for Language Models (Updated)",
        "parsed_abstract": "We empirically study scaling laws in depth.",
        "sections": [
            {"section_title": "1. Introduction", "content": "Language models scale reliably."},
            {"section_title": "2. Experiments", "content": "We train models up to 70B."},
        ],
        "total_sections": 2,
        "total_math_count": 14,
        "total_words": 1500,
        "content_origin": "arxiv_html5",
    }

    record = silver_writer.prepare_record(raw_meta, parsed_html)

    assert record["paper_id"] == "2401.00001"
    assert record["title"] == "Scaling Laws for Language Models (Updated)"
    assert record["abstract"] == "We empirically study scaling laws in depth."
    assert "Title: Scaling Laws for Language Models (Updated)" in record["clean_full_text"]
    assert "## 1. Introduction" in record["clean_full_text"]
    assert "## 2. Experiments" in record["clean_full_text"]
    assert record["total_sections"] == 2
    assert record["total_math_count"] == 14
    assert record["total_words"] == 1500
    assert record["cite_count"] == 42
    assert record["source"] == "arxiv"
    assert record["tier"] == "tier1"
    assert record["content_origin"] == "arxiv_html5"
    assert len(record["abstract_hash"]) == 64  # SHA-256


# ==============================================================================
# 2. Schema Normalization
# ==============================================================================

@pytest.mark.unit
def test_normalize_frame_conforms_to_schema(silver_writer):
    records = [
        {
            "paper_id": "p1",
            "title": "Paper 1",
            "abstract": "Abstract 1",
            "authors": ["Author 1"],
            "categories": ["cs.AI"],
            "primary_category": "cs.AI",
            "clean_full_text": "Text 1",
            # Missing optional fields: cite_count, source, tier, abstract_hash
        }
    ]
    df = silver_writer._normalize_frame(records)

    assert list(df.columns) == silver_writer.SCHEMA.names
    assert df["cite_count"].iloc[0] == 0
    assert df["source"].iloc[0] == "arxiv"
    assert df["tier"].iloc[0] == "tier1"
    assert len(df["abstract_hash"].iloc[0]) == 64


# ==============================================================================
# 3. Streaming Part Appending
# ==============================================================================

@pytest.mark.unit
def test_append_part_writes_parquet(silver_writer):
    records = [
        {"paper_id": "p1", "title": "Paper 1", "abstract": "Abstract 1", "authors": ["A"], "categories": ["cs.AI"]}
    ]
    silver_writer.io.write_parquet.return_value = {
        "uri": "s3://uth-lakehouse/silver/papers/year=2026/parts/part-1.parquet",
        "size_bytes": 2048,
    }

    res = silver_writer.append_part(records, year="2026")

    assert res["status"] == "SUCCESS"
    assert res["count"] == 1
    assert "parts/part-" in res["key"]
    assert silver_writer.io.write_parquet.called

    # Empty records
    res_empty = silver_writer.append_part([], year="2026")
    assert res_empty["status"] == "NO_RECORDS"


# ==============================================================================
# 4. Year Compaction & Deduplication
# ==============================================================================

@pytest.mark.unit
def test_compact_year_merges_and_deletes_parts(silver_writer):
    part_keys = [
        "silver/papers/year=2026/parts/part-001.parquet",
        "silver/papers/year=2026/parts/part-002.parquet",
    ]
    df_part1 = pd.DataFrame([
        {"paper_id": "p1", "title": "Paper 1 v1", "abstract": "A1", "cite_count": 5},
        {"paper_id": "p2", "title": "Paper 2", "abstract": "A2", "cite_count": 10},
    ])
    df_part2 = pd.DataFrame([
        {"paper_id": "p1", "title": "Paper 1 v2", "abstract": "A1 updated", "cite_count": 8},
        {"paper_id": "p3", "title": "Paper 3", "abstract": "A3", "cite_count": 1},
    ])

    silver_writer.io.list_keys.return_value = part_keys
    silver_writer.io.read_parquet.side_effect = [df_part1, df_part2]
    silver_writer.io.upsert_parquet.return_value = {
        "uri": "s3://uth-lakehouse/silver/papers/year=2026/papers.parquet",
        "rows": 3,
    }

    res = silver_writer.compact_year("2026")

    assert res["status"] == "SUCCESS"
    assert res["parts"] == 2
    assert res["rows"] == 3
    # Parts must be deleted only after compaction write
    silver_writer.storage.delete_objects_batch.assert_called_once_with(part_keys)


@pytest.mark.unit
def test_compact_year_nothing_to_compact(silver_writer):
    silver_writer.io.list_keys.return_value = []
    res = silver_writer.compact_year("2026")
    assert res["status"] == "NOTHING_TO_COMPACT"
    assert res["parts"] == 0
    silver_writer.storage.delete_objects_batch.assert_not_called()
