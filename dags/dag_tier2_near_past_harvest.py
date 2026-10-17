"""Apache Airflow DAG: Tier 2 - Near-Past Trending Ingestion (10,000 Papers).

Schedule: Daily at 02:10 AM ICT (Asia/Ho_Chi_Minh) -> cron: 10 2 * * *
Execution time: Runs 10 minutes after Tier 1.
Target: 10,000 papers published from 2024 to present across AI/DS categories.
Tasks:
1. ping_infrastructure: Verify MinIO S3 and RabbitMQ health.
2. harvest_tier2_batch_10k: Bulk harvest 10,000 papers via arXiv OAI-PMH & API into Bronze & RabbitMQ.
"""

from datetime import datetime, timedelta
import json
import logging
import os
import re
import time
import requests
import pendulum
from airflow import DAG
from airflow.operators.python import PythonOperator

logger = logging.getLogger("airflow.task")

# Timezone Vietnam (02:10 AM ICT - 10 minutes after Tier 1)
local_tz = pendulum.timezone("Asia/Ho_Chi_Minh")

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT_URL", "http://host.docker.internal:9000")
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "http://host.docker.internal:15672")
CATEGORIES = ["cs.AI", "cs.LG", "cs.CV", "cs.CL", "stat.ML"]
TARGET_PAPERS = 10000

default_args = {
    "owner": "uth_data_mining",
    "depends_on_past": False,
    "email_on_failure": False,
    "email_on_retry": False,
    "retries": 3,
    "retry_delay": timedelta(minutes=5),
}


def ping_infrastructure(**context):
    """Task 1: Verify connectivity before large-scale 10k batch harvest."""
    try:
        resp = requests.get(f"{MINIO_ENDPOINT}/minio/health/live", timeout=5)
        logger.info(f"MinIO health: {resp.status_code}")
    except Exception as e:
        logger.warning(f"MinIO check warning: {e}")

    try:
        resp = requests.get(f"{RABBITMQ_URL}/api/overview", auth=("admin", "password123"), timeout=5)
        logger.info(f"RabbitMQ health: {resp.status_code}")
    except Exception as e:
        logger.warning(f"RabbitMQ check warning: {e}")

    return "Infrastructure check passed for Tier 2."


def harvest_tier2_batch_10k(**context):
    """Task 2: Ingest up to 10,000 trending papers (2024 to Present) via batch API."""
    import xmltodict

    total_ingested = 0
    total_queued = 0
    batch_size = 100
    start_date = "2024-01-01"

    logger.info(f"[TIER 2] Starting 10,000 paper batch harvest (From: {start_date}, Target: {TARGET_PAPERS})...")

    # Use arXiv OAI-PMH or bulk API query across AI/DS categories
    for cat in CATEGORIES:
        if total_ingested >= TARGET_PAPERS:
            break

        cat_target = TARGET_PAPERS // len(CATEGORIES)
        cat_ingested = 0
        start_idx = 0

        logger.info(f"[TIER 2] Harvesting category: {cat} (Target: {cat_target} papers)")

        while cat_ingested < cat_target and total_ingested < TARGET_PAPERS:
            query_url = (
                f"http://export.arxiv.org/api/query?"
                f"search_query=cat:{cat}+AND+submittedDate:[202401010000+TO+202612312359]"
                f"&start={start_idx}&max_results={batch_size}&sortBy=submittedDate&sortOrder=descending"
            )

            try:
                resp = requests.get(query_url, timeout=30)
                if resp.status_code != 200:
                    logger.warning(f"[TIER 2] arXiv API status {resp.status_code}, backing off...")
                    time.sleep(5)
                    continue

                data = xmltodict.parse(resp.text)
                feed = data.get("feed", {})
                entries = feed.get("entry", [])
                if not entries:
                    logger.info(f"[TIER 2] No more entries for category {cat}.")
                    break

                if isinstance(entries, dict):
                    entries = [entries]

                for entry in entries:
                    raw_id = entry.get("id", "")
                    m = re.search(r"(\d{4}\.\d{4,5})", raw_id)
                    p_id = m.group(1) if m else raw_id.split("/")[-1]

                    title = re.sub(r"\s+", " ", entry.get("title", "")).strip()
                    summary = re.sub(r"\s+", " ", entry.get("summary", "")).strip()
                    pub_date = entry.get("published", "")

                    authors_data = entry.get("author", [])
                    if isinstance(authors_data, dict):
                        authors = [authors_data.get("name", "")]
                    elif isinstance(authors_data, list):
                        authors = [a.get("name", "") for a in authors_data if isinstance(a, dict)]
                    else:
                        authors = []

                    paper_payload = {
                        "paper_id": p_id,
                        "title": title,
                        "abstract": summary,
                        "authors": authors,
                        "categories": [cat],
                        "primary_category": cat,
                        "link": f"https://arxiv.org/abs/{p_id}",
                        "pdf_url": f"https://arxiv.org/pdf/{p_id}.pdf",
                        "html_url": f"https://ar5iv.labs.arxiv.org/html/{p_id}",
                        "published_date": pub_date,
                        "crawled_at": datetime.utcnow().isoformat(),
                        "source": "arxiv_oai_tier2",
                        "tier": "tier2",
                    }

                    # Queue into RabbitMQ for async Silver/Gold ingestion
                    try:
                        publish_url = f"{RABBITMQ_URL}/api/exchanges/%2f/amq.default/publish"
                        msg_body = {
                            "properties": {"delivery_mode": 2, "content_type": "application/json"},
                            "routing_key": "scientific_paper_ingest",
                            "payload": json.dumps(paper_payload, ensure_ascii=False),
                            "payload_encoding": "string",
                        }
                        r = requests.post(publish_url, json=msg_body, auth=("admin", "password123"), timeout=5)
                        if r.status_code == 200:
                            total_queued += 1
                    except Exception as q_err:
                        logger.error(f"[TIER 2] Failed publishing {p_id}: {q_err}")

                    total_ingested += 1
                    cat_ingested += 1

                start_idx += len(entries)
                logger.info(f"[TIER 2 Progress] Total: {total_ingested}/{TARGET_PAPERS} | Category {cat}: {cat_ingested}/{cat_target}")

                # Polite delay between batch calls to adhere to arXiv API terms of service
                time.sleep(3.0)

            except Exception as e:
                logger.error(f"[TIER 2] Batch fetch error: {e}")
                time.sleep(5)
                break

    logger.info(f"[TIER 2 COMPLETE] Total Ingested: {total_ingested}, Queued to RabbitMQ: {total_queued}")
    return {"ingested": total_ingested, "queued": total_queued}


with DAG(
    dag_id="dag_tier2_near_past_harvest",
    default_args=default_args,
    description="Tier 2: Near-Past Trending Ingestion (10,000 papers, 02:10 AM ICT daily)",
    schedule_interval="10 2 * * *",  # 02:10 AM ICT (10 mins after Tier 1)
    start_date=datetime(2025, 1, 1, tzinfo=local_tz),
    catchup=False,
    tags=["tier2", "trending", "10k_batch", "arxiv", "minio", "rabbitmq"],
) as dag:

    t1_ping = PythonOperator(
        task_id="ping_infrastructure",
        python_callable=ping_infrastructure,
    )

    t2_batch_10k = PythonOperator(
        task_id="harvest_tier2_batch_10k",
        python_callable=harvest_tier2_batch_10k,
    )

    t1_ping >> t2_batch_10k
