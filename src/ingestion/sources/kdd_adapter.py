"""KDD conference HTML adapter (fallback).

KDD proceedings are hosted on:
    - https://dl.acm.org/conference/kdd (primary, but anti-scraping)
    - https://www.kdd.org/conferences (the landing page we were given)

We use the KDD landing page as the index and follow links to individual
paper abstracts when available. When a page cannot be parsed, the entry is
skipped (NOT a hard failure).
"""

import logging
import re
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from src.ingestion.sources.html_base import HtmlScrapeAdapter

logger = logging.getLogger(__name__)


class KddAdapter(HtmlScrapeAdapter):
    source_id = "kdd_html"

    def __init__(self, year_from: int, year_to: int):
        super().__init__(venue="KDD", year_from=year_from, year_to=year_to)
        # KDD landing page also exposes per-year pages under /kdd/<year>/
        self._http.set_rate_limiter("www.kdd.org", __import__(
            "src.ingestion.common.rate_limiter", fromlist=["get_rate_limiter_for_domain"]
        ).get_rate_limiter_for_domain("www.kdd.org"))

    def proceeding_index_url(self, year: int) -> str:
        return f"https://www.kdd.org/conferences/{year}"

    def parse_proceedings(self, html: str, year: int) -> List[str]:
        soup = BeautifulSoup(html, "html.parser")
        links: List[str] = []
        # KDD pages usually have <a href=".../papers/..."> or similar.
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if re.search(r"(paper|abstract|proceeding|workshop)", href, re.IGNORECASE):
                if href.startswith("http"):
                    links.append(href)
                else:
                    links.append(urljoin(self.proceeding_index_url(year), href))
        # De-duplicate while preserving order
        seen = set()
        out = []
        for l in links:
            if l not in seen:
                seen.add(l)
                out.append(l)
        return out

    def parse_paper_page(self, html: str, year: int, page_url: str) -> Optional[Dict[str, Any]]:
        soup = BeautifulSoup(html, "html.parser")
        title_el = soup.find("h1") or soup.find("title")
        if not title_el:
            return None
        title = title_el.get_text(strip=True)
        if not title or len(title) < 8:
            return None
        # Abstract is often inside <div class="abstract"> or <p>
        abstract = ""
        for sel in [
            {"name": "div", "attrs": {"class": re.compile(r"abstract", re.I)}},
            {"name": "section", "attrs": {"id": re.compile(r"abstract", re.I)}},
        ]:
            el = soup.find(**sel)
            if el:
                abstract = el.get_text(" ", strip=True)
                if abstract:
                    break
        if not abstract:
            # Fallback: first <p> after the title
            p = title_el.find_next("p")
            if p:
                abstract = p.get_text(" ", strip=True)

        # Authors: best-effort
        authors: List[str] = []
        for el in soup.find_all(["span", "div"], class_=re.compile(r"author", re.I)):
            txt = el.get_text(" ", strip=True)
            if txt and len(txt) < 200 and "," in txt:
                authors.extend([a.strip() for a in txt.split(",") if a.strip()])
                break
        if not authors:
            # Fallback: meta tag
            meta = soup.find("meta", attrs={"name": "citation_author"})
            if meta and meta.get("content"):
                authors = [meta["content"]]

        return {
            "title": title,
            "abstract": abstract,
            "authors": authors,
            "year": year,
            "pdf_url": page_url,
        }
