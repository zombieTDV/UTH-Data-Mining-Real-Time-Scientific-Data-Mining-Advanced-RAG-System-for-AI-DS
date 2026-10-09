"""FastAPI Endpoints for Adaptive Multi-Source Lakehouse Scheduler.

Allows the Frontend UI, Admin Dashboard, and background workers to:
- Inspect scheduled policies, last run, next run, and paper counts for 4 sources.
- Turn ON / Turn OFF scheduler daemon globally (/start, /stop).
- Toggle Enable / Disable individual data sources (/toggle/{source}).
- Immediately cancel any running crawling task (/cancel).
- Trigger manual immediate harvest for any source (/trigger/{source}).
"""

from typing import Any, Dict, Optional
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from src.scheduler.adaptive_scheduler import scheduler_instance, SCHEDULE_CONFIGS

router = APIRouter(prefix="/scheduler", tags=["Adaptive Ingestion Scheduler"])


class TriggerRequest(BaseModel):
    limit: Optional[int] = Field(None, description="Paper count override for this harvest run")
    sync_r2: bool = Field(True, description="Synchronize resulting parquet & vectors to Cloudflare R2")
    force: bool = Field(False, description="Run even if the source is currently toggled OFF")


class StartDaemonRequest(BaseModel):
    interval_seconds: int = Field(30, ge=5, le=3600, description="Daemon loop check frequency in seconds")


class StopDaemonRequest(BaseModel):
    cancel_running: bool = Field(False, description="Whether to also abort any active crawling subprocess")


class ToggleSourceRequest(BaseModel):
    enabled: Optional[bool] = Field(None, description="Explicit boolean state (True=ON, False=OFF). If omitted, state will invert.")


@router.get("/status")
async def get_scheduler_status() -> Dict[str, Any]:
    """Returns current execution status, ON/OFF switches, and upcoming run times for all 4 academic sources."""
    st = scheduler_instance.get_status()
    return {
        "status": "ONLINE",
        "daemon_running": st["daemon_running"],
        "active_source": st["active_source"],
        "active_pid": st["active_pid"],
        "sources": st["sources"],
        "configs": SCHEDULE_CONFIGS,
    }


@router.post("/start")
async def start_scheduler(body: Optional[StartDaemonRequest] = None) -> Dict[str, Any]:
    """BẬT CÀO TỰ ĐỘNG: Starts the adaptive scheduler background daemon loop."""
    interval = body.interval_seconds if body else 30
    res = scheduler_instance.start_daemon(interval_seconds=interval)
    return res


@router.post("/stop")
async def stop_scheduler(body: Optional[StopDaemonRequest] = None) -> Dict[str, Any]:
    """TẮT CÀO TỰ ĐỘNG: Stops the adaptive scheduler background daemon loop."""
    cancel_running = body.cancel_running if body else False
    res = scheduler_instance.stop_daemon(cancel_running=cancel_running)
    return res


@router.post("/toggle/{source}")
async def toggle_source(source: str, body: Optional[ToggleSourceRequest] = None) -> Dict[str, Any]:
    """BẬT / TẮT TỪNG NGUỒN: Toggles or sets enabled state for a specific source (arxiv, openreview, openalex, cvf, all)."""
    target_state = body.enabled if body else None
    try:
        return scheduler_instance.toggle_source(source, enabled=target_state)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/cancel")
async def cancel_scheduler_task() -> Dict[str, Any]:
    """HỦY / DỪNG TÁC VỤ ĐANG CHẠY: Aborts and kills the active crawler subprocess immediately."""
    return scheduler_instance.cancel_current_task()


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
    force = body.force if body else True  # Manual trigger defaults to force=True so user can test anytime

    def _execute():
        scheduler_instance.trigger_source(source_key, limit=limit, sync_r2=sync_r2, force=force)

    if background_tasks:
        background_tasks.add_task(_execute)
        return {
            "status": "QUEUED",
            "source": source_key,
            "message": f"Harvesting pipeline for '{source_key.upper()}' queued in background worker.",
        }
    else:
        res = scheduler_instance.trigger_source(source_key, limit=limit, sync_r2=sync_r2, force=force)
        return res
