"""Unified Content Resolver for Academic Research Literature (HTML-First Architecture).

Waterfall:
1. arXiv HTML5 (https://arxiv.org/html/{id}) -> ar5iv (https://ar5iv.labs.arxiv.org/html/{id}); the raw HTML is
   vaulted to Bronze at bronze/{source}/raw_html/{year}/{paper_id}.html.
2. Open-access PDF, ONLY for Tier 3 papers that are not on arXiv (classics such as LSTM or ImageNet): the PDF from
   Semantic Scholar's openAccessPdf is vaulted to bronze/{source}/raw_pdf/{year}/{paper_id}.pdf and its text is
   extracted in memory with PyMuPDF. Tier 1 and Tier 2 stay HTML-only.
3. Abstract fallback when no full text is available.
"""

import datetime
import hashlib
import json
import logging
import re
from typing import Any, Dict, List, Optional, Tuple
import httpx

from src.config.settings import settings
from src.storage.minio_client import StorageClient
from src.transformation.html_parser import AcademicHTMLParser
from src.utils.hasher import compute_sha256

logger = logging.getLogger("unified_content_resolver")


class UnifiedContentResolver:
    """Waterfall content resolution engine prioritizing HTML5 over binary PDFs."""

    MIN_FULLTEXT_WORDS = 300
    MAX_PDF_BYTES = 40 * 1024 * 1024

    def __init__(
        self,
        storage_client: Optional[StorageClient] = None,
        sync_storage: bool = False,
        r2_client: Optional[Any] = None,
        sync_r2: bool = False,
        **_ignored,
    ):
        # MinIO is the only store: always on, the sync flags are kept for call-site compatibility.
        self.storage = storage_client or r2_client or StorageClient()
        self.r2 = self.storage
        self.sync_r2 = True
        self.html_parser = AcademicHTMLParser()

        self.headers = {"User-Agent": settings.ARXIV_USER_AGENT}

    @staticmethod
    def get_r2_html_key(paper_id: str, source: str = "arxiv", year: str = "2024") -> str:
        """Bronze key of a paper's raw HTML, gzip-compressed: bronze/{source}/raw_html/{year}/{clean_id}.html.gz"""
        clean_id = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", paper_id)
        clean_source = source.lower() if source else "arxiv"
        clean_year = str(year)[:4] if str(year)[:4].isdigit() else "2024"
        return f"bronze/{clean_source}/raw_html/{clean_year}/{clean_id}.html.gz"

    def read_bronze_html(self, key: str) -> Optional[str]:
        """Raw HTML from Bronze (the .html.gz object, or a legacy uncompressed .html), None when absent."""
        import gzip

        for k, packed in ((key, True), (key[:-3], False)):
            if self.storage.object_exists(k):
                body = self.storage.s3.get_object(Bucket=self.storage.bucket_name, Key=k)["Body"].read()
                return (gzip.decompress(body) if packed else body).decode("utf-8", "replace")
        return None

    @staticmethod
    def get_pdf_key(paper_id: str, source: str, year: str) -> str:
        clean_id = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", paper_id)
        clean_year = str(year)[:4] if str(year)[:4].isdigit() else "unknown"
        return f"bronze/{(source or 'unknown').lower()}/raw_pdf/{clean_year}/{clean_id}.pdf"

    def fetch_pdf(self, url: str, client: httpx.Client) -> Optional[bytes]:
        """Download an open-access PDF (None unless the body really is a PDF of sane size)."""
        try:
            resp = client.get(url, timeout=45.0)
            body = resp.content
            if resp.status_code == 200 and body[:5] != b"%PDF-" and b"citation_pdf_url" in body:
                # A repository landing page (HAL, university repositories, publishers): follow its citation_pdf_url
                m = re.search(rb'name="citation_pdf_url"\s+content="([^"]+)"', body) or re.search(rb'content="([^"]+)"\s+name="citation_pdf_url"', body)
                if m:
                    pdf_url = str(httpx.URL(str(resp.url)).join(m.group(1).decode("utf-8", "ignore")))
                    resp = client.get(pdf_url, timeout=45.0)
                    body = resp.content
            if resp.status_code == 200 and body[:5] == b"%PDF-" and len(body) <= self.MAX_PDF_BYTES:
                return body
            logger.info("[PDF RESOLVER] %s is not a usable PDF (HTTP %s, %d bytes)", url, resp.status_code, len(body))
        except Exception as e:
            logger.info("[PDF RESOLVER] Download failed for %s: %s", url, e)
        return None

    @staticmethod
    def parse_pdf(pdf_bytes: bytes) -> Dict[str, Any]:
        """PDF text -> sections with PyMuPDF. A line is a heading when it is short and set clearly larger than
        the body font (the most common span size); everything until the next heading is that section's body."""
        import collections

        import fitz  # PyMuPDF

        lines: List[Tuple[float, str]] = []
        sizes: collections.Counter = collections.Counter()
        with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
            for page in doc:
                for block in page.get_text("dict").get("blocks", []):
                    for line in block.get("lines", []):
                        spans = [sp for sp in line.get("spans", []) if sp.get("text", "").strip()]
                        if not spans:
                            continue
                        text = " ".join(sp["text"].strip() for sp in spans)
                        size = max(sp["size"] for sp in spans)
                        lines.append((size, text))
                        sizes[round(size, 1)] += len(text)
        if not lines:
            return {"sections": [], "total_sections": 0, "total_words": 0, "total_math_count": 0}
        body = sizes.most_common(1)[0][0]

        sections: List[Dict[str, Any]] = []
        title, buf = "Body", []

        def flush():
            content = re.sub(r"-\s+(?=[a-z])", "", " ".join(buf))  # re-join words hyphenated across lines
            content = re.sub(r"\s+", " ", content).strip()
            if content:
                sections.append({"section_title": title, "section_type": "body", "content": content})

        for size, text in lines:
            if size >= body * 1.15 and len(text) <= 90 and re.search(r"[A-Za-z]{3}", text):
                flush()
                title, buf = text.strip(), []
            else:
                buf.append(text)
        flush()
        words = sum(len(sec["content"].split()) for sec in sections)
        return {"sections": sections, "total_sections": len(sections), "total_words": words, "total_math_count": 0}

    def resolve_open_access_pdf(self, paper: Dict[str, Any], client: httpx.Client, source: str, year: str) -> Optional[Dict[str, Any]]:
        """Tier 3, not on arXiv: open-access PDF from Bronze (cache) or the openAccessPdf URL."""
        key = self.get_pdf_key(paper["paper_id"], source, year)
        pdf = None
        try:
            if self.storage.object_exists(key):
                pdf = self.storage.s3.get_object(Bucket=self.storage.bucket_name, Key=key)["Body"].read()
        except Exception as err:
            logger.debug("[PDF RESOLVER] Bronze cache miss for %s: %s", paper["paper_id"], err)
        if pdf is None:
            pdf = self.fetch_pdf(paper["pdf_url"], client)
            if pdf is None:
                return None
            try:
                self.storage.s3.put_object(
                    Bucket=self.storage.bucket_name, Key=key, Body=pdf, ContentType="application/pdf",
                    Metadata={"sha256": compute_sha256(pdf), "paper_id": paper["paper_id"], "source_url": paper["pdf_url"][:1000]},
                )
            except Exception as err:
                logger.warning("[BRONZE UPLOAD ERROR] Failed to vault %s: %s", key, err)
        try:
            parsed = self.parse_pdf(pdf)
        except Exception as err:
            logger.warning("[PDF RESOLVER] PyMuPDF could not read %s: %s", paper["paper_id"], err)
            return None
        if parsed["total_words"] < self.MIN_FULLTEXT_WORDS:
            logger.warning("[PDF RESOLVER] %s PDF has only %d words (scanned image?); using the abstract", paper["paper_id"], parsed["total_words"])
            return None
        md = "\n\n".join(f"## {sec['section_title']}\n{sec['content']}" for sec in parsed["sections"])
        return self._enrich_record_from_parsed(paper, {**parsed, "markdown_content": md}, content_type="open_access_pdf")

    def fetch_arxiv_html(self, clean_arxiv_id: str, client: httpx.Client) -> Optional[Tuple[str, str]]:
        """Attempts to fetch academic HTML5 from arXiv or ar5iv.
        Returns: (html_text, 'arxiv'|'ar5iv') or None.
        """
        if not clean_arxiv_id:
            return None

        # Clean ID format (e.g. 1706.03762v7 or 1706.03762)
        ar_id = clean_arxiv_id.strip()

        # 1. Try official arXiv HTML5
        arxiv_url = f"https://arxiv.org/html/{ar_id}"
        try:
            resp = client.get(arxiv_url, timeout=8.0)
            if resp.status_code == 200 and len(resp.text) > 1200:
                if "<html" in resp.text.lower() and "ltx_" in resp.text:
                    return resp.text, "arxiv_html5"
        except Exception as e:
            logger.debug("[HTML RESOLVER] arXiv HTML failed for %s: %s", ar_id, e)

        # 2. Try arXiv Labs ar5iv (LaTeXML pre-rendered)
        ar5iv_url = f"https://ar5iv.labs.arxiv.org/html/{ar_id}"
        try:
            resp = client.get(ar5iv_url, timeout=8.0)
            if resp.status_code == 200 and len(resp.text) > 1200:
                if "<html" in resp.text.lower():
                    return resp.text, "ar5iv_html5"
        except Exception as e:
            logger.debug("[HTML RESOLVER] ar5iv HTML failed for %s: %s", ar_id, e)

        return None

    def vault_html_to_bronze(self, html_text: str, paper_id: str, source: str, year: str) -> Optional[str]:
        """Stores raw HTML in the MinIO Bronze zone (no local mirror)."""
        r2_key = self.get_r2_html_key(paper_id=paper_id, source=source, year=year)
        import gzip

        try:
            # gzip cuts raw arXiv HTML ~6-8x; the lakehouse has a fixed disk budget
            self.storage.s3.put_object(
                Bucket=self.storage.bucket_name, Key=r2_key, Body=gzip.compress(html_text.encode("utf-8"), compresslevel=6),
                ContentType="application/gzip", Metadata={"sha256": compute_sha256(html_text), "paper_id": paper_id, "inner-type": "text/html"},
            )
            return r2_key
        except Exception as err:
            logger.warning("[BRONZE UPLOAD ERROR] Failed to vault %s: %s", r2_key, err)
            return None

    def resolve_single_paper(self, paper: Dict[str, Any], client: httpx.Client) -> Dict[str, Any]:
        """Resolves content for a single paper via HTML-First waterfall."""
        paper_id = paper["paper_id"]
        safe_id = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", paper_id)
        source = paper.get("source", "arxiv")
        year = str(paper.get("year") or 2024)
        arxiv_id = paper.get("arxiv_id")

        # 0. Check the MinIO Bronze HTML first (acts as the cache)
        html_key = self.get_r2_html_key(paper_id=paper_id, source=source, year=year)
        try:
            html_text = self.read_bronze_html(html_key)
            if html_text and len(html_text) > 1000:
                parsed = self.html_parser.parse(html_text)
                if parsed.get("total_words", 0) >= self.MIN_FULLTEXT_WORDS and parsed.get("total_sections", 0) >= 2:
                    return self._enrich_record_from_parsed(paper, parsed, content_type="cached_html")
                logger.warning("[HTML RESOLVER] Cached Bronze HTML for %s is a stub (%d words); refetching", paper_id, parsed.get("total_words", 0))
        except Exception as err:
            logger.debug("[HTML RESOLVER] Bronze cache miss for %s: %s", paper_id, err)

        # 1. Tier A: Try arXiv HTML if arXiv ID is available
        if arxiv_id:
            clean_ar = re.sub(r"v\d+$", "", str(arxiv_id)).strip()  # keeps pre-2007 ids such as cs/0101001 intact
            html_result = self.fetch_arxiv_html(clean_ar, client)
            if html_result:
                html_text, subtype = html_result
                self.vault_html_to_bronze(html_text, paper_id, source, year)
                parsed = self.html_parser.parse(html_text)
                # A page that parses to (almost) nothing is a stub (e.g. an ar5iv placeholder): fall through to the abstract fallback
                if parsed.get("total_words", 0) >= self.MIN_FULLTEXT_WORDS and parsed.get("total_sections", 0) >= 2:
                    return self._enrich_record_from_parsed(paper, parsed, content_type=subtype)
                logger.warning("[HTML RESOLVER] %s parsed to %d words / %d sections via %s; using the abstract",
                               paper_id, parsed.get("total_words", 0), parsed.get("total_sections", 0), subtype)

        # 2. Tier 3 classics that are not on arXiv: open-access PDF (the only place PDFs are used)
        if not arxiv_id and paper.get("tier") == "tier3" and paper.get("pdf_url"):
            resolved = self.resolve_open_access_pdf(paper, client, source, year)
            if resolved:
                return resolved

        # 3. Abstract fallback (no full text available: paywalled, brand new, or no open-access copy)
        abstract = paper.get("abstract", "")
        title = paper.get("title", "")
        fallback_md = f"# {title}\n\n## Abstract\n\n{abstract}\n"
        paper["markdown_content"] = fallback_md
        paper["clean_full_text"] = fallback_md
        paper["total_math_count"] = 0
        paper["total_sections"] = 1
        paper["total_words"] = len(abstract.split()) if abstract else 0
        paper["sections_json"] = json.dumps([{"section_title": "Abstract", "content": abstract}], ensure_ascii=False)
        paper["content_origin"] = "abstract_fallback"
        paper["crawled_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        return paper

    def _enrich_record_from_parsed(
        self, paper: Dict[str, Any], parsed: Dict[str, Any], content_type: str
    ) -> Dict[str, Any]:
        """Merges parsed HTML structure into paper record matching Silver schema."""
        md_text = parsed.get("markdown_content") or self.html_parser.to_markdown(parsed)
        paper["markdown_content"] = md_text
        paper["clean_full_text"] = md_text
        paper["total_math_count"] = parsed.get("total_math_count", 0)
        paper["total_sections"] = parsed.get("total_sections", 1)
        paper["total_words"] = parsed.get("total_words", len(md_text.split()))
        paper["sections_json"] = json.dumps(parsed.get("sections", []), ensure_ascii=False)
        paper["content_origin"] = content_type
        paper["crawled_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        return paper

    def resolve_batch_concurrent(
        self, batch_papers: List[Dict[str, Any]], max_workers: int = 6
    ) -> List[Dict[str, Any]]:
        """Concurrently resolves an entire batch of papers prioritizing HTML."""
        from concurrent.futures import ThreadPoolExecutor, as_completed

        results: List[Dict[str, Any]] = []
        with httpx.Client(headers=self.headers, follow_redirects=True) as client:
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_to_paper = {
                    executor.submit(self.resolve_single_paper, p, client): p["paper_id"]
                    for p in batch_papers
                }
                for future in as_completed(future_to_paper):
                    p_id = future_to_paper[future]
                    try:
                        resolved = future.result()
                        results.append(resolved)
                    except Exception as err:
                        logger.error("[BATCH RESOLVE ERROR] Failed resolving %s: %s", p_id, err)

        return results

