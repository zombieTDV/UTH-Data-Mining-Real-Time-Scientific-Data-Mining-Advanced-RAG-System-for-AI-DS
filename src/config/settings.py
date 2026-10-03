"""Validated runtime configuration; environment overrides the project .env file."""

import math
import os
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import dotenv_values

PROJECT_ROOT = Path(__file__).resolve().parents[2]

# Conference venues supported by the Phase-2 conference pipeline.
# Each venue is mapped to its primary access strategy:
#   - "api": first-class API (e.g., OpenAlex, OpenReview)
#   - "scrape": HTML scrape fallback
SUPPORTED_VENUES = ("KDD", "ICML", "ICLR", "NeurIPS")
VENUE_PRIMARY_STRATEGY = {
    "KDD": "openalex_api",      # also dl.acm.org/oai-pmh fallback
    "ICML": "openalex_api",     # also proceedings.mlr.press fallback
    "ICLR": "openreview_api",   # primary: api.openreview.net
    "NeurIPS": "openalex_api",  # also proceedings.neurips.cc fallback
}


class Settings:
    """Read settings per instance without mutating the process environment."""

    def __init__(self, env_file=PROJECT_ROOT / ".env", environ=None):
        values = dict(dotenv_values(env_file)) if env_file is not None else {}
        values.update(os.environ if environ is None else environ)

        def value(name, default=""):
            return str(values.get(name) or default).strip()

        self.ROOT_DIR = PROJECT_ROOT
        for name, default in {
            "DATA_RAW_DIR": "data/raw",
            "LOCAL_STORE_DIR": "data/local",
            "MANIFEST_DIR": "data/manifests",
            "SILVER_DIR": "data/silver",
            "GOLD_DIR": "data/gold/lancedb",
            "EMBEDDING_MODEL_PATH": "models/nomic-embed-text-v1.5",
            "CRAWLER_DEAD_LETTER_DIR": "data/dlq",
        }.items():
            setattr(self, name, PROJECT_ROOT / Path(value(name, default)).expanduser())
        for name, default in {
            "CLOUDFLARE_ACCOUNT_ID": "",
            "R2_ACCESS_KEY_ID": "",
            "R2_SECRET_ACCESS_KEY": "",
            "R2_BUCKET_NAME": "uth-scientific-lakehouse",
            "R2_ENDPOINT_URL": "",
            "R2_PUBLIC_URL": "",
        }.items():
            setattr(self, name, value(name, default))
        self.ARXIV_CATEGORIES = list(
            dict.fromkeys(
                c.strip()
                for c in value("ARXIV_CATEGORIES", "cs.AI,cs.LG,cs.CV,cs.CL,stat.ML").split(",")
                if c.strip()
            )
        )
        if not self.ARXIV_CATEGORIES:
            raise ValueError("ARXIV_CATEGORIES must contain at least one category")
        self.ARXIV_REQUEST_DELAY_SECONDS = float(value("ARXIV_REQUEST_DELAY_SECONDS", "6.0"))
        if (
            not math.isfinite(self.ARXIV_REQUEST_DELAY_SECONDS)
            or self.ARXIV_REQUEST_DELAY_SECONDS < 3
        ):
            raise ValueError("ARXIV_REQUEST_DELAY_SECONDS must be finite and >= 3")

        # ==================== Phase-2: Conference Pipeline ====================
        # Venues
        # Normalize venue names: case-insensitive match against supported set
        # so .env values like "NeurIPS" or "neurips" are both accepted.
        normalized = []
        unsupported: list = []
        for raw in (
            v.strip() for v in value("CONFERENCE_SOURCES", "KDD,ICML,ICLR,NeurIPS").split(",")
        ):
            if not raw:
                continue
            match = next(
                (s for s in SUPPORTED_VENUES if s.lower() == raw.lower()),
                None,
            )
            if match is None:
                unsupported.append(raw)
            else:
                normalized.append(match)
        # De-duplicate while preserving first-seen order.
        self.CONFERENCE_SOURCES = list(dict.fromkeys(normalized))
        if not self.CONFERENCE_SOURCES:
            raise ValueError("CONFERENCE_SOURCES must contain at least one venue")
        if unsupported:
            raise ValueError(
                f"Unsupported CONFERENCE_SOURCES: {unsupported}. "
                f"Supported: {list(SUPPORTED_VENUES)}"
            )

        # Year window
        self.CONFERENCE_YEAR_FROM = int(value("CONFERENCE_YEAR_FROM", "2020"))
        self.CONFERENCE_YEAR_TO = int(value("CONFERENCE_YEAR_TO", "2026"))
        if self.CONFERENCE_YEAR_FROM < 1990 or self.CONFERENCE_YEAR_FROM > 2100:
            raise ValueError("CONFERENCE_YEAR_FROM must be 1990-2100")
        if self.CONFERENCE_YEAR_TO < self.CONFERENCE_YEAR_FROM:
            raise ValueError("CONFERENCE_YEAR_TO must be >= CONFERENCE_YEAR_FROM")

        # Per-domain rate limits (req/sec). 0 = no limit (not recommended).
        self.OPENALEX_RATE_LIMIT_RPS = float(value("OPENALEX_RATE_LIMIT_RPS", "10"))
        self.OPENREVIEW_RATE_LIMIT_RPS = float(value("OPENREVIEW_RATE_LIMIT_RPS", "5"))
        self.KDD_RATE_LIMIT_RPS = float(value("KDD_RATE_LIMIT_RPS", "1"))
        self.ICML_RATE_LIMIT_RPS = float(value("ICML_RATE_LIMIT_RPS", "1"))
        self.ICLR_RATE_LIMIT_RPS = float(value("ICLR_RATE_LIMIT_RPS", "1"))
        self.NEURIPS_RATE_LIMIT_RPS = float(value("NEURIPS_RATE_LIMIT_RPS", "1"))

        # Jitter (0.0 - 1.0)
        self.RATE_LIMIT_JITTER = float(value("RATE_LIMIT_JITTER", "0.3"))
        if not 0.0 <= self.RATE_LIMIT_JITTER <= 1.0:
            raise ValueError("RATE_LIMIT_JITTER must be in [0, 1]")

        # Credentials
        self.OPENALEX_EMAIL = value("OPENALEX_EMAIL", "")
        self.S2_API_KEY = value("S2_API_KEY", "")
        self.OPENREVIEW_USERNAME = value("OPENREVIEW_USERNAME", "")

        # Runtime tunables
        self.CRAWLER_TIMEOUT_CONNECT = float(value("CRAWLER_TIMEOUT_CONNECT", "10"))
        self.CRAWLER_TIMEOUT_READ = float(value("CRAWLER_TIMEOUT_READ", "30"))
        self.CRAWLER_TIMEOUT_TOTAL = float(value("CRAWLER_TIMEOUT_TOTAL", "120"))
        self.CRAWLER_MAX_CONCURRENCY = int(value("CRAWLER_MAX_CONCURRENCY", "4"))
        if self.CRAWLER_MAX_CONCURRENCY < 1:
            raise ValueError("CRAWLER_MAX_CONCURRENCY must be >= 1")
        self.CRAWLER_CIRCUIT_BREAKER_THRESHOLD = int(
            value("CRAWLER_CIRCUIT_BREAKER_THRESHOLD", "10")
        )
        self.CRAWLER_CIRCUIT_BREAKER_COOLDOWN = int(
            value("CRAWLER_CIRCUIT_BREAKER_COOLDOWN", "600")
        )
        self.CRAWLER_MAX_RETRIES = int(value("CRAWLER_MAX_RETRIES", "5"))

        # Storage prefixes
        self.CONFERENCE_BRONZE_PREFIX = value("CONFERENCE_BRONZE_PREFIX", "bronze/conferences")
        self.CONFERENCE_SILVER_PREFIX = value("CONFERENCE_SILVER_PREFIX", "silver/papers")

        # Schedule (advisory only)
        self.CRAWLER_OFFPEAK_ENABLED = value("CRAWLER_OFFPEAK_ENABLED", "false").lower() in (
            "1",
            "true",
            "yes",
        )
        self.CRAWLER_OFFPEAK_START_HOUR = int(value("CRAWLER_OFFPEAK_START_HOUR", "1"))
        self.CRAWLER_OFFPEAK_END_HOUR = int(value("CRAWLER_OFFPEAK_END_HOUR", "6"))

        # Logging
        self.LOG_LEVEL = value("LOG_LEVEL", "INFO").upper()
        if self.LOG_LEVEL not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
            raise ValueError("Invalid LOG_LEVEL")

    def get_r2_endpoint(self) -> str:
        url = self.R2_ENDPOINT_URL
        if not url and self.CLOUDFLARE_ACCOUNT_ID:
            url = f"https://{self.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com"
        if url and "://" not in url:
            url = f"https://{url}"
        if url:
            parts = urlsplit(url)
            if parts.scheme not in {"http", "https"} or not parts.hostname or parts.username:
                raise ValueError("R2_ENDPOINT_URL must be an HTTP(S) endpoint")
        return url.rstrip("/")

    def get_venue_rate_limit(self, venue: str) -> float:
        """Return configured per-second rate for a venue (or 0 for default API)."""
        return {
            "KDD": self.KDD_RATE_LIMIT_RPS,
            "ICML": self.ICML_RATE_LIMIT_RPS,
            "ICLR": self.ICLR_RATE_LIMIT_RPS,
            "NeurIPS": self.NEURIPS_RATE_LIMIT_RPS,
        }.get(venue.upper(), 0.0)


settings = Settings()
