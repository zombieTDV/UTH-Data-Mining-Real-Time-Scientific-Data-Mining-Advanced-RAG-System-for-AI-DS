"""Unit tests for src/ingestion/arxiv_batch_harvester.py verifying OAI-PMH record
normalization, checkpoint persistence, error retry handling, and batch harvesting.
"""
from unittest.mock import MagicMock, patch
import httpx
import pytest

from src.ingestion.arxiv_batch_harvester import ArxivBatchHarvester


@pytest.fixture
def mock_storage():
    storage = MagicMock()
    storage.bucket_name = "test-lakehouse"
    storage.object_exists.return_value = False
    return storage


@pytest.fixture
def batch_harvester(mock_storage):
    with patch("src.ingestion.arxiv_batch_harvester.LakehouseIO") as mock_io_cls:
        mock_io = MagicMock()
        mock_io_cls.return_value = mock_io
        harvester = ArxivBatchHarvester(r2_client=mock_storage, request_delay=0.0)
        harvester.io = mock_io
        return harvester


# ==============================================================================
# Checkpoint Tests
# ==============================================================================

@pytest.mark.unit
def test_load_checkpoint_defaults(batch_harvester):
    batch_harvester.io.get_json.return_value = None
    cp = batch_harvester.load_checkpoint()
    assert cp["resumption_token"] is None
    assert cp["page_num"] == 0
    assert cp["total_ingested"] == 0


@pytest.mark.unit
def test_load_checkpoint_existing(batch_harvester):
    batch_harvester.io.get_json.return_value = {
        "resumption_token": "token_abc_123",
        "page_num": 5,
        "total_ingested": 5000,
        "last_updated": "2024-01-01T00:00:00Z",
    }
    cp = batch_harvester.load_checkpoint()
    assert cp["resumption_token"] == "token_abc_123"
    assert cp["page_num"] == 5
    assert cp["total_ingested"] == 5000


@pytest.mark.unit
def test_save_checkpoint(batch_harvester):
    batch_harvester.save_checkpoint(resumption_token="tok_next", page_num=2, total_ingested=200)
    batch_harvester.io.put_json.assert_called_once()
    args, _ = batch_harvester.io.put_json.call_args
    assert args[0] == batch_harvester.checkpoint_key
    assert args[1]["resumption_token"] == "tok_next"
    assert args[1]["page_num"] == 2
    assert args[1]["total_ingested"] == 200


# ==============================================================================
# Record Normalization Tests
# ==============================================================================

@pytest.mark.unit
def test_normalize_oai_record_deleted(batch_harvester):
    raw = {"header": {"@status": "deleted", "identifier": "oai:arXiv.org:2401.00001"}}
    assert batch_harvester.normalize_oai_record(raw) is None


@pytest.mark.unit
def test_normalize_oai_record_missing_metadata(batch_harvester):
    raw = {"header": {"identifier": "oai:arXiv.org:2401.00001"}}
    assert batch_harvester.normalize_oai_record(raw) is None


@pytest.mark.unit
def test_normalize_oai_record_valid(batch_harvester):
    raw = {
        "header": {
            "identifier": "oai:arXiv.org:2401.00099",
            "datestamp": "2024-01-02",
        },
        "metadata": {
            "arXiv": {
                "id": "2401.00099",
                "title": "Quantum   Geometric Deep Learning",
                "abstract": "We develop geometric quantum neural   networks.",
                "authors": {
                    "author": [
                        {"forenames": "Erwin", "keyname": "Schrodinger"},
                        {"forenames": "Werner", "keyname": "Heisenberg"},
                    ]
                },
                "categories": "cs.AI quant-ph cs.LG",
                "created": "2024-01-01",
                "doi": {"#text": "10.1038/quantum.2024.1"},
                "journal-ref": "Nature Quantum 2024",
            }
        },
    }

    p = batch_harvester.normalize_oai_record(raw)
    assert p is not None
    assert p["paper_id"] == "2401.00099"
    assert p["title"] == "Quantum Geometric Deep Learning"
    assert p["abstract"] == "We develop geometric quantum neural networks."
    assert p["authors"] == ["Erwin Schrodinger", "Werner Heisenberg"]
    assert p["categories"] == ["cs.AI", "quant-ph", "cs.LG"]
    assert p["primary_category"] == "cs.AI"
    assert p["doi"] == "10.1038/quantum.2024.1"
    assert p["journal_ref"] == "Nature Quantum 2024"
    assert p["published_date"] == "2024-01-01"


@pytest.mark.unit
def test_normalize_oai_record_fallback_identifier(batch_harvester):
    raw = {
        "header": {"identifier": "oai:arXiv.org:2401.55555", "datestamp": "2024-01-03"},
        "metadata": {
            "arXiv": {
                "title": "Fallback ID Paper",
                "abstract": "Abstract text.",
                "authors": {"author": {"forenames": "", "keyname": "SingleAuthor"}},
                "categories": "cs.CV",
            }
        },
    }
    p = batch_harvester.normalize_oai_record(raw)
    assert p is not None
    assert p["paper_id"] == "2401.55555"
    assert p["authors"] == ["SingleAuthor"]
    assert p["primary_category"] == "cs.CV"


# ==============================================================================
# Fetch OAI Page & Error Handling Tests
# ==============================================================================

@pytest.mark.unit
def test_fetch_oai_page_success(batch_harvester):
    xml_content = """<?xml version="1.0" encoding="UTF-8"?>
    <OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
        <ListRecords>
            <record>
                <header><identifier>oai:arXiv.org:2401.00001</identifier></header>
                <metadata>
                    <arXiv xmlns="http://arxiv.org/OAI/arXiv/">
                        <id>2401.00001</id>
                        <title>Test Title</title>
                        <categories>cs.AI</categories>
                    </arXiv>
                </metadata>
            </record>
            <resumptionToken>next_token_xyz</resumptionToken>
        </ListRecords>
    </OAI-PMH>
    """
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = xml_content
    mock_resp.raise_for_status.return_value = None

    with patch.object(batch_harvester.http_client, "get", return_value=mock_resp):
        res = batch_harvester.fetch_oai_page(resumption_token=None)

    assert len(res["records_raw"]) == 1
    assert res["resumption_token"] == "next_token_xyz"


@pytest.mark.unit
def test_fetch_oai_page_retry_after_503(batch_harvester):
    mock_resp_503 = MagicMock()
    mock_resp_503.status_code = 503
    mock_resp_503.headers = {"Retry-After": "1"}

    mock_resp_200 = MagicMock()
    mock_resp_200.status_code = 200
    mock_resp_200.text = """<OAI-PMH><ListRecords><record></record></ListRecords></OAI-PMH>"""
    mock_resp_200.raise_for_status.return_value = None

    with patch.object(batch_harvester.http_client, "get", side_effect=[mock_resp_503, mock_resp_200]):
        with patch("time.sleep", return_value=None):
            res = batch_harvester.fetch_oai_page(resumption_token="tok1", max_retries=2)

    assert "records_raw" in res


@pytest.mark.unit
def test_fetch_oai_page_oai_error_raises(batch_harvester):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = """<OAI-PMH><error code="noRecordsMatch">No matching records found.</error></OAI-PMH>"""
    mock_resp.raise_for_status.return_value = None

    with patch.object(batch_harvester.http_client, "get", return_value=mock_resp):
        with patch("time.sleep", return_value=None):
            with pytest.raises(Exception):
                batch_harvester.fetch_oai_page(resumption_token=None, max_retries=1)


# ==============================================================================
# Day-By-Day Harvesting Flow
# ==============================================================================

@pytest.mark.unit
def test_harvest_day_by_day_backward_flow(batch_harvester):
    raw_record = {
        "header": {"identifier": "oai:arXiv.org:2401.00010"},
        "metadata": {
            "arXiv": {
                "id": "2401.00010",
                "title": "Day By Day Paper",
                "abstract": "Testing day by day backward harvesting flow.",
                "authors": {"author": {"forenames": "Ada", "keyname": "Lovelace"}},
                "categories": "cs.AI",
                "created": "2024-01-02",
            }
        },
    }

    with patch.object(
        batch_harvester,
        "fetch_oai_page",
        return_value={"records_raw": [raw_record], "resumption_token": None},
    ):
        with patch("time.sleep", return_value=None):
            batch_harvester.io.upsert_parquet.return_value = {"uri": "s3://test/silver/arxiv.parquet"}
            papers = batch_harvester.harvest_day_by_day_backward(
                total_target=1,
                start_date="2024-01-02",
                categories=["cs.AI"],
            )

    assert len(papers) == 1
    assert papers[0]["paper_id"] == "2401.00010"
    assert papers[0]["tier"] == "tier2"
    assert papers[0]["source"] == "arxiv"
    batch_harvester.io.upsert_parquet.assert_called_once()
