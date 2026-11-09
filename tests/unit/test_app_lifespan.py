"""Unit tests for backend/app/main.py lifespan startup and shutdown behavior,
specifically verifying commit 5702e469 (LLM_PRELOAD flag configuration and conditional loading).
"""
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from backend.app.core.config import Settings
from backend.app.main import lifespan


@pytest.mark.asyncio
async def test_lifespan_preloads_llm_when_preload_is_true():
    """Verifies that when LLM_PRELOAD=True, llm_client.preload() is executed during startup."""
    mock_app = MagicMock()

    with patch("backend.app.main.settings") as mock_settings, \
         patch("backend.app.main.llm_client") as mock_llm, \
         patch("backend.app.services.streaming_service.streaming_service") as mock_stream:

        mock_settings.LLM_PRELOAD = True
        mock_settings.HOST = "127.0.0.1"
        mock_settings.PORT = 8000
        mock_settings.MINIO_BUCKET_NAME = "lakehouse"
        mock_settings.SILVER_PRIMARY_KEY = "silver/papers.parquet"
        mock_settings.QDRANT_URL = "http://localhost:6333"
        mock_settings.QDRANT_COLLECTION = "gold_chunks"
        mock_settings.MINIO_ENDPOINT_URL = "http://localhost:9000"
        mock_settings.LLM_CONTEXT_WINDOW = 16384

        async with lifespan(mock_app):
            mock_llm.preload.assert_called_once()
            mock_stream.start_monitor.assert_called_once()

        mock_stream.stop_monitor.assert_called_once()
        mock_llm.close.assert_called_once()


@pytest.mark.asyncio
async def test_lifespan_skips_preload_when_preload_is_false():
    """Verifies commit 5702e469 feature: when LLM_PRELOAD=False, llm_client.preload() is NOT called."""
    mock_app = MagicMock()

    with patch("backend.app.main.settings") as mock_settings, \
         patch("backend.app.main.llm_client") as mock_llm, \
         patch("backend.app.services.streaming_service.streaming_service") as mock_stream:

        mock_settings.LLM_PRELOAD = False
        mock_settings.HOST = "127.0.0.1"
        mock_settings.PORT = 8000
        mock_settings.MINIO_BUCKET_NAME = "lakehouse"
        mock_settings.SILVER_PRIMARY_KEY = "silver/papers.parquet"
        mock_settings.QDRANT_URL = "http://localhost:6333"
        mock_settings.QDRANT_COLLECTION = "gold_chunks"
        mock_settings.MINIO_ENDPOINT_URL = "http://localhost:9000"
        mock_settings.LLM_CONTEXT_WINDOW = 16384

        async with lifespan(mock_app):
            mock_llm.preload.assert_not_called()
            mock_stream.start_monitor.assert_called_once()

        mock_stream.stop_monitor.assert_called_once()
        mock_llm.close.assert_called_once()


@pytest.mark.unit
def test_config_llm_preload_default_and_env_override(monkeypatch):
    """Verifies that LLM_PRELOAD defaults to True and can be overridden via environment variables."""
    # Default behavior without explicit env var
    s_default = Settings()
    assert s_default.LLM_PRELOAD is True

    # Override via env
    monkeypatch.setenv("LLM_PRELOAD", "false")
    s_false = Settings()
    assert s_false.LLM_PRELOAD is False

    monkeypatch.setenv("LLM_PRELOAD", "true")
    s_true = Settings()
    assert s_true.LLM_PRELOAD is True
