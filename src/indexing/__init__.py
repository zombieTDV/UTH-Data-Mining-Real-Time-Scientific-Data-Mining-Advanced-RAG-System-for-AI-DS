"""Indexing module exports."""

from src.indexing.qdrant_manager import QdrantManager


def get_vector_manager() -> QdrantManager:
    """Factory returning the active Qdrant Vector Store Manager."""
    return QdrantManager()


__all__ = ["QdrantManager", "get_vector_manager"]
