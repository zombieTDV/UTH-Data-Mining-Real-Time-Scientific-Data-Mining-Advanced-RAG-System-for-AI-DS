"""Shared helpers for the harvest DAGs. Every endpoint and credential comes from the
Airflow worker environment (same variable names as the project .env); nothing is hardcoded.

Required env: RABBITMQ_MGMT_URL, RABBITMQ_USER, RABBITMQ_PASSWORD, MINIO_ENDPOINT_URL.
Optional env: RABBITMQ_QUEUE_INGEST, ARXIV_CATEGORIES, HARVESTER_USER_AGENT.
"""

import json
import logging
import os
from typing import Any, Dict, List

import requests

logger = logging.getLogger("airflow.task")


def env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def require_env(name: str) -> str:
    value = env(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable {name} on the Airflow worker")
    return value


def categories() -> List[str]:
    return [c.strip() for c in env("ARXIV_CATEGORIES", "cs.AI,cs.LG,cs.CV,cs.CL,stat.ML").split(",") if c.strip()]


def http_headers() -> Dict[str, str]:
    return {"User-Agent": env("HARVESTER_USER_AGENT", "UTH-Scientific-Harvester/2.0")}


def queue_name() -> str:
    return env("RABBITMQ_QUEUE_INGEST", "scientific_paper_ingest")


def _rabbit_auth():
    return require_env("RABBITMQ_USER"), require_env("RABBITMQ_PASSWORD")


def ping_infrastructure(**_context) -> str:
    """Fail the DAG early if MinIO or RabbitMQ is unreachable (a silent warning here used to hide outages)."""
    minio = require_env("MINIO_ENDPOINT_URL").rstrip("/")
    requests.get(f"{minio}/minio/health/live", timeout=5).raise_for_status()
    base = require_env("RABBITMQ_MGMT_URL").rstrip("/")
    requests.get(f"{base}/api/overview", auth=_rabbit_auth(), timeout=5).raise_for_status()
    return "MinIO and RabbitMQ healthy"


def publish_paper(paper: Dict[str, Any]) -> bool:
    """Publish one paper to the ingest queue via the management API. True only if the broker routed it."""
    base = require_env("RABBITMQ_MGMT_URL").rstrip("/")
    body = {
        "properties": {"delivery_mode": 2, "content_type": "application/json"},
        "routing_key": queue_name(),
        "payload": json.dumps(paper, ensure_ascii=False),
        "payload_encoding": "string",
    }
    try:
        r = requests.post(f"{base}/api/exchanges/%2f/amq.default/publish", json=body, auth=_rabbit_auth(), timeout=5)
        return r.status_code == 200 and bool(r.json().get("routed"))
    except Exception as e:
        logger.error("Publish failed for %s: %s", paper.get("paper_id"), e)
        return False


def ensure_published(harvested: int, queued: int) -> None:
    """Make the task fail loudly when papers were harvested but none reached the queue."""
    if harvested and not queued:
        raise RuntimeError(f"Harvested {harvested} papers but queued 0: RabbitMQ publish is failing")
