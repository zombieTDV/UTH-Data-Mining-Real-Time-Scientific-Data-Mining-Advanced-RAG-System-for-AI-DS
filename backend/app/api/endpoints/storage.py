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


import asyncio

@router.post("/storage/sync-r2", tags=["Storage & Lakehouse"])
async def trigger_r2_sync():
    """Triggers background live scan of Cloudflare R2 bucket and updates manifest cache."""
    return await asyncio.to_thread(storage_service.sync_live_from_r2)


@router.post("/storage/reset-session", tags=["Storage & Lakehouse"])
async def reset_streaming_session():
    """Resets the persistent streaming session count back to baseline."""
    from backend.app.services.streaming_service import streaming_service
    streaming_service.reset_session()
    return {"status": "SUCCESS", "message": "Streaming ingestion session reset to baseline."}


@router.post("/storage/query", response_model=DuckDbQueryResponse, tags=["Storage & Lakehouse"])
async def execute_duckdb_query(req: DuckDbQueryRequest):
    """Executes a vectorized DuckDB SQL query over the Parquet Lakehouse files."""
    cleaned_sql = req.sql.strip().rstrip(";")
    
    # Prevent destructive queries
    upper_sql = cleaned_sql.upper()
    for forbidden in ["DROP", "DELETE", "INSERT", "UPDATE", "ALTER", "CREATE", "TRUNCATE"]:
        if forbidden in upper_sql.split():
            raise HTTPException(status_code=400, detail=f"Operation '{forbidden}' is not permitted.")

    # Discover available parquet file or provide graceful fallback
    parquet_file = settings.SILVER_PARQUET
    if not parquet_file.exists():
        candidates = [
            settings.PROJECT_ROOT_DIR / "data" / "silver" / "papers.parquet",
            *list(settings.PROJECT_ROOT_DIR.glob("data_mining/**/papers.parquet")),
        ]
        for c in candidates:
            if c.exists():
                parquet_file = c
                break

    t0 = time.time()
    try:
        con = duckdb.connect(database=":memory:")
        if not parquet_file.exists():
            con.execute("""
                CREATE VIEW papers AS 
                SELECT '2402.10350' AS paper_id, 'cs.AI' AS primary_category, 'Scientific Title' AS title, 
                       12 AS total_math_count, 2026 AS year, 'Sample paper text' AS text
            """)
        else:
            parquet_path = str(parquet_file)
            con.execute(f"CREATE OR REPLACE VIEW papers AS SELECT * FROM read_parquet('{parquet_path}')")
            con.execute(f"CREATE OR REPLACE VIEW scientific_papers_gold AS SELECT * FROM read_parquet('{parquet_path}')")

        df = con.execute(cleaned_sql).df()
        elapsed_ms = round((time.time() - t0) * 1000.0, 2)
        columns = list(df.columns)
        # Convert non-serializable objects (like numpy ndarrays, timestamps, NaN) to python primitives
        clean_records = []
        for row in df.to_dict(orient="records"):
            clean_row = {}
            for k, v in row.items():
                if hasattr(v, "tolist"):
                    clean_row[k] = v.tolist()
                elif hasattr(v, "item"):
                    clean_row[k] = v.item()
                elif isinstance(v, float) and (v != v):
                    clean_row[k] = None
                else:
                    clean_row[k] = v
            clean_records.append(clean_row)

        return DuckDbQueryResponse(
            columns=columns,
            rows=clean_records,
            row_count=len(clean_records),
            execution_time_ms=elapsed_ms,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"DuckDB execution error: {str(e)}")
