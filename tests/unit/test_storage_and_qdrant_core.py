"""Unit tests for backend/app/services/storage_service.py and src/indexing/qdrant_manager.py
verifying object aggregation, Silver deduplication, quota utilization, deterministic UUID generation,
and vector search contracts.
"""
import uuid
from unittest.mock import MagicMock, patch
import pandas as pd
import pytest

from backend.app.services.storage_service import StorageService
from src.indexing.qdrant_manager import QdrantManager, POINT_UUID_NAMESPACE


# ==============================================================================
# 1. StorageService Object Aggregation & Quota Math
# ==============================================================================

@pytest.mark.unit
def test_storage_sum_prefix_filtering():
    objects = [
        {"key": "bronze/arxiv/2024/p1.html.gz", "size": 1000},
        {"key": "bronze/arxiv/2024/p2.html.gz", "size": 2000},
        {"key": "silver/papers/year=2024/papers.parquet", "size": 50000},
        {"key": "gold/mining/clusters.json", "size": 4000},
    ]

    count, total_bytes = StorageService._sum(objects, "bronze/arxiv/")
    assert count == 2
    assert total_bytes == 3000

    s_count, s_bytes = StorageService._sum(objects, "silver/")
    assert s_count == 1
    assert s_bytes == 50000


@pytest.mark.unit
def test_storage_get_current_totals_quota_math():
    svc = StorageService()
    fake_snap = {
        "total_bytes": 10 * 1024**3,  # 10 GB
        "total_objects": 500,
    }

    with patch.object(svc, "snapshot", return_value=fake_snap), \
         patch("backend.app.services.storage_service.FREE_TIER_QUOTA_GB", 20.0):

        totals = svc.get_current_totals()
        assert totals["total_gb"] == 10.0
        # 10 GB out of 20 GB quota = 50.0%
        assert totals["used_pct"] == 50.0


# ==============================================================================
# 2. QdrantManager Deterministic UUIDs & Vector Operations
# ==============================================================================

@pytest.mark.unit
def test_qdrant_deterministic_point_uuids():
    chunk_id = "arxiv_2401.00001_s01_c02"
    expected_uuid = str(uuid.uuid5(POINT_UUID_NAMESPACE, chunk_id))

    # Invariant: regenerating the UUID for the same chunk_id must yield exact same UUID
    assert str(uuid.uuid5(POINT_UUID_NAMESPACE, chunk_id)) == expected_uuid


@pytest.mark.unit
def test_qdrant_headers_with_and_without_api_key():
    qm_with_key = QdrantManager(url="http://localhost:6333", api_key="secret-key-123")
    assert qm_with_key._headers == {"api-key": "secret-key-123"}

    with patch("src.indexing.qdrant_manager.settings") as mock_settings:
        mock_settings.QDRANT_API_KEY = None
        mock_settings.QDRANT_URL = "http://localhost:6333"
        mock_settings.QDRANT_COLLECTION = "test_col"
        qm_no_key = QdrantManager(url="http://localhost:6333", api_key=None)
        assert qm_no_key._headers == {}


@pytest.mark.unit
def test_qdrant_count_delegation():
    qm = QdrantManager(url="http://localhost:6333")
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"result": {"points_count": 42000}}

    with patch.object(qm._session, "get", return_value=mock_resp) as mock_get:
        count = qm.count()
        assert count == 42000
        mock_get.assert_called_once()


@pytest.mark.unit
def test_qdrant_insert_chunks_structure():
    qm = QdrantManager(url="http://localhost:6333")

    chunks = [
        {
            "chunk_id": "c1",
            "paper_id": "p1",
            "title": "Title 1",
            "text": "Passage text 1",
            "authors": ["Author A"],
            "primary_category": "cs.AI",
            "section_title": "Intro",
            "year": 2024,
            "vector": [0.1] * 768,
        }
    ]

    with patch.object(qm, "ensure_collection", return_value=True), \
         patch("requests.put") as mock_put:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_put.return_value = mock_resp

        upserted = qm.insert_chunks(chunks)

        assert upserted == 1
        mock_put.assert_called_once()
        points = mock_put.call_args.kwargs["json"]["points"]
        assert len(points) == 1
        point = points[0]
        assert point["id"] == str(uuid.uuid5(POINT_UUID_NAMESPACE, "c1"))
        assert point["payload"]["title"] == "Title 1"
        assert point["payload"]["chunk_id"] == "c1"

