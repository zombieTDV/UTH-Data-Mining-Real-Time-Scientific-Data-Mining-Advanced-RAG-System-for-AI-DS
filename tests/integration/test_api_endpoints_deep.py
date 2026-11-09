import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.schemas.search import ChunkDto
from backend.app.schemas.chat import ChatResponse
from backend.app.schemas.mining import (
    EdaResponse,
    AssociationRulesResponse,
    ClustersResponse,
    GraphResponse,
    TrendsResponse,
)


@pytest.fixture
def client():
    return TestClient(app)


def test_api_chat_endpoint(client):
    mock_resp = ChatResponse(
        query="What is LoRA?",
        answer="LoRA is parameter-efficient fine tuning.",
        citations=["Paper: 2106.09685, Section: Abstract"],
        similarity_score="0.9500",
        generation_time="0.45s",
        context_chunks_used=1,
    )
    with patch("backend.app.api.endpoints.chat.rag_service.answer_query", return_value=mock_resp):
        res = client.post("/api/chat", json={"query": "What is LoRA?", "top_k": 3})
        assert res.status_code == 200
        data = res.json()
        assert data["query"] == "What is LoRA?"
        assert data["answer"] == "LoRA is parameter-efficient fine tuning."
        assert data["context_chunks_used"] == 1


def test_api_search_endpoint(client):
    mock_chunk = ChunkDto(
        chunk_id="chk_1",
        paper_id="2106.09685",
        title="LoRA Paper",
        text="Low-Rank Adaptation details.",
        score=0.92,
    )
    with patch("backend.app.api.endpoints.search.retrieval_service.search", return_value=[mock_chunk]):
        res = client.post("/api/search", json={"query": "LoRA", "top_k": 1, "mode": "hybrid"})
        assert res.status_code == 200
        data = res.json()
        assert data["query"] == "LoRA"
        assert data["total_results"] == 1
        assert data["results"][0]["chunk_id"] == "chk_1"


def test_api_papers_get_success_and_404(client):
    mock_chunk = ChunkDto(
        chunk_id="chk_2",
        paper_id="2401.0001",
        title="Quantum Error Correction",
        text="Quantum paper text",
    )
    with patch("backend.app.api.endpoints.papers.retrieval_service.get_paper", return_value=[mock_chunk]):
        res = client.get("/api/papers/2401.0001")
        assert res.status_code == 200
        data = res.json()
        assert len(data) == 1
        assert data[0]["paper_id"] == "2401.0001"

    with patch("backend.app.api.endpoints.papers.retrieval_service.get_paper", return_value=[]):
        res_404 = client.get("/api/papers/nonexistent")
        assert res_404.status_code == 404


def test_api_mining_pillars_endpoints(client):
    with patch("backend.app.api.endpoints.mining.mining_service.get_eda") as mock_eda, \
         patch("backend.app.api.endpoints.mining.mining_service.get_association_rules") as mock_rules, \
         patch("backend.app.api.endpoints.mining.mining_service.get_clusters") as mock_clusters, \
         patch("backend.app.api.endpoints.mining.mining_service.get_graph") as mock_graph, \
         patch("backend.app.api.endpoints.mining.mining_service.get_trends") as mock_trends:

        mock_eda.return_value = EdaResponse(
            dataset_overview={
                "total_papers": 10, "fulltext_papers_count": 5, "enriched_html_papers": 2, "enrichment_ratio": 0.2,
                "total_math_formulas": 50, "total_words": 10000, "avg_sections_per_paper": 4.0, "avg_math_per_paper": 5.0,
                "avg_words_per_paper": 1000.0, "earliest_publication": "2020-01-01", "latest_publication": "2024-01-01"
            },
            category_distribution=[],
            temporal_distribution=[],
            math_and_content_stats={},
            top_authors=[],
            category_cooccurrence=[]
        )
        mock_rules.return_value = AssociationRulesResponse(summary={}, frequent_itemsets=[], rules=[])
        mock_clusters.return_value = ClustersResponse(summary={}, validity_metrics={}, cluster_profiles=[], scatter_2d=[])
        mock_graph.return_value = GraphResponse(network_summary={}, top_influencers=[], communities=[], graph_export={})
        mock_trends.return_value = TrendsResponse(summary={}, anomalies=[], trend_velocity=[])

        r_eda = client.get("/api/mining/eda")
        assert r_eda.status_code == 200
        assert r_eda.json()["dataset_overview"]["total_papers"] == 10

        r_rules = client.get("/api/mining/pillars/association-rules")
        assert r_rules.status_code == 200

        r_clusters = client.get("/api/mining/pillars/clusters")
        assert r_clusters.status_code == 200

        r_graph = client.get("/api/mining/pillars/graph")
        assert r_graph.status_code == 200

        r_trends = client.get("/api/mining/pillars/trends")
        assert r_trends.status_code == 200


def test_api_storage_query_validation(client):
    # Reject non-SELECT / WITH
    res_bad = client.post("/api/storage/query", json={"sql": "DROP TABLE papers"})
    assert res_bad.status_code == 400
    assert "Only SELECT / WITH queries are permitted" in res_bad.json()["detail"]

    # Reject multiple statements
    res_multi = client.post("/api/storage/query", json={"sql": "SELECT 1; SELECT 2;"})
    assert res_multi.status_code == 400
    assert "Only a single statement is allowed" in res_multi.json()["detail"]
