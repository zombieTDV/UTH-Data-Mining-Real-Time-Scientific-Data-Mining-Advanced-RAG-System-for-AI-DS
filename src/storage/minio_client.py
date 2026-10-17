"""MinIO Object Storage client wrapper (High-Performance Local S3)."""

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from src.config.settings import settings
from src.utils.hasher import compute_sha256


class MinIOClient:
    """High-Performance MinIO S3 Storage Manager."""

    def __init__(
        self,
        endpoint_url: Optional[str] = None,
        access_key_id: Optional[str] = None,
        secret_access_key: Optional[str] = None,
        bucket_name: Optional[str] = None,
    ):
        self.endpoint_url = endpoint_url or settings.MINIO_ENDPOINT_URL
        self.access_key_id = access_key_id or settings.MINIO_ACCESS_KEY_ID
        self.secret_access_key = secret_access_key or settings.MINIO_SECRET_ACCESS_KEY
        self.bucket_name = bucket_name or settings.MINIO_BUCKET_NAME

        if not self.endpoint_url or not self.access_key_id or not self.secret_access_key:
            raise ValueError(
                "Thiếu thông tin xác thực MinIO Storage. Vui lòng kiểm tra file .env"
            )

        self.s3 = boto3.client(
            service_name="s3",
            endpoint_url=self.endpoint_url,
            aws_access_key_id=self.access_key_id,
            aws_secret_access_key=self.secret_access_key,
            region_name="us-east-1",
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"},
                retries={"max_attempts": 3, "mode": "standard"},
                connect_timeout=15,
                read_timeout=30,
            ),
        )

    def object_exists(self, key: str) -> bool:
        """Kiểm tra xem object key đã tồn tại trong bucket hay chưa."""
        try:
            self.s3.head_object(Bucket=self.bucket_name, Key=self.sanitize_key(key))
            return True
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey"):
                return False
            raise

    def upload_bytes(
        self,
        data: bytes,
        key: str,
        content_type: str = "application/octet-stream",
        metadata: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """Tải dữ liệu bytes trực tiếp lên MinIO."""
        clean_key = self.sanitize_key(key)
        sha256 = compute_sha256(data)
        meta = metadata or {}
        meta["sha256"] = sha256

        self.s3.put_object(
            Bucket=self.bucket_name,
            Key=clean_key,
            Body=data,
            ContentType=content_type,
            Metadata=meta,
        )
        return {
            "bucket": self.bucket_name,
            "key": clean_key,
            "size_bytes": len(data),
            "sha256": sha256,
            "uri": f"s3://{self.bucket_name}/{clean_key}",
        }

    def upload_text(
        self,
        text: str,
        key: str,
        content_type: str = "text/plain; charset=utf-8",
        metadata: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """Tải chuỗi văn bản (JSON, HTML, Markdown) lên MinIO."""
        return self.upload_bytes(
            data=text.encode("utf-8"),
            key=key,
            content_type=content_type,
            metadata=metadata,
        )

    def upload_json(
        self,
        payload: Any,
        key: str,
        metadata: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """Tải cấu trúc Python Dict/List dạng JSON lên MinIO."""
        text = json.dumps(payload, ensure_ascii=False, indent=2)
        return self.upload_text(
            text=text,
            key=key,
            content_type="application/json; charset=utf-8",
            metadata=metadata,
        )

    @staticmethod
    def sanitize_key(key: str) -> str:
        """Sanitizes S3 keys by converting Windows backslashes to forward slashes and stripping leading slashes."""
        return key.replace("\\", "/").lstrip("/")

    def upload_file(
        self,
        file_path: Union[str, Path],
        key: str,
        content_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Upload file từ ổ đĩa local lên MinIO."""
        path = Path(file_path)
        if not path.is_file():
            raise FileNotFoundError(f"File không tồn tại: {path}")

        key = self.sanitize_key(key)
        extra_args = {}
        if content_type:
            extra_args["ContentType"] = content_type

        self.s3.upload_file(
            Filename=str(path),
            Bucket=self.bucket_name,
            Key=key,
            ExtraArgs=extra_args if extra_args else None,
        )
        sha256 = compute_sha256(path)
        return {
            "bucket": self.bucket_name,
            "key": key,
            "size_bytes": path.stat().st_size,
            "sha256": sha256,
            "uri": f"s3://{self.bucket_name}/{key}",
        }

    def delete_object(self, key: str) -> bool:
        """Xóa một object duy nhất khỏi MinIO bằng exact key."""
        try:
            self.s3.delete_object(Bucket=self.bucket_name, Key=self.sanitize_key(key))
            return True
        except ClientError:
            return False

    def delete_objects_batch(self, keys: List[str]) -> int:
        """Xóa danh sách objects theo batch tối đa 1,000 keys per call (S3 standard)."""
        if not keys:
            return 0

        raw_keys = [self.sanitize_key(k) for k in keys]
        deleted_count = 0
        batch_size = 1000

        for i in range(0, len(raw_keys), batch_size):
            chunk = raw_keys[i : i + batch_size]
            delete_payload = {"Objects": [{"Key": k} for k in chunk], "Quiet": True}
            try:
                resp = self.s3.delete_objects(Bucket=self.bucket_name, Delete=delete_payload)
                errors = resp.get("Errors", [])
                if errors:
                    deleted_count += len(chunk) - len(errors)
                else:
                    deleted_count += len(chunk)
            except ClientError:
                for k in chunk:
                    try:
                        self.s3.delete_object(Bucket=self.bucket_name, Key=k)
                        deleted_count += 1
                    except Exception:
                        pass

        return deleted_count

    def download_file_safe(self, key: str, local_path: Union[str, Path]) -> Path:
        """Tải file từ MinIO về an toàn với atomic replace."""
        target = Path(local_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp_target = target.with_suffix(f"{target.suffix}.tmp_{os.getpid()}")

        self.s3.download_file(self.bucket_name, self.sanitize_key(key), str(tmp_target))
        if target.exists():
            target.unlink()
        tmp_target.rename(target)
        return target

    def get_text(self, key: str) -> str:
        """Đọc nội dung văn bản từ MinIO object."""
        response = self.s3.get_object(Bucket=self.bucket_name, Key=self.sanitize_key(key))
        return response["Body"].read().decode("utf-8")

    def get_json(self, key: str) -> Any:
        """Đọc và parse JSON từ MinIO object."""
        return json.loads(self.get_text(key))

    def list_objects(self, prefix: str = "", max_keys: int = 1000) -> List[Dict[str, Any]]:
        """Liệt kê danh sách objects theo prefix."""
        paginator = self.s3.get_paginator("list_objects_v2")
        results = []
        for page in paginator.paginate(
            Bucket=self.bucket_name,
            Prefix=self.sanitize_key(prefix),
            PaginationConfig={"MaxItems": max_keys},
        ):
            for item in page.get("Contents", []):
                results.append(
                    {
                        "key": item["Key"],
                        "size": item["Size"],
                        "last_modified": item["LastModified"].isoformat(),
                    }
                )
        return results


# Aliases for unified Lakehouse storage client
StorageClient = MinIOClient
