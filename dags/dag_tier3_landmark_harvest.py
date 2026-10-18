"""Apache Airflow DAG: Tier 3 - Historical Landmarks (one-off, manual trigger).

The most-cited AI / CV / NLP / Robotics papers of all time, ranked by Semantic Scholar citation count.
1. Semantic Scholar bulk search (Computer Science, sorted by citationCount desc) gives the ranking.
2. A paper is kept when its real arXiv categories hit the AI / CV / NLP / Robotics set, or, for classics that
   are not on arXiv (AlexNet, LSTM, ...), when its venue is an AI / CV / NLP / Robotics venue.
3. Papers already in Silver are skipped; the rest go to RabbitMQ (tier3) and the queue consumer fetches the
   full text (arXiv HTML5 -> ar5iv; for classics not on arXiv the open-access PDF; else the abstract) and writes
   Bronze / Silver / Qdrant.

Trigger: airflow dags trigger dag_tier3_landmark_harvest [--conf '{"target": 3000}']
Optional env: SEMANTIC_SCHOLAR_API_KEY (without it the shared pool rate-limits hard, so requests are retried).
"""

import logging
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

import pendulum
import requests
from airflow import DAG
from airflow.operators.python import PythonOperator

from _common import emit, env, ensure_published, http_headers, is_known, known_paper_ids, remember, on_failure, ping_infrastructure, publish_paper

logger = logging.getLogger("airflow.task")
local_tz = pendulum.timezone("Asia/Ho_Chi_Minh")

TARGET_PAPERS = 3000
MIN_CITATIONS = 500  # keeps the S2 hit count under its 10M bulk-search cap; far below where the top 3000 ends
S2_BULK = "https://api.semanticscholar.org/graph/v1/paper/search/bulk"
S2_FIELDS = "title,abstract,authors,year,venue,publicationDate,externalIds,citationCount,openAccessPdf"
ARXIV_CATS = {"cs.AI", "cs.LG", "stat.ML", "cs.NE", "cs.CV", "cs.CL", "cs.RO"}  # AI (incl. ML), CV, NLP, Robotics
AI_VENUES = re.compile(
    r"neural information processing|neurips|\bnips\b|machine learning|learning representations|\biclr\b|\bicml\b"
    r"|computer vision|pattern recognition|\bcvpr\b|\biccv\b|\beccv\b|pattern analysis and machine intelligence"
    r"|computational linguistics|\bacl\b|\bemnlp\b|\bnaacl\b|\bcoling\b|natural language"
    r"|artificial intelligence|\baaai\b|\bijcai\b|neural computation|neural networks|robotics|\bicra\b|\biros\b",
    re.I,
)

default_args = {
    "on_failure_callback": on_failure,
    "owner": "uth_data_mining",
    "depends_on_past": False,
    "email_on_failure": False,
    "email_on_retry": False,
    "retries": 1,
    "retry_delay": timedelta(minutes=5),
}


def _get(url: str, params: Dict[str, Any] = None, headers: Dict[str, str] = None, attempts: int = 12) -> requests.Response:
    """GET with backoff on 429 / 5xx (the keyless Semantic Scholar pool answers 429 often)."""
    for i in range(1, attempts + 1):
        try:
            r = requests.get(url, params=params, headers=headers, timeout=60)
            if r.status_code == 200:
                return r
            logger.warning("HTTP %s from %s (try %d/%d)", r.status_code, url, i, attempts)
            if r.status_code not in (429, 500, 502, 503, 504):
                r.raise_for_status()
        except requests.RequestException as e:
            logger.warning("Request to %s failed (try %d/%d): %s", url, i, attempts, e)
        time.sleep(min(60, 5 * i))
    raise RuntimeError(f"{url} kept failing after {attempts} attempts")


def _arxiv_meta(ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """Real arXiv metadata (categories, abstract, authors, dates) for up to 100 ids per call."""
    import xmltodict

    out: Dict[str, Dict[str, Any]] = {}
    for i in range(0, len(ids), 100):
        chunk = ids[i:i + 100]
        r = _get("https://export.arxiv.org/api/query", {"id_list": ",".join(chunk), "max_results": len(chunk)}, http_headers())
        entries = xmltodict.parse(r.text).get("feed", {}).get("entry", [])
        entries = [entries] if isinstance(entries, dict) else entries
        for e in entries:
            m = re.search(r"abs/(.+?)(v\d+)?$", e.get("id", ""))
            if not m:
                continue
            cats = e.get("category", [])
            cats = [cats] if isinstance(cats, dict) else cats
            authors = e.get("author", [])
            authors = [authors] if isinstance(authors, dict) else authors
            out[m.group(1)] = {
                "categories": [c.get("@term") for c in cats if isinstance(c, dict) and c.get("@term")],
                "primary_category": (e.get("arxiv:primary_category") or {}).get("@term"),
                "abstract": re.sub(r"\s+", " ", e.get("summary", "")).strip(),
                "authors": [a.get("name", "") for a in authors if isinstance(a, dict)],
                "published": e.get("published", ""),
                "doi": e.get("arxiv:doi", {}).get("#text") if isinstance(e.get("arxiv:doi"), dict) else e.get("arxiv:doi"),
                "journal_ref": e.get("arxiv:journal_ref", {}).get("#text") if isinstance(e.get("arxiv:journal_ref"), dict) else e.get("arxiv:journal_ref"),
            }
        time.sleep(3.0)  # arXiv API terms
    return out


def _paper(s2: Dict[str, Any], arxiv_id: str, meta: Dict[str, Any]) -> Dict[str, Any]:
    ext = s2.get("externalIds") or {}
    if arxiv_id:
        pid = arxiv_id
        links = {"link": f"https://arxiv.org/abs/{pid}", "pdf_url": f"https://arxiv.org/pdf/{pid}.pdf", "html_url": f"https://arxiv.org/html/{pid}"}
    else:
        pid = f"s2_{s2['paperId']}"
        # Not on arXiv: the open-access PDF is the only full-text source (the consumer extracts it with PyMuPDF)
        links = {"link": f"https://www.semanticscholar.org/paper/{s2['paperId']}", "pdf_url": (s2.get("openAccessPdf") or {}).get("url") or "", "html_url": ""}
    return {
        "paper_id": pid,
        "title": re.sub(r"\s+", " ", s2.get("title") or "").strip(),
        "abstract": meta.get("abstract") or (s2.get("abstract") or "").strip(),
        "authors": meta.get("authors") or [a.get("name", "") for a in s2.get("authors") or []],
        "categories": meta.get("categories") or [],
        "primary_category": meta.get("primary_category") or (meta.get("categories") or [""])[0] or "",
        "published_date": meta.get("published") or s2.get("publicationDate") or str(s2.get("year") or ""),
        "doi": meta.get("doi") or ext.get("DOI"),
        "journal_ref": meta.get("journal_ref") or s2.get("venue"),
        "cite_count": int(s2.get("citationCount") or 0),
        "crawled_at": datetime.now(timezone.utc).isoformat(),
        "source": "semantic_scholar",
        "tier": "tier3",
        **links,
    }


def harvest_tier3_landmarks(**context):
    conf = (context.get("dag_run") and context["dag_run"].conf) or {}
    target = int(conf.get("target") or TARGET_PAPERS)
    headers = {"x-api-key": env("SEMANTIC_SCHOLAR_API_KEY")} if env("SEMANTIC_SCHOLAR_API_KEY") else {}
    known = known_paper_ids()
    emit("INFO", "HARVEST", f"Tier 3 landmark harvest started: top {target} most-cited AI/CV/NLP/Robotics papers (Semantic Scholar).", tier="tier3")

    params = {"query": "*", "fieldsOfStudy": "Computer Science", "minCitationCount": MIN_CITATIONS,
              "sort": "citationCount:desc", "fields": S2_FIELDS}
    selected = queued = scanned = skipped = 0
    token = None
    while selected < target:
        page = _get(S2_BULK, {**params, **({"token": token} if token else {})}, headers).json()
        rows = page.get("data") or []
        if not rows:
            break
        arxiv_ids = [r["externalIds"]["ArXiv"] for r in rows if (r.get("externalIds") or {}).get("ArXiv")]
        meta = _arxiv_meta(arxiv_ids)
        for r in rows:  # still in citation order
            if selected >= target:
                break
            scanned += 1
            arxiv_id = (r.get("externalIds") or {}).get("ArXiv")
            m = meta.get(arxiv_id, {}) if arxiv_id else {}
            in_scope = bool(set(m.get("categories") or []) & ARXIV_CATS) if m else bool(AI_VENUES.search(r.get("venue") or ""))
            if not in_scope or not (r.get("title") or "").strip():
                continue
            paper = _paper(r, arxiv_id if m else "", m)
            selected += 1
            if is_known(known, paper["paper_id"], paper["abstract"]):
                skipped += 1
                continue
            remember(known, paper["paper_id"], paper["abstract"])
            queued += publish_paper(paper)
        logger.info("[TIER 3] %d/%d selected (scanned %d, last cite_count %s, %d already in Silver)",
                    selected, target, scanned, rows[-1].get("citationCount"), skipped)
        emit("INFO", "HARVEST", f"Tier 3: {selected}/{target} landmarks selected (scanned {scanned}).", tier="tier3")
        token = page.get("token")
        if not token:
            break
        time.sleep(1.0)

    logger.info("[TIER 3 COMPLETE] selected=%d queued=%d already_have=%d scanned=%d", selected, queued, skipped, scanned)
    emit("SUCCESS" if queued or skipped else "ERROR", "HARVEST",
         f"Tier 3 done: {selected} landmarks selected, {queued} queued, {skipped} already in Silver.", tier="tier3", refresh=True)
    if selected - skipped:
        ensure_published(selected - skipped, queued)
    return {"selected": selected, "queued": queued, "already_have": skipped, "scanned": scanned}


with DAG(
    dag_id="dag_tier3_landmark_harvest",
    default_args=default_args,
    description="Tier 3: top most-cited AI/CV/NLP/Robotics papers via Semantic Scholar (one-off, manual trigger)",
    schedule=None,
    start_date=datetime(2025, 1, 1, tzinfo=local_tz),
    catchup=False,
    tags=["tier3", "landmark", "semantic_scholar", "rabbitmq"],
) as dag:
    ping = PythonOperator(task_id="ping_infrastructure", python_callable=ping_infrastructure)
    harvest = PythonOperator(task_id="harvest_tier3_landmarks", python_callable=harvest_tier3_landmarks, execution_timeout=timedelta(hours=3))
    ping >> harvest
