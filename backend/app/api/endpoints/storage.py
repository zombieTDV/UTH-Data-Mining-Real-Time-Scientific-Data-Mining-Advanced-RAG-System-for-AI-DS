import time
import duckdb
from typing import Any, Dict, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from backend.app.core.config import settings
from backend.app.schemas.storage import StorageStatsResponse
from backend.app.services.lake import lake
from backend.app.services.storage_service import storage_service

router = APIRouter()


class DuckDbQueryRequest(BaseModel):
    sql: str = Field(..., examples=["SELECT primary_category, count(*) as count FROM papers GROUP BY 1"])


class DuckDbQueryResponse(BaseModel):
    columns: List[str]
    rows: List[Dict[str, Any]]
    row_count: int
    execution_time_ms: float


@router.get("/storage/stats", response_model=StorageStatsResponse, tags=["Storage & Lakehouse"])
async def get_storage_stats():
    return storage_service.get_stats()


@router.post("/storage/sync-r2", tags=["Storage & Lakehouse"])
async def trigger_r2_sync():
    """Forces a fresh scan of the MinIO bucket."""
    return storage_service.sync_live_from_r2()


@router.post("/storage/reset-session", tags=["Storage & Lakehouse"])
async def reset_streaming_session():
    """Resets the persistent streaming session count back to baseline."""
    from backend.app.services.streaming_service import streaming_service
    streaming_service.reset_session()
    return {"status": "SUCCESS", "message": "Streaming ingestion session reset to baseline."}


MAX_QUERY_ROWS = 10000
DUCKDB_VIEWS = {
    "papers": None,  # resolved to settings.SILVER_PRIMARY_KEY
    "scientific_papers_gold": None,  # legacy alias of papers
    "tier1_papers": "silver/tier1/landmark_papers.parquet",
    "tier2_papers": "silver/tier2/near_past_papers.parquet",
}


@router.post("/storage/query", response_model=DuckDbQueryResponse, tags=["Storage & Lakehouse"])
async def execute_duckdb_query(req: DuckDbQueryRequest):
    """Read-only DuckDB SQL over the Silver Parquet tables stored in MinIO.

    Available tables: papers, tier1_papers, tier2_papers. Only a single SELECT/WITH statement is accepted and
    DuckDB's file/network access is disabled once the MinIO-backed tables are registered.
    """
    cleaned_sql = req.sql.strip().rstrip(";").strip()
    if ";" in cleaned_sql:
        raise HTTPException(status_code=400, detail="Only a single statement is allowed.")
    if cleaned_sql.split(None, 1)[0].upper() not in ("SELECT", "WITH"):
        raise HTTPException(status_code=400, detail="Only SELECT / WITH queries are permitted.")

    t0 = time.time()
    try:
        con = duckdb.connect(database=":memory:")
        for view, key in DUCKDB_VIEWS.items():
            con.register(view, lake.dataset(key or settings.SILVER_PRIMARY_KEY))
        con.execute("SET enable_external_access=false")
        df = con.execute(f"SELECT * FROM ({cleaned_sql}) AS q LIMIT {MAX_QUERY_ROWS}").df()
        elapsed_ms = round((time.time() - t0) * 1000.0, 2)
        records = df.to_dict(orient="records")
        return DuckDbQueryResponse(columns=list(df.columns), rows=records, row_count=len(records), execution_time_ms=elapsed_ms)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"DuckDB execution error: {str(e)}")
