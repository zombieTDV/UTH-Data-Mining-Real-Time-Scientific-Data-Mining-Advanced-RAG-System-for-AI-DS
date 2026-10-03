"""OpenReview source adapter (primary for ICLR).

OpenReview hosts the ICLR proceedings. The REST API exposes notes (papers)
per venue. We use a GraphQL-like HTTP query to enumerate accepted papers.

Endpoint:
    GET https://api.openreview.net/notes
        ?content=all&group=ICLR.cc/<year>/Conference
        &type=prefix&limit=1000&offset=<n>

    Or, more reliably, the /notes search endpoint with `content.venue` filter.

We keep this implementation conservative:
    - One HTTP GET per page
    - Honors robots for any HTML fallback
    - Sends a clear User-Agent
"""

import logging
import re
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

OPENREVIEW_BASE = "https://api.openreview.net"


class OpenReviewAdapter(BaseSourceAdapter):
    """Adapter for OpenReview (ICLR primary)."""

    source_id = "openreview"
    strategy = "api"

    def __init__(self, venue: str, year_from: int, year_to: int):
        super().__init__(year_from=year_from, year_to=year_to)
        self.venue = venue
        self._http = ConferenceHttpClient()
        self._http.set_rate_limiter("api.openreview.net", get_rate_limiter_for_domain("api.openreview.net"))
        self._breaker = CircuitBreakerRegistry.get(
            f"openreview:{self.venue}",
            failure_threshold=3,  # OpenReview rate-limits aggressively; trip after 3 failures
        )
        self._throttle = AdaptiveThrottle()

    # ------------------------------------------------------------------
    # Step 1: discover
    # ------------------------------------------------------------------
    def discover(self) -> List[str]:
        years = list(range(self.year_from, self.year_to + 1))
        return [f"{self.venue}:{y}" for y in years]

    # ------------------------------------------------------------------
    # Step 4-7
    # ------------------------------------------------------------------
    def fetch_metadata(self, target: str) -> List[Dict[str, Any]]:
        if ":" not in target:
            raise ValueError(f"target must be '<venue>:<year>', got {target!r}")
        venue, year_str = target.split(":", 1)
        year = int(year_str)
        if venue.upper() != self.venue.upper():
            raise ValueError(f"target venue {venue!r} != adapter venue {self.venue!r}")

        return self._fetch_year(year)

    def _fetch_year(self, year: int) -> List[Dict[str, Any]]:
        """Fetch ICLR accepted papers for one year via OpenReview.

        OpenReview's API is the most stable path: list notes under the venue's
        submission group.
        """
        papers: List[Dict[str, Any]] = []
        # Group pattern used by OpenReview for ICLR: ICLR.cc/2024/Conference/-/Blind_Submission
        # We will search by venue name (matches 'content.venue' in notes).
        offset = 0
        limit = 200
        max_total = 20_000  # safety cap per year
        seen_ids = set()

        # Build the search query. OpenReview's `q` is matched against title/abstract.
        # To filter by venue, we additionally inspect `content.venue`.
        base_url = f"{OPENREVIEW_BASE}/notes/search"
        params_base: Dict[str, Any] = {
            "term": self.venue,  # venue name appears in content
            "type": "all",
            "limit": limit,
            "offset": offset,
            "content": "all",
            "source": "forum",
        }
        if settings.OPENREVIEW_USERNAME:
            params_base["user"] = settings.OPENREVIEW_USERNAME

        while offset < max_total:
            params = dict(params_base)
            params["offset"] = offset
            # Fail fast if circuit is open
            if not self._breaker.allow_request():
                logger.warning(
                    "[openreview] circuit breaker OPEN for %s; skipping year %d",
                    self.venue, year,
                )
                break
            t0 = time.monotonic()
            err = False
            try:
                def do():
                    resp = self._http.get(base_url, params=params, use_cache=False)
                    r = resp[0]
                    if r.status_code == 429 or is_retryable_status(r.status_code):
                        raise TransientHttpError(
                            f"openreview {r.status_code}",
                            status_code=r.status_code,
                            retry_after=r.headers.get("Retry-After"),
                            response=r,
                        )
                    r.raise_for_status()
                    return r.json()
                data = http_with_retries(
                    do,
                    max_retries=2,  # Only 2 retries; circuit breaker handles sustained failures
                    base_delay=2.0,
                    max_delay=60.0,
                    label=f"openreview:{self.venue}:{year}",
                )
            except Exception as exc:  # noqa: BLE001
                err = True
                logger.warning(
                    "[openreview] search failed for %s year=%s offset=%d: %s",
                    self.venue, year, offset, exc,
                )
                self._breaker.record_failure()
                break
            finally:
                self._throttle.record(latency=time.monotonic() - t0, error=err)
                factor = self._throttle.factor()
                if factor < 1.0 and not err:
                    time.sleep(1.0 * (1.0 - factor))

            count = data.get("count", 0)
            notes = data.get("notes", [])
            if not notes:
                break

            for note in notes:
                paper = self._normalize_note(note, year=year)
                if not paper:
                    continue
                pid = paper.get("paper_id")
                if pid in seen_ids:
                    continue
                seen_ids.add(pid)
                if self.validate(paper):
                    papers.append(paper)

            if offset + len(notes) >= count:
                break
            offset += len(notes)

        logger.info(
            "[openreview:%s:%d] fetched %d papers (throttle=%s)",
            self.venue, year, len(papers), self._throttle.snapshot(),
        )
        return papers

    # ------------------------------------------------------------------
    # Normalization
    # ------------------------------------------------------------------
    def _normalize_note(self, note: Dict[str, Any], year: int) -> Optional[Dict[str, Any]]:
        content = note.get("content") or {}
        title = (content.get("title") or "").strip()
        abstract = (content.get("abstract") or "").strip()

        # Authors can be a list of dicts (preferred) or strings
        raw_authors = content.get("authors") or []
        authors: List[str] = []
        for a in raw_authors:
            if isinstance(a, dict):
                # OpenReview sometimes nests under "names" or uses "fullname"
                name = a.get("fullname") or a.get("name") or a.get("preferred email")
                if name:
                    authors.append(str(name).strip())
            elif isinstance(a, str):
                authors.append(a.strip())

        # Keywords / primary/secondary subjects (ICLR specific)
        keywords: List[str] = []
        for k in (content.get("keywords") or []):
            if isinstance(k, str) and k.strip():
                keywords.append(k.strip())
        if not keywords:
            primary = content.get("primary_subject") or {}
            if isinstance(primary, dict):
                subj = primary.get("value") or primary.get("display_name")
                if subj:
                    keywords.append(str(subj))
            for s in (content.get("secondary_subject") or []):
                if isinstance(s, dict):
                    subj = s.get("value") or s.get("display_name")
                    if subj:
                        keywords.append(str(subj))

        # Determine venue year from cdate or forum URL
        cdate = note.get("cdate") or note.get("tmdate") or 0
        try:
            ts_year = time.gmtime(int(cdate) / 1000).tm_year if int(cdate) > 0 else year
        except Exception:  # noqa: BLE001
            ts_year = year
        paper_year = int(content.get("year") or ts_year or year)

        # PDF / HTML links
        pdf_url = ""
        for key in ("pdf", "html", "code", "venue"):
            v = content.get(key)
            if isinstance(v, str) and v.lower().endswith(".pdf"):
                pdf_url = v
                break
            if isinstance(v, str) and v.startswith("http"):
                pdf_url = v
                break
        if not pdf_url:
            # OpenReview also provides a direct /pdf endpoint
            pid = note.get("id", "")
            if pid:
                pdf_url = f"{OPENREVIEW_BASE}/pdf?id={pid}"

        note_id = note.get("id") or note.get("forum") or ""
        venue = (content.get("venue") or {}).get("value") if isinstance(content.get("venue"), dict) else content.get("venue")
        if not venue:
            venue = self.venue

        return {
            "paper_id": f"openreview:{note_id}" if note_id else "",
            "title": title,
            "abstract": abstract,
            "authors": authors,
            "year": paper_year,
            "venue": str(venue),
            "source": "openreview",
            "pdf_url": pdf_url,
            "doi": "",
            "keywords": keywords,
            "citation_count": 0,  # OpenReview doesn't expose citations
            "openreview_id": note_id,
        }

    def close(self):
        self._http.close()


_OPENREVIEW_YEAR_RE = re.compile(r"ICLR\.cc/(\d{4})/Conference", re.IGNORECASE)
