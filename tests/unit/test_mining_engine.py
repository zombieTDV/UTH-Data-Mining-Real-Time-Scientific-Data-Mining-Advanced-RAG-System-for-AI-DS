"""Unit tests for src/mining/mining_engine.py verifying master pipeline orchestration,
checkpoint execution, artifact manifest tracking, and CLI parsing.
"""
from unittest.mock import MagicMock, patch
import pytest

from src.mining.mining_engine import MiningEngine, main


@pytest.fixture
def mock_mining_components():
    """Mocks all 5 sub-engines with valid contract data structures."""
    eda_mock = MagicMock()
    eda_mock.run_full_eda.return_value = {
        "dataset_overview": {"total_papers": 1000},
        "category_distribution": [],
    }

    rule_mock = MagicMock()
    rule_mock.mine_rules.return_value = {
        "rules": [{"antecedents": ["cs.AI"], "consequents": ["cs.LG"], "support": 0.05, "confidence": 0.8, "lift": 1.6}],
    }

    cluster_mock = MagicMock()
    cluster_mock.run_clustering_benchmarks.return_value = {
        "validity_metrics": {"silhouette_score": 0.42, "davies_bouldin": 1.1},
    }

    graph_mock = MagicMock()
    graph_mock.analyze_network.return_value = {
        "network_summary": {"total_nodes": 150, "total_edges": 420},
    }

    trend_mock = MagicMock()
    trend_mock.run_mining.return_value = {
        "anomalies": [{"paper_id": "p1", "anomaly_score": -0.15}],
        "trend_velocity": [{"category": "cs.AI", "momentum": "SURGING"}],
    }

    return {
        "eda": eda_mock,
        "rules": rule_mock,
        "cluster": cluster_mock,
        "graph": graph_mock,
        "trend": trend_mock,
    }


# ==============================================================================
# Master Orchestration Tests
# ==============================================================================

@pytest.mark.unit
def test_mining_engine_run_all_success(mock_mining_components):
    engine = MiningEngine(parquet_path="s3://test-bucket/silver/papers.parquet")

    with patch("src.mining.mining_engine.EdaEngine", return_value=mock_mining_components["eda"]), \
         patch("src.mining.mining_engine.AssociationRuleMiner", return_value=mock_mining_components["rules"]), \
         patch("src.mining.mining_engine.SemanticClusterAnalyzer", return_value=mock_mining_components["cluster"]), \
         patch("src.mining.mining_engine.ScientificGraphMiner", return_value=mock_mining_components["graph"]), \
         patch("src.mining.mining_engine.TrendAnomalyMiner", return_value=mock_mining_components["trend"]), \
         patch("src.mining.mining_engine.put_artifact", side_effect=lambda name, data: f"s3://bucket/gold/mining/{name}") as mock_put:

        manifest = engine.run_all(upload_to_r2=False)

        assert manifest["status"] == "COMPLETED"
        assert manifest["parquet_source"] == "s3://test-bucket/silver/papers.parquet"
        assert "execution_timestamp" in manifest
        assert "total_execution_seconds" in manifest

        # All 5 modules must be logged in manifest
        modules = manifest["modules"]
        assert "eda" in modules
        assert modules["eda"]["total_papers"] == 1000
        assert "association_rules" in modules
        assert modules["association_rules"]["rules_mined"] == 1
        assert "clusters" in modules
        assert modules["clusters"]["silhouette_score"] == 0.42
        assert "graph" in modules
        assert modules["graph"]["total_nodes"] == 150
        assert modules["graph"]["total_edges"] == 420
        assert "trends_anomalies" in modules
        assert modules["trends_anomalies"]["anomalies_detected"] == 1

        # 6 artifacts must be saved (eda, rules, clusters, graph, trends, manifest)
        assert mock_put.call_count == 6
        saved_artifacts = [call.args[0] for call in mock_put.call_args_list]
        expected_artifacts = [
            "eda_summary.json",
            "association_rules.json",
            "clusters.json",
            "graph_coauthorship.json",
            "trends_anomalies.json",
            "mining_manifest.json",
        ]
        assert saved_artifacts == expected_artifacts


@pytest.mark.unit
def test_mining_engine_default_initialization():
    with patch("src.mining.mining_engine.s3_uri", return_value="s3://lakehouse/silver/default.parquet"):
        engine = MiningEngine()
        assert engine.parquet_path == "s3://lakehouse/silver/default.parquet"
        assert "qdrant://" in engine.vector_source


@pytest.mark.unit
def test_mining_engine_cli_main():
    with patch("argparse.ArgumentParser.parse_args") as mock_parse, \
         patch.object(MiningEngine, "run_all") as mock_run_all:
        mock_parse.return_value = MagicMock(parquet="s3://custom/path.parquet")
        main()
        mock_run_all.assert_called_once()
