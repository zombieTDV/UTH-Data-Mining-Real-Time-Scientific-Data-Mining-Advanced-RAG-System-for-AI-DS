"""Configuration settings module loaded from environment variables and .env file."""

import os
from pathlib import Path
from typing import Dict, List
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(dotenv_path=PROJECT_ROOT / ".env")


class Settings:
    """Application settings class."""

    # Project Paths
    ROOT_DIR: Path = PROJECT_ROOT
    DATA_RAW_DIR: Path = PROJECT_ROOT / os.getenv("DATA_RAW_DIR", "data/raw")
    MANIFEST_DIR: Path = PROJECT_ROOT / os.getenv("MANIFEST_DIR", "data/manifests")
    EMBEDDING_MODEL_PATH: Path = PROJECT_ROOT / os.getenv("EMBEDDING_MODEL_PATH", "models/nomic-embed-text-v1.5")
    LLM_MODEL_PATH: Path = PROJECT_ROOT / os.getenv("LLM_MODEL_PATH", "models/qwen2.5-7b-instruct-q4_k_m/qwen2.5-7b-instruct-q4_k_m.gguf")

    # Object Storage Configuration (MinIO Local S3)
    STORAGE_PROVIDER: str = os.getenv("STORAGE_PROVIDER", "minio").strip().lower()
    MINIO_ENDPOINT_URL: str = os.getenv("MINIO_ENDPOINT_URL", "http://localhost:9000").strip()
    MINIO_ACCESS_KEY_ID: str = os.getenv("MINIO_ACCESS_KEY_ID", "admin").strip()
    MINIO_SECRET_ACCESS_KEY: str = os.getenv("MINIO_SECRET_ACCESS_KEY", "password123").strip()
    MINIO_BUCKET_NAME: str = os.getenv("MINIO_BUCKET_NAME", "uth-scientific-lakehouse").strip()

    # S3 generic aliases
    S3_ENDPOINT_URL: str = MINIO_ENDPOINT_URL
    S3_ACCESS_KEY_ID: str = MINIO_ACCESS_KEY_ID
    S3_SECRET_ACCESS_KEY: str = MINIO_SECRET_ACCESS_KEY
    S3_BUCKET_NAME: str = MINIO_BUCKET_NAME

    # Vector Database Configuration (Qdrant vs LanceDB)
    VECTOR_STORE_PROVIDER: str = os.getenv("VECTOR_STORE_PROVIDER", "qdrant").strip().lower()
    QDRANT_URL: str = os.getenv("QDRANT_URL", "http://localhost:6333").strip()
    QDRANT_COLLECTION: str = os.getenv("QDRANT_COLLECTION", "scientific_papers_gold").strip()

    # RabbitMQ Message Broker Configuration
    RABBITMQ_URL: str = os.getenv("RABBITMQ_URL", "amqp://admin:password123@localhost:5672").strip()
    RABBITMQ_QUEUE_INGEST: str = os.getenv("RABBITMQ_QUEUE_INGEST", "scientific_paper_ingest").strip()

    # arXiv Harvesting Configuration
    ARXIV_CATEGORIES: List[str] = [
        c.strip()
        for c in os.getenv("ARXIV_CATEGORIES", "cs.AI,cs.LG,cs.CV,cs.CL,stat.ML").split(",")
        if c.strip()
    ]
    ARXIV_REQUEST_DELAY_SECONDS: float = float(os.getenv("ARXIV_REQUEST_DELAY_SECONDS", "6.0"))

    # Zenodo Configuration
    ZENODO_ACCESS_TOKEN: str = os.getenv("ZENODO_ACCESS_TOKEN", "").strip()
    ZENODO_DEFAULT_QUERY: str = os.getenv("ZENODO_DEFAULT_QUERY", "machine learning OR artificial intelligence").strip()

    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO").upper()

    @classmethod
    def get_active_storage_config(cls) -> Dict[str, str]:
        """Trả về cấu hình Object Storage cho MinIO cục bộ."""
        return {
            "provider": "minio",
            "endpoint_url": cls.MINIO_ENDPOINT_URL,
            "access_key_id": cls.MINIO_ACCESS_KEY_ID,
            "secret_access_key": cls.MINIO_SECRET_ACCESS_KEY,
            "bucket_name": cls.MINIO_BUCKET_NAME,
            "addressing_style": "path",
            "use_ssl": False,
        }


settings = Settings()
