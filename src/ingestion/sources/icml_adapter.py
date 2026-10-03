"""ICML conference HTML adapter (fallback).

PMLR hosts ICML proceedings at:
    https://proceedings.mlr.press/v<NUMBER>/

Where <NUMBER> = year (e.g., v235 for ICML 2024).
"""

import logging
import re
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from src.ingestion.sources.html_base import HtmlScrapeAdapter

logger = logging.getLogger(__name__)


def _pmlr_volume_for(year: int) -> int:
    # The PMLR volume numbering tracks ICML's proceedings index.
    # Mapping (best effort): 2020 -> 119, 2021 -> 139, 2022 -> 162, 2023 -> 202, 2024 -> 235
    table = {2020: 119, 2021: 139, 2022: 162, 2023: 202, 2024: 235, 2025: 267}
    return table.get(year, 119 + (year - 2020) * 20)


class IcmlAdapter(HtmlScrapeAdapter):
    source_id = "icml_html"

    def __init__(self, year_from: int, year_to: int):
        super().__init__(venue="ICML", year_from=year_from, year_to=year_to)
        from src.ingestion.common.rate_limiter import get_rate_limiter_for_domain
        self._http.set_rate_limiter("proceedings.mlr.press", get_rate_limiter_for_domain("proceedings.mlr.press"))

    def proceeding_index_url(self, year: int) -> str:
        vol = _pmlr_volume_for(year)
        return f"https://proceedings.mlr.press/v{vol}/"

    def parse_proceedings(self, html: str, year: int) -> List[str]:
        soup = BeautifulSoup(html, "html.parser")
        out: List[str] = []
        for a in soup.find_all("a", href=True):
            href = a["href"]
            # PMLR uses URLs like "park24.html" for individual papers
            if re.search(r"[a-z]\d{2,3}\.html?$", href):
                out.append(urljoin(self.proceeding_index_url(year), href))
        # De-duplicate
        seen, uniq = set(), []
        for l in out:
            if l not in seen:
                seen.add(l)
                uniq.append(l)
        return uniq

    def parse_paper_page(self, html: str, year: int, page_url: str) -> Optional[Dict[str, Any]]:
        soup = BeautifulSoup(html, "html.parser")
        title_el = soup.find("h1") or soup.find("title")
        if not title_el:
            return None
        title = title_el.get_text(strip=True)
        # PMLR pages use <div class="abstract"> or <p> with "Abstract."
        abstract = ""
        abs_el = soup.find("div", class_=re.compile(r"abstract", re.I))
        if abs_el:
            abstract = abs_el.get_text(" ", strip=True)
        if not abstract:
            # Look for "Abstract." marker
            for p in soup.find_all("p"):
                txt = p.get_text(" ", strip=True)
                if txt.lower().startswith("abstract."):
                    abstract = txt[len("abstract."):].strip()
                    break
        # Authors: PMLR lists them in <p class="authors"> or similar
        authors: List[str] = []
        auth_el = soup.find(["p", "div"], class_=re.compile(r"author", re.I))
        if auth_el:
            txt = auth_el.get_text(" ", strip=True)
            for piece in re.split(r",\s*", txt):
                if piece.strip():
                    authors.append(piece.strip())
        # PDF link
        pdf_url = ""
        pdf_a = soup.find("a", href=re.compile(r"\.pdf$", re.I))
        if pdf_a:
            pdf_url = urljoin(page_url, pdf_a["href"])
        if not pdf_url:
            pdf_url = page_url

        return {
            "title": title,
            "abstract": abstract,
            "authors": authors,
            "year": year,
            "pdf_url": pdf_url,
        }
