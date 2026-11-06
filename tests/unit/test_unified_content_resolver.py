"""Unit tests for src/transformation/unified_content_resolver.py verifying
HTML-first waterfall resolution, key generation, gzip decompression, PDF parsing,
and abstract fallback.
"""
import gzip
from unittest.mock import MagicMock, patch
import httpx
import pytest

from src.transformation.unified_content_resolver import UnifiedContentResolver


@pytest.fixture
def content_resolver():
    mock_storage = MagicMock()
    mock_storage.bucket_name = "uth-lakehouse"
    mock_storage.endpoint_url = "http://localhost:9000"
    resolver = UnifiedContentResolver(storage_client=mock_storage)
    return resolver


# ==============================================================================
# 1. Key Formatting & Sanitization
# ==============================================================================

@pytest.mark.unit
def test_key_sanitization_for_html_and_pdf():
    # Slashes and colons must be sanitized to underscores for S3 keys
    html_key = UnifiedContentResolver.get_r2_html_key("2401.00001v1", source="arXiv", year="2024")
    assert html_key == "bronze/arxiv/raw_html/2024/2401.00001v1.html.gz"

    dirty_key = UnifiedContentResolver.get_r2_html_key("cs/9901001:v2", source="arXiv", year="1999")
    assert dirty_key == "bronze/arxiv/raw_html/1999/cs_9901001_v2.html.gz"

    pdf_key = UnifiedContentResolver.get_pdf_key("openalex:W12345", source="s2", year="2020")
    assert pdf_key == "bronze/s2/raw_pdf/2020/openalex_W12345.pdf"


# ==============================================================================
# 2. Bronze Gzip Decompression
# ==============================================================================

@pytest.mark.unit
def test_read_bronze_html_gzip_decompression(content_resolver):
    raw_html = "<html><body><h1>Deep Learning</h1><p>Content</p></body></html>"
    compressed_bytes = gzip.compress(raw_html.encode("utf-8"))

    content_resolver.storage.object_exists.return_value = True
    mock_body = MagicMock()
    mock_body.read.return_value = compressed_bytes
    content_resolver.storage.s3.get_object.return_value = {"Body": mock_body}

    decompressed = content_resolver.read_bronze_html("bronze/arxiv/raw_html/2024/test.html.gz")
    assert decompressed == raw_html


@pytest.mark.unit
def test_read_bronze_html_miss_returns_none(content_resolver):
    content_resolver.storage.object_exists.return_value = False
    assert content_resolver.read_bronze_html("bronze/arxiv/raw_html/2024/missing.html.gz") is None


# ==============================================================================
# 3. PDF Byte Validation & Redirection
# ==============================================================================

@pytest.mark.unit
def test_fetch_pdf_validates_magic_header(content_resolver):
    mock_client = MagicMock()

    # Case 1: valid PDF
    valid_pdf_bytes = b"%PDF-1.4\n%real pdf binary content"
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.content = valid_pdf_bytes
    mock_client.get.return_value = mock_resp

    res = content_resolver.fetch_pdf("https://example.com/paper.pdf", mock_client)
    assert res == valid_pdf_bytes

    # Case 2: HTML error page returning 200 with text content
    html_error = b"<!DOCTYPE html><html><body>Error 404</body></html>"
    mock_resp.content = html_error
    res_err = content_resolver.fetch_pdf("https://example.com/paper.pdf", mock_client)
    assert res_err is None


# ==============================================================================
# 4. Fallback Resolution Hierarchy
# ==============================================================================

@pytest.mark.unit
def test_resolve_paper_content_abstract_fallback(content_resolver):
    paper = {
        "paper_id": "2401.99999",
        "title": "A Rare Paper Without Full Text",
        "abstract": "We describe our theoretical findings here.",
        "authors": ["Solo Author"],
        "primary_category": "cs.AI",
        "published_date": "2024-01-01",
        "html_url": "https://arxiv.org/html/2401.99999",
        "arxiv_id": "2401.99999",
        "tier": "tier1",
    }

    # Simulate network failure or 404 for HTML
    with patch.object(content_resolver, "read_bronze_html", return_value=None), \
         patch.object(content_resolver, "fetch_arxiv_html", return_value=None):

        mock_http = MagicMock()
        res = content_resolver.resolve_single_paper(paper, mock_http)

        assert res["content_origin"] == "abstract_fallback"
        assert res["total_sections"] == 1
        assert "Abstract" in res["clean_full_text"]
        assert "We describe our theoretical findings here." in res["clean_full_text"]
