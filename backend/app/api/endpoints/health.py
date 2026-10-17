from datetime import datetime, timezone
from fastapi import APIRouter
from backend.app.schemas.health import HealthResponse
from backend.app.core.config import settings
from backend.app.services.lake import lake
from backend.app.services.retrieval_service import retrieval_service

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    is_ready = retrieval_service.is_ready()
    return HealthResponse(
        status="ok" if is_ready else "degraded",
        timestamp=datetime.now(timezone.utc).isoformat(),
        version=settings.VERSION,
        qdrant_ready=is_ready,
        lancedb_ready=is_ready,  # legacy field name kept for the frontend contract; Qdrant is the vector store
        parquet_ready=lake.exists(settings.SILVER_PRIMARY_KEY),
    )
