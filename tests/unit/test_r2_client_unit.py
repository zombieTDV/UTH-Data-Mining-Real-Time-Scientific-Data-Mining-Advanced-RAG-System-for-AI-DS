"""Unit tests for R2Client in src/storage/r2_client.py using mocked boto3."""
import io
import json
from unittest.mock import MagicMock, patch
import pytest
from botocore.exceptions import ClientError
from src.storage.r2_client import R2Client


@pytest.fixture
def mock_boto():
    with patch("src.storage.r2_client.boto3.client") as mock_client:
        mock_s3 = MagicMock()
        mock_client.return_value = mock_s3
        yield mock_s3


@pytest.fixture
def r2_client(mock_boto):
    client = R2Client(
        endpoint_url="https://mock-account.r2.cloudflarestorage.com",
        access_key_id="mock_key",
        secret_access_key="mock_secret",
        bucket_name="test-bucket",
    )
    return client


@pytest.mark.unit
def test_r2_client_init_missing_creds(monkeypatch):
    from src.config.settings import settings

    monkeypatch.setattr(settings, "get_r2_endpoint", lambda: None)
    monkeypatch.setattr(settings, "R2_ACCESS_KEY_ID", None)
    monkeypatch.setattr(settings, "R2_SECRET_ACCESS_KEY", None)

    with pytest.raises(ValueError, match="Thiếu thông tin xác thực Cloudflare R2"):
        R2Client(
            endpoint_url=None,
            access_key_id=None,
            secret_access_key=None,
        )


@pytest.mark.unit
def test_r2_object_exists_true(r2_client, mock_boto):
    mock_boto.head_object.return_value = {"ContentLength": 1024}
    assert r2_client.object_exists("bronze/raw/paper.json") is True
    mock_boto.head_object.assert_called_once_with(
        Bucket="test-bucket", Key="bronze/raw/paper.json"
    )


@pytest.mark.unit
def test_r2_object_exists_404(r2_client, mock_boto):
    error_response = {"Error": {"Code": "404", "Message": "Not Found"}}
    mock_boto.head_object.side_effect = ClientError(error_response, "head_object")
    assert r2_client.object_exists("nonexistent.json") is False


@pytest.mark.unit
def test_r2_object_exists_other_error(r2_client, mock_boto):
    error_response = {"Error": {"Code": "500", "Message": "Internal Error"}}
    mock_boto.head_object.side_effect = ClientError(error_response, "head_object")
    with pytest.raises(ClientError):
        r2_client.object_exists("error.json")


@pytest.mark.unit
def test_r2_upload_bytes(r2_client, mock_boto):
    data = b"Hello, R2 Lakehouse!"
    res = r2_client.upload_bytes(
        data=data,
        key="bronze/raw/hello.txt",
        content_type="text/plain",
        metadata={"custom": "meta"},
    )

    assert res["bucket"] == "test-bucket"
    assert res["key"] == "bronze/raw/hello.txt"
    assert res["size_bytes"] == len(data)
    assert res["uri"] == "s3://test-bucket/bronze/raw/hello.txt"
    assert "sha256" in res

    mock_boto.put_object.assert_called_once()
    call_kwargs = mock_boto.put_object.call_args[1]
    assert call_kwargs["Bucket"] == "test-bucket"
    assert call_kwargs["Key"] == "bronze/raw/hello.txt"
    assert call_kwargs["Body"] == data
    assert call_kwargs["ContentType"] == "text/plain"
    assert call_kwargs["Metadata"]["custom"] == "meta"
    assert call_kwargs["Metadata"]["sha256"] == res["sha256"]


@pytest.mark.unit
def test_r2_upload_text_and_json(r2_client, mock_boto):
    payload = {"title": "Test Paper", "year": 2024}
    res = r2_client.upload_json(payload, "silver/structured/meta.json")

    assert res["key"] == "silver/structured/meta.json"
    mock_boto.put_object.assert_called_once()
    call_kwargs = mock_boto.put_object.call_args[1]
    assert call_kwargs["ContentType"] == "application/json; charset=utf-8"
    body_str = call_kwargs["Body"].decode("utf-8")
    assert json.loads(body_str) == payload


@pytest.mark.unit
def test_r2_upload_file(tmp_path, r2_client, mock_boto):
    local_file = tmp_path / "test_artifact.parquet"
    local_file.write_bytes(b"PARQUET_MAGIC_BYTES_1234")

    res = r2_client.upload_file(
        file_path=local_file,
        key="silver/parquet/catalog.parquet",
        content_type="application/vnd.apache.parquet",
    )

    assert res["key"] == "silver/parquet/catalog.parquet"
    assert res["size_bytes"] == local_file.stat().st_size
    mock_boto.upload_file.assert_called_once()


@pytest.mark.unit
def test_r2_upload_file_not_found(r2_client):
    with pytest.raises(FileNotFoundError):
        r2_client.upload_file("non_existent_path.txt", "key.txt")


@pytest.mark.unit
def test_r2_get_text_and_json(r2_client, mock_boto):
    body_mock = MagicMock()
    body_mock.read.return_value = json.dumps({"status": "ok"}).encode("utf-8")
    mock_boto.get_object.return_value = {"Body": body_mock}

    data = r2_client.get_json("gold/analytics/status.json")
    assert data == {"status": "ok"}
    mock_boto.get_object.assert_called_once_with(
        Bucket="test-bucket", Key="gold/analytics/status.json"
    )


@pytest.mark.unit
def test_r2_list_objects(r2_client, mock_boto):
    from datetime import datetime

    mock_paginator = MagicMock()
    mock_boto.get_paginator.return_value = mock_paginator
    mock_paginator.paginate.return_value = [
        {
            "Contents": [
                {
                    "Key": "bronze/raw/p1.json",
                    "Size": 1024,
                    "LastModified": datetime(2024, 1, 1, 12, 0, 0),
                },
                {
                    "Key": "bronze/raw/p2.json",
                    "Size": 2048,
                    "LastModified": datetime(2024, 1, 2, 12, 0, 0),
                },
            ]
        }
    ]

    items = r2_client.list_objects(prefix="bronze/raw/", max_keys=10)
    assert len(items) == 2
    assert items[0]["key"] == "bronze/raw/p1.json"
    assert items[0]["size"] == 1024
    assert items[1]["key"] == "bronze/raw/p2.json"
    mock_boto.get_paginator.assert_called_once_with("list_objects_v2")
