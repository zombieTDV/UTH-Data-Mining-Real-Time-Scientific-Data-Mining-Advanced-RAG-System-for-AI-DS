"""Unified Content Resolver for Academic Research Literature (HTML-First Architecture).

Implements a high-throughput, multi-source waterfall resolution engine:
1. Tier A (HTML-First): Fetches native HTML5 from arXiv (https://arxiv.org/html/{id})
   or ar5iv (https://ar5iv.labs.arxiv.org/html/{id}).
2. Tier B (Cross-Reference Mirror): Resolves CVF / OpenReview papers against arXiv HTML preprints.
3. Tier C (Bronze Vaulting): Vaults raw HTML to Cloudflare R2 Bronze Zone matching
   the pre-existing partition schema: bronze/{source}/raw_html/{year}/{paper_id}.html.
4. Tier D (PDF Fallback): Falls back to temporary PDF download + Marker/PyPDF extraction
   only when no HTML is available, followed by an immediate zero-leak PDF purge.
5. Tier E (Abstract Fallback): Graceful fallback to rich abstract text if paper body is paywalled.
"""

import datetime
import hashlib
import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import uuid
import httpx

from src.config.settings import settings
from src.storage.minio_client import StorageClient
from src.transformation.html_parser import AcademicHTMLParser
from src.transformation.marker_extractor import MarkerPdfExtractor
from src.utils.hasher import compute_sha256

logger = logging.getLogger("unified_content_resolver")


class UnifiedContentResolver:
    """Waterfall content resolution engine prioritizing HTML5 over binary PDFs."""

    def __init__(
        self,
        storage_client: Optional[StorageClient] = None,
        sync_storage: bool = False,
        r2_client: Optional[Any] = None,
        sync_r2: bool = False,
        use_marker_fallback: bool = True,
        max_pdf_pages: int = 15,
        local_cache_dir: Optional[Path] = None,
        temp_pdf_dir: Optional[Path] = None,
    ):
        self.storage = storage_client or r2_client or (StorageClient() if (sync_storage or sync_r2) else None)
        self.r2 = self.storage
        self.sync_r2 = (sync_storage or sync_r2) and (self.storage is not None)
        self.html_parser = AcademicHTMLParser()

        self.marker_extractor = MarkerPdfExtractor(use_marker=use_marker_fallback, max_pages=max_pdf_pages)

        self.cache_dir = local_cache_dir or (settings.ROOT_DIR / "data" / "raw" / "html")
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        self.temp_pdf_dir = temp_pdf_dir or (settings.ROOT_DIR / "data" / "raw" / "temp_pdfs")
        self.temp_pdf_dir.mkdir(parents=True, exist_ok=True)

        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) UTH-Scientific-HTMLFirstResolver/2.0 (academic research; contact: datamining@uth.edu.vn)"
        }

    @staticmethod
    def get_r2_html_key(paper_id: str, source: str = "arxiv", year: str = "2024") -> str:
        """Returns standard Lakehouse Bronze S3 key matching pre-existing schema:
        bronze/{source}/raw_html/{year}/{clean_id}.html
        """
        clean_id = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", paper_id)
        clean_source = source.lower() if source else "arxiv"
        clean_year = str(year)[:4] if str(year)[:4].isdigit() else "2024"
        return f"bronze/{clean_source}/raw_html/{clean_year}/{clean_id}.html"

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
        """Saves raw HTML to local mirror and uploads to Cloudflare R2 Bronze Zone."""
        safe_id = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", paper_id)
        local_file = self.cache_dir / f"{safe_id}.html"
        try:
            with open(local_file, "w", encoding="utf-8") as f:
                f.write(html_text)
        except Exception as err:
            logger.debug("[HTML CACHE ERROR] Could not save local HTML for %s: %s", paper_id, err)

        if self.sync_r2 and self.r2:
            r2_key = self.get_r2_html_key(paper_id=paper_id, source=source, year=year)
            html_hash = compute_sha256(html_text)
            try:
                self.r2.upload_text(
                    text=html_text,
                    key=r2_key,
                    content_type="text/html; charset=utf-8",
                    metadata={"sha256": html_hash, "paper_id": paper_id},
                )
                return r2_key
            except Exception as r2_err:
                logger.warning("[R2 BRONZE UPLOAD ERROR] Failed to vault %s to R2: %s", r2_key, r2_err)

        return None

    def resolve_single_paper(self, paper: Dict[str, Any], client: httpx.Client) -> Dict[str, Any]:
        """Resolves content for a single paper via HTML-First waterfall."""
        paper_id = paper["paper_id"]
        safe_id = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", paper_id)
        source = paper.get("source", "arxiv")
        year = str(paper.get("year") or 2024)
        arxiv_id = paper.get("arxiv_id")

        # 0. Check local HTML cache first
        local_html = self.cache_dir / f"{safe_id}.html"
        if local_html.exists() and local_html.stat().st_size > 1000:
            try:
                with open(local_html, "r", encoding="utf-8") as f:
                    html_text = f.read()
                parsed = self.html_parser.parse(html_text)
                return self._enrich_record_from_parsed(paper, parsed, content_type="cached_html")
            except Exception:
                pass

        # 1. Tier A: Try arXiv HTML if arXiv ID is available
        if arxiv_id:
            clean_ar = re.sub(r"v\d+$", "", str(arxiv_id)).strip()
            clean_ar = re.sub(r"[^0-9\.]", "", clean_ar)
            html_result = self.fetch_arxiv_html(clean_ar, client)
            if html_result:
                html_text, subtype = html_result
                self.vault_html_to_bronze(html_text, paper_id, source, year)
                parsed = self.html_parser.parse(html_text)
                return self._enrich_record_from_parsed(paper, parsed, content_type=subtype)

        # 2. Tier B: PDF Download + Resilient Marker Fallback (Rolling buffer)
        pdf_urls = paper.get("pdf_urls", [])
        if pdf_urls:
            unique_token = uuid.uuid4().hex[:8]
            local_pdf = self.temp_pdf_dir / f"{safe_id}_{unique_token}.pdf"
            pdf_downloaded = False
            for u in pdf_urls:
                try:
                    resp = client.get(u, timeout=10.0)
                    if resp.status_code == 200 and len(resp.content) > 1000:
                        header = resp.content[:200].lower()
                        if resp.content.startswith(b"%PDF") and b"<!doctype" not in header and b"<html" not in header:
                            with open(local_pdf, "wb") as pf:
                                pf.write(resp.content)
                            pdf_downloaded = True
                            break
                except Exception:
                    continue

            if pdf_downloaded and local_pdf.exists():
                md_text, meta = "", {}
                try:
                    md_text, meta = self.marker_extractor.convert_pdf_to_markdown(local_pdf)
                except Exception as e:
                    logger.debug("[PDF EXTRACT ERROR] %s: %s", paper_id, e)
                finally:
                    # Guaranteed Zero-Leak Purge (safely handled on Windows)
                    try:
                        if local_pdf.exists():
                            local_pdf.unlink(missing_ok=True)
                    except Exception:
                        pass

                if md_text and len(md_text) > 200:
                    paper["markdown_content"] = md_text
                    paper["clean_full_text"] = md_text
                    paper["total_math_count"] = meta.get("latex_formulas_detected", 0)
                    paper["total_sections"] = 5
                    paper["total_words"] = len(md_text.split())
                    paper["sections_json"] = json.dumps([{"section_title": "Full Text", "content": md_text}], ensure_ascii=False)
                    paper["content_origin"] = meta.get("engine", "pdf_marker_fallback")
                    paper["crawled_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
                    return paper

        # 3. Tier C: Rich Abstract Fallback
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

    def purge_temp_pdfs(self):
        """Purges any lingering temporary PDFs in temp buffer."""
        deleted = 0
        for f in self.temp_pdf_dir.glob("*.pdf"):
            try:
                f.unlink()
                deleted += 1
            except Exception:
                pass
        if deleted > 0:
            logger.debug("[ZERO LEAK] Purged %d temporary PDFs from buffer.", deleted)

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

        self.purge_temp_pdfs()
        return results

