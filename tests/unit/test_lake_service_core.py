import pytest
from unittest.mock import MagicMock, patch
from botocore.exceptions import ClientError
from backend.app.services.lake import Lake


@pytest.fixture
def lake_instance():
    lake = Lake()
    lake._storage = MagicMock()
    return lake


def test_lake_head_success(lake_instance):
    mock_s3 = MagicMock()
    mock_s3.head_object.return_value = {
        "ContentLength": 1024,
        "LastModified": "2024-01-01",
        "ETag": '"abc"',
    }
    lake_instance._storage.s3 = mock_s3
    info = lake_instance.head("gold/test.parquet")
    assert info == {"size": 1024, "last_modified": "2024-01-01", "etag": '"abc"'}


def test_lake_head_not_found(lake_instance):
    mock_s3 = MagicMock()
    err_resp = {"Error": {"Code": "404", "Message": "Not Found"}}
    mock_s3.head_object.side_effect = ClientError(err_resp, "HeadObject")
    lake_instance._storage.s3 = mock_s3
    info = lake_instance.head("missing.key")
    assert info is None


def test_lake_get_json_cached_and_ttl(lake_instance):
    lake_instance._storage.get_text.return_value = '{"foo": "bar"}'
    # Initial read
    data1 = lake_instance.get_json("test.json", ttl=10.0)
    assert data1 == {"foo": "bar"}
    assert lake_instance._storage.get_text.call_count == 1

    # Cached read within TTL
    data2 = lake_instance.get_json("test.json", ttl=10.0)
    assert data2 == {"foo": "bar"}
    assert lake_instance._storage.get_text.call_count == 1  # No extra s3 call

    # Invalidate prefix
    lake_instance.invalidate("test")
    data3 = lake_instance.get_json("test.json", ttl=10.0)
    assert data3 == {"foo": "bar"}
    assert lake_instance._storage.get_text.call_count == 2


def test_lake_put_json(lake_instance):
    lake_instance.put_json("manifest.json", {"status": "OK"})
    lake_instance._storage.upload_json.assert_called_once_with({"status": "OK"}, "manifest.json")


def test_lake_scan_bucket(lake_instance):
    mock_paginator = MagicMock()
    mock_paginator.paginate.return_value = [
        {"Contents": [{"Key": "file1.parquet", "Size": 100}, {"Key": "file2.json", "Size": 50}]}
    ]
    mock_s3 = MagicMock()
    mock_s3.get_paginator.return_value = mock_paginator
    lake_instance._storage.s3 = mock_s3
    objects = lake_instance.scan_bucket()
    assert len(objects) == 2
    assert objects[0]["key"] == "file1.parquet"
    assert objects[0]["size"] == 100


def test_lake_lookup_paper(lake_instance):
    mock_dataset = MagicMock()
    mock_dataset.schema.names = ["paper_id", "title", "year"]
    mock_table = MagicMock()
    mock_table.num_rows = 1
    mock_table.slice.return_value.to_pylist.return_value = [
        {"paper_id": "2301.0001", "title": "Test Paper", "year": 2023}
    ]
    mock_dataset.to_table.return_value = mock_table

    with patch.object(lake_instance, "catalog_keys", return_value=["silver/arxiv.parquet"]), \
         patch.object(lake_instance, "dataset", return_value=mock_dataset):
        
        row = lake_instance.lookup_paper("2301.0001")
        assert row["paper_id"] == "2301.0001"
        assert row["title"] == "Test Paper"
