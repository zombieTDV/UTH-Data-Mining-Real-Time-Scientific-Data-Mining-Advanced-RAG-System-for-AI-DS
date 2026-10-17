"""Indexing module exports."""

import logging
from src.config.settings import settings
from src.indexing.lancedb_manager import LanceDBManager
from src.indexing.qdrant_manager import QdrantManager

logger = logging.getLogger(__name__)


def get_vector_manager():
    """Factory returning the active Vector Store Manager (Qdrant or LanceDB)."""
    provider = settings.VECTOR_STORE_PROVIDER.lower()
    if provider == "qdrant":
        try:
            return QdrantManager()
        except Exception as e:
            logger.warning("[VectorStore] Failed to initialize Qdrant (%s), falling back to LanceDB.", e)
            return LanceDBManager()
    return LanceDBManager()


__all__ = ["LanceDBManager", "QdrantManager", "get_vector_manager"]
