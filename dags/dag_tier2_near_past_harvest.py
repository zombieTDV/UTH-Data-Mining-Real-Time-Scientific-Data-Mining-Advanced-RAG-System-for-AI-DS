"""Apache Airflow DAG: Tier 2 - Near-Past Ingestion, newest -> oldest down to 2024-01-01.

Schedule: daily 19:10 ICT, 10 minutes after the Tier 1 stream. Sources, in order:
1. harvest_venues: CVF main conferences (CVPR / ICCV / WACV, findings included), newest first. CVF papers that link
   an arXiv id use it as paper_id, so the consumer fetches their arXiv HTML full text; the rest keep their abstract
   (Tier 2 is HTML-only). OpenReview is not harvested: its API and pages now require a logged-in account.
2. harvest_arxiv: every paper of the ARXIV_CATEGORIES (one OR query), one submission day at a time, walking back from
   today to 2024-01-01. The Airflow Variable tier2_arxiv_cursor is the next day to fetch; a day is only marked done
   once all of its papers are queued, so an interrupted day is simply fetched again (known papers are skipped).
3. harvest_cvf_workshops: CVF workshop papers, only with whatever budget is left.

Every task skips what Silver already holds (paper_id or abstract hash) and stops when the lakehouse disk budget
(LAKEHOUSE_BUDGET_GB, MinIO + Qdrant) is full, so a run never queues more than the disk can take. Real arXiv
metadata is kept (all categories, primary category, DOI, journal ref); withdrawn papers are dropped.
"""

import html
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Iterator, List

import pendulum
import requests
from airflow import DAG
from airflow.models import Variable
from airflow.utils.trigger_rule import TriggerRule
from airflow.operators.python import PythonOperator
from airflow.timetables.trigger import CronTriggerTimetable

from _common import (budget_papers_left, categories, emit, http_headers, is_known, known_paper_ids, on_failure,
                     ping_infrastructure, publish_paper, remember)

logger = logging.getLogger("airflow.task")
local_tz = pendulum.timezone("Asia/Ho_Chi_Minh")

FLOOR = date(2024, 1, 1)
ARXIV_CURSOR = "tier2_arxiv_cursor"
ARXIV_PAGE = 1000
CVF = "https://openaccess.thecvf.com"
YEARS = ("2026", "2025", "2024")

default_args = {
    "on_failure_callback": on_failure,
    "owner": "uth_data_mining",
    "depends_on_past": False,
    "email_on_failure": False,
    "email_on_retry": False,
    "retries": 1,
    "retry_delay": timedelta(minutes=5),
}


def _clean(text: Any) -> str:
    return re.sub(r"\s+", " ", html.unescape(str(text or ""))).strip()


def _withdrawn(abstract: str, comment: str) -> bool:
    return "withdrawn" in (comment or "").lower() or abstract.lower().startswith("this paper has been withdrawn")


class Harvest:
    """Budget + dedup bookkeeping shared by one task: publish() returns False once the budget is spent."""

    def __init__(self, name: str):
        self.name = name
        self.known = known_paper_ids()
        self.room = budget_papers_left()
        self.queued = self.skipped = self.dropped = 0
        emit("INFO", "HARVEST", f"Tier 2 {name} started: room for {self.room:,} new papers in the disk budget.", tier="tier2")

    @property
    def full(self) -> bool:
        return self.queued >= self.room

    def publish(self, paper: Dict[str, Any]) -> bool:
        if self.full:
            return False
        if is_known(self.known, paper["paper_id"], paper["abstract"]):
            self.skipped += 1
            return True
        remember(self.known, paper["paper_id"], paper["abstract"])
        self.queued += publish_paper({**paper, "tier": "tier2", "crawled_at": datetime.now(timezone.utc).isoformat()})
        return True

    def done(self, extra: str = "") -> Dict[str, int]:
        msg = (f"Tier 2 {self.name}: {self.queued:,} new paper(s) queued, {self.skipped:,} already in Silver, "
               f"{self.dropped:,} dropped" + (" - disk budget reached" if self.full else "") + (f". {extra}" if extra else "."))
        logger.info("[TIER 2] %s", msg)
        emit("SUCCESS", "HARVEST", msg, tier="tier2", refresh=True)
        return {"queued": self.queued, "already_have": self.skipped, "dropped": self.dropped, "budget_full": self.full}


# ---------------------------------------------------------------- CVF

def _cvf_get(url: str) -> str:
    for attempt in range(1, 6):
        try:
            r = requests.get(url, headers=http_headers(), timeout=60)
            if r.status_code == 200:
                return r.text
            if r.status_code == 404:
                return ""
        except requests.RequestException as e:
            logger.warning("CVF %s failed (try %d): %s", url, attempt, e)
        time.sleep(3 * attempt)
    return ""


def _cvf_listings(workshops: bool) -> List[str]:
    """Listing pages (newest first): main conferences, or every workshop of 2024+."""
    menu = _cvf_get(f"{CVF}/menu")
    confs = sorted({m for m in re.findall(r'href="/?((?:CVPR|ICCV|WACV)20(?:2[4-9])(?:_findings)?)"', menu)},
                   key=lambda c: (c[-4:] if c[-4:].isdigit() else c.split("_")[0][-4:], c), reverse=True)
    if not workshops:
        return [f"{CVF}/{c}?day=all" for c in confs]
    pages = []
    for menu_path in sorted(set(re.findall(r'href="/?((?:CVPR|ICCV|WACV)20(?:2[4-9])_workshops)(?:/menu)?"', menu)), reverse=True):
        sub = _cvf_get(f"{CVF}/{menu_path}/menu")
        pages += [f"{CVF}{p}" for p in sorted(set(re.findall(rf'href="(/{menu_path}/[^"/]+)"', sub))) if not p.endswith("/menu")]
    return pages


def _cvf_entries(listing_html: str) -> List[Dict[str, Any]]:
    """One dict per paper on a CVF listing page: title, html page, authors, arXiv id."""
    out = []
    for block in re.split(r'<dt class="ptitle">', listing_html)[1:]:
        m = re.search(r'<a href="([^"]+\.html)">(.*?)</a>', block, re.S)
        if not m:
            continue
        arxiv = re.search(r'arxiv\.org/abs/(\d{4}\.\d{4,5})', block)
        out.append({
            "page": m.group(1) if m.group(1).startswith("http") else CVF + m.group(1),
            "title": _clean(re.sub(r"<[^>]+>", "", m.group(2))),
            "authors": [_clean(a) for a in re.findall(r'name="query_author" value="([^"]+)"', block)],
            "arxiv_id": arxiv.group(1) if arxiv else None,
        })
    return out


def _cvf_slug(page_url: str) -> str:
    return re.sub(r"[^A-Za-z0-9_\-]", "_", page_url.rsplit("/", 1)[-1].replace("_paper.html", ""))


def _cvf_abstract(page_url: str) -> str:
    m = re.search(r'<div id="abstract"\s*>(.*?)</div>', _cvf_get(page_url), re.S)
    return _clean(re.sub(r"<[^>]+>", " ", m.group(1))) if m else ""


def _harvest_cvf(h: Harvest, workshops: bool) -> str:
    for listing in _cvf_listings(workshops):
        if h.full:
            return "budget full"
        venue = re.search(r"/((?:CVPR|ICCV|WACV)20\d\d[^/?]*)", listing).group(1)
        year = re.search(r"20\d\d", venue).group(0)
        # Skip papers Silver already holds before fetching their abstract page (by arXiv id, or by the CVF page slug)
        entries = [e for e in _cvf_entries(_cvf_get(listing)) if (e["arxiv_id"] or f"cvf_{_cvf_slug(e['page'])}") not in h.known]
        # Abstracts live on each paper's page: fetch them a few at a time, politely, and only for papers we may queue
        for i in range(0, len(entries), 60):
            if h.full:
                return "budget full"
            chunk = entries[i:i + 60]
            with ThreadPoolExecutor(max_workers=3) as pool:
                abstracts = list(pool.map(_cvf_abstract, [e["page"] for e in chunk]))
            for e, abstract in zip(chunk, abstracts):
                if not abstract:
                    h.dropped += 1
                    continue
                pid = e["arxiv_id"] or f"cvf_{_cvf_slug(e['page'])}"
                h.publish({
                    "paper_id": pid,
                    "title": e["title"],
                    "abstract": abstract,
                    "authors": e["authors"],
                    "categories": ["cs.CV"],
                    "primary_category": "cs.CV",
                    "journal_ref": venue.replace("_", " "),
                    "published_date": year,
                    "link": e["page"],
                    "pdf_url": e["page"].replace("/html/", "/papers/").replace(".html", ".pdf"),
                    "html_url": f"https://arxiv.org/html/{pid}" if e["arxiv_id"] else "",
                    "source": "cvf",
                })
        logger.info("[TIER 2] CVF %s done (queued so far %d)", venue, h.queued)
    return ""


def harvest_venues(**_context):
    h = Harvest("CVF conferences")
    return h.done(_harvest_cvf(h, workshops=False))


def harvest_cvf_workshops(**_context):
    h = Harvest("CVF workshops")
    return h.done(_harvest_cvf(h, workshops=True))


# ---------------------------------------------------------------- arXiv

def _arxiv_day(day: date, cats: List[str]) -> Iterator[Dict[str, Any]]:
    """Every paper first submitted on `day` (UTC) in any of `cats`, with its real metadata."""
    import xmltodict

    query = "(" + "+OR+".join(f"cat:{c}" for c in cats) + f")+AND+submittedDate:[{day:%Y%m%d}0000+TO+{day:%Y%m%d}2359]"
    start = 0
    while True:
        for attempt in range(1, 6):
            try:
                r = requests.get(f"https://export.arxiv.org/api/query?search_query={query}&start={start}&max_results={ARXIV_PAGE}"
                                 "&sortBy=submittedDate&sortOrder=descending", headers=http_headers(), timeout=90)
                r.raise_for_status()
                feed = xmltodict.parse(r.text).get("feed", {})
                break
            except Exception as e:
                logger.warning("[TIER 2] arXiv %s page %d failed (try %d/5): %s", day, start, attempt, e)
                time.sleep(10 * attempt)
        else:
            raise RuntimeError(f"arXiv API kept failing for {day}")
        total = int((feed.get("opensearch:totalResults") or {}).get("#text", 0) if isinstance(feed.get("opensearch:totalResults"), dict) else feed.get("opensearch:totalResults") or 0)
        entries = feed.get("entry", [])
        entries = [entries] if isinstance(entries, dict) else entries
        for e in entries:
            m = re.search(r"abs/(.+?)(v\d+)?$", e.get("id", ""))
            if not m:
                continue
            cats_e = e.get("category", [])
            cats_e = [cats_e] if isinstance(cats_e, dict) else cats_e
            authors = e.get("author", [])
            authors = [authors] if isinstance(authors, dict) else authors

            def text(key):
                v = e.get(key)
                return _clean(v.get("#text") if isinstance(v, dict) else v)

            pid = m.group(1)
            yield {
                "paper_id": pid,
                "title": _clean(e.get("title")),
                "abstract": _clean(e.get("summary")),
                "authors": [_clean(a.get("name")) for a in authors if isinstance(a, dict)],
                "categories": [c.get("@term") for c in cats_e if isinstance(c, dict) and c.get("@term")],
                "primary_category": (e.get("arxiv:primary_category") or {}).get("@term") or "",
                "doi": text("arxiv:doi") or None,
                "journal_ref": text("arxiv:journal_ref") or None,
                "comment": text("arxiv:comment"),
                "published_date": e.get("published", ""),
                "link": f"https://arxiv.org/abs/{pid}",
                "pdf_url": f"https://arxiv.org/pdf/{pid}",
                "html_url": f"https://arxiv.org/html/{pid}",
                "source": "arxiv",
            }
        start += len(entries)
        if not entries or start >= total:
            return
        time.sleep(3.0)  # arXiv API terms


def harvest_arxiv(**_context):
    h = Harvest("arXiv")
    cats = categories()
    day = date.fromisoformat(Variable.get(ARXIV_CURSOR, default_var=datetime.now(timezone.utc).date().isoformat()))
    days = 0
    while day >= FLOOR and not h.full:
        n = 0
        for paper in _arxiv_day(day, cats):
            comment = paper.pop("comment", "")
            if _withdrawn(paper["abstract"], comment):
                h.dropped += 1
                continue
            if not h.publish(paper):
                break
            n += 1
        if h.full:
            break  # this day is not finished: it is fetched again next run (queued papers are then known)
        logger.info("[TIER 2] arXiv %s: %d paper(s) (queued so far %d)", day, n, h.queued)
        day -= timedelta(days=1)
        Variable.set(ARXIV_CURSOR, day.isoformat())
        days += 1
        if days % 7 == 0:
            emit("INFO", "HARVEST", f"Tier 2 arXiv: back to {day} ({h.queued:,} new so far).", tier="tier2")
        time.sleep(3.0)
    return h.done(f"cursor now {day}" + (" (reached 2024-01-01)" if day < FLOOR else ""))


with DAG(
    dag_id="dag_tier2_near_past_harvest",
    default_args=default_args,
    description="Tier 2: CVF + arXiv, newest -> 2024-01-01, within the lakehouse disk budget (19:10 ICT daily)",
    schedule=CronTriggerTimetable("10 19 * * *", timezone=local_tz),  # fires exactly at 19:10 ICT, 10 min after Tier 1
    start_date=datetime(2025, 1, 1, tzinfo=local_tz),
    catchup=False,
    max_active_runs=1,
    tags=["tier2", "arxiv", "cvf", "rabbitmq"],
) as dag:
    ping = PythonOperator(task_id="ping_infrastructure", python_callable=ping_infrastructure)
    venues = PythonOperator(task_id="harvest_venues", python_callable=harvest_venues, execution_timeout=timedelta(hours=8))
    # all_done: a CVF step that fails or hits its timeout must not hold back the next source; each step
    # reads the budget from Qdrant/MinIO first, so it still fails fast when the infrastructure is down
    arxiv = PythonOperator(task_id="harvest_arxiv", python_callable=harvest_arxiv, execution_timeout=timedelta(hours=12),
                           trigger_rule=TriggerRule.ALL_DONE)
    workshops = PythonOperator(task_id="harvest_cvf_workshops", python_callable=harvest_cvf_workshops,
                               execution_timeout=timedelta(hours=8), trigger_rule=TriggerRule.ALL_DONE)
    ping >> venues >> arxiv >> workshops
