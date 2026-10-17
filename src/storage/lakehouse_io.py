"""In-memory Lakehouse I/O on top of MinIO.

Pipelines never touch the local disk: JSON, text, Parquet and checkpoints are
serialized in memory and read/written straight to MinIO keys.
"""

import io
import json
import logging
from typing import Any, Dict, Iterable, List, Optional, Sequence

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from botocore.exceptions import ClientError

from src.storage.minio_client import StorageClient

logger = logging.getLogger("lakehouse_io")

PARQUET_CT = "application/vnd.apache.parquet"
_MISSING_CODES = ("404", "NoSuchKey", "NotFound")


class LakehouseIO:
    """Read/write JSON, text, and Parquet objects in MinIO without local files."""

    def __init__(self, storage: Optional[StorageClient] = None):
        self.storage = storage or StorageClient()

    # ---------------- JSON / text ----------------
    def put_json(self, key: str, payload: Any) -> Dict[str, Any]:
        return self.storage.upload_json(payload, key)

    def put_text(self, key: str, text: str, content_type: str = "text/plain; charset=utf-8") -> Dict[str, Any]:
        return self.storage.upload_text(text, key, content_type=content_type)

    def get_json(self, key: str, default: Any = None) -> Any:
        """Return parsed JSON, or `default` when the key does not exist."""
        try:
            return self.storage.get_json(key)
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") in _MISSING_CODES:
                return default
            raise

    def exists(self, key: str) -> bool:
        return self.storage.object_exists(key)

    # ---------------- Parquet ----------------
    def read_parquet(self, key: str) -> Optional[pd.DataFrame]:
        """Return a DataFrame, or None when the key does not exist."""
        try:
            raw = self.storage.get_bytes(key)
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") in _MISSING_CODES:
                return None
            raise
        return pq.read_table(io.BytesIO(raw)).to_pandas()

    def write_parquet(self, key: str, data: Any, schema: Optional[pa.Schema] = None) -> Dict[str, Any]:
        """Serialize a DataFrame/Table to zstd Parquet in memory and upload it."""
        if isinstance(data, pa.Table):
            table = data
        else:
            table = pa.Table.from_pandas(data, schema=schema, preserve_index=False)
        buf = io.BytesIO()
        pq.write_table(table, buf, compression="zstd")
        return self.storage.upload_bytes(buf.getvalue(), key, content_type=PARQUET_CT)

    def upsert_parquet(
        self,
        key: str,
        new_df: pd.DataFrame,
        subset: Sequence[str] = ("abstract_hash",),
        schema: Optional[pa.Schema] = None,
    ) -> Dict[str, Any]:
        """Merge new rows into the Parquet at `key` (last write wins on `subset`)."""
        existing = self.read_parquet(key)
        combined = new_df if existing is None else pd.concat([existing, new_df], ignore_index=True)
        usable = [c for c in subset if c in combined.columns]
        if usable:
            key_col = "__dedup_key__"
            if "abstract_hash" in usable and "paper_id" in combined.columns:
                # Rows without a hash must not collapse into one another: fall back to the paper id
                hashes = combined["abstract_hash"]
                missing = hashes.isna() | (hashes.astype(str).str.strip() == "")
                combined[key_col] = hashes.astype(str).where(~missing, "pid:" + combined["paper_id"].astype(str))
                others = [c for c in usable if c != "abstract_hash"]
                combined = combined.drop_duplicates(subset=[key_col] + others, keep="last").drop(columns=[key_col])
            else:
                combined = combined.drop_duplicates(subset=usable, keep="last")
        if schema is not None:
            for col in schema.names:
                if col not in combined.columns:
                    combined[col] = None
            combined = combined[schema.names]
        res = self.write_parquet(key, combined, schema=schema)
        res["rows"] = len(combined)
        return res

    def list_keys(self, prefix: str, max_keys: int = 100000) -> List[str]:
        return [o["key"] for o in self.storage.list_objects(prefix, max_keys=max_keys)]
