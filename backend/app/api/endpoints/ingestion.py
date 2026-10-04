"""
backend/app/api/endpoints/ingestion.py
--------------------------------------
API Endpoints for Real-Time Streaming Ingestion & Change Data Capture (CDC).
"""

from typing import Any, Dict
from fastapi import APIRouter, BackgroundTasks, Query
from sse_starlette.sse import EventSourceResponse
from backend.app.services.streaming_service import streaming_service

router = APIRouter(prefix="/ingestion", tags=["Streaming Ingestion"])


@router.get("/status")
async def get_streaming_status() -> Dict[str, Any]:
    """Returns current streaming ingestion status, target, and speed metrics."""
    return streaming_service.get_status()


@router.post("/start")
async def start_streaming_ingestion(
    target: int = Query(3000, description="Target preprints to ingest incrementally (default: 3000)"),
    delay: float = Query(2.0, description="Delay between papers (seconds)"),
) -> Dict[str, Any]:
    """Starts or resumes the real-time streaming ingestion worker."""
    return await streaming_service.start_streaming(target=target, delay=delay)


@router.post("/stop")
async def stop_streaming_ingestion() -> Dict[str, Any]:
    """Gracefully pauses or stops the active streaming worker."""
    return await streaming_service.stop_streaming()


@router.get("/stream")
async def stream_ingestion_events():
    """Server-Sent Events (SSE) streaming live paper ingestion events and speed telemetry."""
    return EventSourceResponse(streaming_service.stream_events())
