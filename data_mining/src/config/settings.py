"""Configuration settings module loaded from environment variables and .env file."""

import os
from pathlib import Path
from typing import List
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

    # Cloudflare R2 Credentials
    CLOUDFLARE_ACCOUNT_ID: str = os.getenv("CLOUDFLARE_ACCOUNT_ID", "").strip()
    R2_ACCESS_KEY_ID: str = os.getenv("R2_ACCESS_KEY_ID", "").strip()
    R2_SECRET_ACCESS_KEY: str = os.getenv("R2_SECRET_ACCESS_KEY", "").strip()
    R2_BUCKET_NAME: str = os.getenv("R2_BUCKET_NAME", "uth-scientific-lakehouse").strip()
    R2_ENDPOINT_URL: str = os.getenv("R2_ENDPOINT_URL", "").strip()

    # arXiv Harvesting Configuration
    ARXIV_CATEGORIES: List[str] = [
        c.strip()
        for c in os.getenv("ARXIV_CATEGORIES", "cs.AI,cs.LG,cs.CV,cs.CL,stat.ML").split(",")
        if c.strip()
    ]
    ARXIV_REQUEST_DELAY_SECONDS: float = float(os.getenv("ARXIV_REQUEST_DELAY_SECONDS", "6.0"))

    # OpenAlex API Keys
    OPENALEX_API_KEY: str = os.getenv("OPENALEX_API_KEY","").strip()

    # OpenAlex Categories Config
    OPENALEX_SUBFIELDS: List[str] = [
        c.strip() 
        for c in os.getenv("OPENALEX_SUB_FIELDS","1203,1702,1703,1706,1707,1710,1711,1804,2207,2613,3309,3310").split(",") 
        if c.strip()
    ]
    OPENALEX_DEDUP_MAX_OBJECTS_PER_YEAR = int(os.getenv('OPENALEX_DEDUP_MAX_OBJECTS_PER_YEAR', 100_000))
    OPENALEX_PER_PAGE = int(os.getenv('OPENALEX_PER_PAGE', 100))
    OPENALEX_REQUESTS_PER_SECOND = float(os.getenv('OPENALEX_REQUESTS_PER_SECOND', 5))
    OPENALEX_TIMEOUT_SECONDS = float(os.getenv('OPENALEX_TIMEOUT_SECONDS', 30.0))
    OPENALEX_MAX_RETRIES = int(os.getenv('OPENALEX_MAX_RETRIES', 5))


    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO").upper()

    @classmethod
    def get_r2_endpoint(cls) -> str:
        """Trả về endpoint R2 chuẩn hóa có tiền tố https://."""
        url = cls.R2_ENDPOINT_URL
        if not url:
            if cls.CLOUDFLARE_ACCOUNT_ID:
                url = f"https://{cls.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com"
        if url and not url.startswith("http://") and not url.startswith("https://"):
            url = f"https://{url}"
        return url


settings = Settings()
