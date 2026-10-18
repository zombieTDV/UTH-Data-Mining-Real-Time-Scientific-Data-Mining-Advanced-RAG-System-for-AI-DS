"""MinIO / Qdrant access for the mining engine.

DuckDB reads Silver Parquet straight from MinIO over S3 (httpfs); artifacts are written back as JSON to
MinIO (gold/mining/). Nothing is read from or written to the local disk.
"""

import logging
import random
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import duckdb

from src.config.settings import settings
from src.storage.lakehouse_io import LakehouseIO
from src.storage.minio_client import StorageClient

logger = logging.getLogger("mining.lake")

MINING_PREFIX = "gold/mining"
SILVER_PRIMARY_KEY = "silver/papers/**/*.parquet"  # all tiers (year partitions, compacted files and streaming parts)

_storage: Optional[StorageClient] = None


def storage() -> StorageClient:
    global _storage
    if _storage is None:
        _storage = StorageClient()
    return _storage


def s3_uri(key: str) -> str:
    return f"s3://{settings.MINIO_BUCKET_NAME}/{key.lstrip('/')}"


def key_of(path_or_uri: str) -> str:
    prefix = f"s3://{settings.MINIO_BUCKET_NAME}/"
    return path_or_uri[len(prefix):] if path_or_uri.startswith(prefix) else path_or_uri


def path_exists(path_or_uri: str) -> bool:
    """True when the MinIO object exists (bucket key or s3:// URI); for a glob, when anything matches its prefix."""
    key = key_of(path_or_uri)
    if "*" in key:
        prefix = key.split("*", 1)[0]
        return any(o["key"].endswith(".parquet") for o in storage().list_objects(prefix, max_keys=1000))
    return storage().object_exists(key)


def _q(value: str) -> str:
    return value.replace("'", "''")


def duck_connect() -> duckdb.DuckDBPyConnection:
    """In-memory DuckDB with httpfs configured for the project's MinIO endpoint."""
    settings.validate_storage()
    con = duckdb.connect(database=":memory:")
    con.execute("INSTALL httpfs")
    con.execute("LOAD httpfs")
    ep = urlparse(settings.MINIO_ENDPOINT_URL)
    con.execute(f"SET s3_endpoint='{_q(ep.netloc)}'")
    con.execute(f"SET s3_access_key_id='{_q(settings.MINIO_ACCESS_KEY_ID)}'")
    con.execute(f"SET s3_secret_access_key='{_q(settings.MINIO_SECRET_ACCESS_KEY)}'")
    con.execute("SET s3_url_style='path'")
    con.execute("SET s3_region='us-east-1'")
    con.execute(f"SET s3_use_ssl={'true' if ep.scheme == 'https' else 'false'}")
    return con


def put_artifact(filename: str, payload: Any) -> str:
    """Write a JSON artifact to gold/mining/ in MinIO and return its s3:// URI."""
    key = f"{MINING_PREFIX}/{filename}"
    LakehouseIO(storage()).put_json(key, payload)
    return s3_uri(key)


# ---------------------------------------------------------------------------- Qdrant
def qdrant_client():
    from qdrant_client import QdrantClient

    return QdrantClient(
        url=settings.QDRANT_URL,
        api_key=getattr(settings, "QDRANT_API_KEY", None) or None,
        timeout=60.0,
        check_compatibility=False,
    )


def ensure_keyword_index(client, field: str) -> None:
    """Idempotently index a payload field so Qdrant can filter and facet on it."""
    from qdrant_client import models

    try:
        client.create_payload_index(settings.QDRANT_COLLECTION, field_name=field, field_schema=models.PayloadSchemaType.KEYWORD)
    except Exception as e:
        logger.debug("create_payload_index(%s): %s", field, e)


def section_facets(client, limit: int = 20) -> List[Dict[str, Any]]:
    """Real chunk counts per section_type from Qdrant."""
    ensure_keyword_index(client, "section_type")
    res = client.facet(settings.QDRANT_COLLECTION, key="section_type", limit=limit)
    return [{"section_type": str(h.value), "chunks": int(h.count)} for h in res.hits]


def sample_abstract_vectors(client, sample_size: int, seed: int = 42):
    """Random sample of abstract-chunk points (one per paper) with vectors and payload."""
    from qdrant_client import models

    ensure_keyword_index(client, "section_type")
    flt = models.Filter(must=[models.FieldCondition(key="section_type", match=models.MatchValue(value="abstract"))])
    res = client.query_points(
        settings.QDRANT_COLLECTION,
        query=models.SampleQuery(sample=models.Sample.RANDOM),
        query_filter=flt,
        limit=sample_size + 1000,
        with_vectors=True,
        with_payload=True,
    )
    pts = list(res.points)
    random.Random(seed).shuffle(pts)
    return pts
