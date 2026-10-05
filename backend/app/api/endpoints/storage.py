import time
import duckdb
from typing import Any, Dict, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from backend.app.core.config import settings
from backend.app.schemas.storage import StorageStatsResponse
from backend.app.services.storage_service import storage_service

router = APIRouter()


class DuckDbQueryRequest(BaseModel):
    sql: str = Field(..., examples=["SELECT primary_category, count(*) as count FROM read_parquet('data/silver/year=2026/papers.parquet') GROUP BY 1"])


class DuckDbQueryResponse(BaseModel):
    columns: List[str]
    rows: List[Dict[str, Any]]
    row_count: int
    execution_time_ms: float


@router.get("/storage/stats", response_model=StorageStatsResponse, tags=["Storage & Lakehouse"])
async def get_storage_stats():
    return storage_service.get_stats()


@router.post("/storage/query", response_model=DuckDbQueryResponse, tags=["Storage & Lakehouse"])
async def execute_duckdb_query(req: DuckDbQueryRequest):
    """Executes a vectorized DuckDB SQL query over the Parquet Lakehouse files."""
    cleaned_sql = req.sql.strip().rstrip(";")
    
    # Prevent destructive queries
    upper_sql = cleaned_sql.upper()
    for forbidden in ["DROP", "DELETE", "INSERT", "UPDATE", "ALTER", "CREATE", "TRUNCATE"]:
        if forbidden in upper_sql.split():
            raise HTTPException(status_code=400, detail=f"Operation '{forbidden}' is not permitted.")

    # Normalize relative parquet paths if user used scientific_papers_gold alias
    parquet_path = str(settings.SILVER_PARQUET)
    if "scientific_papers_gold" in cleaned_sql:
        cleaned_sql = cleaned_sql.replace("scientific_papers_gold", f"read_parquet('{parquet_path}')")
    elif "read_parquet(" not in cleaned_sql and "papers.parquet" not in cleaned_sql:
        # Default target table if FROM is omitted or standard name used
        cleaned_sql = cleaned_sql.replace("papers", f"read_parquet('{parquet_path}')")

    t0 = time.time()
    try:
        con = duckdb.connect(database=":memory:")
        df = con.execute(cleaned_sql).df()
        elapsed_ms = round((time.time() - t0) * 1000.0, 2)
        columns = list(df.columns)
        # Convert non-serializable objects (like numpy types or timestamps) to python primitives
        records = df.to_dict(orient="records")
        return DuckDbQueryResponse(
            columns=columns,
            rows=records,
            row_count=len(records),
            execution_time_ms=elapsed_ms,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"DuckDB execution error: {str(e)}")
