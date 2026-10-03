"""OpenAlex source adapter.

Why OpenAlex:
    - Free, no auth required (email in the polite pool grants higher rate).
    - Single endpoint that indexes KDD, ICML, ICLR, NeurIPS (and more).
    - Supports cursor pagination (Rule #14), per-year filters, batch.
    - Returns DOIs, abstracts, concepts (keywords), cited_by_count.

IMPORTANT — Source ID strategy (2026-10-03):
    OpenAlex does NOT have stable source IDs for conference proceedings.
    Each conference-year gets a different source ID (e.g. "Proceedings of the
    30th ACM SIGKDD Conference..." is S4363608767, but earlier years have
    different IDs). The `primary_location.source.id:<id>` filter only works
    when you know the exact ID.

    Strategy: use the `search` parameter on /works to find papers for a
    given (venue, year) without needing a source ID:
        GET https://api.openalex.org/works
            ?search=<venue_search_term>
            &filter=publication_year:<year>,type:conference-paper|article
            &per_page=200
            &cursor=*

    Per-year source ID discovery (for logging / verification):
        1. Call /sources?search=<venue_name>&filter=type:conference
           and look for a result whose display_name contains the venue
           acronym (case-insensitive).
        2. Cache the found source_id per (venue, year).
"""

import logging
import threading
import time
from typing import Any, Dict, List, Optional

from src.config.settings import settings
from src.ingestion.common.adaptive_throttle import AdaptiveThrottle
from src.ingestion.common.backoff import (
    TransientHttpError,
    http_with_retries,
    is_retryable_status,
)
from src.ingestion.common.circuit_breaker import CircuitBreakerRegistry
from src.ingestion.common.http_client import ConferenceHttpClient
from src.ingestion.common.rate_limiter import get_rate_limiter_for_domain
from src.ingestion.sources.base import BaseSourceAdapter

logger = logging.getLogger(__name__)

OPENALEX_BASE = "https://api.openalex.org"
OPENALEX_PER_PAGE = 200

# Search terms for each venue. These are passed as the `search` parameter
# on /works to find papers from that conference. Order matters: put the
# most specific term first; the adapter tries them in sequence.
VENUE_SEARCH_TERMS: Dict[str, List[str]] = {
    "KDD": [
        "KDD Conference",
        "ACM SIGKDD",
        "SIGKDD",
    ],
    "ICML": [
        "ICML",
        "International Conference on Machine Learning",
    ],
    "ICLR": [
        "ICLR",
        "International Conference on Learning Representations",
    ],
    "NeurIPS": [
        "NeurIPS",
        "Neural Information Processing Systems",
    ],
}


def _concept_to_keywords(concepts: List[Dict[str, Any]], top_n: int = 5) -> List[str]:
    """Extract top-N concept names as keywords."""
    if not concepts:
        return []
    sorted_c = sorted(concepts, key=lambda c: c.get("score", 0.0), reverse=True)
    return [c.get("display_name", "") for c in sorted_c[:top_n] if c.get("display_name")]


def _reconstruct_abstract(inverted_index: Optional[Dict[str, List[int]]]) -> str:
    """OpenAlex stores abstracts as inverted indexes; reconstruct the text."""
    if not inverted_index:
        return ""
    pairs: List[tuple] = []
    for word, positions in inverted_index.items():
        for p in positions:
            pairs.append((p, word))
    pairs.sort()
    return " ".join(w for _, w in pairs)


class OpenAlexAdapter(BaseSourceAdapter):
    """Adapter for OpenAlex API (one instance per venue)."""

    source_id = "openalex"
    strategy = "api"

    def __init__(self, venue: str, year_from: int, year_to: int):
        super().__init__(year_from=year_from, year_to=year_to)
        self.venue = venue
        self._http = ConferenceHttpClient()
        self._http.set_rate_limiter(
            "api.openalex.org", get_rate_limiter_for_domain("api.openalex.org")
        )
        self._breaker = CircuitBreakerRegistry.get(f"openalex:{self.venue}")
        self._throttle = AdaptiveThrottle()

    # ------------------------------------------------------------------
    # Per-year source ID discovery (for logging / verification)
    # ------------------------------------------------------------------
    # Cache source IDs so we don't re-query on every adapter construction.
    # Key: (venue, year), Value: source_id string
    _SOURCE_ID_CACHE: Dict[str, str] = {}
    _SOURCE_ID_LOCK = threading.Lock()

    def _discover_source_id_for_year(self, year: int) -> Optional[str]:
        """Find the OpenAlex source ID for this venue in a given year.

        Searches /sources with venue name + type:conference and looks for
        a display_name that contains the venue acronym.
        Returns the source_id URL or None if not found.
        """
        cache_key = f"{self.venue}:{year}"
        with self._SOURCE_ID_LOCK:
            if cache_key in self._SOURCE_ID_CACHE:
                return self._SOURCE_ID_CACHE[cache_key] or None

        search_terms = VENUE_SEARCH_TERMS.get(self.venue, [self.venue])
        for term in search_terms:
            sid = self._search_source(term)
            if sid:
                with self._SOURCE_ID_LOCK:
                    self._SOURCE_ID_CACHE[cache_key] = sid
                logger.info(
                    "[openalex] discovered source_id for %s/%d: %s (search=%r)",
                    self.venue, year, sid, term,
                )
                return sid

        # Not found: cache empty string to avoid repeated lookups
        with self._SOURCE_ID_LOCK:
            self._SOURCE_ID_CACHE[cache_key] = ""
        logger.debug(
            "[openalex] no source_id found for %s/%d", self.venue, year
        )
        return None

    def _search_source(self, term: str) -> str:
        """Find a conference source matching ``term`` via /sources search."""
        url = f"{OPENALEX_BASE}/sources"
        params: Dict[str, Any] = {
            "search": term,
            "filter": "type:conference",
            "per_page": 5,
        }
        if settings.OPENALEX_EMAIL:
            params["mailto"] = settings.OPENALEX_EMAIL
        try:
            data, _ = self._http.get_json(url, params=params, use_cache=True)
        except Exception as exc:  # noqa: BLE001
            logger.debug("[openalex] source search %r failed: %s", term, exc)
            return ""
        if not data or not data.get("results"):
            return ""

        # The acronym we need to see in display_name
        acronym = {
            "KDD": "kdd",
            "ICML": "icml",
            "ICLR": "iclr",
            "NeurIPS": "neurips",
        }.get(self.venue, self.venue.lower())

        for r in data["results"]:
            name = (r.get("display_name") or "").lower()
            if acronym in name and r.get("id"):
                return r["id"]

        # Fallback: first result
        return data["results"][0].get("id") or ""

    # ------------------------------------------------------------------
    # Step 1: discover
    # ------------------------------------------------------------------
    def discover(self) -> List[str]:
        years = list(range(self.year_from, self.year_to + 1))
        return [f"{self.venue}:{y}" for y in years]

    # ------------------------------------------------------------------
    # Step 4-7: fetch + parse
    # ------------------------------------------------------------------
    def fetch_metadata(self, target: str) -> List[Dict[str, Any]]:
        if ":" not in target:
            raise ValueError(f"target must be '<venue>:<year>', got {target!r}")
        venue, year_str = target.split(":", 1)
        year = int(year_str)
        if venue.upper() != self.venue.upper():
            raise ValueError(f"target venue {venue!r} != adapter venue {self.venue!r}")

        return self._fetch_year(year=year)

    def _fetch_year(self, year: int) -> List[Dict[str, Any]]:
        """Fetch all papers for one (venue, year) using search + cursor pagination.

        Uses the `search` parameter on /works to find papers, filtered by
        publication_year and type. This avoids the need for stable source IDs
        which OpenAlex does not provide for conference proceedings.

        R1 (Retry with Retry-After): each page request goes through
        ``http_with_retries`` which honors the upstream Retry-After header
        and applies exponential backoff on 429/5xx.

        R2 (Adaptive throttle): every page records latency and success/failure
        into the local ``AdaptiveThrottle``.
        """
        papers: List[Dict[str, Any]] = []
        cursor = "*"
        per_page = OPENALEX_PER_PAGE

        # Discover source_id for this year (for logging only; not used in query)
        source_id = self._discover_source_id_for_year(year)
        if source_id:
            logger.debug(
                "[openalex:%s:%d] using source_id=%s", self.venue, year, source_id
            )

        # Build the search terms for this venue
        search_terms = VENUE_SEARCH_TERMS.get(self.venue, [self.venue])
        active_term = search_terms[0]

        params_base: Dict[str, Any] = {
            "search": active_term,
            "filter": f"publication_year:{year},type:conference-paper|article",
            "per_page": per_page,
            "sort": "publication_date:asc",
        }
        if settings.OPENALEX_EMAIL:
            params_base["mailto"] = settings.OPENALEX_EMAIL

        while True:
            params = dict(params_base)
            params["cursor"] = cursor
            url = f"{OPENALEX_BASE}/works"
            # Fail fast if circuit is open
            if not self._breaker.allow_request():
                logger.warning(
                    "[openalex] circuit breaker OPEN for %s; skipping year %d",
                    self.venue, year,
                )
                break
            t0 = time.monotonic()
            err = False
            try:
                def do():
                    resp = self._http.get(url, params=params, use_cache=False)
                    r = resp[0]
                    if r.status_code == 429 or is_retryable_status(r.status_code):
                        raise TransientHttpError(
                            f"openalex {r.status_code}",
                            status_code=r.status_code,
                            retry_after=r.headers.get("Retry-After"),
                            response=r,
                        )
                    r.raise_for_status()
                    return r.json()

                data = http_with_retries(
                    do,
                    max_retries=settings.CRAWLER_MAX_RETRIES,
                    base_delay=2.0,
                    max_delay=60.0,
                    label=f"openalex:{self.venue}:{year}",
                )
            except Exception as exc:  # noqa: BLE001
                err = True
                logger.warning(
                    "[openalex] page failed for %s year=%s cursor=%s: %s",
                    self.venue, year, cursor, exc,
                )
                self._breaker.record_failure()
                break
            finally:
                self._throttle.record(latency=time.monotonic() - t0, error=err)
                factor = self._throttle.factor()
                if factor < 1.0 and not err:
                    time.sleep(1.0 * (1.0 - factor))

            results = data.get("results", [])
            for w in results:
                paper = self._normalize_work(w, year=year)
                if self.validate(paper):
                    papers.append(paper)

            meta = data.get("meta") or {}
            next_cursor = meta.get("next_cursor")
            if not next_cursor or len(results) < per_page:
                break
            cursor = next_cursor

        logger.info(
            "[openalex:%s:%d] fetched %d papers (throttle=%s)",
            self.venue, year, len(papers), self._throttle.snapshot(),
        )
        return papers

    # ------------------------------------------------------------------
    # Normalization (Research-friendly schema)
    # ------------------------------------------------------------------
    def _normalize_work(self, work: Dict[str, Any], year: int) -> Dict[str, Any]:
        openalex_id = work.get("id", "")
        if isinstance(openalex_id, str) and openalex_id.startswith("https://"):
            paper_id = openalex_id.split("/")[-1]
        else:
            paper_id = str(openalex_id)

        doi = work.get("doi") or ""
        if doi.startswith("https://doi.org/"):
            doi = doi[len("https://doi.org/"):]

        authors: List[str] = []
        for a in (work.get("authorships") or []):
            author = a.get("author") or {}
            name = author.get("display_name", "").strip()
            orcid = author.get("orcid") or ""
            if name:
                authors.append(f"{name} ({orcid})" if orcid else name)

        loc = work.get("primary_location") or {}
        source = loc.get("source") or {}
        paper_venue = source.get("display_name") or self.venue

        abstract = _reconstruct_abstract(work.get("abstract_inverted_index"))
        if not abstract:
            abstract = (work.get("abstract") or "").strip()

        pdf_url = ""
        for link in (loc.get("pdf_url"), work.get("doi_url")):
            if link:
                pdf_url = link
                break
        if not pdf_url and doi:
            pdf_url = f"https://doi.org/{doi}"

        concepts = work.get("concepts") or []
        keywords = _concept_to_keywords(concepts, top_n=6)

        return {
            "paper_id": f"openalex:{paper_id}" if not paper_id.startswith("openalex:") else paper_id,
            "title": (work.get("title") or work.get("display_name") or "").strip(),
            "abstract": abstract,
            "authors": authors,
            "year": int(work.get("publication_year") or year),
            "venue": paper_venue,
            "source": "openalex",
            "pdf_url": pdf_url,
            "doi": doi,
            "keywords": keywords,
            "citation_count": int(work.get("cited_by_count") or 0),
            "openalex_id": paper_id,
            "openalex_url": work.get("id", ""),
            "publication_date": work.get("publication_date") or "",
            "type": work.get("type") or "",
        }

    def close(self):
        self._http.close()
