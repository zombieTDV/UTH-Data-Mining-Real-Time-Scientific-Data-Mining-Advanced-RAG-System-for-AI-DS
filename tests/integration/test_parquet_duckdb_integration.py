"""Integration tests for DuckDB analytical querying over Silver Parquet catalogs."""
from pathlib import Path
import duckdb
import pandas as pd
import pytest


@pytest.fixture
def sample_parquet_catalog(tmp_path: Path):
    parquet_path = tmp_path / "papers.parquet"
    data = [
        {
            "paper_id": "2401.00001",
            "title": "Scaling Vision Transformers for Robotics",
            "authors": ["Alice Smith", "Bob Jones"],
            "primary_category": "cs.CV",
            "categories": ["cs.CV", "cs.RO"],
            "abstract": "We evaluate vision transformer scaling laws in multi-task robotic manipulation.",
            "year": 2024,
            "doi": "10.1145/3600001",
            "citation_count": 42,
        },
        {
            "paper_id": "2401.00002",
            "title": "Diffusion Guidance Optimization",
            "authors": ["Alice Smith", "Charlie Brown"],
            "primary_category": "cs.AI",
            "categories": ["cs.AI", "cs.LG"],
            "abstract": "Guidance intervals improve sample fidelity in latent diffusion models.",
            "year": 2024,
            "doi": "10.1145/3600002",
            "citation_count": 88,
        },
        {
            "paper_id": "2401.00003",
            "title": "Reinforcement Learning from Human Feedback at Scale",
            "authors": ["David Miller"],
            "primary_category": "cs.LG",
            "categories": ["cs.LG", "stat.ML"],
            "abstract": "Theoretical bounds on RLHF reward model generalization.",
            "year": 2025,
            "doi": "10.1145/3600003",
            "citation_count": 15,
        },
    ]
    df = pd.DataFrame(data)
    df.to_parquet(parquet_path, index=False)
    return parquet_path


@pytest.mark.integration
def test_duckdb_read_parquet_schema(sample_parquet_catalog):
    con = duckdb.connect()
    res = con.execute(f"DESCRIBE SELECT * FROM '{sample_parquet_catalog.as_posix()}'").fetchall()
    column_names = [r[0] for r in res]
    assert "paper_id" in column_names
    assert "title" in column_names
    assert "authors" in column_names
    assert "primary_category" in column_names
    assert "citation_count" in column_names
    assert "year" in column_names


@pytest.mark.integration
def test_duckdb_category_aggregation(sample_parquet_catalog):
    con = duckdb.connect()
    sql = f"""
        SELECT primary_category, count(*) as count, avg(citation_count) as avg_citations
        FROM '{sample_parquet_catalog.as_posix()}'
        GROUP BY primary_category
        ORDER BY count DESC
    """
    df = con.execute(sql).df()
    assert len(df) == 3
    assert set(df["primary_category"].tolist()) == {"cs.CV", "cs.AI", "cs.LG"}
    cv_row = df[df["primary_category"] == "cs.CV"].iloc[0]
    assert cv_row["count"] == 1
    assert cv_row["avg_citations"] == 42.0


@pytest.mark.integration
def test_duckdb_author_search_filter(sample_parquet_catalog):
    con = duckdb.connect()
    # List contains Alice Smith
    sql = f"""
        SELECT paper_id, title
        FROM '{sample_parquet_catalog.as_posix()}'
        WHERE list_contains(authors, 'Alice Smith')
        ORDER BY paper_id ASC
    """
    df = con.execute(sql).df()
    assert len(df) == 2
    assert df.iloc[0]["paper_id"] == "2401.00001"
    assert df.iloc[1]["paper_id"] == "2401.00002"


@pytest.mark.integration
def test_duckdb_temporal_trend(sample_parquet_catalog):
    con = duckdb.connect()
    sql = f"""
        SELECT year, count(*) as count
        FROM '{sample_parquet_catalog.as_posix()}'
        GROUP BY year
        ORDER BY year ASC
    """
    df = con.execute(sql).df()
    assert len(df) == 2
    assert df[df["year"] == 2024]["count"].values[0] == 2
    assert df[df["year"] == 2025]["count"].values[0] == 1
