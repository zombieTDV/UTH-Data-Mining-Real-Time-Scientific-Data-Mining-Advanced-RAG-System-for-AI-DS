"""Unit tests for src/ingestion/openreview_harvester.py verifying peer review
ingestion, rating normalization, consensus/controversy statistics, and Lakehouse storage.
"""
from unittest.mock import MagicMock, patch
import pytest

from src.ingestion.openreview_harvester import OpenReviewHarvester


@pytest.fixture
def mock_storage():
    storage = MagicMock()
    storage.bucket_name = "test-lakehouse"
    storage.object_exists.return_value = False
    return storage


@pytest.fixture
def openreview_harvester(mock_storage):
    with patch("src.ingestion.openreview_harvester.LakehouseIO") as mock_io_cls:
        with patch("src.ingestion.openreview_harvester.SilverLakehouseWriter") as mock_writer_cls:
            mock_io = MagicMock()
            mock_io_cls.return_value = mock_io
            mock_writer = MagicMock()
            mock_writer_cls.return_value = mock_writer
            harvester = OpenReviewHarvester(r2_client=mock_storage)
            harvester.io = mock_io
            harvester.silver_writer = mock_writer
            return harvester


# ==============================================================================
# Rating Score Normalization Tests
# ==============================================================================

@pytest.mark.unit
@pytest.mark.parametrize(
    "raw_input,expected_norm",
    [
        ("8: Accept (good paper)", 0.8),
        ("10: Strong Accept", 1.0),
        ("6: Weak Accept", 0.6),
        ("3: Clear Reject", 0.3),
        ("4.5", 0.45),
        (None, None),
        ("", None),
        ("No rating provided", None),
    ],
)
def test_normalize_rating_score(openreview_harvester, raw_input, expected_norm):
    score = openreview_harvester._normalize_rating_score(raw_input)
    assert score == expected_norm


# ==============================================================================
# Academic Mirror Fetch Tests
# ==============================================================================

@pytest.mark.unit
def test_fetch_via_academic_mirror_success(openreview_harvester):
    mock_row_1 = {
        "row": {
            "paper_id": "iclr2024_001",
            "paper_title": "Direct Preference Optimization",
            "paper_abstract": "A closed-form algorithm for RLHF.",
            "paper_authors": "Rafael Rafailov, Archit Sharma",
            "venue": "ICLR 2024",
            "year": 2024,
            "raw_review": {
                "title": "Clear and insightful",
                "rating": "8: Strong Accept",
                "confidence": "4: High",
                "review": "The mathematical derivation is very clean.",
            },
        }
    }
    mock_row_2 = {
        "row": {
            "paper_id": "iclr2024_001",  # Second review for the same paper
            "paper_title": "Direct Preference Optimization",
            "paper_abstract": "A closed-form algorithm for RLHF.",
            "paper_authors": "Rafael Rafailov, Archit Sharma",
            "venue": "ICLR 2024",
            "year": 2024,
            "raw_review": (
                '{"title": "Good empirical results", "rating": "6: Weak Accept", "confidence": "3", "review": "Good ablations."}'
            ),
        }
    }

    mock_row_3 = {
        "row": {
            "paper_id": "iclr2024_002",
            "paper_title": "Second ICLR Paper",
            "paper_abstract": "Another abstract.",
            "paper_authors": "Alice",
            "venue": "ICLR 2024",
            "year": 2024,
            "raw_review": {"rating": "7", "confidence": "3", "review": "Solid paper."},
        }
    }

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"rows": [mock_row_1, mock_row_2, mock_row_3]}
    mock_resp.raise_for_status.return_value = None

    with patch.object(openreview_harvester.http_client, "get", return_value=mock_resp):
        with patch.object(openreview_harvester.http_client, "post", return_value=MagicMock()):
            papers = openreview_harvester.fetch_via_academic_mirror(limit=2, venue_filter="ICLR")

    assert len(papers) == 2
    p = papers[0]
    assert p["paper_id"] == "iclr2024_001"
    assert p["title"] == "Direct Preference Optimization"
    assert p["authors"] == ["Rafael Rafailov", "Archit Sharma"]
    assert len(p["reviews"]) == 2
    assert p["reviews"][0]["normalized_rating"] == 0.8
    assert p["reviews"][1]["normalized_rating"] == 0.6


@pytest.mark.unit
def test_fetch_via_academic_mirror_venue_filter(openreview_harvester):
    mock_row_neurips = {
        "row": {
            "paper_id": "neurips_001",
            "paper_title": "NeurIPS Paper",
            "venue": "NeurIPS 2024",
            "paper_authors": "Alice",
        }
    }
    mock_row_iclr = {
        "row": {
            "paper_id": "iclr_001",
            "paper_title": "ICLR Paper",
            "venue": "ICLR 2024",
            "paper_authors": "Bob",
        }
    }

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"rows": [mock_row_neurips, mock_row_iclr]}
    mock_resp.raise_for_status.return_value = None

    with patch.object(openreview_harvester.http_client, "get", return_value=mock_resp):
        with patch.object(openreview_harvester.http_client, "post", return_value=MagicMock()):
            papers = openreview_harvester.fetch_via_academic_mirror(limit=1, venue_filter="NeurIPS")

    assert len(papers) == 1
    assert papers[0]["paper_id"] == "neurips_001"


# ==============================================================================
# Consensus & Controversy Calculation in Vaulting Flow
# ==============================================================================

@pytest.mark.unit
def test_harvest_and_vault_consensus_and_controversy_math(openreview_harvester):
    sample_paper = {
        "paper_id": "p001",
        "title": "Sample Paper",
        "abstract": "Abstract text.",
        "authors": ["Author One"],
        "venue": "ICLR",
        "year": 2024,
        "pdf_url": "http://openreview.net/pdf",
        "forum_url": "http://openreview.net/forum",
        "reviews": [
            {"normalized_rating": 0.6, "rating": "6", "confidence": "3", "review_body": "Rev 1"},
            {"normalized_rating": 0.8, "rating": "8", "confidence": "4", "review_body": "Rev 2"},
        ],
        "crawled_at": "2024-01-01T00:00:00Z",
    }

    with patch.object(openreview_harvester, "fetch_via_academic_mirror", return_value=[sample_paper]):
        openreview_harvester.silver_writer.prepare_record.side_effect = lambda raw, parsed: {
            **raw,
            **parsed,
        }
        openreview_harvester.io.write_parquet.return_value = {"uri": "s3://test/silver/openreview.parquet"}

        records = openreview_harvester.harvest_and_vault(total_limit=1, venue="ml_core")

    assert len(records) == 1
    rec = records[0]

    # Verify mathematical truth:
    # Ratings: [0.6, 0.8]
    # Mean (Consensus) = (0.6 + 0.8) / 2 = 0.700
    # Variance (Controversy) = ((0.6 - 0.7)^2 + (0.8 - 0.7)^2) / 2 = (0.01 + 0.01) / 2 = 0.0100
    assert rec["consensus_score"] == 0.7
    assert rec["controversy_variance"] == 0.01
    assert rec["review_count"] == 2

    # Verify vaulting calls
    openreview_harvester.io.put_json.assert_called_once()
    openreview_harvester.io.write_parquet.assert_called_once()
