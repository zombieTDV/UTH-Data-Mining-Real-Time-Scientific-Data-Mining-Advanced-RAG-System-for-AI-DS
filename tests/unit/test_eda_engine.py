"""Unit tests for src/mining/eda_engine.py verifying dual-scale exploratory data analysis,
quantiles, category distributions, author unnests, and correlation matrices.
"""
from unittest.mock import MagicMock, patch
import duckdb
import pytest

from src.mining.eda_engine import EdaEngine


@pytest.fixture
def mock_duckdb_eda():
    """Sets up an in-memory DuckDB connection pre-populated with synthetic academic papers."""
    con = duckdb.connect(database=":memory:")

    # Populate synthetic academic papers
    con.execute("""
    CREATE TABLE synthetic_papers (
        paper_id VARCHAR,
        title VARCHAR,
        abstract VARCHAR,
        authors VARCHAR[],
        categories VARCHAR[],
        primary_category VARCHAR,
        published_date VARCHAR,
        total_sections INTEGER,
        total_math_count INTEGER,
        total_words INTEGER,
        clean_full_text VARCHAR,
        cite_count INTEGER
    );
    """)

    sample_rows = [
        ("2401.00001", "Scaling Laws for Visual Representation Learning", "Abstract 1", ["Alice Smith", "Bob Jones"], ["cs.CV", "cs.AI"], "cs.CV", "2024-01-15", 5, 25, 4500, "Full text 1", 12),
        ("2401.00002", "Deep Equilibrium Diffusion Models", "Abstract 2", ["Bob Jones", "Charlie Brown"], ["cs.AI", "cs.LG"], "cs.AI", "2024-01-20", 4, 40, 5200, "Full text 2", 8),
        ("2401.00003", "PAC-Bayes Generalization for Langevin Dynamics", "Abstract 3", ["Alice Smith"], ["cs.LG", "stat.ML"], "cs.LG", "2024-02-01", 6, 85, 6100, "Full text 3", 24),
        ("2401.00004", "Zero-Shot Multimodal Instruction Tuning", "Abstract 4", ["David Wilson", "Alice Smith"], ["cs.CV", "cs.CL"], "cs.CV", "2024-02-15", 3, 10, 3800, "Full text 4", 5),
        ("2401.00005", "Direct Preference Optimization Invariance", "Abstract 5", ["Eve Miller"], ["cs.AI"], "cs.AI", "2024-03-01", 1, 0, 800, "Abstract only", 2),
    ]

    for r in sample_rows:
        con.execute("INSERT INTO synthetic_papers VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", r)

    con.execute("CREATE VIEW catalog_view AS SELECT * FROM synthetic_papers")
    con.execute("CREATE VIEW fulltext_view AS SELECT * FROM synthetic_papers")

    return con


@pytest.fixture
def eda_engine(mock_duckdb_eda):
    with patch("src.mining.eda_engine.duck_connect", return_value=mock_duckdb_eda):
        with patch("src.mining.eda_engine.path_exists", return_value=False):
            engine = object.__new__(EdaEngine)
            engine.catalog_path = "s3://test/catalog.parquet"
            engine.fulltext_path = "s3://test/fulltext.parquet"
            engine.con = mock_duckdb_eda
            return engine


# ==============================================================================
# Overview & Distribution Metrics Tests
# ==============================================================================

@pytest.mark.unit
def test_get_overview_metrics(eda_engine):
    metrics = eda_engine._get_overview_metrics()

    assert metrics["total_papers"] == 5
    assert metrics["fulltext_papers_count"] == 5
    # 4 papers have total_sections > 1
    assert metrics["enriched_html_papers"] == 4
    assert metrics["enrichment_ratio"] == 0.8
    assert metrics["total_math_formulas"] == 25 + 40 + 85 + 10 + 0  # 160
    assert metrics["earliest_publication"] == "2024-01-15"
    assert metrics["latest_publication"] == "2024-03-01"
    assert metrics["avg_math_per_paper"] == 32.0


@pytest.mark.unit
def test_get_category_distribution(eda_engine):
    cat_dist = eda_engine._get_category_distribution()

    assert len(cat_dist) == 3
    categories = {c["category"]: c for c in cat_dist}

    # cs.CV (2), cs.AI (2), cs.LG (1)
    assert categories["cs.CV"]["count"] == 2
    assert categories["cs.AI"]["count"] == 2
    assert categories["cs.LG"]["count"] == 1

    total_pct = sum(c["percentage"] for c in cat_dist)
    assert abs(total_pct - 100.0) <= 0.1


@pytest.mark.unit
def test_get_temporal_distribution(eda_engine):
    temporal = eda_engine._get_temporal_distribution()

    # Periods: 2024-01 (2), 2024-02 (2), 2024-03 (1)
    assert len(temporal) == 3
    assert temporal[0]["period"] == "2024-01"
    assert temporal[0]["count"] == 2
    assert temporal[1]["period"] == "2024-02"
    assert temporal[1]["count"] == 2
    assert temporal[2]["period"] == "2024-03"
    assert temporal[2]["count"] == 1


# ==============================================================================
# Statistical Quantiles & Author Unnesting Tests
# ==============================================================================

@pytest.mark.unit
def test_get_math_and_length_stats_monotonic_quantiles(eda_engine):
    stats = eda_engine._get_math_and_length_stats()

    mq = stats["math_quantiles"]
    wq = stats["word_quantiles"]

    # Verify mathematical ordering: p25 <= median <= p75 <= p95 <= max
    assert mq["p25"] <= mq["median"] <= mq["p75"] <= mq["p95"] <= mq["max"]
    assert wq["p25"] <= wq["median"] <= wq["p75"] <= wq["p95"] <= wq["max"]
    assert mq["max"] == 85
    assert wq["max"] == 6100


@pytest.mark.unit
def test_get_top_authors_unnesting(eda_engine):
    top_authors = eda_engine._get_top_authors(limit=5)
    author_counts = {a["author"]: a["paper_count"] for a in top_authors}

    # Alice Smith appears in papers 1, 3, 4 -> count = 3
    # Bob Jones appears in papers 1, 2 -> count = 2
    assert author_counts["Alice Smith"] == 3
    assert author_counts["Bob Jones"] == 2


@pytest.mark.unit
def test_get_category_cooccurrence(eda_engine):
    cooccur = eda_engine._get_category_cooccurrence(limit=10)
    # Pairs: (cs.AI, cs.CV) in paper 1, (cs.AI, cs.LG) in paper 2, (cs.LG, stat.ML) in paper 3, (cs.CL, cs.CV) in paper 4
    assert len(cooccur) >= 3
    for pair in cooccur:
        assert pair["category_a"] < pair["category_b"]
        assert pair["cooccurrence_count"] >= 1


# ==============================================================================
# Correlation Matrix Invariants
# ==============================================================================

@pytest.mark.unit
def test_get_correlation_matrix_invariants(eda_engine):
    corr = eda_engine._get_correlation_matrix()

    assert "pearson" in corr
    assert "spearman" in corr
    pearson = corr["pearson"]

    # Pearson diagonal self-correlation must be 1.0
    for feat in ["words", "math", "sections", "authors"]:
        assert pearson[feat][feat]["r"] == 1.0

    # Symmetry invariant: r(words, math) == r(math, words)
    assert pearson["words"]["math"]["r"] == pearson["math"]["words"]["r"]
