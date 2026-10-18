"""MinIO-backed lakehouse access for the backend.

All reads and writes go straight to MinIO (JSON through boto3, Parquet through pyarrow's S3
filesystem with range reads and predicate pushdown). The backend never touches local data files.
"""

import json
import logging
import threading
import time
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import pyarrow.compute as pc
import pyarrow.dataset as ds
import pyarrow.fs as pafs
from botocore.exceptions import ClientError

from backend.app.core.config import settings
from src.storage.minio_client import StorageClient

logger = logging.getLogger("lake")
_MISSING = ("404", "NoSuchKey", "NotFound")


class Lake:
    def __init__(self):
        self._storage: Optional[StorageClient] = None
        self._fs: Optional[pafs.S3FileSystem] = None
        self._json_cache: Dict[str, Any] = {}
        self._lock = threading.Lock()

    # ------------------------------------------------------------ clients
    @property
    def storage(self) -> StorageClient:
        if self._storage is None:
            self._storage = StorageClient(
                endpoint_url=settings.MINIO_ENDPOINT_URL,
                access_key_id=settings.MINIO_ACCESS_KEY_ID,
                secret_access_key=settings.MINIO_SECRET_ACCESS_KEY,
                bucket_name=settings.MINIO_BUCKET_NAME,
            )
        return self._storage

    @property
    def fs(self) -> pafs.S3FileSystem:
        if self._fs is None:
            ep = urlparse(settings.MINIO_ENDPOINT_URL)
            self._fs = pafs.S3FileSystem(
                access_key=settings.MINIO_ACCESS_KEY_ID,
                secret_key=settings.MINIO_SECRET_ACCESS_KEY,
                endpoint_override=ep.netloc,
                scheme=ep.scheme or "http",
                region="us-east-1",
            )
        return self._fs

    @property
    def bucket(self) -> str:
        return settings.MINIO_BUCKET_NAME

    # ------------------------------------------------------------ objects
    def head(self, key: str) -> Optional[Dict[str, Any]]:
        try:
            r = self.storage.s3.head_object(Bucket=self.bucket, Key=key)
            return {"size": r["ContentLength"], "last_modified": r["LastModified"], "etag": r["ETag"]}
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") in _MISSING:
                return None
            raise

    def exists(self, key: str) -> bool:
        """An object, or for a key ending in '/' a prefix holding at least one Parquet file."""
        if key.endswith("/"):
            from pyarrow import fs as pafs

            infos = self.fs.get_file_info(pafs.FileSelector(f"{self.bucket}/{key}", recursive=True, allow_not_found=True))
            return any(i.type == pafs.FileType.File and i.path.endswith(".parquet") for i in infos)
        return self.head(key) is not None

    def get_json(self, key: str, ttl: float = 30.0, default: Any = None) -> Any:
        """JSON object from MinIO with a short in-process cache (validated by TTL)."""
        now = time.time()
        with self._lock:
            hit = self._json_cache.get(key)
            if hit and now - hit[0] < ttl:
                return hit[1]
        try:
            data = json.loads(self.storage.get_text(key))
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") in _MISSING:
                return default
            raise
        with self._lock:
            self._json_cache[key] = (now, data)
        return data

    def invalidate(self, prefix: str) -> None:
        """Drop cached JSON under a prefix (artifacts rewritten by another process, e.g. the mining engine)."""
        with self._lock:
            for k in [k for k in self._json_cache if k.startswith(prefix)]:
                del self._json_cache[k]

    def put_json(self, key: str, payload: Any) -> None:
        self.storage.upload_json(payload, key)
        with self._lock:
            self._json_cache.pop(key, None)

    def scan_bucket(self) -> List[Dict[str, Any]]:
        """Every object in the bucket as {key, size}."""
        out = []
        for page in self.storage.s3.get_paginator("list_objects_v2").paginate(Bucket=self.bucket):
            out.extend({"key": o["Key"], "size": o["Size"]} for o in page.get("Contents", []))
        return out

    def parquet_rows(self, key: str) -> int:
        """Row count from the Parquet footer only (range reads)."""
        import pyarrow.parquet as pq

        try:
            with self.fs.open_input_file(f"{self.bucket}/{key}") as f:
                return pq.ParquetFile(f).metadata.num_rows
        except Exception:
            return 0

    # ------------------------------------------------------------ parquet
    def dataset(self, key: str) -> ds.Dataset:
        return ds.dataset(f"{self.bucket}/{key}", filesystem=self.fs, format="parquet")

    def catalog_keys(self) -> List[str]:
        return [k.strip() for k in settings.SILVER_CATALOG_KEYS.split(",") if k.strip()]

    def lookup_paper(self, paper_id: str) -> Dict[str, Any]:
        """Full metadata row for a paper id across the Silver catalogs ({} when unknown)."""
        for key in self.catalog_keys():
            try:
                d = self.dataset(key)
                names = set(d.schema.names)
                for col, val in (("paper_id", paper_id), ("openalex_id", paper_id.replace("openalex:", ""))):
                    if col in names:
                        t = d.to_table(filter=ds.field(col) == val)
                        if t.num_rows:
                            return t.slice(0, 1).to_pylist()[0]
            except Exception as err:
                logger.debug("lookup_paper: %s unreadable: %s", key, err)
        return {}

    def search_titles(self, term: str, limit: int = 3) -> List[Dict[str, Any]]:
        """Papers whose title contains `term` (case-insensitive), first catalog with a hit wins."""
        for key in self.catalog_keys():
            try:
                d = self.dataset(key)
                names = set(d.schema.names)
                if "title" not in names:
                    continue
                cols = [c for c in ("paper_id", "title", "year", "doi", "citation_count", "cite_count") if c in names]
                t = d.to_table(columns=cols, filter=pc.match_substring(ds.field("title"), term, ignore_case=True))
                if t.num_rows:
                    sort_col = next((c for c in ("citation_count", "cite_count") if c in cols), None)
                    if sort_col:
                        t = t.sort_by([(sort_col, "descending")])
                    return t.slice(0, limit).to_pylist()
            except Exception as err:
                logger.debug("search_titles: %s unreadable: %s", key, err)
        return []


lake = Lake()
