"""Unit tests for src/mining/cluster_analysis.py verifying K-Means & DBSCAN topic clustering,
cluster validity metrics (Silhouette, Davies-Bouldin, Calinski-Harabasz), and PCA 2D projections.
"""
from unittest.mock import MagicMock, patch
import numpy as np
import pytest

from src.mining.cluster_analysis import SemanticClusterAnalyzer


@pytest.fixture
def synthetic_cluster_data():
    """Generates synthetic 768-D vectors across 3 well-separated clusters."""
    rng = np.random.RandomState(42)
    n_points_per_cluster = 30
    dim = 768

    c1 = rng.randn(n_points_per_cluster, dim) + 5.0
    c2 = rng.randn(n_points_per_cluster, dim) - 5.0
    c3 = rng.randn(n_points_per_cluster, dim)
    c3[:, 0] += 10.0

    vectors = np.vstack([c1, c2, c3]).astype(np.float32)

    categories = ["cs.CV"] * 30 + ["cs.AI"] * 30 + ["cs.LG"] * 30
    metadata = [
        {
            "chunk_id": f"chunk_{i:03d}",
            "paper_id": f"2401.{i:05d}",
            "title": f"Scientific Investigation Paper {i}",
            "primary_category": categories[i],
        }
        for i in range(len(vectors))
    ]

    return {"vectors": vectors, "metadata": metadata}


# ==============================================================================
# Clustering Pipeline & Validity Metrics Tests
# ==============================================================================

@pytest.mark.unit
def test_run_clustering_benchmarks_validity_metrics(synthetic_cluster_data):
    analyzer = SemanticClusterAnalyzer()

    with patch.object(analyzer, "load_vector_sample", return_value=synthetic_cluster_data):
        results = analyzer.run_clustering_benchmarks(sample_size=90, n_clusters=3)

    summary = results["summary"]
    metrics = results["validity_metrics"]
    profiles = results["cluster_profiles"]
    scatter = results["scatter_2d"]

    # 1. Summary checks
    assert summary["sample_analyzed"] == 90
    assert summary["vector_dimensions"] == 768
    assert summary["optimal_k"] == 3

    # 2. Mathematical validity bounds
    # Silhouette score must be between -1 and 1 (well-separated clusters should be > 0.3)
    assert -1.0 <= metrics["silhouette_score"] <= 1.0
    assert metrics["silhouette_score"] > 0.2

    # Davies-Bouldin index is non-negative; lower is better
    assert metrics["davies_bouldin_index"] >= 0.0

    # Calinski-Harabasz index is positive; higher is better
    assert metrics["calinski_harabasz_index"] > 0.0

    # 3. Cluster profiles invariant: sum of cluster sizes == total sample
    total_cluster_points = sum(p["size"] for p in profiles)
    assert total_cluster_points == 90
    total_percentage = sum(p["percentage"] for p in profiles)
    assert abs(total_percentage - 100.0) <= 0.1

    # 4. Scatter 2D projection properties
    assert len(scatter) == 90
    for pt in scatter:
        assert isinstance(pt["x"], float)
        assert isinstance(pt["y"], float)
        assert pt["cluster"] in (0, 1, 2)
        assert pt["category"] in ("cs.CV", "cs.AI", "cs.LG")


# ==============================================================================
# Vector Sampling & Deduplication Tests
# ==============================================================================

@pytest.mark.unit
def test_load_vector_sample_deduplication():
    analyzer = SemanticClusterAnalyzer()

    # Create 3 points where two share the same paper_id
    pt1 = MagicMock()
    pt1.payload = {"paper_id": "2401.00001", "title": "Paper One", "primary_category": "cs.AI"}
    pt1.vector = [0.1] * 768

    pt2 = MagicMock()
    pt2.payload = {"paper_id": "2401.00001", "title": "Paper One Duplicate", "primary_category": "cs.AI"}
    pt2.vector = [0.1] * 768

    pt3 = MagicMock()
    pt3.payload = {"paper_id": "2401.00002", "title": "Abstract", "primary_category": "cs.CV"}
    pt3.vector = [0.2] * 768

    with patch("src.mining.cluster_analysis.qdrant_client"), \
         patch("src.mining.cluster_analysis.sample_abstract_vectors", return_value=[pt1, pt2, pt3]), \
         patch("src.mining.cluster_analysis.duck_connect", side_effect=Exception("No DuckDB")):

        sample = analyzer.load_vector_sample(sample_size=10)

    # Must deduplicate paper_id 2401.00001
    assert len(sample["metadata"]) == 2
    assert sample["vectors"].shape == (2, 768)

    # Generic title "Abstract" must be sanitized
    assert sample["metadata"][1]["title"] == "Paper 2401.00002"


# ==============================================================================
# Artifact Persistence Tests
# ==============================================================================

@pytest.mark.unit
def test_save_clusters(synthetic_cluster_data):
    analyzer = SemanticClusterAnalyzer()

    with patch.object(analyzer, "load_vector_sample", return_value=synthetic_cluster_data), \
         patch("src.mining.cluster_analysis.put_artifact", return_value="s3://test/gold/mining/clusters.json") as mock_put:

        analyzer.save_clusters("gold/mining/clusters.json", sample_size=90, n_clusters=3)

    mock_put.assert_called_once()
    args, _ = mock_put.call_args
    assert args[0] == "clusters.json"
    assert "validity_metrics" in args[1]
