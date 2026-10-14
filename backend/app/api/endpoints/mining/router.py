from typing import Any, Dict

from fastapi import APIRouter, BackgroundTasks

from backend.app.api.endpoints.mining.manifest_route import read_manifest
from backend.app.api.endpoints.mining.readers import (
    read_association_rules,
    read_coauthorship_graph,
    read_eda,
    read_semantic_clusters,
    read_trends,
)
from backend.app.api.endpoints.mining.telemetry_route import build_telemetry_response
from backend.app.api.endpoints.mining.trigger import (
    build_trigger_response,
    run_mining_pipeline,
)
from backend.app.schemas.mining import (
    AssociationRulesResponse,
    ClustersResponse,
    EdaResponse,
    GraphResponse,
    TrendsResponse,
)

router = APIRouter(prefix="/mining", tags=["Data Mining & Modeling"])


@router.get("/eda", response_model=EdaResponse)
async def get_eda_summary():
    """Returns exploratory data analysis metrics, category distribution, top authors, and math density."""
    return read_eda()


@router.get("/pillars/association-rules", response_model=AssociationRulesResponse)
async def get_association_rules():
    """Pillar 1: Frequent itemsets and high-lift association rules (FP-Growth)."""
    return read_association_rules()


@router.get("/pillars/clusters", response_model=ClustersResponse)
async def get_semantic_clusters():
    """Pillar 2: Semantic Topic Clustering (K-Means & DBSCAN) with 2D projections and validity metrics."""
    return read_semantic_clusters()


@router.get("/pillars/graph", response_model=GraphResponse)
async def get_coauthorship_graph():
    """Pillar 3: Scientific Co-authorship Network Analysis, PageRank, and Louvain communities."""
    return read_coauthorship_graph()


@router.get("/pillars/trends", response_model=TrendsResponse)
async def get_trends_and_anomalies():
    """Pillar 4: Structural novelty outliers (Isolation Forest) and category trend velocities."""
    return read_trends()


@router.get("/manifest")
async def get_mining_manifest() -> Dict[str, Any]:
    """Returns timing benchmarks and metadata of the most recent mining pipeline run."""
    return read_manifest()


@router.get("/telemetry/stream")
async def telemetry_event_stream():
    """Server-Sent Events (SSE) streaming live telemetry pulses to the Frontend Dashboard."""
    return build_telemetry_response()


@router.post("/trigger")
async def trigger_mining_execution(background_tasks: BackgroundTasks) -> Dict[str, str]:
    """Triggers background re-execution of the Python Data Mining Engine across the 10,000 papers."""
    background_tasks.add_task(run_mining_pipeline)
    return build_trigger_response()
