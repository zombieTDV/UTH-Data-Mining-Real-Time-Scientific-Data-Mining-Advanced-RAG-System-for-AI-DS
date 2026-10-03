"""NeurIPS conference HTML adapter (fallback).

NeurIPS proceedings are hosted at:
    https://papers.nips.cc/paper_files/paper/<year>

The page lists links to individual paper HTML pages.
"""

import logging
import re
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from src.ingestion.sources.html_base import HtmlScrapeAdapter

logger = logging.getLogger(__name__)


class NeuripsAdapter(HtmlScrapeAdapter):
    source_id = "neurips_html"

    def __init__(self, year_from: int, year_to: int):
        super().__init__(venue="NeurIPS", year_from=year_from, year_to=year_to)
        from src.ingestion.common.rate_limiter import get_rate_limiter_for_domain
        self._http.set_rate_limiter("papers.nips.cc", get_rate_limiter_for_domain("papers.nips.cc"))

    def proceeding_index_url(self, year: int) -> str:
        return f"https://papers.nips.cc/paper_files/paper/{year}"

    def parse_proceedings(self, html: str, year: int) -> List[str]:
        soup = BeautifulSoup(html, "html.parser")
        out: List[str] = []
        for a in soup.find_all("a", href=True):
            href = a["href"]
            # NeurIPS uses /paper_files/paper/<year>/hash/<name>-Paper.html
            if "Paper.html" in href or "paper.html" in href:
                out.append(urljoin(self.proceeding_index_url(year), href))
        seen, uniq = set(), []
        for l in out:
            if l not in seen:
                seen.add(l)
                uniq.append(l)
        return uniq

    def parse_paper_page(self, html: str, year: int, page_url: str) -> Optional[Dict[str, Any]]:
        soup = BeautifulSoup(html, "html.parser")
        title_el = soup.find("h4") or soup.find("h1") or soup.find("title")
        if not title_el:
            return None
        title = title_el.get_text(strip=True)
        # Abstract is in <h4>Abstract</h4> + <p>
        abstract = ""
        abs_h = soup.find("h4", string=re.compile(r"abstract", re.I))
        if abs_h:
            p = abs_h.find_next("p")
            if p:
                abstract = p.get_text(" ", strip=True)
        if not abstract:
            p = soup.find("p")
            if p:
                abstract = p.get_text(" ", strip=True)
        # Authors: <i> followed by <a> or in <p>
        authors: List[str] = []
        for el in soup.find_all(["i", "b"]):
            txt = el.get_text(" ", strip=True)
            if txt and "," in txt and len(txt) < 400:
                for piece in re.split(r",\s*", txt):
                    if piece.strip() and piece.strip() not in authors:
                        authors.append(piece.strip())
                break
        # PDF link
        pdf_url = ""
        pdf_a = soup.find("a", href=re.compile(r"\.pdf$", re.I))
        if pdf_a:
            pdf_url = urljoin(page_url, pdf_a["href"])

        return {
            "title": title,
            "abstract": abstract,
            "authors": authors,
            "year": year,
            "pdf_url": pdf_url or page_url,
        }
