"""Integration tests for FastAPI application endpoints in backend/app/main.py."""
import pytest
import pyarrow as pa
from starlette.testclient import TestClient
from backend.app.schemas.storage import (
    StorageStatsResponse,
    StorageZonesDto,
    ActiveLakehouseDto,
    BackupStorageDto,
    TotalBucketDto,
)
from backend.app.schemas.mining import (
    EdaResponse, EdaOverview, CategoryDistItem, TemporalDistItem, TopAuthorItem, CategoryCooccurItem,
    AssociationRulesResponse, AssociationRuleItem,
    ClustersResponse, ClusterProfileItem, ScatterPointItem,
    GraphResponse,
    TrendsResponse, AnomalyItem, TrendVelocityItem,
)


@pytest.fixture(autouse=True)
def mock_api_services(monkeypatch):
    from backend.app.services.storage_service import storage_service
    from backend.app.services.mining_service import mining_service
    from backend.app.services.streaming_service import streaming_service
    from backend.app.services.lake import lake
    import backend.app.api.endpoints.explorer as explorer_mod
    import backend.app.services.airflow_client as airflow_mod

    # 1. Storage Stats
    mock_stats = StorageStatsResponse(
        bucket="uth-scientific-lakehouse",
        status="ready",
        total_objects=36673,
        total_size_bytes=11964057750,
        total_size_gb=11.142,
        free_tier_quota_gb=20.0,
        used_percentage=55.71,
        zones=StorageZonesDto(
            bronzeCount=11660,
            bronzeSizeBytes=4040788866,
            openalexCount=24754,
            openalexSizeBytes=4264028211,
            silverTables=["papers.parquet"],
            silverSizeBytes=331411456,
            goldTables=["mining/clusters.json"],
            goldChunkCount=143523,
            goldSizeBytes=127097720,
            goldBackupChunkCount=28,
            goldBackupSizeBytes=3295282176,
        ),
        activeLakehouse=ActiveLakehouseDto(
            totalObjects=36619,
            totalSizeBytes=8668472480,
            totalSizeGb=8.073,
            usedPercentage=80.73,
            arxivHtmlCount=11660,
            arxivHtmlSizeBytes=4040788866,
            arxivHtmlSizeGb=3.763,
            openalexCount=24754,
            openalexSizeBytes=4264028211,
            openalexSizeGb=3.971,
            silverParquetCount=9,
            silverParquetSizeBytes=331411456,
            silverParquetSizeMb=316.06,
            conferenceCount=2000,
            activeVectors=40399,
            activeVectorsSizeBytes=0,
            activeVectorsSizeMb=0.0,
        ),
        backupStorage=BackupStorageDto(
            totalObjects=28,
            totalSizeBytes=3295282176,
            totalSizeGb=3.069,
            description="Archived snapshots",
        ),
        totalBucket=TotalBucketDto(
            totalObjects=36673,
            totalSizeBytes=11964057750,
            totalSizeGb=11.142,
            usedPercentage=55.71,
            freeTierQuotaGb=20.0,
            overageGb=0.0,
            estimatedOverageCostUsd=0.0,
        ),
    )
    monkeypatch.setattr(storage_service, "get_stats", lambda: mock_stats)

    # 2. Mining Service
    mock_eda = EdaResponse(
        dataset_overview=EdaOverview(
            total_papers=1000,
            fulltext_papers_count=500,
            enriched_html_papers=500,
            enrichment_ratio=0.5,
            total_math_formulas=5000,
            total_words=2000000,
            avg_sections_per_paper=5.2,
            avg_math_per_paper=5.0,
            avg_words_per_paper=2000.0,
            earliest_publication="2020-01-01",
            latest_publication="2024-03-01",
        ),
        category_distribution=[
            CategoryDistItem(category="cs.AI", count=600, percentage=60.0, total_math_formulas=3000, avg_words=2100.0),
            CategoryDistItem(category="cs.CV", count=400, percentage=40.0, total_math_formulas=2000, avg_words=1900.0),
        ],
        temporal_distribution=[TemporalDistItem(period="2024-Q1", count=1000)],
        math_and_content_stats={"total_formulas": 5000},
        top_authors=[TopAuthorItem(author="Alice Smith", paper_count=15)],
        category_cooccurrence=[CategoryCooccurItem(category_a="cs.AI", category_b="cs.CV", cooccurrence_count=120)],
    )
    mock_assoc = AssociationRulesResponse(
        summary={"total_rules": 1, "min_support": 0.05, "min_confidence": 0.2},
        frequent_itemsets=[{"itemset": ["cs.AI", "cs.LG"], "support": 0.25}],
        rules=[
            AssociationRuleItem(
                antecedents=["cs.AI"],
                consequents=["cs.LG"],
                support=0.25,
                confidence=0.75,
                lift=1.5,
                leverage=0.05,
                conviction=1.8,
            )
        ],
    )
    mock_clusters = ClustersResponse(
        summary={"total_clusters": 2, "algorithm": "K-Means"},
        validity_metrics={"silhouette_score": 0.45, "davies_bouldin_index": 1.1},
        cluster_profiles=[
            ClusterProfileItem(
                cluster_id=0,
                size=600,
                percentage=60.0,
                dominant_categories=[{"category": "cs.AI", "count": 500}],
                sample_titles=["Diffusion Models for Reasoning"],
                topic_label="Generative AI",
                topic_subtitle="Diffusion and LLMs",
            ),
        ],
        scatter_2d=[
            ScatterPointItem(x=0.1, y=0.2, cluster=0, category="cs.AI", title="Diffusion Models", paper_id="2401.00001"),
        ],
    )
    mock_graph = GraphResponse(
        network_summary={"num_nodes": 50, "num_edges": 120, "density": 0.08},
        top_influencers=[{"author": "Alice Smith", "pagerank": 0.045, "degree": 12}],
        communities=[{"community_id": 0, "size": 30}],
        graph_export={"nodes": [{"id": "Alice Smith", "label": "Alice Smith"}], "links": []},
    )
    mock_trends = TrendsResponse(
        summary={"total_anomalies": 1, "total_categories": 2},
        anomalies=[
            AnomalyItem(
                paper_id="2401.00001",
                title="Outlier High-Math Paper",
                primary_category="cs.AI",
                anomaly_score=-0.85,
                math_count=450,
                word_count=12000,
                author_count=2,
                category_count=1,
                outlier_reasons=["Extreme formula density"],
            )
        ],
        trend_velocity=[
            TrendVelocityItem(
                category="cs.AI",
                recent_quarter_papers=150,
                previous_quarter_papers=100,
                growth_rate_pct=50.0,
                momentum="ACCELERATING",
                all_time_papers=600,
            )
        ],
    )
    monkeypatch.setattr(mining_service, "get_eda", lambda: mock_eda)
    monkeypatch.setattr(mining_service, "get_association_rules", lambda: mock_assoc)
    monkeypatch.setattr(mining_service, "get_clusters", lambda: mock_clusters)
    monkeypatch.setattr(mining_service, "get_graph", lambda: mock_graph)
    monkeypatch.setattr(mining_service, "get_trends", lambda: mock_trends)
    monkeypatch.setattr(mining_service, "get_manifest", lambda: {"status": "COMPLETED", "execution_timestamp": "2026-10-19T12:00:00"})

    # 3. DuckDB Lake Dataset Mock
    dummy_arrow_table = pa.Table.from_pydict({
        "paper_id": ["2401.00001", "2401.00002", "2401.00003"],
        "title": ["Paper 1", "Paper 2", "Paper 3"],
        "primary_category": ["cs.AI", "cs.AI", "cs.CV"],
        "tier": ["tier1", "tier2", "tier1"],
    })
    monkeypatch.setattr(lake, "dataset", lambda prefix: dummy_arrow_table)

    # 4. Explorer Endpoints
    import datetime
    import json
    monkeypatch.setattr(explorer_mod, "build_inventory", lambda force=False: {
        "bucket_name": "uth-scientific-lakehouse",
        "total_objects": 10,
        "total_size_bytes": 1048576,
        "total_size_gb": 0.001,
        "free_tier_quota_gb": 20.0,
        "used_percentage": 0.01,
        "cost_shield_active": True,
        "last_synced": "2026-10-19 12:00:00",
        "zones": {"bronze": [], "silver": [], "gold": []},
        "zone_raw": {"bronze": (1, 1000), "silver": (1, 2000), "gold": (1, 3000)},
        "zone_stats": {"bronze": 1, "silver": 1, "gold": 1},
        "files": [
            {"key": "silver/papers.parquet", "size_bytes": 2000, "last_modified": None, "row_count": 10},
            {"key": "gold/mining/association_rules.json", "size_bytes": 3000, "last_modified": None, "row_count": 1},
        ],
    })
    monkeypatch.setattr(lake, "head", lambda key: {"size": 500, "last_modified": datetime.datetime.now()})
    monkeypatch.setattr(lake.storage, "get_text", lambda key: json.dumps({"rules": [{"antecedents": ["cs.AI"], "consequents": ["cs.LG"], "support": 0.25}]}))
    monkeypatch.setattr(lake, "get_json", lambda key, **kwargs: {"key": key, "rules": [{"antecedents": ["cs.AI"], "consequents": ["cs.LG"], "support": 0.25}]})

    # 5. Airflow & Streaming Service
    dags_list = [
        {"key": "tier1", "name": "Tier 1 Harvest", "dag_id": "harvest_tier1", "frequency": "daily", "kind": "harvest", "paused": False, "running": False, "last_run": {"state": "success", "start": "2026-10-19T00:00:00", "end": "2026-10-19T00:05:00"}},
        {"key": "tier2", "name": "Tier 2 Harvest", "dag_id": "harvest_tier2", "frequency": "hourly", "kind": "harvest", "paused": False, "running": False, "last_run": {"state": "success", "start": "2026-10-19T01:00:00", "end": "2026-10-19T01:05:00"}},
    ]
    mock_snap = {
        "airflow": {
            "reachable": True,
            "scheduler_healthy": True,
            "dags": dags_list,
        },
        "session": {"by_tier": {"tier1": 3000, "tier2": 15000}},
        "queue": {"status": "ONLINE", "ready": 10, "unacked": 0, "consumers": 2, "dead": 0}
    }
    monkeypatch.setattr(streaming_service, "airflow_dags", dags_list)
    monkeypatch.setattr(streaming_service, "snapshot", lambda: mock_snap)
    monkeypatch.setattr(airflow_mod.airflow, "set_paused", lambda dag_id, paused: {"is_paused": paused})


@pytest.mark.integration
def test_health_endpoint(test_client: TestClient):
    response = test_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("ok", "degraded")
    assert "version" in data
    assert "vector_store_ready" in data


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
def test_explorer_tree_endpoint(test_client: TestClient):
    res = test_client.get("/api/explorer/tree")
    assert res.status_code == 200
    data = res.json()
    assert "bucket_name" in data
    assert "total_objects" in data
    assert "total_size_gb" in data
    assert "zones" in data
    assert "zone_stats" in data
    assert data["cost_shield_active"] is True


@pytest.mark.integration
def test_explorer_preview_endpoint(test_client: TestClient):
    res = test_client.get(
        "/api/explorer/preview?key=gold/mining/association_rules.json"
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
    assert "tier1" in st["sources"] and "tier2" in st["sources"]

    # 2. Toggle source to its current state, so the test never pauses or unpauses a real Airflow DAG
    enabled = bool(st["sources"]["tier1"].get("enabled"))
    res_toggle = test_client.post("/api/scheduler/toggle/tier1", json={"enabled": enabled})
    assert res_toggle.status_code == 200
    toggle_data = res_toggle.json()
    assert toggle_data["source"] == "tier1"
    assert toggle_data["enabled"] is enabled
