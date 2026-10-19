"""
backend/app/main.py
-------------------
FastAPI Application Entry Point.
Real-Time Scientific Data Mining & Advanced RAG System Backend.
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.core.config import settings
from backend.app.api.endpoints import health
from backend.app.api.router import api_router

from backend.app.services.llm_client import llm_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("fastapi_main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("================================================================================")
    logger.info("[STARTUP] Starting FastAPI Backend for Scientific Lakehouse & Data Mining")
    logger.info("[STARTUP] Server running on: http://%s:%d", settings.HOST, settings.PORT)
    logger.info("[STARTUP] Interactive OpenAPI Docs: http://localhost:%d/docs", settings.PORT)
    logger.info("[STARTUP] Silver primary: s3://%s/%s", settings.MINIO_BUCKET_NAME, settings.SILVER_PRIMARY_KEY)
    logger.info("[STARTUP] Qdrant URL: %s (Collection: %s)", settings.QDRANT_URL, settings.QDRANT_COLLECTION)
    logger.info("[STARTUP] MinIO S3: %s (Bucket: %s)", settings.MINIO_ENDPOINT_URL, settings.MINIO_BUCKET_NAME)
    logger.info("[STARTUP] Context Window: %d tokens", settings.LLM_CONTEXT_WINDOW)

    # Preload LLM model into Apple Silicon Metal GPU memory immediately on startup (LLM_PRELOAD=false skips it)
    if settings.LLM_PRELOAD:
        llm_client.preload()
    else:
        logger.info("[STARTUP] LLM_PRELOAD=false: the local LLM is not loaded at startup.")

    logger.info("================================================================================")
    from backend.app.services.streaming_service import streaming_service

    streaming_service.start_monitor()
    yield
    streaming_service.stop_monitor()
    logger.info("[SHUTDOWN] Stopping FastAPI Backend.")
    llm_client.close()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Real-Time Scientific Data Mining & Advanced RAG System API (FastAPI)",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS configuration for Frontend Dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.FRONTEND_ORIGIN.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Health endpoint at root
app.include_router(health.router)

# Include all API routes under /api
app.include_router(api_router, prefix=settings.API_PREFIX)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
    )
