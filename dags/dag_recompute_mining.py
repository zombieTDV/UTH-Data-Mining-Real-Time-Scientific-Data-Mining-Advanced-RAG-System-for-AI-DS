"""Apache Airflow DAG: Weekly Data Mining Recalculation.

Schedule: Sunday 00:00 UTC.
Triggers the backend mining run (EDA + FP-Growth + clustering + graph + trends). The engine reads Silver
Parquet from MinIO and vectors from Qdrant and publishes every artifact to MinIO gold/mining/.

Required env on the Airflow worker: BACKEND_MINING_TRIGGER_URL (e.g. http://<backend>:8000/api/mining/trigger).
"""

import logging
import os
from datetime import datetime, timedelta

import requests
from airflow import DAG
from airflow.operators.python import PythonOperator

logger = logging.getLogger("airflow.task")

default_args = {
    "owner": "uth_data_mining",
    "depends_on_past": False,
    "email_on_failure": False,
    "email_on_retry": False,
    "retries": 1,
    "retry_delay": timedelta(minutes=5),
}


def trigger_mining(**_context):
    url = os.environ["BACKEND_MINING_TRIGGER_URL"]
    resp = requests.post(url, timeout=30)
    resp.raise_for_status()  # 409 (run already in progress) or any failure fails the task
    logger.info("Mining run queued: %s", resp.json())
    return resp.json()


with DAG(
    dag_id="dag_recompute_mining",
    default_args=default_args,
    description="Weekly recalculation of EDA, association rules, clusters, graph and trends",
    schedule_interval="0 0 * * 0",
    start_date=datetime(2025, 1, 1),
    catchup=False,
    tags=["mining", "lakehouse"],
) as dag:
    PythonOperator(task_id="trigger_mining_run", python_callable=trigger_mining)
