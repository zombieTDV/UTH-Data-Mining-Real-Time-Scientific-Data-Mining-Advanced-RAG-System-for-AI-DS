"""Apache Airflow DAG: Tier 1 - Live Real-Time Forward Stream.

Schedule: daily 04:50 ICT (Asia/Ho_Chi_Minh).
Tasks:
1. ping_infrastructure: fail fast if MinIO / RabbitMQ are down.
2. harvest_tier1_realtime: read arXiv RSS and publish new preprints to RabbitMQ.

The queue consumer (src.ingestion.queue_consumer) is the single writer for Bronze / Silver /
Gold and the dedup registry, so duplicates published here are dropped there.
"""

import logging
from datetime import datetime, timedelta, timezone

import pendulum
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.timetables.trigger import CronTriggerTimetable

from _common import emit, on_failure, categories, ensure_published, fetch_recent, ping_infrastructure, publish_paper

logger = logging.getLogger("airflow.task")
local_tz = pendulum.timezone("Asia/Ho_Chi_Minh")
PER_CATEGORY = 10

default_args = {
    "on_failure_callback": on_failure,
    "owner": "uth_data_mining",
    "depends_on_past": False,
    "email_on_failure": False,
    "email_on_retry": False,
    "retries": 2,
    "retry_delay": timedelta(minutes=3),
}


def harvest_tier1_realtime(**_context):
    harvested = queued = 0
    per_cat = {}
    emit("INFO", "HARVEST", f"Tier 1 real-time harvest started ({PER_CATEGORY} newest per category).", tier="tier1")
    for cat in categories():
        got = 0
        for item in fetch_recent(cat, PER_CATEGORY):
            pid = item["paper_id"]
            paper = {
                "paper_id": pid,
                "title": item["title"],
                "abstract": item["abstract"],
                "authors": item["authors"],
                "categories": [cat],
                "primary_category": cat,
                "link": f"https://arxiv.org/abs/{pid}",
                "pdf_url": f"https://arxiv.org/pdf/{pid}.pdf",
                "html_url": f"https://arxiv.org/html/{pid}",
                "published_date": item["published"] or datetime.now(timezone.utc).isoformat(),
                "crawled_at": datetime.now(timezone.utc).isoformat(),
                "source": "arxiv_rss_realtime",
                "tier": "tier1",
            }
            harvested += 1
            got += 1
            queued += publish_paper(paper)
        per_cat[cat] = got

    logger.info("[TIER 1 COMPLETE] harvested=%d queued=%d", harvested, queued)
    emit("SUCCESS" if queued else "ERROR", "HARVEST",
         f"Tier 1 harvest: {harvested} paper(s) fetched, {queued} queued to RabbitMQ (" + ", ".join(f"{c} {n}" for c, n in per_cat.items()) + ")",
         tier="tier1", refresh=True)
    ensure_published(harvested, queued)
    return {"harvested": harvested, "queued": queued}


with DAG(
    dag_id="dag_tier1_realtime_stream",
    default_args=default_args,
    description="Tier 1: daily arXiv AI/DS live preprint stream (04:50 AM ICT)",
    schedule=CronTriggerTimetable("50 4 * * *", timezone=local_tz),  # fires exactly at 04:50 ICT (not at the end of an interval)
    start_date=datetime(2025, 1, 1, tzinfo=local_tz),
    catchup=False,
    tags=["tier1", "realtime", "arxiv", "rabbitmq"],
) as dag:
    ping = PythonOperator(task_id="ping_infrastructure", python_callable=ping_infrastructure)
    harvest = PythonOperator(task_id="harvest_tier1_realtime", python_callable=harvest_tier1_realtime)
    ping >> harvest
