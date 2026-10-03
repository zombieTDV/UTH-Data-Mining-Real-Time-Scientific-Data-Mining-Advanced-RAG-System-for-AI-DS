"""HTML scrape adapter base class.

Used for the KDD, ICML, NeurIPS venues as a *fallback* when the OpenAlex API
returns incomplete data. Always goes through robots.txt (Rule #2) and the
shared rate-limiter / circuit-breaker / backoff infrastructure.

Subclasses must implement:
    - `proceeding_index_url(year)`: URL of the year's proceedings landing page.
    - `parse_proceedings(html, year)`: extract paper links from the index page.
    - `parse_paper_page(html, year)`: extract one paper's metadata.
    - `paper_page_url(link)`: convert a relative link into a full URL.
"""

import abc
import logging
from typing import Any, Dict, List, Optional

from bs4 import BeautifulSoup

from src.ingestion.common.circuit_breaker import CircuitBreakerRegistry
from src.ingestion.common.http_client import ConferenceHttpClient
from src.ingestion.common.rate_limiter import get_rate_limiter_for_domain
from src.ingestion.common.robots_checker import RobotsRegistry
from src.ingestion.sources.base import BaseSourceAdapter

logger = logging.getLogger(__name__)


class HtmlScrapeAdapter(BaseSourceAdapter):
    """Base class for HTML-scraped conference proceedings."""

    source_id = "html"
    strategy = "scrape"

    def __init__(self, venue: str, year_from: int, year_to: int):
        super().__init__(year_from=year_from, year_to=year_to)
        # Preserve the canonical case ("NeurIPS") used by the pipeline;
        # .upper() is applied by ConferenceIngestionPipeline only.
        self.venue = venue
        self._http = ConferenceHttpClient()
        self._breaker = CircuitBreakerRegistry.get(f"html:{self.venue}")

    # ----------------- abstract hooks -----------------

    @abc.abstractmethod
    def proceeding_index_url(self, year: int) -> str:
        raise NotImplementedError

    @abc.abstractmethod
    def parse_proceedings(self, html: str, year: int) -> List[str]:
        """Return a list of relative paper-page URLs from the proceedings page."""
        raise NotImplementedError

    @abc.abstractmethod
    def parse_paper_page(self, html: str, year: int, page_url: str) -> Optional[Dict[str, Any]]:
        """Extract one paper's metadata from a single paper page."""
        raise NotImplementedError

    def paper_page_url(self, link: str, base: str) -> str:
        """Resolve a relative link against a base URL."""
        from urllib.parse import urljoin

        return urljoin(base, link)

    # ----------------- step 1: discover -----------------

    def discover(self) -> List[str]:
        years = list(range(self.year_from, self.year_to + 1))
        return [f"{self.venue}:{y}" for y in years]

    # ----------------- step 4-7: fetch + parse -----------------

    def fetch_metadata(self, target: str) -> List[Dict[str, Any]]:
        if ":" not in target:
            raise ValueError(f"target must be '<venue>:<year>', got {target!r}")
        venue, year_str = target.split(":", 1)
        year = int(year_str)
        if venue.upper() != self.venue.upper():
            raise ValueError(f"target venue {venue!r} != adapter venue {self.venue!r}")

        index_url = self.proceeding_index_url(year)
        if not RobotsRegistry.is_allowed(index_url):
            logger.warning("[%s] blocked by robots.txt: %s", self.venue, index_url)
            return []

        # Step 4: GET the index page
        try:
            def do():
                resp = self._http.get(index_url, use_cache=True)
                resp[0].raise_for_status()
                return resp[0].text
            html = self._breaker.call(do)
        except Exception as exc:  # noqa: BLE001
            logger.warning("[%s] failed to fetch index %s: %s", self.venue, index_url, exc)
            return []

        # Step 7: parse the index
        rel_links = self.parse_proceedings(html, year=year)
        logger.info("[%s:%d] index has %d paper links", self.venue, year, len(rel_links))

        # Step 4-7 per paper: fetch + parse + normalize
        papers: List[Dict[str, Any]] = []
        for link in rel_links:
            full_url = self.paper_page_url(link, base=index_url)
            if not RobotsRegistry.is_allowed(full_url):
                continue
            try:
                def do_paper():
                    resp = self._http.get(full_url, use_cache=True)
                    resp[0].raise_for_status()
                    return resp[0].text
                page_html = self._breaker.call(do_paper)
            except Exception as exc:  # noqa: BLE001
                logger.debug("[%s] paper fetch failed %s: %s", self.venue, full_url, exc)
                continue
            paper = self.parse_paper_page(page_html, year=year, page_url=full_url)
            if not paper:
                continue
            # Normalize source/venue fields
            paper.setdefault("source", self.source_id)
            paper.setdefault("venue", self.venue)
            if not paper.get("paper_id"):
                # Derive a deterministic ID from the URL
                paper["paper_id"] = f"{self.source_id}:{self.venue}:{year}:{abs(hash(full_url)) & 0xffffffff:08x}"
            paper.setdefault("keywords", [])
            paper.setdefault("citation_count", 0)
            if self.validate(paper):
                papers.append(paper)

        logger.info("[%s:%d] fetched %d papers", self.venue, year, len(papers))
        return papers

    def close(self):
        self._http.close()
