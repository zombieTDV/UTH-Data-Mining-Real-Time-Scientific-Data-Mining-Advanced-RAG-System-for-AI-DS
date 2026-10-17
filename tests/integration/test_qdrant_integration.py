"""Integration tests for Qdrant Gold Lakehouse vector storage & search."""
import pytest
import numpy as np
from src.indexing.qdrant_manager import QdrantManager


@pytest.fixture
def temp_qdrant():
    manager = QdrantManager(collection_name="test_papers_gold_integration")
    manager.ensure_collection()
    return manager


@pytest.fixture
def sample_vector_chunks():
    rng = np.random.RandomState(42)
    chunks = []
    categories = ["cs.CV", "cs.AI", "cs.LG"]
    for i in range(10):
        raw_vec = rng.randn(768).astype(np.float32)
        norm_vec = (raw_vec / np.linalg.norm(raw_vec)).tolist()
        chunks.append(
            {
                "chunk_id": f"qdrant_test_chunk_{i:03d}",
                "paper_id": f"2401.{10000 + i}",
                "title": f"Scientific Research Paper {i}",
                "authors": [f"Author {i}A", f"Author {i}B"],
                "primary_category": categories[i % len(categories)],
                "section_title": "Methodology",
                "section_type": "methods",
                "text": f"Detailed technical methodology excerpt for research investigation {i}.",
                "vector": norm_vec,
            }
        )
    return chunks


@pytest.mark.integration
def test_qdrant_collection_creation_and_upsert(temp_qdrant, sample_vector_chunks):
    inserted = temp_qdrant.insert_chunks(sample_vector_chunks)
    assert inserted == len(sample_vector_chunks)
    assert temp_qdrant.count() >= len(sample_vector_chunks)


@pytest.mark.integration
def test_qdrant_vector_search(temp_qdrant, sample_vector_chunks):
    temp_qdrant.insert_chunks(sample_vector_chunks)
    query_vector = sample_vector_chunks[0]["vector"]
    results = temp_qdrant.vector_search(query_vector=query_vector, limit=3)
    assert len(results) > 0
    assert "paper_id" in results.columns
    assert "_distance" in results.columns
    assert results.iloc[0]["paper_id"] == sample_vector_chunks[0]["paper_id"]


@pytest.mark.integration
def test_qdrant_category_filter(temp_qdrant, sample_vector_chunks):
    temp_qdrant.insert_chunks(sample_vector_chunks)
    query_vector = sample_vector_chunks[0]["vector"]
    results = temp_qdrant.vector_search(
        query_vector=query_vector,
        limit=5,
        category_filter="cs.CV",
    )
    assert len(results) > 0
    for _, r in results.iterrows():
        assert r["primary_category"] == "cs.CV"
