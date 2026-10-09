"""Integration tests for LanceDB Gold Lakehouse vector storage & search."""
from pathlib import Path
import numpy as np
import pytest
from src.indexing.lancedb_manager import LanceDBManager


@pytest.fixture
def temp_lancedb(tmp_path: Path):
    manager = LanceDBManager(db_path=tmp_path / "gold_lancedb")
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
                "chunk_id": f"chunk_{i:03d}",
                "paper_id": f"2401.{10000 + i}",
                "title": f"Scientific Research Paper {i}",
                "authors": [f"Author {i}A", f"Author {i}B"],
                "primary_category": categories[i % len(categories)],
                "section_title": "Methodology",
                "section_type": "methods",
                "text": f"Detailed technical methodology excerpt for research investigation {i}.",
                "context_text": f"Paper Title: Scientific Research Paper {i}. Section: Methodology",
                "vector": norm_vec,
                "doi": f"10.1145/{3600000 + i}",
            }
        )
    return chunks


@pytest.mark.integration
def test_lancedb_table_creation_and_schema(temp_lancedb, sample_vector_chunks):
    table = temp_lancedb.get_or_create_table(
        table_name="test_papers_gold", data_sample=sample_vector_chunks
    )
    assert table is not None
    assert "test_papers_gold" in temp_lancedb.db.table_names()

    # Verify column presence
    schema_names = table.schema.names
    expected_cols = [
        "chunk_id",
        "paper_id",
        "title",
        "authors",
        "primary_category",
        "section_title",
        "section_type",
        "text",
        "context_text",
        "vector",
        "doi",
    ]
    for col in expected_cols:
        assert col in schema_names, f"Missing expected column: {col}"

    # Verify vector dimension is 768
    vector_field = table.schema.field("vector")
    dim = getattr(vector_field.type, "list_size", None)
    assert dim == 768 or str(vector_field.type).startswith("fixed_size_list") or "768" in str(vector_field.type)


@pytest.mark.integration
def test_lancedb_vector_ann_search(temp_lancedb, sample_vector_chunks):
    temp_lancedb.insert_chunks(sample_vector_chunks, table_name="test_ann")
    
    # Search with the exact vector of chunk_000
    target_vec = sample_vector_chunks[0]["vector"]
    results_df = temp_lancedb.vector_search(
        query_vector=target_vec, limit=3, table_name="test_ann"
    )

    assert len(results_df) == 3
    # Nearest neighbor should be chunk_000 with distance ~ 0
    assert results_df.iloc[0]["chunk_id"] == "chunk_000"
    if "_distance" in results_df.columns:
        assert results_df.iloc[0]["_distance"] < 1e-4


@pytest.mark.integration
def test_lancedb_prefiltered_vector_search(temp_lancedb, sample_vector_chunks):
    temp_lancedb.insert_chunks(sample_vector_chunks, table_name="test_filter")

    query_vec = sample_vector_chunks[0]["vector"]
    results_df = temp_lancedb.vector_search(
        query_vector=query_vec,
        limit=5,
        filter_expr="primary_category = 'cs.CV'",
        table_name="test_filter",
    )

    assert len(results_df) > 0
    for _, row in results_df.iterrows():
        assert row["primary_category"] == "cs.CV"


@pytest.mark.integration
def test_lancedb_upsert_merge(temp_lancedb, sample_vector_chunks):
    temp_lancedb.insert_chunks(sample_vector_chunks[:5], table_name="test_upsert")
    table = temp_lancedb.db.open_table("test_upsert")
    assert len(table) == 5

    # Update chunk_000 text and insert a new chunk
    updated_chunk = dict(sample_vector_chunks[0])
    updated_chunk["text"] = "MODIFIED TEXT CONTENT"

    new_chunk = dict(sample_vector_chunks[5])
    
    temp_lancedb.insert_chunks([updated_chunk, new_chunk], table_name="test_upsert")
    
    # Should now have 6 total rows
    table = temp_lancedb.db.open_table("test_upsert")
    assert len(table) == 6

    # Verify updated content
    df = table.search().where("chunk_id = 'chunk_000'").limit(1).to_pandas()
    assert df.iloc[0]["text"] == "MODIFIED TEXT CONTENT"
