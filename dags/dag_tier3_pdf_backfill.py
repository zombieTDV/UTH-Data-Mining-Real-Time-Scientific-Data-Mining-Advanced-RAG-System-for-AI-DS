"""Apache Airflow DAG: Tier 3 - open-access PDF backfill for classics that are not on arXiv (manual trigger).

Tier 3 papers without an arXiv id (LSTM, ImageNet, ...) that are still abstract-only in Silver get their
Semantic Scholar openAccessPdf link and are re-published with refresh=True. The queue consumer then downloads the
PDF, extracts the text with PyMuPDF, writes a new Silver row and replaces the paper's Qdrant chunks.
New Tier 3 runs already carry the PDF link, so this is only needed for papers harvested before that.

Trigger after the queue has drained: airflow dags trigger dag_tier3_pdf_backfill
"""

import logging
import time
from datetime import datetime, timedelta

import pendulum
import requests
from airflow import DAG
from airflow.operators.python import PythonOperator

from _common import emit, env, on_failure, ping_infrastructure, publish_paper, silver_files

logger = logging.getLogger("airflow.task")
local_tz = pendulum.timezone("Asia/Ho_Chi_Minh")

S2_BATCH = "https://api.semanticscholar.org/graph/v1/paper/batch"
BATCH = 500  # S2 batch endpoint limit
COLUMNS = ["paper_id", "title", "abstract", "authors", "categories", "primary_category", "published_date",
           "doi", "journal_ref", "cite_count", "source", "tier", "content_origin"]

default_args = {
    "on_failure_callback": on_failure,
    "owner": "uth_data_mining",
    "depends_on_past": False,
    "email_on_failure": False,
    "email_on_retry": False,
    "retries": 0,
}


def _open_access_pdfs(s2_ids):
    """{s2 paperId: openAccessPdf url} via the batch endpoint, with backoff on 429 / 5xx."""
    headers = {"x-api-key": env("SEMANTIC_SCHOLAR_API_KEY")} if env("SEMANTIC_SCHOLAR_API_KEY") else {}
    out = {}
    for i in range(0, len(s2_ids), BATCH):
        chunk = s2_ids[i:i + BATCH]
        for attempt in range(1, 13):
            r = requests.post(S2_BATCH, params={"fields": "openAccessPdf"}, json={"ids": chunk}, headers=headers, timeout=60)
            if r.status_code == 200:
                break
            logger.warning("HTTP %s from S2 batch (try %d/12)", r.status_code, attempt)
            if r.status_code not in (429, 500, 502, 503, 504):
                r.raise_for_status()
            time.sleep(min(60, 5 * attempt))
        else:
            raise RuntimeError("Semantic Scholar batch endpoint kept failing")
        for sid, row in zip(chunk, r.json()):
            url = ((row or {}).get("openAccessPdf") or {}).get("url")
            if url:
                out[sid] = url
        time.sleep(1.0)
    return out


def backfill_open_access_pdfs(**_context):
    import pyarrow.parquet as pq

    fs, files = silver_files()
    rows, done = {}, set()
    for path in files:
        for r in pq.read_table(path, columns=COLUMNS, filesystem=fs).to_pylist():
            if r["tier"] != "tier3" or not str(r["paper_id"]).startswith("s2_"):
                continue
            if r["content_origin"] == "open_access_pdf":
                done.add(r["paper_id"])  # already re-indexed with its full text
            else:
                rows.setdefault(r["paper_id"], r)
    todo = {pid: r for pid, r in rows.items() if pid not in done}
    logger.info("[TIER 3 PDF] %d non-arXiv landmarks, %d still abstract-only", len(rows | {p: None for p in done}), len(todo))

    urls = _open_access_pdfs([pid[len("s2_"):] for pid in todo])
    queued = 0
    for pid, r in todo.items():
        url = urls.get(pid[len("s2_"):])
        if not url:
            continue
        paper = {k: r[k] for k in COLUMNS if k != "content_origin"}
        paper.update({"pdf_url": url, "html_url": "", "link": f"https://www.semanticscholar.org/paper/{pid[len('s2_'):]}", "refresh": True})
        queued += publish_paper(paper)

    msg = f"Tier 3 PDF backfill: {len(todo)} abstract-only classics, {len(urls)} have an open-access PDF, {queued} queued for re-indexing."
    logger.info("[TIER 3 PDF] %s", msg)
    emit("SUCCESS", "HARVEST", msg, tier="tier3", refresh=True)
    return {"abstract_only": len(todo), "with_pdf": len(urls), "queued": queued}


with DAG(
    dag_id="dag_tier3_pdf_backfill",
    default_args=default_args,
    description="Tier 3: open-access PDF full text for classics not on arXiv (one-off, manual trigger)",
    schedule=None,
    start_date=datetime(2025, 1, 1, tzinfo=local_tz),
    catchup=False,
    tags=["tier3", "landmark", "semantic_scholar", "pdf"],
) as dag:
    ping = PythonOperator(task_id="ping_infrastructure", python_callable=ping_infrastructure)
    backfill = PythonOperator(task_id="backfill_open_access_pdfs", python_callable=backfill_open_access_pdfs, execution_timeout=timedelta(hours=1))
    ping >> backfill
