"""
backend/app/core/config.py
--------------------------
Application configuration using Pydantic Settings.
Reads environment variables from root .env.
"""

import os
from pathlib import Path
from typing import Optional
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

    # MinIO S3 Lakehouse (the only data store; credentials come from .env, no defaults)
    MINIO_ENDPOINT_URL: str
    MINIO_ACCESS_KEY_ID: str
    MINIO_SECRET_ACCESS_KEY: str
    MINIO_BUCKET_NAME: str
    STORAGE_PROVIDER: str = "minio"

    # Qdrant Vector Database
    QDRANT_URL: str
    QDRANT_COLLECTION: str = "scientific_papers_gold"
    QDRANT_API_KEY: Optional[str] = None

    # RabbitMQ Message Broker (management API used for queue stats)
    RABBITMQ_USER: str
    RABBITMQ_PASSWORD: str
    RABBITMQ_MGMT_URL: str
    RABBITMQ_QUEUE_INGEST: str = "scientific_paper_ingest"
    RABBITMQ_QUEUE_EMBED: str = "scientific_chunk_embed"
    EMBED_QUEUE_MAX: int = 500  # same env var as the worker: the fetch stage pauses at this embed-queue depth

    # Apache Airflow REST API (DAG monitoring and control)
    AIRFLOW_API_URL: str
    AIRFLOW_USER: str
    AIRFLOW_PASSWORD: str

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
    LLM_SERVICE_URL: str
    OLLAMA_SERVICE_URL: str
    LLM_MODEL_PATH: str = "./models/qwen2.5-7b-instruct-q4_k_m/qwen2.5-7b-instruct-q4_k_m.gguf"
    LLM_CONTEXT_WINDOW: int = 16384
    LLM_MAX_TOKENS: int = 1536
    LLM_TEMPERATURE: float = 0.7
    GROQ_API_KEY: str = ""

    # DeepEval Benchmarking Settings
    DEEPEVAL_JUDGE_MODEL: str = "local"  # "local", "deepseek", "groq", "openai"
    DEEPEVAL_LOCAL_URL: str
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
