"""FastAPI Endpoints for Adaptive Multi-Source Lakehouse Scheduler.

Allows the Frontend UI or automation workers to:
- Inspect scheduled policies, last run, next run, and paper counts for 4 sources.
- Trigger manual immediate harvest for any source (arxiv, openreview, openalex, cvf, all).
"""

from typing import Any, Dict, Optional
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from src.scheduler.adaptive_scheduler import scheduler_instance, SCHEDULE_CONFIGS

router = APIRouter(prefix="/scheduler", tags=["Adaptive Ingestion Scheduler"])


class TriggerRequest(BaseModel):
    limit: Optional[int] = None
    sync_r2: bool = True


@router.get("/status")
async def get_scheduler_status() -> Dict[str, Any]:
    """Returns current execution status and upcoming run times for all 4 academic sources."""
    return {
        "status": "ONLINE",
        "sources": scheduler_instance.get_status(),
        "configs": SCHEDULE_CONFIGS,
    }


@router.post("/trigger/{source}")
async def trigger_source_harvest(
    source: str,
    background_tasks: BackgroundTasks,
    body: Optional[TriggerRequest] = None,
) -> Dict[str, Any]:
    """Triggers an immediate harvest run for a designated source in a background worker."""
    source_key = source.lower().strip()
    if source_key not in SCHEDULE_CONFIGS and source_key != "all":
        raise HTTPException(
            status_code=400,
            detail=f"Invalid source '{source}'. Valid sources: {list(SCHEDULE_CONFIGS.keys())} or 'all'",
        )

    limit = body.limit if body else None
    sync_r2 = body.sync_r2 if body else True

    def _execute():
        scheduler_instance.trigger_source(source_key, limit=limit, sync_r2=sync_r2)

    if background_tasks:
        background_tasks.add_task(_execute)
        return {
            "status": "QUEUED",
            "source": source_key,
            "message": f"Harvesting pipeline for '{source_key.upper()}' queued in background.",
        }
    else:
        # Synchronous fallback
        res = scheduler_instance.trigger_source(source_key, limit=limit, sync_r2=sync_r2)
        return res
