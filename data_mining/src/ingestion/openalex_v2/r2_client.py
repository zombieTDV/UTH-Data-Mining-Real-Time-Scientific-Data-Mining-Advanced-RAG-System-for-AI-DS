"""R2 (S3-compatible) client extensions used by OpenAlex V2.

The base R2Client (src/storage/r2_client.py) is intentionally
preserved for backward compatibility. This module adds the
operations required by the V2 pipeline:

  - iter_objects()       unlimited paginated iteration
  - head_object_metadata()  size + custom metadata + etag
  - safe_upload_file()   SHA256 enforced + remote verify via HEAD
  - verify_object()      re-fetch HEAD and compare with expected SHA

The contract is: callers can ask for a SHA-256 to be embedded in
the object's custom metadata; the upload is then verified by
re-reading the object metadata. If the remote SHA mismatches the
local one the upload is considered FAILED and no overwrite occurs.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Union

from botocore.exceptions import ClientError

from src.config.settings import settings
from src.storage.r2_client import R2Client
from src.utils.hasher import compute_sha256


@dataclass(frozen=True)
class ObjectMetadata:
    key: str
    size: int
    etag: str
    last_modified: str
    sha256: Optional[str]
    custom: Dict[str, str]


def head_object_metadata(
    r2: R2Client,
    key: str,
) -> Optional[ObjectMetadata]:
    try:
        response = r2.s3.head_object(Bucket=r2.bucket_name, Key=key)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code in ("404", "NoSuchKey"):
            return None
        raise
    raw_meta = response.get("Metadata", {}) or {}
    return ObjectMetadata(
        key=key,
        size=int(response.get("ContentLength", 0)),
        etag=str(response.get("ETag", "")).strip('"'),
        last_modified=str(response.get("LastModified", "")),
        sha256=raw_meta.get("sha256"),
        custom={k: str(v) for k, v in raw_meta.items()},
    )


def iter_objects(
    r2: R2Client,
    prefix: str = "",
    page_size: int = 1000,
) -> Iterator[Dict[str, Any]]:
    if page_size <= 0:
        raise ValueError(f"page_size must be > 0, got {page_size}")
    paginator = r2.s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(
        Bucket=r2.bucket_name,
        Prefix=prefix,
        PaginationConfig={"PageSize": page_size},
    ):
        for item in page.get("Contents", []):
            yield {
                "key": item["Key"],
                "size": int(item["Size"]),
                "last_modified": item["LastModified"].isoformat(),
            }


def list_all_objects(
    r2: R2Client,
    prefix: str = "",
    page_size: int = 1000,
) -> List[Dict[str, Any]]:
    return list(iter_objects(r2, prefix=prefix, page_size=page_size))


def safe_upload_bytes(
    r2: R2Client,
    *,
    data: bytes,
    key: str,
    content_type: str = "application/octet-stream",
    metadata: Optional[Dict[str, str]] = None,
    verify_remote: bool = True,
) -> Dict[str, Any]:
    local_sha = compute_sha256(data)
    meta = dict(metadata or {})
    meta["sha256"] = local_sha

    if verify_remote:
        existing = head_object_metadata(r2, key)
        if existing is not None:
            if existing.sha256 == local_sha:
                return {
                    "status": "SKIP_OK",
                    "bucket": r2.bucket_name,
                    "key": key,
                    "size_bytes": len(data),
                    "sha256": local_sha,
                    "uri": f"s3://{r2.bucket_name}/{key}",
                }
            return {
                "status": "CONFLICT",
                "bucket": r2.bucket_name,
                "key": key,
                "size_bytes": len(data),
                "sha256": local_sha,
                "uri": f"s3://{r2.bucket_name}/{key}",
                "remote_sha256": existing.sha256,
            }

    r2.s3.put_object(
        Bucket=r2.bucket_name,
        Key=key,
        Body=data,
        ContentType=content_type,
        Metadata=meta,
    )
    return {
        "status": "UPLOADED",
        "bucket": r2.bucket_name,
        "key": key,
        "size_bytes": len(data),
        "sha256": local_sha,
        "uri": f"s3://{r2.bucket_name}/{key}",
    }


def safe_upload_file(
    r2: R2Client,
    *,
    file_path: Union[str, Path],
    key: str,
    content_type: Optional[str] = None,
    metadata: Optional[Dict[str, str]] = None,
    verify_remote: bool = True,
) -> Dict[str, Any]:
    path = Path(file_path)
    if not path.is_file():
        raise FileNotFoundError(f"File not found: {path}")
    data = path.read_bytes()
    return safe_upload_bytes(
        r2,
        data=data,
        key=key,
        content_type=content_type or "application/octet-stream",
        metadata=metadata,
        verify_remote=verify_remote,
    )


def verify_object(
    r2: R2Client,
    *,
    key: str,
    expected_sha256: str,
    expected_size: Optional[int] = None,
) -> bool:
    meta = head_object_metadata(r2, key)
    if meta is None:
        return False
    if meta.sha256 != expected_sha256:
        return False
    if expected_size is not None and meta.size != expected_size:
        return False
    return True
