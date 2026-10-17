"""Apache Airflow DAG: Silver compaction.

Schedule: daily 03:00 ICT, after the Tier 1 (02:00) and Tier 2 (02:10) harvests have had time to drain.
The queue consumer writes each micro-batch as an immutable part under silver/papers/year=YYYY/parts/. This DAG asks
the backend to fold those parts into silver/papers/year=YYYY/papers.parquet (deduplicated by abstract hash) so the
dashboard, DuckDB and the mining engine see the new papers.

Required env on the Airflow worker: BACKEND_COMPACT_SILVER_URL (e.g. http://<backend>:8000/api/ingestion/compact-silver).
"""

import logging
import os
from datetime import datetime, timedelta

import pendulum
import requests
from airflow import DAG
from airflow.operators.python import PythonOperator

logger = logging.getLogger("airflow.task")
local_tz = pendulum.timezone("Asia/Ho_Chi_Minh")

default_args = {
    "owner": "uth_data_mining",
    "depends_on_past": False,
    "email_on_failure": False,
    "email_on_retry": False,
    "retries": 2,
    "retry_delay": timedelta(minutes=10),
}


def compact_silver(**_context):
    resp = requests.post(os.environ["BACKEND_COMPACT_SILVER_URL"], timeout=1800)  # merging a large year file takes a while
    resp.raise_for_status()  # 409 (already running) or any failure fails the task and triggers the retry
    result = resp.json()
    logger.info("Silver compaction: %d part(s) merged across years %s", result.get("parts", 0), result.get("years"))
    return result


with DAG(
    dag_id="dag_compact_silver",
    default_args=default_args,
    description="Daily compaction of streaming Silver parts into per-year papers.parquet (03:00 AM ICT)",
    schedule_interval="0 3 * * *",
    start_date=datetime(2025, 1, 1, tzinfo=local_tz),
    catchup=False,
    tags=["silver", "compaction", "lakehouse"],
) as dag:
    PythonOperator(task_id="compact_silver_parts", python_callable=compact_silver)
