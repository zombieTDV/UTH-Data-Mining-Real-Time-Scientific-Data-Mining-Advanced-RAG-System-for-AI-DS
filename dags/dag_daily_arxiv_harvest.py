"""Apache Airflow DAG: Daily Academic Paper Harvesting.

Schedule: daily 01:00 UTC.
Tasks: ping_infrastructure -> harvest_and_ingest_arxiv (arXiv RSS -> RabbitMQ).
Bronze / Silver / Gold are written by the queue consumer, never by this DAG.
"""

import logging
import re
from datetime import datetime, timedelta, timezone

from airflow import DAG
from airflow.operators.python import PythonOperator

from _common import categories, ensure_published, http_headers, ping_infrastructure, publish_paper

logger = logging.getLogger("airflow.task")
PER_CATEGORY = 5

default_args = {
    "owner": "uth_data_mining",
    "depends_on_past": False,
    "email_on_failure": False,
    "email_on_retry": False,
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
}


def harvest_and_ingest_arxiv(**_context):
    import feedparser

    harvested = queued = 0
    for cat in categories():
        feed = feedparser.parse(f"https://export.arxiv.org/rss/{cat}", request_headers=http_headers())
        logger.info("Scanned %s: %d entries", cat, len(feed.entries))
        for entry in feed.entries[:PER_CATEGORY]:
            m = re.search(r"(\d{4}\.\d{4,5})", entry.link)
            pid = m.group(1) if m else entry.link.split("/")[-1]
            paper = {
                "paper_id": pid,
                "title": re.sub(r"\s+", " ", entry.title).strip(),
                "abstract": re.sub(r"\s+", " ", entry.summary).strip(),
                "authors": [a.name for a in getattr(entry, "authors", []) if hasattr(a, "name")],
                "categories": [cat],
                "primary_category": cat,
                "link": entry.link,
                "pdf_url": f"https://arxiv.org/pdf/{pid}.pdf",
                "html_url": f"https://arxiv.org/html/{pid}",
                "published_date": getattr(entry, "published", datetime.now(timezone.utc).isoformat()),
                "crawled_at": datetime.now(timezone.utc).isoformat(),
                "source": "airflow_daily_dag",
                "tier": "tier1",
            }
            harvested += 1
            queued += publish_paper(paper)

    logger.info("Harvest complete. harvested=%d queued=%d", harvested, queued)
    ensure_published(harvested, queued)
    return {"harvested": harvested, "queued": queued}


with DAG(
    dag_id="dag_daily_arxiv_harvest",
    default_args=default_args,
    description="Daily arXiv AI/DS preprint harvesting into RabbitMQ",
    schedule_interval="0 1 * * *",
    start_date=datetime(2025, 1, 1),
    catchup=False,
    tags=["harvesting", "arxiv", "rabbitmq"],
) as dag:
    ping = PythonOperator(task_id="ping_infrastructure", python_callable=ping_infrastructure)
    harvest = PythonOperator(task_id="harvest_and_ingest_arxiv", python_callable=harvest_and_ingest_arxiv)
    ping >> harvest
