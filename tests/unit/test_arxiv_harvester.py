"""Unit tests for src/ingestion/arxiv_harvester.py verifying arXiv RSS parsing,
HTML retrieval, Bronze storage vaulting, and queue dispatch.
"""
from typing import Any, Dict
from unittest.mock import MagicMock, patch
import httpx
import pytest

from src.ingestion.arxiv_harvester import ArxivHarvester


@pytest.fixture
def mock_storage():
    storage = MagicMock()
    storage.bucket_name = "test-lakehouse"
    storage.object_exists.return_value = False
    storage.upload_text.return_value = {
        "key": "bronze/arxiv/raw_html/2024/2401.00001.html",
        "uri": "s3://test-lakehouse/bronze/arxiv/raw_html/2024/2401.00001.html",
        "sha256": "fake_html_sha256",
    }
    storage.upload_json.return_value = {
        "key": "bronze/arxiv/raw_metadata/2024/2401.00001.json",
        "uri": "s3://test-lakehouse/bronze/arxiv/raw_metadata/2024/2401.00001.json",
        "sha256": "fake_meta_sha256",
    }
    return storage


@pytest.fixture
def mock_publisher():
    pub = MagicMock()
    pub.publish_paper.return_value = True
    return pub


@pytest.fixture
def harvester(mock_storage, mock_publisher):
    return ArxivHarvester(
        storage_client=mock_storage,
        categories=["cs.AI"],
        request_delay=0.0,
        enable_queue=True,
        queue_publisher=mock_publisher,
    )


# ==============================================================================
# ID Extraction Tests
# ==============================================================================

@pytest.mark.unit
@pytest.mark.parametrize(
    "raw_input,expected_id",
    [
        ("2401.00001", "2401.00001"),
        ("2401.00001v2", "2401.00001"),
        ("http://arxiv.org/abs/2401.12345", "2401.12345"),
        ("https://arxiv.org/abs/2401.99999v1", "2401.99999"),
        ("https://arxiv.org/pdf/2402.54321.pdf", "2402.54321"),
        ("https://arxiv.org/html/2403.11111v3", "2403.11111"),
    ],
)
def test_extract_clean_arxiv_id(harvester, raw_input, expected_id):
    assert harvester.extract_clean_arxiv_id(raw_input) == expected_id


# ==============================================================================
# RSS Feed Parsing Tests
# ==============================================================================

@pytest.mark.unit
def test_fetch_rss_feed_parsing(harvester):
    mock_feed = MagicMock()
    entry1 = MagicMock()
    entry1.link = "http://arxiv.org/abs/2401.00001"
    entry1.title = "Advances in Latent Diffusion Models. (arXiv:2401.00001v1 [cs.AI])"
    entry1.summary = "<p>This is an abstract regarding latent diffusion and score-matching.</p>"
    author1 = MagicMock()
    author1.name = "Alice Turing"
    entry1.authors = [author1]
    entry1.published = "2024-01-02T10:00:00Z"

    entry2 = MagicMock()
    entry2.link = "http://arxiv.org/abs/2401.00002"
    entry2.title = "PAC-Bayes Generalization Bounds"
    entry2.summary = "Generalization theorem for stochastic Langevin dynamics."
    entry2.author = "Bob Shannon"
    del entry2.authors  # Simulating entry without authors attribute, only author string
    entry2.published = "2024-01-02T11:00:00Z"

    mock_feed.entries = [entry1, entry2]

    with patch("src.ingestion.arxiv_harvester.feedparser.parse", return_value=mock_feed):
        papers = harvester.fetch_rss_feed("cs.AI")

    assert len(papers) == 2
    # Verify paper 1 cleaning
    assert papers[0]["paper_id"] == "2401.00001"
    assert papers[0]["title"] == "Advances in Latent Diffusion Models."
    assert papers[0]["abstract"] == "This is an abstract regarding latent diffusion and score-matching."
    assert papers[0]["authors"] == ["Alice Turing"]
    assert papers[0]["pdf_url"] == "https://arxiv.org/pdf/2401.00001.pdf"
    assert papers[0]["html_url"] == "https://arxiv.org/html/2401.00001"

    # Verify paper 2 cleaning
    assert papers[1]["paper_id"] == "2401.00002"
    assert papers[1]["title"] == "PAC-Bayes Generalization Bounds"
    assert papers[1]["authors"] == ["Bob Shannon"]


# ==============================================================================
# HTML Download Tests
# ==============================================================================

@pytest.mark.unit
def test_download_paper_html_success(harvester):
    valid_html = "<!DOCTYPE html><div class='ltx_document'><h1>Paper</h1><article>Body</article></div>"
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = valid_html
    mock_resp.raise_for_status.return_value = None

    with patch.object(harvester.http_client, "get", return_value=mock_resp):
        res = harvester.download_paper_html("2401.00001")
        assert res == valid_html


@pytest.mark.unit
def test_download_paper_html_404(harvester):
    mock_resp = MagicMock()
    mock_resp.status_code = 404

    with patch.object(harvester.http_client, "get", return_value=mock_resp):
        res = harvester.download_paper_html("2401.00001")
        assert res is None


@pytest.mark.unit
def test_download_paper_html_non_article_content(harvester):
    non_article_html = "<html><body>Just a generic error landing page</body></html>"
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = non_article_html
    mock_resp.raise_for_status.return_value = None

    with patch.object(harvester.http_client, "get", return_value=mock_resp):
        res = harvester.download_paper_html("2401.00001")
        assert res is None


# ==============================================================================
# Ingestion Lifecycle Tests
# ==============================================================================

@pytest.mark.unit
def test_ingest_paper_skipped_if_existing(harvester, mock_storage, mock_publisher):
    mock_storage.object_exists.return_value = True

    paper_meta = {"paper_id": "2401.00001", "title": "Existing Title"}
    result = harvester.ingest_paper(paper_meta)

    assert result["status"] == "SKIPPED_EXISTING"
    assert result["paper_id"] == "2401.00001"
    mock_storage.upload_json.assert_not_called()
    mock_storage.upload_text.assert_not_called()
    mock_publisher.publish_paper.assert_not_called()


@pytest.mark.unit
def test_ingest_paper_success_with_html(harvester, mock_storage, mock_publisher):
    mock_storage.object_exists.return_value = False
    valid_html = "<div class='ltx_document'>Valid content</div>"

    with patch.object(harvester, "download_paper_html", return_value=valid_html):
        paper_meta = {
            "paper_id": "2401.00001",
            "title": "Fresh Preprint",
            "abstract": "Abstract content.",
            "authors": ["Alice"],
        }
        res = harvester.ingest_paper(paper_meta, download_html=True)

    assert res["status"] == "INGESTED"
    assert res["has_html"] is True
    assert res["sha256"] == "fake_meta_sha256"

    # Verify upload calls
    mock_storage.upload_text.assert_called_once()
    mock_storage.upload_json.assert_called_once()
    mock_publisher.publish_paper.assert_called_once()


@pytest.mark.unit
def test_ingest_paper_success_without_html(harvester, mock_storage, mock_publisher):
    mock_storage.object_exists.return_value = False

    with patch.object(harvester, "download_paper_html", return_value=None):
        paper_meta = {
            "paper_id": "2401.00001",
            "title": "Fresh Preprint No HTML",
            "abstract": "Abstract content.",
        }
        res = harvester.ingest_paper(paper_meta, download_html=True)

    assert res["status"] == "INGESTED"
    assert res["has_html"] is False
    assert res["html_uri"] is None
    mock_storage.upload_text.assert_not_called()
    mock_storage.upload_json.assert_called_once()
    mock_publisher.publish_paper.assert_called_once()


@pytest.mark.unit
def test_harvest_daily_papers_batch_limiting(harvester):
    dummy_papers = [
        {"paper_id": f"2401.{i:05d}", "title": f"Paper {i}", "abstract": "Abs"}
        for i in range(10)
    ]
    with patch.object(harvester, "fetch_rss_feed", return_value=dummy_papers):
        with patch.object(harvester, "ingest_paper", return_value={"status": "INGESTED"}) as mock_ingest:
            with patch("time.sleep", return_value=None):
                results = harvester.harvest_daily_papers(max_per_category=3)

    assert len(results) == 3
    assert mock_ingest.call_count == 3
