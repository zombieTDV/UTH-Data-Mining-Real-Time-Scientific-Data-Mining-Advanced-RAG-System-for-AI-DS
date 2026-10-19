"""Apache Airflow DAG: Tier 2 - Near-Past Ingestion, newest -> oldest down to 2024-01-01.

Schedule: daily 19:10 ICT, 10 minutes after the Tier 1 stream. One task, harvest_rotation, takes turns between the
two sources in SLICE-long slots (CVF 1 h, arXiv 1 h, CVF 1 h, ...) so neither starves the other; each source resumes
where its last slot stopped, and once one is exhausted the other gets all the time.
- CVF: main conferences (CVPR / ICCV / WACV, findings included), newest first, then the 2024+ workshops. CVF papers
  that link an arXiv id use it as paper_id, so the consumer fetches their arXiv HTML full text; the rest keep their
  abstract (Tier 2 is HTML-only). OpenReview is not harvested: its API and pages now require a logged-in account.
- arXiv: OAI-PMH bulk harvesting (oaipmh.arxiv.org, sets cs + stat + eess), one metadata-datestamp day at a time,
  walking back from today to 2024-01-01, keeping papers of the GROUPS categories whose arXiv id is 2401 or later.
  Once the walk reaches 2024-01-01 the next run starts a new pass from today (what Silver holds is skipped). The search
  API is not used here: it answers wide date queries with HTTP 429; OAI-PMH 503/429 Retry-After waits are obeyed. The Airflow Variable tier2_arxiv_cursor is the next day to fetch; a day is only marked done once all
  of its papers are queued, so an interrupted day is simply fetched again (known papers are skipped).

Mix: every paper belongs to one topic GROUP (its first listed category found in GROUPS; CVF papers are CV) and to
one source. At the start of a run, Silver's Tier 2 counts per group and per source are water-filled with the run's
room (disk budget or conf max_papers): the emptiest groups/sources get filled first, up to one common level, and a
paper is queued only while both its group and its source are under their level. arXiv papers of a group are also
spread over the days still to walk (taken at the rate share-left / (new papers a day x days left), evenly), so a big
group does not spend its share on the newest few weeks.

Papers are queued in batches of HARVEST_BATCH (1000); before each batch the task waits until the ingest queue is
back under HARVEST_LOW_WATER, so harvesting keeps pace with the fetch + embed workers instead of piling up.
Every task skips what Silver already holds (paper_id or abstract hash) and stops when the lakehouse disk budget
(LAKEHOUSE_BUDGET_GB, MinIO + Qdrant) is full, so a run never queues more than the disk can take. Real arXiv
metadata is kept (all categories, primary category, DOI, journal ref); withdrawn papers are dropped.
"""

import html
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor
from collections import Counter
from itertools import chain
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Iterator, List, Optional, Tuple

import pendulum
import requests
from airflow import DAG
from airflow.models import Variable
from airflow.operators.python import PythonOperator
from airflow.timetables.trigger import CronTriggerTimetable

from _common import (HARVEST_BATCH, budget_papers_left, emit, http_headers, is_known, known_paper_ids, on_failure,
                     ping_infrastructure, publish_paper, remember, silver_files, wait_for_queue_room)

logger = logging.getLogger("airflow.task")
local_tz = pendulum.timezone("Asia/Ho_Chi_Minh")

FLOOR = date(2024, 1, 1)
ARXIV_CURSOR = "tier2_arxiv_cursor"
ARXIV_OAI = "https://oaipmh.arxiv.org/oai"  # OAI-PMH bulk harvesting (the search API rate-limits wide date queries)
ARXIV_OAI_SETS = ("cs", "stat", "eess")
# Topic groups Tier 2 keeps level (a paper's group = its first listed category found here)
GROUPS = {
    "CV": ("cs.CV", "eess.IV"),
    "NLP": ("cs.CL",),
    "ML": ("cs.LG", "stat.ML", "cs.NE"),
    "AI": ("cs.AI", "cs.MA"),
    "Robotics": ("cs.RO",),
    "IR": ("cs.IR",),
    "Speech": ("cs.SD", "eess.AS"),
}
GROUP_OF = {c: g for g, cats in GROUPS.items() for c in cats}
CVF = "https://openaccess.thecvf.com"
YEARS = ("2026", "2025", "2024")
SLICE_SECONDS = 3600  # one source's turn in the rotation
RUN_HOURS = 23  # default deadline of a run (a manual run may pass conf "until")

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


def _group_of(categories: List[str]) -> Optional[str]:
    return next((GROUP_OF[c] for c in categories or [] if c in GROUP_OF), None)


def _fill_level(counts: Dict[str, int], room: int) -> int:
    """Water-filling: the common level reached when `room` new papers go to the emptiest keys first."""
    vals, left = sorted(counts.values()), room
    level = vals[0]
    for i in range(1, len(vals) + 1):
        step = (vals[i] - level) * i if i < len(vals) else None
        if step is None or step > left:
            return level + left // i
        left -= step
        level = vals[i]
    return level


def _tier2_mix() -> Tuple[Counter, Counter]:
    """Tier 2 papers Silver holds, per topic group and per source (each paper_id once)."""
    import pyarrow.parquet as pq

    fs, files = silver_files()

    def rows(path: str):
        try:
            return pq.read_table(path, columns=["paper_id", "tier", "source", "categories"], filesystem=fs).to_pylist()
        except Exception as e:
            logger.warning("Could not read the Tier 2 mix from %s: %s", path, e)
            return []

    seen, groups, sources = set(), Counter(), Counter()
    with ThreadPoolExecutor(max_workers=8) as pool:
        for chunk in pool.map(rows, files):
            for r in chunk:
                if r["tier"] == "tier2" and r["paper_id"] not in seen:
                    seen.add(r["paper_id"])
                    groups[_group_of(r["categories"])] += 1
                    sources[r["source"]] += 1
    return groups, sources


class Harvest:
    """Budget + dedup bookkeeping shared by one task: publish() returns False once the budget is spent."""

    def __init__(self, name: str, sources: List[str], max_papers: int = 0, exclude_groups: Tuple[str, ...] = ()):
        self.name = name
        self.max_papers = max_papers  # 0 = no cap besides the disk budget
        self.known = known_paper_ids()
        self.queued = self.skipped = self.dropped = self.over_mix = 0
        self.batch_left = 0  # papers still allowed before the next wait for the ingest queue to drain
        self.refresh_budget()
        # Group + source mix: Silver's Tier 2 counts, water-filled with this run's room
        groups, srcs = _tier2_mix()
        self.count = {"group": {g: groups[g] for g in GROUPS if g not in exclude_groups}, "source": {s: srcs[s] for s in sources}}
        self.level = {kind: _fill_level(c, self.room) for kind, c in self.count.items()}
        self.added = Counter()
        mix = ", ".join(f"{g} {n:,}" for g, n in self.count["group"].items())
        logger.info("[TIER 2] Silver Tier 2 mix: %s | sources %s | levels this run: group %d, source %d",
                    mix, dict(self.count["source"]), self.level["group"], self.level["source"])
        emit("INFO", "HARVEST", f"Tier 2 {name} started: room for {self.room:,} new papers; each group filled up to "
                                f"{self.level['group']:,} papers ({mix}).", tier="tier2")

    def left(self, group: str, source: str) -> int:
        """New papers this group + source may still take in this run."""
        if group not in self.count["group"]:
            return 0  # an excluded group
        return max(0, min(self.level["group"] - self.count["group"][group], self.level["source"] - self.count["source"][source]))

    def refresh_budget(self) -> None:
        """Re-measure the disk budget (a run lasts hours: the consumer keeps writing what was queued)."""
        self.room = self.queued + budget_papers_left()
        if self.max_papers:
            self.room = min(self.room, self.max_papers)

    @property
    def full(self) -> bool:
        return self.queued >= self.room

    def publish(self, paper: Dict[str, Any], group: str) -> bool:
        if self.full:
            return False
        if is_known(self.known, paper["paper_id"], paper["abstract"]):
            self.skipped += 1
            return True
        if not self.left(group, paper["source"]):
            self.over_mix += 1
            return True
        if self.batch_left <= 0:
            # Batches of HARVEST_BATCH: wait for the workers to catch up, then re-measure the budget
            wait_for_queue_room("tier2")
            self.refresh_budget()
            if self.full:
                return False
            self.batch_left = HARVEST_BATCH
        remember(self.known, paper["paper_id"], paper["abstract"])
        self.batch_left -= 1
        if publish_paper({**paper, "tier": "tier2", "crawled_at": datetime.now(timezone.utc).isoformat()}):
            self.queued += 1
            self.added[group] += 1
            self.count["group"][group] += 1
            self.count["source"][paper["source"]] += 1
        return True

    def done(self, extra: str = "") -> Dict[str, int]:
        mix = ", ".join(f"{g} +{n:,}" for g, n in self.added.most_common())
        msg = (f"Tier 2 {self.name}: {self.queued:,} new paper(s) queued ({mix or 'none'}), {self.skipped:,} already in Silver, "
               f"{self.over_mix:,} left for later to keep groups/sources level, {self.dropped:,} dropped" + ((f" - cap of {self.max_papers:,} reached" if self.max_papers and self.queued >= self.max_papers else " - disk budget reached") if self.full else "") + (f". {extra}" if extra else "."))
        logger.info("[TIER 2] %s", msg)
        emit("SUCCESS", "HARVEST", msg, tier="tier2", refresh=True)
        return {"queued": self.queued, "per_group": dict(self.added), "already_have": self.skipped,
                "left_for_mix": self.over_mix, "dropped": self.dropped, "budget_full": self.full}


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


def _cvf_stream(h: Harvest, workshops: bool) -> Iterator[None]:
    """Queues CVF papers, yielding after every chunk so the rotation can pause it between chunks."""
    for listing in _cvf_listings(workshops):
        if h.full or not h.left("CV", "cvf"):
            logger.info("[TIER 2] CVF stops: CV or CVF is at its level for this run")
            return
        venue = re.search(r"/((?:CVPR|ICCV|WACV)20\d\d[^/?]*)", listing).group(1)
        year = re.search(r"20\d\d", venue).group(0)
        # Skip papers Silver already holds before fetching their abstract page (by arXiv id, or by the CVF page slug)
        entries = [e for e in _cvf_entries(_cvf_get(listing)) if (e["arxiv_id"] or f"cvf_{_cvf_slug(e['page'])}") not in h.known]
        # Abstracts live on each paper's page: fetch them a few at a time, politely, and only for papers we may queue
        for i in range(0, len(entries), 60):
            if h.full or not h.left("CV", "cvf"):
                return
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
                }, "CV")
            yield
        logger.info("[TIER 2] CVF %s done (queued so far %d)", venue, h.queued)


# ---------------------------------------------------------------- arXiv

def _oai_page(params: Dict[str, str]) -> Dict[str, Any]:
    """One OAI-PMH ListRecords page. arXiv answers 503 (next page still being built) or 429 with a Retry-After to obey."""
    import xmltodict

    for attempt in range(1, 9):
        try:
            r = requests.get(ARXIV_OAI, params=params, headers=http_headers(), timeout=180)
            if r.status_code in (429, 503):
                wait = int(r.headers.get("Retry-After") or 30)
                logger.info("[TIER 2] arXiv OAI-PMH %d: waiting %ds as asked (Retry-After)", r.status_code, wait)
                time.sleep(wait + 2)
                continue
            r.raise_for_status()
            root = xmltodict.parse(r.text).get("OAI-PMH", {})
            err = root.get("error")
            if err:
                code = err.get("@code") if isinstance(err, dict) else ""
                if code == "noRecordsMatch":
                    return {}
                raise RuntimeError(f"arXiv OAI-PMH error: {err}")
            return root.get("ListRecords") or {}
        except (requests.RequestException, ValueError) as e:
            logger.warning("[TIER 2] arXiv OAI-PMH page failed (try %d/8): %s", attempt, e)
            time.sleep(10 * attempt)
    raise RuntimeError(f"arXiv OAI-PMH kept failing for {params}")


def _arxiv_day(day: date) -> Iterator[Dict[str, Any]]:
    """Every record of the ARXIV_OAI_SETS whose metadata datestamp is `day`, kept when it falls in a GROUP and its
    arXiv id is 2401 or later (the OAI <created> field is not the v1 date, the id's YYMM is)."""
    seen = set()  # a cross-listed paper is in several sets
    for oai_set in ARXIV_OAI_SETS:
        params = {"verb": "ListRecords", "metadataPrefix": "arXiv", "set": oai_set, "from": f"{day}", "until": f"{day}"}
        while True:
            page = _oai_page(params)
            records = page.get("record", [])
            records = [records] if isinstance(records, dict) else records
            for rec in records:
                meta = ((rec.get("metadata") or {}).get("arXiv")) or {}
                pid = _clean(meta.get("id"))
                cats_e = _clean(meta.get("categories")).split()
                m = re.match(r"(\d{2})(\d{2})\.\d{4,5}$", pid)
                group = _group_of(cats_e)
                if (rec.get("header") or {}).get("@status") == "deleted" or not m or f"{m.group(1)}{m.group(2)}" < f"{FLOOR:%y%m}" or not group or pid in seen:
                    continue
                seen.add(pid)
                authors = (meta.get("authors") or {}).get("author", [])
                authors = [authors] if isinstance(authors, dict) else authors
                created = _clean(meta.get("created"))
                yield {
                    "paper_id": pid,
                    "title": _clean(meta.get("title")),
                    "abstract": _clean(meta.get("abstract")),
                    "authors": [_clean(f"{a.get('forenames') or ''} {a.get('keyname') or ''}") for a in authors if isinstance(a, dict)],
                    "categories": cats_e,
                    "primary_category": cats_e[0] if cats_e else "",
                    "doi": _clean(meta.get("doi")) or None,
                    "journal_ref": _clean(meta.get("journal-ref")) or None,
                    "comment": _clean(meta.get("comments")),
                    # <created> is only the v1 date when it falls in the id's month; otherwise keep just the id's month
                    "published_date": created if created[2:4] + created[5:7] == pid[:4] else f"20{m.group(1)}-{m.group(2)}",
                    "link": f"https://arxiv.org/abs/{pid}",
                    "pdf_url": f"https://arxiv.org/pdf/{pid}",
                    "html_url": f"https://arxiv.org/html/{pid}",
                    "source": "arxiv",
                    "group": group,
                }
            token = page.get("resumptionToken")
            token = token.get("#text") if isinstance(token, dict) else token
            if not token:
                break
            params = {"verb": "ListRecords", "resumptionToken": token}
            time.sleep(3.0)  # arXiv harvesting terms


def _arxiv_stream(h: Harvest) -> Iterator[None]:
    """Walks arXiv back one OAI datestamp day at a time, yielding after each finished day. Each group's share is spread
    over the days still to walk: a group meeting `rate` new papers a day takes left / (rate x days left) of them,
    evenly (a credit counter, no randomness)."""
    today = datetime.now(timezone.utc).date()
    day = date.fromisoformat(Variable.get(ARXIV_CURSOR, default_var=today.isoformat()))
    if day < FLOOR:
        logger.info("[TIER 2] arXiv: the last pass reached %s, starting a new pass from %s", FLOOR, today)
        day = today
    days = 0
    met, credit = Counter(), Counter()  # new papers met per group this run, and their take credit
    while day >= FLOOR and not h.full:
        n = 0
        days_left = (day - FLOOR).days + 1
        for paper in _arxiv_day(day):
            comment, group = paper.pop("comment", ""), paper.pop("group")
            if _withdrawn(paper["abstract"], comment):
                h.dropped += 1
                continue
            if is_known(h.known, paper["paper_id"], paper["abstract"]):
                h.skipped += 1
                continue
            met[group] += 1
            credit[group] += min(1.0, h.left(group, "arxiv") / (met[group] / (days + 1) * days_left))
            if credit[group] < 1:
                h.over_mix += 1
                continue
            credit[group] -= 1
            if not h.publish(paper, group):
                break
            n += 1
        if h.full:
            return  # this day is not finished: it is fetched again next run (queued papers are then known)
        logger.info("[TIER 2] arXiv %s: %d paper(s) (queued so far %d: %s)", day, n, h.queued,
                    ", ".join(f"{g} {c:,}" for g, c in h.added.most_common()))
        day -= timedelta(days=1)
        Variable.set(ARXIV_CURSOR, day.isoformat())
        days += 1
        if days % 7 == 0:
            emit("INFO", "HARVEST", f"Tier 2 arXiv: back to {day} ({h.queued:,} new so far).", tier="tier2")
        time.sleep(3.0)
        yield


def harvest_rotation(**context):
    """CVF and arXiv take turns, SLICE_SECONDS each, until both are exhausted, the disk budget is full or the deadline
    passes (RUN_HOURS after the start, so a run ends before the next 19:10 one). A manual run can pick sources, cap new
    papers, leave groups out and set its own deadline (ISO time) with conf
    {"sources": ["arXiv"], "max_papers": 20000, "exclude_groups": ["CV"], "until": "2026-10-21T23:59:00+07:00"}."""
    conf = (context.get("dag_run") and context["dag_run"].conf) or {}
    picked = conf.get("sources") or ["CVF", "arXiv"]
    until = datetime.fromisoformat(conf["until"]) if conf.get("until") else datetime.now(timezone.utc) + timedelta(hours=RUN_HOURS)
    h = Harvest(" + ".join(picked) + " rotation", [s.lower() for s in picked], max_papers=int(conf.get("max_papers") or 0),
                exclude_groups=tuple(conf.get("exclude_groups") or ()))
    logger.info("[TIER 2] Harvesting until %s", until.isoformat())
    streams = {"CVF": lambda: chain(_cvf_stream(h, workshops=False), _cvf_stream(h, workshops=True)), "arXiv": lambda: _arxiv_stream(h)}
    sources = {name: streams[name]() for name in picked}
    while sources and not h.full and datetime.now(timezone.utc) < until:
        for name in list(sources):
            h.refresh_budget()
            if h.full or datetime.now(timezone.utc) >= until:
                break
            before = h.queued
            emit("INFO", "HARVEST", f"Tier 2 rotation: {name} turn ({SLICE_SECONDS // 60} min), {h.queued:,} new so far.", tier="tier2")
            end = time.monotonic() + SLICE_SECONDS
            try:
                while time.monotonic() < end and not h.full and datetime.now(timezone.utc) < until:
                    next(sources[name])
            except StopIteration:
                del sources[name]
                emit("SUCCESS", "HARVEST", f"Tier 2 rotation: {name} has nothing left to harvest.", tier="tier2")
            logger.info("[TIER 2] %s turn over: %d new paper(s) this turn", name, h.queued - before)
    return h.done("all sources harvested" if not sources else f"arXiv cursor {Variable.get(ARXIV_CURSOR, default_var='-')}")


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
    # Stops itself at its deadline (RUN_HOURS, or conf "until"); the timeout is only a safety net for a hung run.
    # No retry, since the next run resumes from Silver + the arXiv cursor anyway
    rotation = PythonOperator(task_id="harvest_rotation", python_callable=harvest_rotation,
                              execution_timeout=timedelta(hours=72), retries=0)
    ping >> rotation
