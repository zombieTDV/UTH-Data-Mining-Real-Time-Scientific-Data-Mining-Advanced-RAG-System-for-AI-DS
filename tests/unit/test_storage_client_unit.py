"""Unit tests for MinIOClient in src/storage/minio_client.py using mocked boto3."""
import io
import json
from unittest.mock import MagicMock, patch
import pytest
from botocore.exceptions import ClientError
from src.storage.minio_client import MinIOClient


@pytest.fixture
def mock_boto():
    with patch("src.storage.minio_client.boto3.client") as mock_client:
        mock_s3 = MagicMock()
        mock_client.return_value = mock_s3
        yield mock_s3


@pytest.fixture
def storage_client(mock_boto):
    client = MinIOClient(
        endpoint_url="http://localhost:9000",
        access_key_id="mock_key",
        secret_access_key="mock_secret",
        bucket_name="test-bucket",
    )
    return client


@pytest.mark.unit
def test_storage_client_init_missing_creds(monkeypatch):
    from src.config.settings import settings

    monkeypatch.setattr(settings, "MINIO_ENDPOINT_URL", "")
    monkeypatch.setattr(settings, "MINIO_ACCESS_KEY_ID", "")
    monkeypatch.setattr(settings, "MINIO_SECRET_ACCESS_KEY", "")

    with pytest.raises(ValueError, match="Thiếu thông tin xác thực MinIO Storage"):
        MinIOClient(
            endpoint_url=None,
            access_key_id=None,
            secret_access_key=None,
        )


@pytest.mark.unit
def test_storage_object_exists_true(storage_client, mock_boto):
    mock_boto.head_object.return_value = {"ContentLength": 1024}
    assert storage_client.object_exists("bronze/raw/paper.json") is True
    mock_boto.head_object.assert_called_once_with(
        Bucket="test-bucket", Key="bronze/raw/paper.json"
    )


@pytest.mark.unit
def test_storage_object_exists_404(storage_client, mock_boto):
    error_response = {"Error": {"Code": "404", "Message": "Not Found"}}
    mock_boto.head_object.side_effect = ClientError(error_response, "head_object")
    assert storage_client.object_exists("nonexistent.json") is False


@pytest.mark.unit
def test_storage_object_exists_other_error(storage_client, mock_boto):
    error_response = {"Error": {"Code": "500", "Message": "Internal Error"}}
    mock_boto.head_object.side_effect = ClientError(error_response, "head_object")
    with pytest.raises(ClientError):
        storage_client.object_exists("error.json")


@pytest.mark.unit
def test_storage_upload_bytes(storage_client, mock_boto):
    data = b"Hello, MinIO Lakehouse!"
    res = storage_client.upload_bytes(
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
def test_storage_upload_text_and_json(storage_client, mock_boto):
    payload = {"title": "Test Paper", "year": 2024}
    res = storage_client.upload_json(payload, "silver/structured/meta.json")

    assert res["key"] == "silver/structured/meta.json"
    assert res["size_bytes"] > 0
    assert res["uri"] == "s3://test-bucket/silver/structured/meta.json"

    mock_boto.put_object.assert_called_once()
    call_kwargs = mock_boto.put_object.call_args[1]
    assert call_kwargs["ContentType"] == "application/json; charset=utf-8"
    assert json.loads(call_kwargs["Body"].decode("utf-8")) == payload


@pytest.mark.unit
def test_storage_upload_file(tmp_path, storage_client, mock_boto):
    p = tmp_path / "sample.parquet"
    p.write_bytes(b"PARQUET_MAGIC_BYTES_HERE")

    res = storage_client.upload_file(
        file_path=p,
        key="silver/papers.parquet",
        content_type="application/octet-stream",
    )

    assert res["bucket"] == "test-bucket"
    assert res["key"] == "silver/papers.parquet"
    assert res["size_bytes"] == p.stat().st_size
    mock_boto.upload_file.assert_called_once_with(
        Filename=str(p),
        Bucket="test-bucket",
        Key="silver/papers.parquet",
        ExtraArgs={"ContentType": "application/octet-stream"},
    )


@pytest.mark.unit
def test_storage_upload_file_not_found(storage_client):
    with pytest.raises(FileNotFoundError):
        storage_client.upload_file("non_existent_path.txt", "key.txt")


@pytest.mark.unit
def test_storage_delete_object(storage_client, mock_boto):
    assert storage_client.delete_object("gold/to_delete.txt") is True
    mock_boto.delete_object.assert_called_once_with(
        Bucket="test-bucket", Key="gold/to_delete.txt"
    )

    mock_boto.delete_object.side_effect = ClientError({"Error": {}}, "delete_object")
    assert storage_client.delete_object("gold/error.txt") is False


@pytest.mark.unit
def test_storage_get_text_and_json(storage_client, mock_boto):
    mock_body = MagicMock()
    mock_body.read.return_value = b'{"status": "ready", "count": 42}'
    mock_boto.get_object.return_value = {"Body": mock_body}

    data = storage_client.get_json("gold/analytics/status.json")
    assert data["status"] == "ready"
    assert data["count"] == 42


@pytest.mark.unit
def test_storage_list_objects(storage_client, mock_boto):
    mock_paginator = MagicMock()
    mock_paginator.paginate.return_value = [
        {
            "Contents": [
                {
                    "Key": "bronze/raw/1.json",
                    "Size": 100,
                    "LastModified": MagicMock(isoformat=lambda: "2024-01-01T00:00:00Z"),
                },
                {
                    "Key": "bronze/raw/2.json",
                    "Size": 200,
                    "LastModified": MagicMock(isoformat=lambda: "2024-01-02T00:00:00Z"),
                },
            ]
        }
    ]
    mock_boto.get_paginator.return_value = mock_paginator

    items = storage_client.list_objects(prefix="bronze/raw/", max_keys=10)
    assert len(items) == 2
    assert items[0]["key"] == "bronze/raw/1.json"
    assert items[1]["size"] == 200
