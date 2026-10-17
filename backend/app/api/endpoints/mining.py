from typing import Dict, Any
from fastapi import APIRouter, BackgroundTasks, HTTPException
from sse_starlette.sse import EventSourceResponse
from backend.app.schemas.mining import (
    EdaResponse,
    AssociationRulesResponse,
    ClustersResponse,
    GraphResponse,
    TrendsResponse,
)
from backend.app.services.mining_service import mining_service

router = APIRouter(prefix="/mining", tags=["Data Mining & Modeling"])


@router.get("/eda", response_model=EdaResponse)
async def get_eda_summary():
    """Returns exploratory data analysis metrics, category distribution, top authors, and math density."""
    try:
        return mining_service.get_eda()
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/pillars/association-rules", response_model=AssociationRulesResponse)
async def get_association_rules():
    """Pillar 1: Frequent itemsets and high-lift association rules (FP-Growth)."""
    try:
        return mining_service.get_association_rules()
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/pillars/clusters", response_model=ClustersResponse)
async def get_semantic_clusters():
    """Pillar 2: Semantic Topic Clustering (K-Means & DBSCAN) with 2D projections and validity metrics."""
    try:
        return mining_service.get_clusters()
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/pillars/graph", response_model=GraphResponse)
async def get_coauthorship_graph():
    """Pillar 3: Scientific Co-authorship Network Analysis, PageRank, and Louvain communities."""
    try:
        return mining_service.get_graph()
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/pillars/trends", response_model=TrendsResponse)
async def get_trends_and_anomalies():
    """Pillar 4: Structural novelty outliers (Isolation Forest) and category trend velocities."""
    try:
        return mining_service.get_trends()
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/manifest")
async def get_mining_manifest() -> Dict[str, Any]:
    """Returns timing benchmarks and metadata of the most recent mining pipeline run."""
    return mining_service.get_manifest()


@router.get("/telemetry/stream")
async def telemetry_event_stream():
    """Server-Sent Events (SSE) streaming live telemetry pulses to the Frontend Dashboard."""
    return EventSourceResponse(mining_service.stream_telemetry())


@router.post("/trigger")
async def trigger_mining_execution() -> Dict[str, str]:
    """Mining re-execution is disabled until src/mining is ported to MinIO + Qdrant.

    The engine still reads local Parquet paths and the removed LanceDB table, so queuing it would only fail in the
    background. The served artifacts (gold/mining/*.json in MinIO) are unaffected."""
    raise HTTPException(
        status_code=501,
        detail="Mining engine is not yet ported to MinIO/Qdrant; artifacts are served from the last published run.",
    )
