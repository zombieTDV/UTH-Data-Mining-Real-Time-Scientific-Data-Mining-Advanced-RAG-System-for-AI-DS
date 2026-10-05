"""
backend/tests/test_api.py
-------------------------
FastAPI Integration & Regression Test Suite using starlette TestClient.
"""

import pytest
from starlette.testclient import TestClient
from backend.app.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert "lancedb_ready" in data


def test_storage_stats_endpoint():
    response = client.get("/api/storage/stats")
    assert response.status_code == 200
    data = response.json()
    assert data["bucket"] == "uth-scientific-lakehouse"
    assert "zones" in data
    assert data["zones"]["bronzeCount"] > 0
    assert data["zones"]["goldChunkCount"] > 0


def test_search_endpoint():
    payload = {
        "query": "diffusion models",
        "top_k": 3,
        "mode": "fts",
    }
    response = client.post("/api/search", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["query"] == "diffusion models"
    assert "results" in data
    assert len(data["results"]) <= 3


def test_chat_endpoint():
    payload = {
        "query": "What is the role of sampling in diffusion distillation?",
        "top_k": 2,
    }
    response = client.post("/api/chat", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "answer" in data
    assert "citations" in data
    assert "similarity_score" in data


def test_chat_stream_endpoint():
    payload = {
        "query": "What is diffusion distillation?",
        "top_k": 2,
    }
    response = client.post("/api/chat/stream", json=payload)
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]
    assert "data:" in response.text


def test_mining_eda_endpoint():
    response = client.get("/api/mining/eda")
    assert response.status_code == 200
    data = response.json()
    assert data["dataset_overview"]["total_papers"] >= 10000
    assert len(data["category_distribution"]) > 0
    assert len(data["top_authors"]) > 0


def test_mining_association_rules_endpoint():
    response = client.get("/api/mining/pillars/association-rules")
    assert response.status_code == 200
    data = response.json()
    assert "rules" in data
    assert len(data["rules"]) > 0


def test_mining_clusters_endpoint():
    response = client.get("/api/mining/pillars/clusters")
    assert response.status_code == 200
    data = response.json()
    assert "validity_metrics" in data
    assert "cluster_profiles" in data
    assert len(data["cluster_profiles"]) > 0


def test_mining_graph_endpoint():
    response = client.get("/api/mining/pillars/graph")
    assert response.status_code == 200
    data = response.json()
    assert data["network_summary"]["total_authors"] > 0
    assert len(data["graph_export"]["nodes"]) > 0


def test_mining_trends_endpoint():
    response = client.get("/api/mining/pillars/trends")
    assert response.status_code == 200
    data = response.json()
    assert "anomalies" in data
    assert len(data["anomalies"]) > 0
    assert len(data["trend_velocity"]) > 0


def test_mining_manifest_endpoint():
    response = client.get("/api/mining/manifest")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "COMPLETED"


def test_streaming_ingestion_endpoints():
    # 1. Check status
    res = client.get("/api/ingestion/status")
    assert res.status_code == 200
    status_data = res.json()
    assert "status" in status_data
    assert "total_corpus" in status_data

    # 2. Trigger start
    res_start = client.post("/api/ingestion/start?target=10&delay=0.1")
    assert res_start.status_code == 200
    assert res_start.json()["status"] in ["STARTED", "ALREADY_RUNNING"]

    # 3. Stop
    res_stop = client.post("/api/ingestion/stop")
    assert res_stop.status_code == 200
    assert res_stop.json()["status"] in ["STOPPED", "NOT_RUNNING"]


def test_duckdb_query_endpoint():
    sql = "SELECT primary_category, count(*) as count FROM papers GROUP BY 1 LIMIT 3"
    res = client.post("/api/storage/query", json={"sql": sql})
    assert res.status_code == 200
    data = res.json()
    assert "columns" in data
    assert "rows" in data
    assert data["row_count"] > 0
    assert "execution_time_ms" in data


def test_get_paper_endpoint():
    res = client.get("/api/papers/2402.10350")
    assert res.status_code == 200
    data = res.json()
    assert len(data) > 0
    assert data[0]["paper_id"] == "2402.10350"
    assert "title" in data[0]


