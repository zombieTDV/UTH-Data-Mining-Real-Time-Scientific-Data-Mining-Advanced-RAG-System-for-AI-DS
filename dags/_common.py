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
    if not harvested:
        raise RuntimeError("Harvested 0 papers: the source returned nothing (feed outage or wrong endpoint)")
    if not queued:
        raise RuntimeError(f"Harvested {harvested} papers but queued 0: RabbitMQ publish is failing")


def _clean(text: str) -> str:
    import re

    return re.sub(r"\s+", " ", text or "").strip()


def fetch_recent(cat: str, limit: int) -> List[Dict[str, Any]]:
    """Newest papers of a category as normalized dicts.

    Tries the daily RSS (new + cross-listed only, abstract prefix stripped). rss.arxiv.org returns an empty feed
    on non-announcement days, so it falls back to the arXiv API sorted by submission date.
    """
    import re

    import feedparser

    out: List[Dict[str, Any]] = []
    feed = feedparser.parse(f"https://rss.arxiv.org/rss/{cat}", request_headers=http_headers())
    for e in feed.entries:
        if e.get("arxiv_announce_type", "new") not in ("new", "cross"):
            continue
        text = _clean(e.summary)
        m = re.search(r"(\d{4}\.\d{4,5})", e.link)
        out.append({
            "paper_id": m.group(1) if m else e.link.split("/")[-1],
            "title": _clean(e.title),
            "abstract": text.split("Abstract:", 1)[1].strip() if "Abstract:" in text else text,
            "authors": [a.name for a in getattr(e, "authors", []) if hasattr(a, "name")],
            "published": getattr(e, "published", ""),
        })
        if len(out) >= limit:
            return out

    if not out:
        logger.info("RSS empty for %s; falling back to the arXiv API", cat)
        url = (
            "https://export.arxiv.org/api/query?"
            f"search_query=cat:{cat}&sortBy=submittedDate&sortOrder=descending&max_results={limit}"
        )
        for e in feedparser.parse(url, request_headers=http_headers()).entries:
            m = re.search(r"(\d{4}\.\d{4,5})", e.id)
            out.append({
                "paper_id": m.group(1) if m else e.id.rsplit("/", 1)[-1],
                "title": _clean(e.title),
                "abstract": _clean(e.summary),
                "authors": [a.name for a in getattr(e, "authors", []) if hasattr(a, "name")],
                "published": getattr(e, "published", ""),
            })
    return out


def emit(level: str, tag: str, msg: str, tier: str = "", refresh: bool = False) -> None:
    """Post a log line to the dashboard backend (best effort; the DAG never fails because the dashboard is down)."""
    url = env("BACKEND_BROADCAST_URL")
    if not url:
        return
    try:
        requests.post(url, json={"type": "LOG", "level": level, "tag": tag, "msg": msg, "tier": tier, "refresh": refresh}, timeout=2)
    except Exception:
        pass


def on_failure(context) -> None:
    ti = context.get("task_instance")
    emit("ERROR", "AIRFLOW", f"Task {ti.dag_id}.{ti.task_id} failed (try {ti.try_number}): {context.get('exception')}", tier=_tier_of(ti.dag_id))


def _tier_of(dag_id: str) -> str:
    return "tier1" if "tier1" in dag_id else "tier2" if "tier2" in dag_id else ""
