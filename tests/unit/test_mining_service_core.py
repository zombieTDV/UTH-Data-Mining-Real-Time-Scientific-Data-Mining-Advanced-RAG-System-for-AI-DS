import pytest
from unittest.mock import MagicMock, patch
from backend.app.services.mining_service import MiningService
from backend.app.schemas.mining import (
    EdaResponse,
    AssociationRulesResponse,
    ClustersResponse,
    GraphResponse,
    TrendsResponse,
)


@pytest.fixture
def mining_service():
    return MiningService()


def test_mining_load_json_success(mining_service):
    with patch("backend.app.services.mining_service.lake.get_json", return_value={"status": "OK"}):
        res = mining_service._load_json("test.json")
        assert res == {"status": "OK"}


def test_mining_load_json_not_found(mining_service):
    with patch("backend.app.services.mining_service.lake.get_json", return_value=None):
        with pytest.raises(FileNotFoundError, match="Mining artifact 'missing.json' not found"):
            mining_service._load_json("missing.json")


def test_get_eda_response(mining_service):
    mock_eda = {
        "dataset_overview": {
            "total_papers": 100,
            "fulltext_papers_count": 50,
            "enriched_html_papers": 40,
            "enrichment_ratio": 0.4,
            "total_math_formulas": 320,
            "total_words": 150000,
            "avg_sections_per_paper": 6.2,
            "avg_math_per_paper": 3.2,
            "avg_words_per_paper": 1500.0,
            "earliest_publication": "2020-01-01",
            "latest_publication": "2024-01-01"
        },
        "category_distribution": [
            {
                "category": "cs.AI",
                "count": 100,
                "percentage": 100.0,
                "total_math_formulas": 320,
                "avg_words": 1500.0
            }
        ],
        "temporal_distribution": [
            {"period": "2024-Q1", "count": 100}
        ],
        "math_and_content_stats": {"median_words": 1400},
        "top_authors": [
            {"author": "Author A", "paper_count": 10}
        ],
        "category_cooccurrence": [
            {"category_a": "cs.AI", "category_b": "cs.CV", "cooccurrence_count": 15}
        ]
    }
    with patch.object(mining_service, "_load_json", return_value=mock_eda):
        resp = mining_service.get_eda()
        assert isinstance(resp, EdaResponse)
        assert resp.dataset_overview.total_papers == 100
        assert resp.category_distribution[0].category == "cs.AI"


def test_get_association_rules(mining_service):
    mock_rules = {
        "summary": {"total_rules": 1},
        "frequent_itemsets": [{"itemset": ["cs.AI", "cs.CV"], "support": 0.15}],
        "rules": [
            {
                "antecedents": ["cs.CV"],
                "consequents": ["cs.AI"],
                "support": 0.15,
                "confidence": 0.85,
                "lift": 2.1,
                "leverage": 0.05,
                "conviction": 1.4
            }
        ]
    }
    with patch.object(mining_service, "_load_json", return_value=mock_rules):
        resp = mining_service.get_association_rules()
        assert isinstance(resp, AssociationRulesResponse)
        assert len(resp.rules) == 1
        assert resp.rules[0].lift == 2.1


def test_get_clusters_enrichment(mining_service):
    mock_clusters = {
        "summary": {"n_clusters": 2},
        "validity_metrics": {"silhouette": 0.42, "davies_bouldin": 1.1},
        "cluster_profiles": [
            {
                "cluster_id": 0,
                "size": 50,
                "percentage": 50.0,
                "dominant_categories": [{"category": "cs.AI", "count": 40}],
                "sample_titles": ["Reasoning with LLMs"]
            },
            {
                "cluster_id": 99,
                "size": 10,
                "percentage": 10.0,
                "dominant_categories": [{"category": "stat.ML", "count": 10}],
                "sample_titles": ["Custom Research Paper"]
            },
        ],
        "scatter_2d": [
            {"x": 1.2, "y": -0.5, "cluster": 0, "category": "cs.AI", "title": "Paper 1", "paper_id": "2401.01"}
        ]
    }
    with patch.object(mining_service, "_load_json", return_value=mock_clusters):
        resp = mining_service.get_clusters()
        assert isinstance(resp, ClustersResponse)
        assert len(resp.cluster_profiles) == 2
        # Cluster 0 should receive curated metadata
        c0 = resp.cluster_profiles[0]
        assert c0.topic_label == "Large Language Models & In-Context Reasoning"
        assert "Prompt engineering" in c0.topic_subtitle

        # Cluster 99 should receive default topic label
        c99 = resp.cluster_profiles[1]
        assert c99.topic_label == "Topic Cluster #99"
        assert c99.topic_subtitle == "Machine Learning Research"


def test_get_graph(mining_service):
    mock_graph = {
        "network_summary": {"total_nodes": 1, "total_edges": 1, "density": 0.05},
        "top_influencers": [{"name": "Author One", "score": 0.95}],
        "communities": [{"id": 0, "size": 1, "members": ["Author One"]}],
        "graph_export": {
            "nodes": [{"id": "author1", "label": "Author One", "pagerank": 0.015, "degree": 3, "community": 0, "paper_count": 5}],
            "links": [{"source": "author1", "target": "author2", "weight": 2}]
        }
    }
    with patch.object(mining_service, "_load_json", return_value=mock_graph):
        resp = mining_service.get_graph()
        assert isinstance(resp, GraphResponse)
        assert resp.network_summary["total_nodes"] == 1
        assert len(resp.top_influencers) == 1


def test_get_trends(mining_service):
    mock_trends = {
        "summary": {"total_anomalies": 1},
        "anomalies": [
            {
                "paper_id": "2401.9999",
                "title": "Anomalous Math Outlier",
                "primary_category": "math.PR",
                "anomaly_score": 0.98,
                "math_count": 500,
                "word_count": 12000,
                "author_count": 12,
                "category_count": 4,
                "outlier_reasons": ["Extreme math formula density"]
            }
        ],
        "trend_velocity": [
            {
                "category": "cs.AI",
                "recent_quarter_papers": 120,
                "previous_quarter_papers": 80,
                "growth_rate_pct": 50.0,
                "momentum": "accelerating",
                "all_time_papers": 500
            }
        ]
    }
    with patch.object(mining_service, "_load_json", return_value=mock_trends):
        resp = mining_service.get_trends()
        assert isinstance(resp, TrendsResponse)
        assert len(resp.anomalies) == 1
        assert resp.anomalies[0].anomaly_score == 0.98
        assert resp.trend_velocity[0].momentum == "accelerating"


def test_get_manifest(mining_service):
    with patch.object(mining_service, "_load_json", return_value={"status": "COMPLETED", "total_papers": 500}):
        m = mining_service.get_manifest()
        assert m["status"] == "COMPLETED"

    with patch.object(mining_service, "_load_json", side_effect=Exception("Missing")):
        m_fallback = mining_service.get_manifest()
        assert m_fallback == {"status": "STANDBY"}


@pytest.mark.asyncio
async def test_stream_telemetry(mining_service):
    with patch.object(mining_service, "get_manifest", return_value={"status": "PROCESSING", "total_execution_seconds": 12.5, "modules": {"eda": {"total_papers": 300}}}):
        with patch("asyncio.sleep", return_value=None):
            gen = mining_service.stream_telemetry()
            first_event = await anext(gen)
            assert "PROCESSING" in first_event
            assert "300" in first_event
            await gen.aclose()
