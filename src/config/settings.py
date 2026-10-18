"""Configuration settings module loaded from environment variables and .env file.

All endpoints and credentials come from the environment (.env). Secrets have no
defaults: a missing required variable fails fast with a clear message.
"""

import os
from pathlib import Path
from typing import Dict, List
from urllib.parse import quote, urlparse

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(dotenv_path=PROJECT_ROOT / ".env")


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _require(name: str) -> str:
    value = _env(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable {name}. Set it in {PROJECT_ROOT / '.env'}")
    return value


def _build_amqp_url() -> str:
    """RABBITMQ_URL wins; otherwise assemble it from the discrete RABBITMQ_* variables."""
    explicit = _env("RABBITMQ_URL")
    if explicit:
        return explicit
    user, password = quote(_require("RABBITMQ_USER"), safe=""), quote(_require("RABBITMQ_PASSWORD"), safe="")
    host, port = _env("RABBITMQ_HOST", "localhost"), _env("RABBITMQ_PORT", "5672")
    return f"amqp://{user}:{password}@{host}:{port}/"


class Settings:
    """Application settings class."""

    # Project Paths (read-only inputs: models). No pipeline writes under these.
    ROOT_DIR: Path = PROJECT_ROOT
    EMBEDDING_MODEL_PATH: Path = PROJECT_ROOT / _env("EMBEDDING_MODEL_PATH", "models/nomic-embed-text-v1.5")
    LLM_MODEL_PATH: Path = PROJECT_ROOT / _env(
        "LLM_MODEL_PATH", "models/qwen2.5-7b-instruct-q4_k_m/qwen2.5-7b-instruct-q4_k_m.gguf"
    )

    # Object Storage (MinIO S3) - the only place pipelines persist data
    STORAGE_PROVIDER: str = _env("STORAGE_PROVIDER", "minio").lower()
    MINIO_ENDPOINT_URL: str = _env("MINIO_ENDPOINT_URL")
    MINIO_ACCESS_KEY_ID: str = _env("MINIO_ACCESS_KEY_ID")
    MINIO_SECRET_ACCESS_KEY: str = _env("MINIO_SECRET_ACCESS_KEY")
    MINIO_BUCKET_NAME: str = _env("MINIO_BUCKET_NAME")

    # S3 generic aliases
    S3_ENDPOINT_URL: str = MINIO_ENDPOINT_URL
    S3_ACCESS_KEY_ID: str = MINIO_ACCESS_KEY_ID
    S3_SECRET_ACCESS_KEY: str = MINIO_SECRET_ACCESS_KEY
    S3_BUCKET_NAME: str = MINIO_BUCKET_NAME

    # Vector Database (Qdrant)
    VECTOR_STORE_PROVIDER: str = _env("VECTOR_STORE_PROVIDER", "qdrant").lower()
    QDRANT_URL: str = _env("QDRANT_URL")
    QDRANT_COLLECTION: str = _env("QDRANT_COLLECTION", "scientific_papers_gold")
    QDRANT_API_KEY: str = _env("QDRANT_API_KEY", "")

    # RabbitMQ
    RABBITMQ_URL: str = _build_amqp_url() if (_env("RABBITMQ_URL") or _env("RABBITMQ_USER")) else ""
    RABBITMQ_USER: str = _env("RABBITMQ_USER")
    RABBITMQ_PASSWORD: str = _env("RABBITMQ_PASSWORD")
    RABBITMQ_MGMT_URL: str = _env("RABBITMQ_MGMT_URL").rstrip("/")
    RABBITMQ_QUEUE_INGEST: str = _env("RABBITMQ_QUEUE_INGEST", "scientific_paper_ingest")
    RABBITMQ_QUEUE_DEAD: str = _env("RABBITMQ_QUEUE_DEAD", "scientific_paper_ingest.dead")
    RABBITMQ_MAX_RETRIES: int = int(_env("RABBITMQ_MAX_RETRIES", "3"))

    # Telemetry broadcast to the backend (optional; empty disables it)
    BACKEND_BROADCAST_URL: str = _env("BACKEND_BROADCAST_URL")

    # arXiv Harvesting
    ARXIV_CATEGORIES: List[str] = [
        c.strip() for c in _env("ARXIV_CATEGORIES", "cs.AI,cs.LG,cs.CV,cs.CL,stat.ML").split(",") if c.strip()
    ]
    ARXIV_REQUEST_DELAY_SECONDS: float = float(_env("ARXIV_REQUEST_DELAY_SECONDS", "6.0"))
    ARXIV_USER_AGENT: str = _env("HARVESTER_USER_AGENT", "UTH-Scientific-Harvester/2.0")

    # Zenodo
    ZENODO_ACCESS_TOKEN: str = _env("ZENODO_ACCESS_TOKEN")
    ZENODO_DEFAULT_QUERY: str = _env("ZENODO_DEFAULT_QUERY", "machine learning OR artificial intelligence")

    LOG_LEVEL: str = _env("LOG_LEVEL", "INFO").upper()

    @classmethod
    def validate_storage(cls) -> None:
        """Raise a readable error if MinIO is not fully configured."""
        for name in ("MINIO_ENDPOINT_URL", "MINIO_ACCESS_KEY_ID", "MINIO_SECRET_ACCESS_KEY", "MINIO_BUCKET_NAME"):
            _require(name)

    @classmethod
    def rabbitmq_mgmt_url(cls) -> str:
        """HTTP management API base; derived from the AMQP host when RABBITMQ_MGMT_URL is unset."""
        if cls.RABBITMQ_MGMT_URL:
            return cls.RABBITMQ_MGMT_URL
        host = urlparse(cls.RABBITMQ_URL).hostname or "localhost"
        return f"http://{host}:15672"

    @classmethod
    def rabbitmq_credentials(cls) -> tuple:
        """(user, password) from discrete vars, falling back to the AMQP URL userinfo."""
        if cls.RABBITMQ_USER and cls.RABBITMQ_PASSWORD:
            return cls.RABBITMQ_USER, cls.RABBITMQ_PASSWORD
        parsed = urlparse(cls.RABBITMQ_URL)
        return parsed.username or "", parsed.password or ""

    @classmethod
    def get_active_storage_config(cls) -> Dict[str, str]:
        cls.validate_storage()
        return {
            "provider": "minio",
            "endpoint_url": cls.MINIO_ENDPOINT_URL,
            "access_key_id": cls.MINIO_ACCESS_KEY_ID,
            "secret_access_key": cls.MINIO_SECRET_ACCESS_KEY,
            "bucket_name": cls.MINIO_BUCKET_NAME,
            "addressing_style": "path",
            "use_ssl": cls.MINIO_ENDPOINT_URL.startswith("https"),
        }


settings = Settings()
