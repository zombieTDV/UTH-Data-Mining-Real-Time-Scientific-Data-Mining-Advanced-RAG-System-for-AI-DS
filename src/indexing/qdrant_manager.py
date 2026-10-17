"""Qdrant Vector Database Manager for Gold Layer.

Stores contextual chunks and 768-dimensional dense vectors (Nomic v1.5)
in Qdrant with HNSW indexing, cosine similarity, and payload keyword filtering.
Drop-in compatible with LanceDBManager interface.
"""

import logging
import uuid
from typing import Any, Dict, List, Optional, Union
import pandas as pd
import requests

from src.config.settings import settings

logger = logging.getLogger(__name__)

# Standard DNS UUID namespace (matches TypeScript uuidv5)
POINT_UUID_NAMESPACE = uuid.NAMESPACE_DNS


class QdrantManager:
    """Manages the Qdrant vector database for the Gold layer."""

    DEFAULT_COLLECTION_NAME = "scientific_papers_gold"
    VECTOR_DIM = 768

    def __init__(
        self,
        url: Optional[str] = None,
        collection_name: Optional[str] = None,
    ):
        self.url = (url or settings.QDRANT_URL).rstrip("/")
        self.collection_name = collection_name or settings.QDRANT_COLLECTION
        self._client = None
        self._init_client()

    def _init_client(self):
        """Initialize official qdrant-client if installed, otherwise fallback to REST."""
        try:
            from qdrant_client import QdrantClient
            self._client = QdrantClient(url=self.url, timeout=30.0)
            logger.info("[Qdrant] Connected via official qdrant_client to %s", self.url)
        except ImportError:
            logger.info("[Qdrant] qdrant-client not installed; using REST API via %s", self.url)
            self._client = None

    @staticmethod
    def chunk_id_to_uuid(chunk_id: str) -> str:
        """Deterministically generates a UUID string from chunk_id (RFC 4122 v5)."""
        return str(uuid.uuid5(POINT_UUID_NAMESPACE, chunk_id))

    def ensure_collection(self, collection_name: Optional[str] = None) -> bool:
        """Ensures the Qdrant collection exists with 768-D Cosine vectors and payload index."""
        col = collection_name or self.collection_name
        try:
            # Check existence via REST
            resp = requests.get(f"{self.url}/collections/{col}", timeout=5)
            if resp.status_code == 200:
                return True

            # Create collection
            payload = {
                "vectors": {
                    "size": self.VECTOR_DIM,
                    "distance": "Cosine",
                }
            }
            create_resp = requests.put(f"{self.url}/collections/{col}", json=payload, timeout=10)
            if create_resp.status_code in (200, 201):
                logger.info("[Qdrant] Created collection '%s' (dim=%d, distance=Cosine)", col, self.VECTOR_DIM)
                # Create payload indexes for fast filtering
                self._create_payload_index(col, "primary_category", "keyword")
                self._create_payload_index(col, "paper_id", "keyword")
                return True
            else:
                logger.warning("[Qdrant] Failed to create collection '%s': %s", col, create_resp.text)
                return False
        except Exception as e:
            logger.error("[Qdrant] Error ensuring collection '%s': %s", col, e)
            return False

    def _create_payload_index(self, col: str, field_name: str, field_type: str = "keyword"):
        """Creates a payload index on a field for fast filtering."""
        try:
            url = f"{self.url}/collections/{col}/index"
            requests.put(
                url,
                json={"field_name": field_name, "field_schema": field_type},
                timeout=5,
            )
        except Exception as e:
            logger.debug("[Qdrant] Notice on payload index %s: %s", field_name, e)

    def count(self, collection_name: Optional[str] = None) -> int:
        """Returns the total number of vectors in the collection."""
        col = collection_name or self.collection_name
        try:
            resp = requests.get(f"{self.url}/collections/{col}", timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                return data.get("result", {}).get("points_count", 0)
        except Exception as e:
            logger.error("[Qdrant] Failed to get points count: %s", e)
        return 0

    def insert_chunks(
        self,
        chunks: List[Dict[str, Any]],
        table_name: Optional[str] = None,
        batch_size: int = 100,
    ) -> int:
        """Ghi hoặc cập nhật danh sách chunks kèm vector vào Qdrant (upsert)."""
        if not chunks:
            return 0

        col = table_name or self.collection_name
        self.ensure_collection(col)

        points = []
        for c in chunks:
            raw_id = str(c.get("chunk_id", str(uuid.uuid4())))
            point_id = self.chunk_id_to_uuid(raw_id)

            vec = c.get("vector")
            if vec is None:
                continue

            # Convert numpy array to list if necessary
            if hasattr(vec, "tolist"):
                vec = vec.tolist()

            # Copy chunk fields to payload excluding raw vector
            payload = {k: v for k, v in c.items() if k != "vector"}
            # Ensure chunk_id is explicitly recorded in payload
            payload["chunk_id"] = raw_id

            points.append({
                "id": point_id,
                "vector": vec,
                "payload": payload,
            })

        if not points:
            return 0

        # Batch upsert
        upserted_count = 0
        for i in range(0, len(points), batch_size):
            batch = points[i : i + batch_size]
            try:
                resp = requests.put(
                    f"{self.url}/collections/{col}/points?wait=true",
                    json={"points": batch},
                    timeout=30,
                )
                if resp.status_code in (200, 201):
                    upserted_count += len(batch)
                else:
                    logger.error("[Qdrant] Batch upsert error: %s", resp.text)
            except Exception as e:
                logger.error("[Qdrant] Batch upsert exception: %s", e)

        return upserted_count

    def vector_search(
        self,
        query_vector: Union[List[float], Any],
        limit: int = 5,
        filter_expr: Optional[str] = None,
        category_filter: Optional[str] = None,
        table_name: Optional[str] = None,
        **kwargs,
    ) -> pd.DataFrame:
        """Tìm kiếm lân cận gần đúng (ANN) trên vector embeddings trong Qdrant.

        Trả về Pandas DataFrame tương thích với LanceDBManager.vector_search.
        """
        col = table_name or self.collection_name

        if hasattr(query_vector, "tolist"):
            query_vector = query_vector.tolist()

        # Build Qdrant filter
        qdrant_filter: Optional[Dict[str, Any]] = None
        target_category = category_filter

        if not target_category and filter_expr:
            # Parse simple 'primary_category = X' if passed via filter_expr
            import re
            m = re.search(r"primary_category\s*=\s*['\"]([^'\"]+)['\"]", filter_expr)
            if m:
                target_category = m.group(1)

        if target_category:
            qdrant_filter = {
                "must": [
                    {
                        "key": "primary_category",
                        "match": {"value": target_category},
                    }
                ]
            }

        search_payload = {
            "query": query_vector,
            "limit": limit,
            "with_payload": True,
        }
        if qdrant_filter:
            search_payload["filter"] = qdrant_filter

        try:
            # Qdrant v1.10+ query API (or fallback to points/search)
            resp = requests.post(
                f"{self.url}/collections/{col}/points/query",
                json=search_payload,
                timeout=15,
            )
            data = resp.json()
            points = data.get("result", {}).get("points", [])

            # Fallback to legacy /points/search if /points/query is not supported
            if not points and resp.status_code != 200:
                legacy_payload = {
                    "vector": query_vector,
                    "limit": limit,
                    "with_payload": True,
                }
                if qdrant_filter:
                    legacy_payload["filter"] = qdrant_filter
                resp2 = requests.post(
                    f"{self.url}/collections/{col}/points/search",
                    json=legacy_payload,
                    timeout=15,
                )
                points = resp2.json().get("result", [])

            rows = []
            for p in points:
                payload = dict(p.get("payload", {}))
                score = float(p.get("score", 0.0))
                # Cosine distance in LanceDB is (1 - cosine similarity)
                payload["score"] = score
                payload["_distance"] = max(0.0, 1.0 - score)
                payload["id"] = p.get("id")
                rows.append(payload)

            return pd.DataFrame(rows)
        except Exception as e:
            logger.error("[Qdrant] vector_search error: %s", e)
            return pd.DataFrame()
