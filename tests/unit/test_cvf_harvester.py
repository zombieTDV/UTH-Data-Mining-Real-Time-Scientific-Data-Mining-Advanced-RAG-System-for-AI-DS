"""Unit tests for src/ingestion/cvf_harvester.py verifying CVF Open Access scraping,
DOM parsing, abstract enrichment, and Lakehouse storage vaulting.
"""
from unittest.mock import MagicMock, patch
import pytest

from src.ingestion.cvf_harvester import CvfHarvester


SAMPLE_CVF_LISTING_HTML = """
<!DOCTYPE html>
<html>
<body>
<div id="content">
    <dl>
        <dt class="ptitle"><br><a href="/content/CVPR2024/html/Author_Paper_One_CVPR_2024_paper.html">NeRF-Based Generalizable Synthesis</a></dt>
        <dd>
            <form action="" method="post">
                <input type="hidden" name="query_author" value="John Doe">
                <input type="hidden" name="query_author" value="Jane Roe">
            </form>
        </dd>
        <dd>
            [<a href="/content/CVPR2024/papers/Author_Paper_One_CVPR_2024_paper.pdf">pdf</a>]
            <div class="bibref">
                @InProceedings{Doe_2024_CVPR,
                    author = {Doe, John and Roe, Jane},
                    title = {NeRF-Based Generalizable Synthesis},
                    booktitle = {CVPR},
                    year = {2024}
                }
            </div>
        </dd>

        <dt class="ptitle"><br><a href="/content/CVPR2024/html/Smith_Vision_Transformer_CVPR_2024_paper.html">Vision Transformers for Robotics</a></dt>
        <dd>
            <a href="#">Alice Smith</a>, <a href="#">Bob Jones</a>
        </dd>
        <dd>
            [<a href="/content/CVPR2024/papers/Smith_Vision_Transformer_CVPR_2024_paper.pdf">pdf</a>]
        </dd>
    </dl>
</div>
</body>
</html>
"""

SAMPLE_ABSTRACT_HTML = """
<!DOCTYPE html>
<html>
<body>
    <div id="papertitle">NeRF-Based Generalizable Synthesis</div>
    <div id="abstract">
        We propose a novel radiance field representation capable of zero-shot generalization across scenes.
    </div>
</body>
</html>
"""


@pytest.fixture
def mock_storage():
    storage = MagicMock()
    storage.bucket_name = "test-lakehouse"
    storage.object_exists.return_value = False
    return storage


@pytest.fixture
def cvf_harvester(mock_storage):
    with patch("src.ingestion.cvf_harvester.LakehouseIO") as mock_io_cls:
        with patch("src.ingestion.cvf_harvester.SilverLakehouseWriter") as mock_writer_cls:
            mock_io = MagicMock()
            mock_io_cls.return_value = mock_io
            mock_writer = MagicMock()
            mock_writer_cls.return_value = mock_writer
            harvester = CvfHarvester(r2_client=mock_storage, request_delay=0.0)
            harvester.io = mock_io
            harvester.silver_writer = mock_writer
            return harvester


# ==============================================================================
# Proceedings Listing Parsing Tests
# ==============================================================================

@pytest.mark.unit
def test_fetch_papers_listing_from_cache(cvf_harvester, mock_storage):
    mock_storage.object_exists.return_value = True
    # Cache content > 100,000 bytes
    large_cache = SAMPLE_CVF_LISTING_HTML + ("<!-- padding -->\n" * 10000)
    assert len(large_cache) > 100000
    mock_storage.get_text.return_value = large_cache

    with patch("httpx.Client.get") as mock_http_get:
        papers = cvf_harvester.fetch_papers_listing("CVPR2024")
        mock_http_get.assert_not_called()

    assert len(papers) == 2
    assert papers[0]["paper_id"] == "cvf_Author_Paper_One_CVPR_2024_paper"
    assert papers[0]["title"] == "NeRF-Based Generalizable Synthesis"
    assert papers[0]["authors"] == ["John Doe", "Jane Roe"]
    assert "pdf" in papers[0]["pdf_url"]
    assert "Doe_2024_CVPR" in papers[0]["bibtex"]

    # Paper 2: authors parsed from <a> tags
    assert papers[1]["paper_id"] == "cvf_Smith_Vision_Transformer_CVPR_2024_paper"
    assert papers[1]["title"] == "Vision Transformers for Robotics"
    assert papers[1]["authors"] == ["Alice Smith", "Bob Jones"]


@pytest.mark.unit
def test_fetch_papers_listing_from_web(cvf_harvester, mock_storage):
    mock_storage.object_exists.return_value = False
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = SAMPLE_CVF_LISTING_HTML
    mock_resp.raise_for_status.return_value = None

    with patch("httpx.Client.get", return_value=mock_resp):
        papers = cvf_harvester.fetch_papers_listing("CVPR2024")

    assert len(papers) == 2
    mock_storage.upload_text.assert_called_once()


@pytest.mark.unit
def test_fetch_papers_listing_failure(cvf_harvester, mock_storage):
    mock_storage.object_exists.return_value = False

    with patch("httpx.Client.get", side_effect=Exception("Connection timed out")):
        with patch("time.sleep", return_value=None):
            papers = cvf_harvester.fetch_papers_listing("CVPR2024")

    assert papers == []


# ==============================================================================
# Abstract Enrichment Tests
# ==============================================================================

@pytest.mark.unit
def test_enrich_abstract_success(cvf_harvester):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = SAMPLE_ABSTRACT_HTML

    with patch.object(cvf_harvester.http_client, "get", return_value=mock_resp):
        abs_text = cvf_harvester.enrich_abstract("https://openaccess.thecvf.com/paper.html")

    assert "novel radiance field representation" in abs_text


@pytest.mark.unit
def test_enrich_abstract_missing_or_error(cvf_harvester):
    mock_resp = MagicMock()
    mock_resp.status_code = 404

    with patch.object(cvf_harvester.http_client, "get", return_value=mock_resp):
        assert cvf_harvester.enrich_abstract("https://openaccess.thecvf.com/missing.html") == ""

    assert cvf_harvester.enrich_abstract("") == ""


# ==============================================================================
# Complete Vaulting Flow Tests
# ==============================================================================

@pytest.mark.unit
def test_harvest_and_vault_flow(cvf_harvester):
    sample_paper = {
        "paper_id": "cvf_test_01",
        "title": "NeRF-Based Generalizable Synthesis",
        "authors": ["John Doe"],
        "venue": "CVPR2024",
        "year": 2024,
        "pdf_url": "https://openaccess.thecvf.com/test.pdf",
        "html_url": "https://openaccess.thecvf.com/test.html",
        "bibtex": "@InProceedings{Doe_2024}",
        "abstract": "",
        "crawled_at": "2024-06-15T00:00:00Z",
    }

    with patch.object(cvf_harvester, "fetch_papers_listing", return_value=[sample_paper]):
        with patch.object(
            cvf_harvester,
            "enrich_abstract",
            return_value="Synthesizing generalizable radiance fields across novel views.",
        ):
            cvf_harvester.silver_writer.prepare_record.return_value = {
                "paper_id": "cvf_test_01",
                "title": "NeRF-Based Generalizable Synthesis",
            }
            cvf_harvester.io.write_parquet.return_value = {"uri": "s3://test/silver/cvf/cvpr2024.parquet"}

            records = cvf_harvester.harvest_and_vault(
                total_limit=1,
                venue="CVPR2024",
                enrich_abstract=True,
                max_workers=1,
            )

    assert len(records) == 1
    assert records[0]["paper_id"] == "cvf_test_01"
    cvf_harvester.io.put_json.assert_called_once()
    cvf_harvester.silver_writer.prepare_record.assert_called_once()
    cvf_harvester.io.write_parquet.assert_called_once()
