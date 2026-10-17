"""Apache Airflow DAG: Tier 2 - Near-Past Ingestion (present -> past, 10k papers/run).

Schedule: daily 05:00 ICT (10 minutes after the Tier 1 stream at 04:50).
Walks arXiv BACKWARDS in time per category (newest first, down to 2024-01-01). A per-category cursor in an
Airflow Variable remembers the oldest submission reached, so each run continues deeper into the past instead of
re-harvesting the same papers. Papers go to RabbitMQ; the queue consumer writes Bronze / Silver / Gold.
(Tier 1 = the live stream at 04:50; Tier 3 = the historical archive, already harvested and never crawled again.)
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
from airflow.timetables.trigger import CronTriggerTimetable

from _common import emit, on_failure, categories, ensure_published, http_headers, ping_infrastructure, publish_paper

logger = logging.getLogger("airflow.task")
local_tz = pendulum.timezone("Asia/Ho_Chi_Minh")

TARGET_PAPERS = 10000
BATCH_SIZE = 100
FLOOR = "202401010000"  # oldest submission date to reach (arXiv format YYYYMMDDHHMM)
MAX_FETCH_FAILURES = 3
CURSOR_VAR = "tier2_cursor_{cat}"

default_args = {
    "on_failure_callback": on_failure,
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


def harvest_tier2_batch_10k(**context):
    import xmltodict

    conf = (context.get("dag_run") and context["dag_run"].conf) or {}
    # Per-run override: --conf '{"target": 100}', else the Airflow Variable tier2_target_papers, else 10,000
    target = int(conf.get("target") or Variable.get("tier2_target_papers", default_var=TARGET_PAPERS))
    cats = categories()
    per_cat = target // len(cats)
    ingested = queued = 0
    emit("INFO", "HARVEST", f"Tier 2 harvest started: target {target} papers, newest first, down to {FLOOR[:4]}-{FLOOR[4:6]}-{FLOOR[6:8]}.", tier="tier2")

    for cat in cats:
        upper = Variable.get(CURSOR_VAR.format(cat=cat), default_var=datetime.now(timezone.utc).strftime("%Y%m%d%H%M"))
        got = start = failures = 0
        oldest = upper
        logger.info("[TIER 2] %s: walking back from %s (budget %d)", cat, upper, per_cat)

        while got < per_cat:
            url = (
                "https://export.arxiv.org/api/query?"
                f"search_query=cat:{cat}+AND+submittedDate:[{FLOOR}+TO+{upper}]"
                f"&start={start}&max_results={min(BATCH_SIZE, per_cat - got)}&sortBy=submittedDate&sortOrder=descending"
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
                logger.info("[TIER 2] %s: reached the floor (%s)", cat, FLOOR)
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
                    oldest = min(oldest, _to_arxiv_stamp(published))

            start += len(entries)
            logger.info("[TIER 2] %s: %d/%d (total %d)", cat, got, per_cat, ingested)
            time.sleep(3.0)  # arXiv API terms: be polite

        emit("INFO", "HARVEST", f"Tier 2 {cat}: {got} paper(s) queued, now back to {oldest[:4]}-{oldest[4:6]}-{oldest[6:8]}.", tier="tier2")
        # Move the cursor back only after the batch reached the queue
        if oldest < upper:
            Variable.set(CURSOR_VAR.format(cat=cat), oldest)

    logger.info("[TIER 2 COMPLETE] ingested=%d queued=%d", ingested, queued)
    emit("SUCCESS" if queued else "ERROR", "HARVEST", f"Tier 2 harvest done: {ingested} fetched, {queued} queued to RabbitMQ.", tier="tier2", refresh=True)
    ensure_published(ingested, queued)
    return {"ingested": ingested, "queued": queued}


with DAG(
    dag_id="dag_tier2_near_past_harvest",
    default_args=default_args,
    description="Tier 2: near-past arXiv ingestion, present -> past (10k papers/run, 05:00 AM ICT daily)",
    schedule=CronTriggerTimetable("0 5 * * *", timezone=local_tz),  # fires exactly at 05:00 ICT, 10 minutes after Tier 1
    start_date=datetime(2025, 1, 1, tzinfo=local_tz),
    catchup=False,
    tags=["tier2", "trending", "arxiv", "rabbitmq"],
) as dag:
    ping = PythonOperator(task_id="ping_infrastructure", python_callable=ping_infrastructure)
    harvest = PythonOperator(task_id="harvest_tier2_batch_10k", python_callable=harvest_tier2_batch_10k)
    ping >> harvest
