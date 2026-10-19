"""
backend/app/core/config.py
--------------------------
Application configuration using Pydantic Settings.
Reads environment variables from root .env.
"""

import os
from pathlib import Path
from typing import Optional, Any
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# Find project root (where .env lives)
CURRENT_FILE = Path(__file__).resolve()
PROJECT_ROOT = CURRENT_FILE.parents[3]
ENV_FILE = PROJECT_ROOT / ".env"


class Settings(BaseSettings):
    # Server & Ports
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    PROJECT_NAME: str = "UTH Scientific Data Mining & Real-Time RAG API"
    VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"
    FRONTEND_ORIGIN: str

    # MinIO / R2 S3 Lakehouse (supports MINIO_* or R2_* aliases)
    MINIO_ENDPOINT_URL: str = "http://localhost:9000"
    MINIO_ACCESS_KEY_ID: str = "minioadmin"
    MINIO_SECRET_ACCESS_KEY: str = "minioadmin"
    MINIO_BUCKET_NAME: str = "uth-scientific-lakehouse"
    STORAGE_PROVIDER: str = "minio"

    # Qdrant Vector Database
    QDRANT_URL: str = "https://qdrant.minio-quangmanh.io.vn"
    QDRANT_COLLECTION: str = "scientific_papers_gold"
    QDRANT_API_KEY: Optional[str] = "uth_guest_readonly_key_4b71a8e9d2c"

    # RabbitMQ Message Broker (management API used for queue stats)
    RABBITMQ_USER: str = "guest"
    RABBITMQ_PASSWORD: str = "guest"
    RABBITMQ_MGMT_URL: str = "http://localhost:15672"
    RABBITMQ_QUEUE_INGEST: str = "scientific_paper_ingest"
    RABBITMQ_QUEUE_EMBED: str = "scientific_chunk_embed"
    EMBED_QUEUE_MAX: int = 500  # same env var as the worker: the fetch stage pauses at this embed-queue depth

    @model_validator(mode="before")
    @classmethod
    def resolve_r2_aliases(cls, values: Any) -> Any:
        if isinstance(values, dict):
            # Resolve R2_* aliases (both lower and upper case from dotenv) if MINIO_* not set
            r2_ep = values.get("MINIO_ENDPOINT_URL") or values.get("minio_endpoint_url") or values.get("R2_ENDPOINT_URL") or values.get("r2_endpoint_url")
            if r2_ep:
                values["MINIO_ENDPOINT_URL"] = r2_ep

            r2_key = values.get("MINIO_ACCESS_KEY_ID") or values.get("minio_access_key_id") or values.get("R2_ACCESS_KEY_ID") or values.get("r2_access_key_id")
            if r2_key:
                values["MINIO_ACCESS_KEY_ID"] = r2_key

            r2_sec = values.get("MINIO_SECRET_ACCESS_KEY") or values.get("minio_secret_access_key") or values.get("R2_SECRET_ACCESS_KEY") or values.get("r2_secret_access_key")
            if r2_sec:
                values["MINIO_SECRET_ACCESS_KEY"] = r2_sec

            r2_bkt = values.get("MINIO_BUCKET_NAME") or values.get("minio_bucket_name") or values.get("R2_BUCKET_NAME") or values.get("r2_bucket_name")
            if r2_bkt:
                values["MINIO_BUCKET_NAME"] = r2_bkt

            # Resolve Qdrant URL and key if present
            qdrant_url = values.get("QDRANT_URL") or values.get("qdrant_url")
            if qdrant_url:
                values["QDRANT_URL"] = qdrant_url
            qdrant_key = values.get("QDRANT_API_KEY") or values.get("qdrant_api_key")
            if qdrant_key:
                values["QDRANT_API_KEY"] = qdrant_key
        return values

    # Apache Airflow REST API (DAG monitoring and control)
    AIRFLOW_API_URL: str = "http://localhost:8080/api/v1"
    AIRFLOW_USER: str = "admin"
    AIRFLOW_PASSWORD: str = "admin"

    # Lakehouse object keys (inside the MinIO bucket)
    # Silver is one dataset: every tier lands in silver/papers/year=YYYY/ (papers.parquet + parts/), with a `tier` column
    SILVER_PRIMARY_KEY: str = "silver/papers/"
    SILVER_CATALOG_KEYS: str = "silver/papers/"
    MINING_PREFIX: str = "gold/mining"
    LAKEHOUSE_BUDGET_GB: float = 20.0  # disk budget for MinIO + Qdrant (the harvest DAGs stop publishing at this size)
    STATE_PREFIX: str = "state"
    PROJECT_ROOT_DIR: Path = PROJECT_ROOT
    EMBEDDING_MODEL_PATH: str = str(PROJECT_ROOT / "models" / "nomic-embed-text-v1.5")

    # LLM Settings
    LLM_MODE: str = "local"  # "local", "ollama", "groq", "mock"
    LLM_SERVICE_URL: str = "http://localhost:9001/v1"
    OLLAMA_SERVICE_URL: str = "http://localhost:11434/v1"
    LLM_MODEL_PATH: str = "./models/qwen2.5-7b-instruct-q4_k_m/qwen2.5-7b-instruct-q4_k_m.gguf"
    LLM_CONTEXT_WINDOW: int = 16384
    LLM_PRELOAD: bool = True  # False keeps the local GGUF out of memory until a chat request needs it
    LLM_MAX_TOKENS: int = 1536
    LLM_TEMPERATURE: float = 0.7
    GROQ_API_KEY: str = ""

    # DeepEval Benchmarking Settings
    DEEPEVAL_JUDGE_MODEL: str = "local"  # "local", "deepseek", "groq", "openai"
    DEEPEVAL_LOCAL_URL: str = "http://localhost:9001/v1"
    DEEPEVAL_LOCAL_MODEL: str = "qwen2.5-7b-instruct"
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com/v1"
    DEEPSEEK_MODEL: str = "deepseek-chat"
    OPENAI_API_KEY: str = ""
    CONFIDENT_AI_API_KEY: str = ""

    # Cross-Encoder Reranker Settings (two-stage retrieval with cross-attention)
    RERANKER_ENABLED: bool = True
    RERANKER_MODEL_NAME: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    RERANKER_FALLBACK_MODEL: str = "BAAI/bge-reranker-base"
    RERANKER_TOP_K: int = 5
    RERANKER_CANDIDATE_K: int = 15

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE) if ENV_FILE.exists() else None,
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
