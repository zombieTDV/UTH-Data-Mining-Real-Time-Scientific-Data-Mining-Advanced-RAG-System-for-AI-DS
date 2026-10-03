"""OpenAlex source adapter.

Why OpenAlex:
    - Free, no auth required (email in the polite pool grants higher rate).
    - Single endpoint that indexes KDD, ICML, ICLR, NeurIPS (and more).
    - Supports cursor pagination (Rule #14), per-year filters, batch.
    - Returns DOIs, abstracts, concepts (keywords), cited_by_count.

Endpoint:
    GET https://api.openalex.org/works
        ?filter=primary_location.source.id:<venue_id>,
                publication_year:<year>,
                type:article|proceedings-article
        &per_page=200
        &cursor=*

OpenAlex "source" IDs (canonical, see https://api.openalex.org/sources):
    KDD       -> S4210193800  (KDD Proceedings)
    ICML      -> S4210192555  (ICML / PMLR)
    ICLR      -> S4210197244  (ICLR Conference)
    NeurIPS   -> S4210198495  (NeurIPS Proceedings)

Note: OpenAlex source IDs may shift; we resolve them lazily via
`/sources?filter=display_name:<venue>` and cache the result in checkpoint.
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


# Mapping from OpenAlex display_name search to a primary venue we recognize.
# Used as a *fallback* if the canonical source-id lookup fails.
VENUE_DISPLAY_NAME = {
    "KDD": "ACM SIGKDD",
    "ICML": "ICML",
    "ICLR": "ICLR",
    "NeurIPS": "NeurIPS",
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
        self._http.set_rate_limiter("api.openalex.org", get_rate_limiter_for_domain("api.openalex.org"))
        self._breaker = CircuitBreakerRegistry.get(f"openalex:{self.venue}")
        self._throttle = AdaptiveThrottle()
        self._source_id: Optional[str] = None

    # ------------------------------------------------------------------
    # Source ID resolution
    # ------------------------------------------------------------------
    # Process-wide cache for OpenAlex source IDs so we don't re-query on every
    # adapter construction (see P5: avoid N HTTP calls for N runs).
    _SOURCE_ID_CACHE: Dict[str, str] = {}
    _SOURCE_ID_LOCK = threading.Lock()

    def resolve_source_id(self) -> str:
        """Resolve canonical OpenAlex source ID by display name.

        Tries canonical IDs first, then falls back to /sources search.
        Cached process-wide so consecutive runs do not re-query.
        """
        cache_key = self.venue
        with self._SOURCE_ID_LOCK:
            if cache_key in self._SOURCE_ID_CACHE:
                self._source_id = self._SOURCE_ID_CACHE[cache_key]
                return self._source_id
        if self._source_id:
            return self._source_id
        url = f"{OPENALEX_BASE}/sources"
        params: Dict[str, Any] = {"per_page": 1}
        if settings.OPENALEX_EMAIL:
            params["mailto"] = settings.OPENALEX_EMAIL
        params["filter"] = f"display_name.search:{VENUE_DISPLAY_NAME.get(self.venue, self.venue)}"
        try:
            data, _ = self._http.get_json(url, params=params, use_cache=True)
        except Exception as exc:  # noqa: BLE001
            logger.warning("[openalex] source lookup failed for %s: %s", self.venue, exc)
            self._source_id = ""
            return ""
        if not data or not data.get("results"):
            logger.warning("[openalex] no source found for %s", self.venue)
            self._source_id = ""
            return ""
        self._source_id = data["results"][0]["id"]
        with self._SOURCE_ID_LOCK:
            self._SOURCE_ID_CACHE[cache_key] = self._source_id
        logger.info("[openalex] %s -> %s", self.venue, self._source_id)
        return self._source_id

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
        if venue.upper() != self.venue:
            raise ValueError(f"target venue {venue!r} != adapter venue {self.venue!r}")

        source_id = self.resolve_source_id()
        if not source_id:
            return []

        return self._fetch_year(year=year, source_id=source_id)

    def _fetch_year(self, year: int, source_id: str) -> List[Dict[str, Any]]:
        """Fetch all papers for one (venue, year) using cursor pagination.

        R1 (Retry with Retry-After): each page request goes through
        ``http_with_retries`` which honors the upstream Retry-After header
        and applies exponential backoff on 429/5xx.

        R2 (Adaptive throttle): every page records latency and success/failure
        into the local ``AdaptiveThrottle``. When the factor drops, the loop
        sleeps an extra ``1 - factor`` seconds before the next request.
        """
        papers: List[Dict[str, Any]] = []
        cursor = "*"
        per_page = OPENALEX_PER_PAGE
        # OpenAlex's `primary_location.source.id` uses full URL; we strip prefix.
        sid = source_id.split("/")[-1] if source_id.startswith("https://") else source_id

        params_base: Dict[str, Any] = {
            "filter": (
                f"primary_location.source.id:{sid},"
                f"publication_year:{year},"
                f"type:article|proceedings-article"
            ),
            "per_page": per_page,
            "sort": "publication_date:asc",
        }
        if settings.OPENALEX_EMAIL:
            params_base["mailto"] = settings.OPENALEX_EMAIL

        while True:
            params = dict(params_base)
            params["cursor"] = cursor
            url = f"{OPENALEX_BASE}/works"
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
                # Hand off to circuit breaker so repeated failures trip it.
                try:
                    self._breaker.call(lambda: (_ for _ in ()).throw(exc))
                except Exception:  # noqa: BLE001
                    pass
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
        # OpenAlex ID is a URL like "https://openalex.org/W123"; use the last segment
        openalex_id = work.get("id", "")
        if isinstance(openalex_id, str) and openalex_id.startswith("https://"):
            paper_id = openalex_id.split("/")[-1]
        else:
            paper_id = str(openalex_id)

        doi = work.get("doi") or ""
        if doi.startswith("https://doi.org/"):
            doi = doi[len("https://doi.org/"):]

        # Authors -> list of "Name (orcid)" strings
        authors: List[str] = []
        for a in (work.get("authorships") or []):
            author = a.get("author") or {}
            name = author.get("display_name", "").strip()
            orcid = author.get("orcid") or ""
            if name:
                authors.append(f"{name} ({orcid})" if orcid else name)

        loc = work.get("primary_location") or {}
        source = loc.get("source") or {}
        venue = source.get("display_name") or self.venue

        # OpenAlex stores abstracts as inverted indexes
        abstract = _reconstruct_abstract(work.get("abstract_inverted_index"))
        if not abstract:
            # Some records have a plain "abstract" field
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
            "venue": venue,
            "source": "openalex",
            "pdf_url": pdf_url,
            "doi": doi,
            "keywords": keywords,
            "citation_count": int(work.get("cited_by_count") or 0),
            # provenance
            "openalex_id": paper_id,
            "openalex_url": work.get("id", ""),
            "publication_date": work.get("publication_date") or "",
            "type": work.get("type") or "",
        }

    def close(self):
        self._http.close()
