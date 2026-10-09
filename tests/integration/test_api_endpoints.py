"""Integration tests for FastAPI application endpoints in backend/app/main.py."""
import pytest
from starlette.testclient import TestClient


@pytest.mark.integration
def test_health_endpoint(test_client: TestClient):
    response = test_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert "lancedb_ready" in data


@pytest.mark.integration
def test_storage_stats_endpoint(test_client: TestClient):
    response = test_client.get("/api/storage/stats")
    assert response.status_code == 200
    data = response.json()
    assert data["bucket"] == "uth-scientific-lakehouse"
    assert "zones" in data
    assert "bronzeCount" in data["zones"]
    assert "silverTables" in data["zones"]
    assert "activeLakehouse" in data
    assert "silverParquetCount" in data["activeLakehouse"]


@pytest.mark.integration
def test_search_endpoint_fts(test_client: TestClient):
    payload = {
        "query": "diffusion models",
        "top_k": 3,
        "mode": "fts",
    }
    response = test_client.post("/api/search", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["query"] == "diffusion models"
    assert "results" in data
    assert len(data["results"]) <= 3


@pytest.mark.integration
def test_chat_endpoint(test_client: TestClient, monkeypatch):
    from backend.app.services.llm_client import llm_client

    monkeypatch.setattr(
        llm_client,
        "generate",
        lambda messages, **kwargs: "Diffusion models are score-based generative models.",
    )

    payload = {
        "query": "What is diffusion distillation?",
        "top_k": 2,
    }
    response = test_client.post("/api/chat", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "answer" in data
    assert "citations" in data
    assert "similarity_score" in data


@pytest.mark.integration
def test_chat_stream_endpoint(test_client: TestClient, monkeypatch):
    from backend.app.services.llm_client import llm_client

    async def mock_stream(messages, **kwargs):
        for token in ["Diffusion ", "models ", "are ", "generative."]:
            yield token

    monkeypatch.setattr(llm_client, "generate_stream", mock_stream)

    payload = {
        "query": "What is diffusion distillation?",
        "top_k": 2,
    }
    response = test_client.post("/api/chat/stream", json=payload)
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]
    assert "data:" in response.text


@pytest.mark.integration
def test_mining_eda_endpoint(test_client: TestClient):
    response = test_client.get("/api/mining/eda")
    assert response.status_code == 200
    data = response.json()
    assert "dataset_overview" in data
    assert "category_distribution" in data
    assert "top_authors" in data


@pytest.mark.integration
def test_mining_association_rules_endpoint(test_client: TestClient):
    response = test_client.get("/api/mining/pillars/association-rules")
    assert response.status_code == 200
    data = response.json()
    assert "rules" in data
    assert len(data["rules"]) > 0


@pytest.mark.integration
def test_mining_clusters_endpoint(test_client: TestClient):
    response = test_client.get("/api/mining/pillars/clusters")
    assert response.status_code == 200
    data = response.json()
    assert "validity_metrics" in data
    assert "cluster_profiles" in data


@pytest.mark.integration
def test_mining_graph_endpoint(test_client: TestClient):
    response = test_client.get("/api/mining/pillars/graph")
    assert response.status_code == 200
    data = response.json()
    assert "network_summary" in data
    assert "graph_export" in data


@pytest.mark.integration
def test_mining_trends_endpoint(test_client: TestClient):
    response = test_client.get("/api/mining/pillars/trends")
    assert response.status_code == 200
    data = response.json()
    assert "anomalies" in data
    assert "trend_velocity" in data


@pytest.mark.integration
def test_mining_manifest_endpoint(test_client: TestClient):
    response = test_client.get("/api/mining/manifest")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "COMPLETED"


@pytest.mark.integration
def test_duckdb_query_endpoint(test_client: TestClient):
    sql = "SELECT primary_category, count(*) as count FROM papers GROUP BY 1 LIMIT 3"
    res = test_client.post("/api/storage/query", json={"sql": sql})
    assert res.status_code == 200
    data = res.json()
    assert "columns" in data
    assert "rows" in data
    assert data["row_count"] > 0
    assert "execution_time_ms" in data


@pytest.mark.integration
def test_r2_tree_endpoint(test_client: TestClient):
    res = test_client.get("/api/r2/tree")
    assert res.status_code == 200
    data = res.json()
    assert "bucket_name" in data
    assert "total_objects" in data
    assert "total_size_gb" in data
    assert "zones" in data
    assert "zone_stats" in data
    assert data["cost_shield_active"] is True


@pytest.mark.integration
def test_r2_preview_endpoint(test_client: TestClient):
    res = test_client.get(
        "/api/r2/preview?key=gold/mining/association_rules.json"
    )
    assert res.status_code == 200
    data = res.json()
    assert data["key"] == "gold/mining/association_rules.json"
    assert data["preview_type"] == "json"
    assert "json_data" in data or "raw_text" in data


@pytest.mark.integration
def test_scheduler_status_and_toggle(test_client: TestClient):
    # 1. Status
    res = test_client.get("/api/scheduler/status")
    assert res.status_code == 200
    st = res.json()
    assert st["status"] == "ONLINE"
    assert "sources" in st
    assert "arxiv" in st["sources"]

    # 2. Toggle source
    res_toggle = test_client.post("/api/scheduler/toggle/arxiv", json={"enabled": True})
    assert res_toggle.status_code == 200
    toggle_data = res_toggle.json()
    assert toggle_data["source"] == "arxiv"
    assert toggle_data["enabled"] is True
