"""Unit tests for src/ingestion/zenodo_harvester.py verifying Zenodo REST queries,
OAI-PMH protocol fallback, HTML tag stripping, and Lakehouse storage vaulting.
"""
from unittest.mock import MagicMock, patch
import pytest

from src.ingestion.zenodo_harvester import ZenodoHarvester


@pytest.fixture
def mock_storage():
    storage = MagicMock()
    storage.bucket_name = "test-lakehouse"
    storage.object_exists.return_value = False
    return storage


@pytest.fixture
def zenodo_harvester(mock_storage):
    with patch("src.ingestion.zenodo_harvester.LakehouseIO") as mock_io_cls:
        with patch("src.ingestion.zenodo_harvester.SilverLakehouseWriter") as mock_writer_cls:
            mock_io = MagicMock()
            mock_io_cls.return_value = mock_io
            mock_writer = MagicMock()
            mock_writer_cls.return_value = mock_writer
            harvester = ZenodoHarvester(r2_client=mock_storage, access_token="test_token")
            harvester.io = mock_io
            harvester.silver_writer = mock_writer
            return harvester


# ==============================================================================
# Helper & Cleaning Tests
# ==============================================================================

@pytest.mark.unit
def test_clean_html_text(zenodo_harvester):
    raw = "<p>This is a <b>scientific</b> study.<br/>New line with &nbsp; formatting.</p>"
    clean = zenodo_harvester._clean_html_text(raw)
    assert clean == "This is a scientific study. New line with &nbsp; formatting."
    assert zenodo_harvester._clean_html_text("") == ""
    assert zenodo_harvester._clean_html_text(None) == ""


# ==============================================================================
# REST API Fetch Tests
# ==============================================================================

@pytest.mark.unit
def test_fetch_records_via_api_success(zenodo_harvester):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "hits": {
            "hits": [
                {
                    "id": "1234567",
                    "metadata": {
                        "title": "Benchmarking Foundation Models",
                        "description": "Comprehensive evaluation of deep learning models.",
                        "creators": [{"name": "Carl Friedrich Gauss"}],
                        "publication_date": "2024-05-10",
                    },
                    "files": [],
                }
            ]
        }
    }

    with patch.object(zenodo_harvester.http_client, "get", return_value=mock_resp):
        hits = zenodo_harvester.fetch_records_via_api("machine learning", limit=5)

    assert len(hits) == 1
    assert hits[0]["id"] == "1234567"
    assert hits[0]["metadata"]["title"] == "Benchmarking Foundation Models"


@pytest.mark.unit
def test_fetch_records_via_api_fallback_on_error(zenodo_harvester):
    mock_resp = MagicMock()
    mock_resp.status_code = 429  # Rate limited

    with patch.object(zenodo_harvester.http_client, "get", return_value=mock_resp):
        hits = zenodo_harvester.fetch_records_via_api("machine learning", limit=5)

    assert hits == []


# ==============================================================================
# OAI-PMH Protocol Fallback Tests
# ==============================================================================

@pytest.mark.unit
def test_fetch_records_via_oai_success(zenodo_harvester):
    xml_content = """<?xml version="1.0" encoding="UTF-8"?>
    <OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
        <ListRecords>
            <record>
                <header>
                    <identifier>oai:zenodo.org:7654321</identifier>
                    <datestamp>2024-04-20</datestamp>
                </header>
                <metadata>
                    <oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" xmlns:dc="http://purl.org/dc/elements/1.1/">
                        <dc:title>Graph Neural Networks in Quantum Chemistry</dc:title>
                        <dc:description>Exploring molecular representations using GNNs.</dc:description>
                        <dc:creator>Marie Curie</dc:creator>
                    </oai_dc:dc>
                </metadata>
            </record>
            <record>
                <header status="deleted">
                    <identifier>oai:zenodo.org:9999999</identifier>
                </header>
            </record>
        </ListRecords>
    </OAI-PMH>
    """
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = xml_content

    with patch.object(zenodo_harvester.http_client, "get", return_value=mock_resp):
        records = zenodo_harvester.fetch_records_via_oai(limit=5)

    # Deleted record is excluded
    assert len(records) == 1
    rec = records[0]
    assert rec["id"] == "7654321"
    assert rec["metadata"]["title"] == "Graph Neural Networks in Quantum Chemistry"
    assert rec["metadata"]["doi"] == "10.5281/zenodo.7654321"
    assert rec["metadata"]["creators"] == [{"name": "Marie Curie"}]


# ==============================================================================
# Complete Harvest Flow Tests
# ==============================================================================

@pytest.mark.unit
def test_harvest_flow_with_bronze_and_silver(zenodo_harvester):
    sample_hit = {
        "id": "1001",
        "metadata": {
            "title": "Quantum Error Mitigation",
            "description": "<p>A detailed formulation of quantum error mitigation.</p>",
            "creators": [{"name": "David Deutsch"}],
            "publication_date": "2024-01-15",
            "doi": "10.5281/zenodo.1001",
            "keywords": ["quantum", "error mitigation", "physics"],
        },
        "files": [],
    }

    with patch.object(zenodo_harvester, "fetch_records_via_api", return_value=[sample_hit]):
        with patch.object(zenodo_harvester, "_broadcast_cdc_pulse"):
            zenodo_harvester.io.put_json.return_value = {"uri": "s3://test/bronze/zenodo.json"}
            zenodo_harvester.io.upsert_parquet.return_value = {
                "uri": "s3://test/silver/zenodo.parquet",
                "rows": 1,
            }

            results = zenodo_harvester.harvest(limit=1, query="quantum")

    assert len(results) == 1
    p = results[0]
    assert p["paper_id"] == "zenodo:1001"
    assert p["title"] == "Quantum Error Mitigation"
    assert p["authors"] == ["David Deutsch"]
    assert p["source"] == "Zenodo"
    assert p["year"] == 2024
    assert p["keywords"] == ["quantum", "error mitigation", "physics"]

    zenodo_harvester.io.put_json.assert_called_once()
    zenodo_harvester.io.upsert_parquet.assert_called_once()
