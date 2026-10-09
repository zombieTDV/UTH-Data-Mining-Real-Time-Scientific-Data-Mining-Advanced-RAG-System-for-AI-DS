"""Dual E2E Test (Tier 1): Complete Backend API Lifecycle Flow."""
import pytest
from starlette.testclient import TestClient


@pytest.mark.e2e
def test_full_backend_api_lifecycle(test_client: TestClient, monkeypatch):
    from backend.app.services.llm_client import llm_client

    monkeypatch.setattr(
        llm_client,
        "generate",
        lambda messages, **kwargs: "Diffusion probabilistic models learn iterative data generation through reverse score-matching.",
    )

    # 1. Health Verification
    health_resp = test_client.get("/health")
    assert health_resp.status_code == 200
    assert health_resp.json()["status"] == "ok"

    # 2. Storage & Medallion Lakehouse Stats
    stats_resp = test_client.get("/api/storage/stats")
    assert stats_resp.status_code == 200
    stats = stats_resp.json()
    assert stats["bucket"] == "uth-scientific-lakehouse"
    assert stats["zones"]["bronzeCount"] > 0
    assert "activeLakehouse" in stats

    # 3. Cloudflare R2 Tree Exploration (Cost Shield Active)
    tree_resp = test_client.get("/api/r2/tree")
    assert tree_resp.status_code == 200
    tree_data = tree_resp.json()
    assert tree_data["total_objects"] > 0
    assert "bronze" in tree_data["zones"]
    assert "silver" in tree_data["zones"]
    assert "gold" in tree_data["zones"]
    assert "lancedb" in tree_data["zones"]

    # 4. Deep Artifact Preview
    preview_resp = test_client.get("/api/r2/preview?key=gold/mining/association_rules.json")
    assert preview_resp.status_code == 200
    preview_data = preview_resp.json()
    assert preview_data["key"] == "gold/mining/association_rules.json"
    assert preview_data["preview_type"] == "json"

    # 5. Hybrid Search Retrieval
    search_payload = {
        "query": "generative diffusion",
        "top_k": 3,
        "mode": "fts",
    }
    search_resp = test_client.post("/api/search", json=search_payload)
    assert search_resp.status_code == 200
    search_results = search_resp.json()
    assert search_results["query"] == "generative diffusion"
    assert "results" in search_results

    # 6. Grounded RAG Chat Synthesis with Citations
    chat_payload = {
        "query": "What are diffusion probabilistic models?",
        "top_k": 2,
    }
    chat_resp = test_client.post("/api/chat", json=chat_payload)
    assert chat_resp.status_code == 200
    chat_data = chat_resp.json()
    assert "answer" in chat_data
    assert len(chat_data["answer"]) > 10
    assert "citations" in chat_data

    # 7. Adaptive Scheduler Status Inspection
    sched_resp = test_client.get("/api/scheduler/status")
    assert sched_resp.status_code == 200
    sched_data = sched_resp.json()
    assert sched_data["status"] == "ONLINE"
    assert "sources" in sched_data

    # 8. Vectorized DuckDB SQL Analytics
    query_payload = {
        "sql": "SELECT primary_category, count(*) as cnt FROM papers GROUP BY 1 ORDER BY cnt DESC LIMIT 3"
    }
    query_resp = test_client.post("/api/storage/query", json=query_payload)
    assert query_resp.status_code == 200
    query_data = query_resp.json()
    assert query_data["row_count"] > 0
    assert "columns" in query_data
    assert "rows" in query_data
