"""Apache Airflow DAG: Tier 2 - Near-Past Trending Ingestion (incremental, 10k papers/run).

Schedule: daily 02:10 ICT.
Walks arXiv forward in time per category (oldest first, from 2024-01-01) and remembers a
per-category cursor in an Airflow Variable, so each run continues where the last one stopped
instead of re-harvesting the same newest papers. Papers go to RabbitMQ; the queue consumer
writes Bronze / Silver / Gold.
"""

import logging
import re
import time
from datetime import datetime, timedelta, timezone

import pendulum
import requests
from airflow import DAG
from airflow.models import Variable
from airflow.operators.python import PythonOperator

from _common import categories, ensure_published, http_headers, ping_infrastructure, publish_paper

logger = logging.getLogger("airflow.task")
local_tz = pendulum.timezone("Asia/Ho_Chi_Minh")

TARGET_PAPERS = 10000
BATCH_SIZE = 100
INITIAL_CURSOR = "202401010000"  # arXiv submittedDate format YYYYMMDDHHMM
MAX_FETCH_FAILURES = 3
CURSOR_VAR = "tier2_cursor_{cat}"

default_args = {
    "owner": "uth_data_mining",
    "depends_on_past": False,
    "email_on_failure": False,
    "email_on_retry": False,
    "retries": 3,
    "retry_delay": timedelta(minutes=5),
}


def _to_arxiv_stamp(iso_ts: str) -> str:
    """'2024-03-05T12:34:56Z' -> '202403051234' (arXiv submittedDate)."""
    return re.sub(r"\D", "", iso_ts)[:12]


def harvest_tier2_batch_10k(**_context):
    import xmltodict

    cats = categories()
    per_cat = TARGET_PAPERS // len(cats)
    ingested = queued = 0

    for cat in cats:
        cursor = Variable.get(CURSOR_VAR.format(cat=cat), default_var=INITIAL_CURSOR)
        now_stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
        got = start = failures = 0
        newest = cursor
        logger.info("[TIER 2] %s: continuing from cursor %s (budget %d)", cat, cursor, per_cat)

        while got < per_cat:
            url = (
                "https://export.arxiv.org/api/query?"
                f"search_query=cat:{cat}+AND+submittedDate:[{cursor}+TO+{now_stamp}]"
                f"&start={start}&max_results={BATCH_SIZE}&sortBy=submittedDate&sortOrder=ascending"
            )
            try:
                resp = requests.get(url, headers=http_headers(), timeout=30)
                resp.raise_for_status()
                entries = xmltodict.parse(resp.text).get("feed", {}).get("entry", [])
            except Exception as e:
                failures += 1
                logger.warning("[TIER 2] %s fetch failed (%d/%d): %s", cat, failures, MAX_FETCH_FAILURES, e)
                if failures >= MAX_FETCH_FAILURES:
                    break  # bounded: never spin forever on a bad endpoint
                time.sleep(5 * failures)
                continue
            failures = 0

            if isinstance(entries, dict):
                entries = [entries]
            if not entries:
                logger.info("[TIER 2] %s: caught up", cat)
                break

            for entry in entries:
                raw_id = entry.get("id", "")
                m = re.search(r"(\d{4}\.\d{4,5})", raw_id)
                pid = m.group(1) if m else raw_id.split("/")[-1]
                authors = entry.get("author", [])
                authors = [authors] if isinstance(authors, dict) else authors
                published = entry.get("published", "")
                paper = {
                    "paper_id": pid,
                    "title": re.sub(r"\s+", " ", entry.get("title", "")).strip(),
                    "abstract": re.sub(r"\s+", " ", entry.get("summary", "")).strip(),
                    "authors": [a.get("name", "") for a in authors if isinstance(a, dict)],
                    "categories": [cat],
                    "primary_category": cat,
                    "link": f"https://arxiv.org/abs/{pid}",
                    "pdf_url": f"https://arxiv.org/pdf/{pid}.pdf",
                    "html_url": f"https://arxiv.org/html/{pid}",
                    "published_date": published,
                    "crawled_at": datetime.now(timezone.utc).isoformat(),
                    "source": "arxiv_api_tier2",
                    "tier": "tier2",
                }
                queued += publish_paper(paper)
                ingested += 1
                got += 1
                if published:
                    newest = max(newest, _to_arxiv_stamp(published))

            start += len(entries)
            logger.info("[TIER 2] %s: %d/%d (total %d)", cat, got, per_cat, ingested)
            time.sleep(3.0)  # arXiv API terms: be polite

        # Advance the cursor only after the batch reached the queue
        if newest > cursor:
            Variable.set(CURSOR_VAR.format(cat=cat), newest)

    logger.info("[TIER 2 COMPLETE] ingested=%d queued=%d", ingested, queued)
    ensure_published(ingested, queued)
    return {"ingested": ingested, "queued": queued}


with DAG(
    dag_id="dag_tier2_near_past_harvest",
    default_args=default_args,
    description="Tier 2: incremental near-past arXiv ingestion (10k papers/run, 02:10 AM ICT daily)",
    schedule_interval="10 2 * * *",
    start_date=datetime(2025, 1, 1, tzinfo=local_tz),
    catchup=False,
    tags=["tier2", "trending", "arxiv", "rabbitmq"],
) as dag:
    ping = PythonOperator(task_id="ping_infrastructure", python_callable=ping_infrastructure)
    harvest = PythonOperator(task_id="harvest_tier2_batch_10k", python_callable=harvest_tier2_batch_10k)
    ping >> harvest
