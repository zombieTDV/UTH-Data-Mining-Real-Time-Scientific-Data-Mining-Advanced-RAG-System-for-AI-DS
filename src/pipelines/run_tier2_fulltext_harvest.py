"""Tier 2 Pure Full-Text Harvester using Marker 2.0 (CUDA PDF-to-Markdown).

Strict Full-Text Lakehouse Pipeline:
1. Sourcing: arXiv API for AI/ML preprints (cs.AI, cs.LG, cs.CV, cs.CL, stat.ML).
2. Download: Downloads raw scientific PDFs to data/bronze/pdf_raw/.
3. Neural Extraction: Uses Marker (MarkerPdfExtractor) on CUDA GPU (FP16)
   to extract high-fidelity Markdown, preserving math equations ($ ... $, $$ ... $$),
   tables, and numbered headings (1 Introduction, 2 Method, 3 Experiments...).
4. Strict Quality Gate: Rejects any record with < 2 structured sections
   or < 500 words (Strictly ZERO abstract-only papers allowed).
5. Silver Vaulting: Appends verified full-text records to data/silver/tier2/fulltext_papers.parquet.
6. Live Telemetry: Streams SSE progress pulses to FastAPI /api/ingestion/broadcast.

Usage:
    # Test batch of 5 papers:
    python src/pipelines/run_tier2_fulltext_harvest.py --test-limit 5

    # Full collection up to 50,000 papers:
    python src/pipelines/run_tier2_fulltext_harvest.py --max-papers 50000 --batch-size 50
"""

import os
import sys
import warnings

# Suppress annoying C-extension / third-party deprecation spam in log outputs
warnings.filterwarnings("ignore")
os.environ["PYTHONWARNINGS"] = "ignore"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

import argparse
import datetime
import json
import logging
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Set
import xml.etree.ElementTree as ET

import hashlib
import httpx
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config.settings import settings
from src.storage.r2_client import R2Client
from src.transformation.html_parser import AcademicHTMLParser
from src.transformation.marker_extractor import MarkerPdfExtractor
from src.utils.hasher import compute_abstract_hash
from src.utils.logger import setup_pipeline_logging

logger, log_file = setup_pipeline_logging("tier2_fulltext_harvest")


def broadcast_telemetry(payload: dict):
    """Broadcasts live ingestion telemetry to local FastAPI SSE bridge."""
    try:
        httpx.post("http://127.0.0.1:8000/api/ingestion/broadcast", json=payload, timeout=0.25)
    except Exception:
        pass


def sanitize_surrogates(val: Any) -> Any:
    """Removes lone surrogate unicode characters (e.g. \\ud835) that break PyArrow/Parquet."""
    if isinstance(val, str):
        return val.encode("utf-8", errors="ignore").decode("utf-8")
    elif isinstance(val, list):
        return [sanitize_surrogates(x) for x in val]
    elif isinstance(val, dict):
        return {k: sanitize_surrogates(v) for k, v in val.items()}
    return val


class Tier2FullTextHarvester:
    """Automated high-throughput harvester extracting pure full-text papers via Marker."""

    ARXIV_API_BASE = "http://export.arxiv.org/api/query"

    def __init__(
        self,
        categories: Optional[List[str]] = None,
        sync_r2: bool = False,
        request_delay: float = 1.0,
        shard_index: Optional[int] = None,
        total_shards: int = 1,
        clean_pdf: bool = True,
    ):
        self.categories = categories or ["cs.AI", "cs.LG", "cs.CV", "cs.CL", "stat.ML"]
        self.sync_r2 = sync_r2
        self.request_delay = request_delay
        self.shard_index = shard_index
        self.total_shards = max(total_shards, 1)
        self.clean_pdf = clean_pdf
        self.r2 = R2Client() if sync_r2 else None

        self.bronze_pdf_dir = settings.ROOT_DIR / "data" / "bronze" / "pdf_raw"
        self.bronze_pdf_dir.mkdir(parents=True, exist_ok=True)

        self.silver_dir = settings.ROOT_DIR / "data" / "silver" / "tier2"
        self.silver_dir.mkdir(parents=True, exist_ok=True)
        if self.shard_index is not None:
            self.silver_path = self.silver_dir / f"fulltext_papers_shard{self.shard_index}.parquet"
            self.r2_key = f"silver/tier2/fulltext_papers_shard{self.shard_index}.parquet"
        else:
            self.silver_path = self.silver_dir / "fulltext_papers.parquet"
            self.r2_key = "silver/tier2/fulltext_papers.parquet"

        self.marker_extractor = MarkerPdfExtractor(use_marker=True)
        self.html_parser = AcademicHTMLParser()
        self.bronze_html_dir = settings.ROOT_DIR / "data" / "bronze" / "arxiv" / "html_raw"
        self.bronze_html_dir.mkdir(parents=True, exist_ok=True)
        self.existing_ids: Set[str] = self._load_existing_ids()

        self.http_client = httpx.Client(
            headers={
                "User-Agent": "UTH-DataMining-FullText-Harvester/2.0 (academic research; contact: data-mining@uth.edu.vn)"
            },
            timeout=45.0,
            follow_redirects=True,
        )

    def _load_existing_ids(self) -> Set[str]:
        """Loads paper IDs already ingested across all fulltext_papers parquets."""
        existing = set()
        for p in self.silver_dir.glob("fulltext_papers*.parquet"):
            try:
                df = pd.read_parquet(p, columns=["paper_id"])
                existing.update(df["paper_id"].astype(str))
            except Exception as e:
                logger.warning("[CACHE WARNING] Could not read %s: %s", p.name, e)
        logger.info("[CACHE] Found %d verified full-text papers already in Silver cache.", len(existing))
        return existing

    def fetch_arxiv_candidates(self, category: str, start: int = 0, max_results: int = 50) -> List[Dict[str, Any]]:
        """Queries arXiv API for preprints in the specified AI/ML category."""
        params = {
            "search_query": f"cat:{category}",
            "start": start,
            "max_results": max_results,
            "sortBy": "submittedDate",
            "sortOrder": "descending",
        }

        try:
            resp = self.http_client.get(self.ARXIV_API_BASE, params=params)
            resp.raise_for_status()
            return self._parse_arxiv_atom_feed(resp.text, category)
        except Exception as e:
            logger.error("[ARXIV API ERROR] Failed to fetch category %s at start=%d: %s", category, start, e)
            return []

    def _parse_arxiv_atom_feed(self, atom_xml: str, category: str) -> List[Dict[str, Any]]:
        """Parses arXiv Atom XML response into structured paper records."""
        root = ET.fromstring(atom_xml)
        ns = {"atom": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}

        papers = []
        for entry in root.findall("atom:entry", ns):
            id_url = entry.find("atom:id", ns)
            if id_url is None or not id_url.text:
                continue

            raw_id = id_url.text.strip().split("/abs/")[-1]
            clean_id = re.sub(r"v\d+$", "", raw_id)

            title_elem = entry.find("atom:title", ns)
            title = re.sub(r"\s+", " ", title_elem.text).strip() if title_elem is not None and title_elem.text else ""

            summary_elem = entry.find("atom:summary", ns)
            abstract = re.sub(r"\s+", " ", summary_elem.text).strip() if summary_elem is not None and summary_elem.text else ""

            authors = []
            for author in entry.findall("atom:author", ns):
                name_elem = author.find("atom:name", ns)
                if name_elem is not None and name_elem.text:
                    authors.append(name_elem.text.strip())

            published_elem = entry.find("atom:published", ns)
            pub_date = published_elem.text.strip() if published_elem is not None and published_elem.text else ""

            pdf_url = f"https://arxiv.org/pdf/{clean_id}.pdf"
            html_url = f"https://arxiv.org/abs/{clean_id}"

            doi_elem = entry.find("arxiv:doi", ns)
            doi = doi_elem.text.strip() if doi_elem is not None and doi_elem.text else None

            journal_elem = entry.find("arxiv:journal_ref", ns)
            journal_ref = journal_elem.text.strip() if journal_elem is not None and journal_elem.text else None

            papers.append({
                "paper_id": clean_id,
                "title": title,
                "abstract": abstract,
                "authors": authors,
                "primary_category": category,
                "categories": [category],
                "published_date": pub_date,
                "pdf_url": pdf_url,
                "html_url": html_url,
                "doi": doi,
                "journal_ref": journal_ref,
                "source": "arxiv",
                "tier": "tier2",
                "content_origin": "arxiv_marker_fulltext",
            })

        return papers

    def download_pdf(self, paper_id: str, pdf_url: str) -> Optional[Path]:
        """Downloads scientific PDF to Bronze zone with retry logic and safe filename."""
        safe_id = "".join([c if c.isalnum() or c in "-_." else "_" for c in str(paper_id)])
        dest_path = self.bronze_pdf_dir / f"{safe_id}.pdf"
        if dest_path.exists() and dest_path.stat().st_size > 10000:
            return dest_path

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        }

        for attempt in range(3):
            try:
                time.sleep(self.request_delay)
                resp = self.http_client.get(pdf_url, headers=headers)
                if resp.status_code == 200 and len(resp.content) > 10000 and resp.content.startswith(b"%PDF"):
                    with open(dest_path, "wb") as f:
                        f.write(resp.content)
                    return dest_path
                elif resp.status_code == 429:
                    logger.warning("[RATE LIMIT] 429 received from %s. Sleeping 5s (attempt %d/3)...", pdf_url[:40], attempt + 1)
                    time.sleep(5.0)
            except Exception as e:
                logger.warning("[DOWNLOAD ERROR] %s (attempt %d/3): %s", paper_id, attempt + 1, e)
                time.sleep(2.0)

        return None

    def extract_fulltext_and_sections(self, pdf_path: Path, paper_record: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Parses PDF via Marker into clean Markdown and structured sections."""
        try:
            markdown_text, meta = self.marker_extractor.convert_pdf_to_markdown(pdf_path)
            if not markdown_text or len(markdown_text.split()) < 300:
                logger.warning("[MARKER NOTE] Insufficient content extracted for %s", pdf_path.name)
                return None

            # Split into structured sections based on Markdown headers
            sections = self._parse_markdown_into_sections(markdown_text, paper_record.get("abstract", ""))
            if len(sections) < 2:
                logger.warning("[QUALITY GATE] %s rejected: only %d sections detected.", paper_record["paper_id"], len(sections))
                return None

            total_words = len(markdown_text.split())
            latex_formulas = meta.get("latex_formulas_detected", 0)

            return {
                "clean_full_text": markdown_text,
                "sections_json": json.dumps(sections),
                "total_sections": len(sections),
                "total_words": total_words,
                "total_math_count": latex_formulas,
            }
        except Exception as e:
            logger.error("[MARKER ERROR] Failed to process %s: %s", pdf_path.name, e)
            return None

    def extract_arxiv_html(self, paper_id: str, paper_record: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Attempts to fetch and parse academic HTML5 directly from arXiv.

        Returns structured section dictionary if HTML5 exists and passes quality gates, else None.
        """
        clean_id = str(paper_id).replace("arxiv_", "").strip()
        html_url = f"https://arxiv.org/html/{clean_id}"
        try:
            resp = self.http_client.get(html_url)
            if resp.status_code == 200 and len(resp.text) > 1000:
                html_text = resp.text
                safe_id = "".join([c if c.isalnum() or c in "-_." else "_" for c in str(clean_id)])
                local_html_path = self.bronze_html_dir / f"{safe_id}.html"
                try:
                    local_html_path.write_text(html_text, encoding="utf-8")
                except Exception:
                    pass

                parsed = self.html_parser.parse(html_text)
                sections = parsed.get("sections", [])
                total_words = parsed.get("total_words", 0)

                # Quality gate: at least 2 structured sections and at least 300 words
                if len(sections) >= 2 and total_words >= 300:
                    abs_text = str(paper_record.get("abstract", "")).strip() or parsed.get("parsed_abstract", "")
                    has_abs = any(s.get("section_id") == "abstract" or "abstract" in str(s.get("section_title", "")).lower() for s in sections)
                    if abs_text and not has_abs:
                        sections.insert(0, {
                            "section_id": "abstract",
                            "section_title": "Abstract",
                            "section_type": "abstract",
                            "content": abs_text,
                            "paragraphs": [abs_text],
                            "paragraph_count": 1,
                            "math_count": 0,
                            "word_count": len(abs_text.split()),
                        })

                    return {
                        "clean_full_text": parsed.get("markdown_content", ""),
                        "sections_json": json.dumps(sections),
                        "total_sections": len(sections),
                        "total_words": total_words,
                        "total_math_count": parsed.get("total_math_count", 0),
                        "method": "HTML5",
                    }
        except Exception as e:
            logger.debug("[HTML FETCH NOTE] %s HTML5 fetch exception: %s", clean_id, e)
        return None

    def _parse_markdown_into_sections(self, markdown_text: str, abstract: str) -> List[Dict[str, Any]]:
        """Extracts structured sections respecting numbered headings (# 1 Introduction, ## 2 Method...)."""
        sections: List[Dict[str, Any]] = []

        # Ensure Abstract section exists
        if abstract:
            sections.append({
                "section_id": "abstract",
                "section_title": "Abstract",
                "section_type": "abstract",
                "content": abstract,
                "paragraphs": [abstract],
                "paragraph_count": 1,
                "math_count": 0,
                "word_count": len(abstract.split()),
            })

        # Regex recognizing markdown headers (#, ##, ###)
        heading_regex = re.compile(r"^(#{1,3})\s+(?:\*{1,2})?(\d+(?:\.\d+)*\.?\s+[^#\n\*]+|[A-Z][^#\n\*]+)(?:\*{1,2})?$", re.MULTILINE)
        matches = list(heading_regex.finditer(markdown_text))

        for idx, match in enumerate(matches):
            raw_title = match.group(2).strip().strip("*").strip()
            start_pos = match.end()
            end_pos = matches[idx + 1].start() if idx + 1 < len(matches) else len(markdown_text)

            content = markdown_text[start_pos:end_pos].strip()
            words = content.split()
            if len(words) < 20:
                continue

            # Classify section type
            lower_title = raw_title.lower()
            if any(k in lower_title for k in ["intro", "background"]):
                sec_type = "introduction"
            elif any(k in lower_title for k in ["method", "model", "approach", "architecture", "algorithm"]):
                sec_type = "methodology"
            elif any(k in lower_title for k in ["experiment", "result", "eval", "ablation", "benchmark"]):
                sec_type = "experiments"
            elif any(k in lower_title for k in ["conclu", "summary", "discussion"]):
                sec_type = "conclusion"
            else:
                sec_type = "body"

            sec_math_count = len(re.findall(r"\$[^$]+\$|\$\$[^$]+\$\$", content))

            sections.append({
                "section_id": f"sec_{idx + 1}",
                "section_title": raw_title,
                "section_type": sec_type,
                "content": content,
                "paragraphs": [p.strip() for p in content.split("\n\n") if len(p.strip()) > 10],
                "paragraph_count": len(content.split("\n\n")),
                "math_count": sec_math_count,
                "word_count": len(words),
            })

        return sections

    def load_multi_source_candidates(self, max_total: int = 50000) -> List[Dict[str, Any]]:
        """Loads candidates across OpenReview, CVF, DOI, and arXiv in interleaved round-robin order."""
        near_past_path = settings.ROOT_DIR / "data" / "silver" / "tier2" / "near_past_papers.parquet"
        if not near_past_path.exists():
            logger.warning("[CANDIDATES] %s not found. Will use live arXiv stream.", near_past_path.name)
            return []

        logger.info("[CANDIDATES] Loading multi-source candidates from %s...", near_past_path.name)
        df = pd.read_parquet(near_past_path)
        if "source" not in df.columns:
            def _infer_source(r):
                pid = str(r.get("paper_id", "")).lower()
                if "openreview" in pid:
                    return "openreview"
                if "cvf" in pid:
                    return "cvf"
                if "doi" in pid or str(r.get("doi", "")).strip():
                    return "doi"
                return "arxiv"
            df["source"] = df.apply(_infer_source, axis=1)

        valid_mask = (
            df["pdf_url"].notna()
            & df["pdf_url"].astype(str).str.startswith("http")
            & (~df["paper_id"].astype(str).isin(self.existing_ids))
        )
        df_valid = df[valid_mask]

        if not df_valid.empty and self.total_shards > 1 and self.shard_index is not None:
            def _match_shard(pid: str) -> bool:
                return int(hashlib.md5(str(pid).encode("utf-8")).hexdigest(), 16) % self.total_shards == self.shard_index
            df_valid = df_valid[df_valid["paper_id"].apply(_match_shard)]
            logger.info("[SHARDING FILTER] Shard %d/%d assigned %d partitioned candidates.",
                        self.shard_index, self.total_shards, len(df_valid))

        if df_valid.empty or "source" not in df_valid.columns:
            queues = {"openreview": [], "cvf": [], "doi": [], "arxiv": []}
        else:
            queues = {
                "openreview": df_valid[df_valid["source"] == "openreview"].to_dict(orient="records"),
                "cvf": df_valid[df_valid["source"] == "cvf"].to_dict(orient="records"),
                "doi": df_valid[df_valid["source"] == "doi"].to_dict(orient="records"),
                "arxiv": df_valid[df_valid["source"] == "arxiv"].to_dict(orient="records"),
            }

        logger.info(
            "[CANDIDATES POOL] Available uncollected: OpenReview=%d | CVF=%d | DOI=%d | arXiv=%d",
            len(queues["openreview"]), len(queues["cvf"]), len(queues["doi"]), len(queues["arxiv"])
        )

        interleaved: List[Dict[str, Any]] = []
        pointers = {s: 0 for s in queues}
        sources_list = ["openreview", "cvf", "doi", "arxiv"]

        while len(interleaved) < max_total:
            added_in_round = False
            for s in sources_list:
                idx = pointers[s]
                if idx < len(queues[s]):
                    interleaved.append(queues[s][idx])
                    pointers[s] += 1
                    added_in_round = True
                    if len(interleaved) >= max_total:
                        break
            if not added_in_round:
                break

        logger.info("[INTERLEAVED QUEUE] Prepared %d balanced candidates across all 4 sources.", len(interleaved))
        return interleaved

    def run_harvest(self, max_papers: int = 50000, batch_size: int = 50) -> int:
        """Executes balanced multi-source full-text collection across OpenReview, CVF, DOI, and arXiv."""
        logger.info("=" * 80)
        logger.info("STARTING UNIFIED MULTI-SOURCE FULL-TEXT HARVESTER (Target: %d papers)", max_papers)
        logger.info("Distribution: OpenReview (ICLR/NeurIPS) + CVF (CVPR) + DOI (Journals) + arXiv (Preprints)")
        logger.info("=" * 80)

        collected_this_run = 0
        source_counts = {"openreview": 0, "cvf": 0, "doi": 0, "arxiv": 0}
        batch_records: List[Dict[str, Any]] = []
        t0_global = time.time()

        # 1. First exhaust interleaved multi-source candidate pool
        candidates = self.load_multi_source_candidates(max_total=max_papers)

        for paper in candidates:
            if collected_this_run >= max_papers:
                break

            pid = str(paper["paper_id"])
            if pid in self.existing_ids:
                continue

            src = str(paper.get("source", "arxiv")).lower()
            pdf_url = str(paper.get("pdf_url", "")).strip()
            if not pdf_url.startswith("http"):
                continue

            t0_ext = time.time()
            extracted = self.extract_fulltext_and_sections(pdf_path, paper)
            if self.clean_pdf and pdf_path and pdf_path.exists():
                try:
                    pdf_path.unlink()
                except Exception:
                    pass
            if not extracted:
                pdf_path = self.download_pdf(pid, pdf_url)
                if not pdf_path:
                    continue
                extracted = self.extract_fulltext_and_sections(pdf_path, paper)
                if not extracted:
                    continue
                method = "Marker"
                content_origin = f"{src}_marker_fulltext"

            ext_duration = time.time() - t0_ext
            abs_text = str(paper.get("abstract", "")).strip()
            abs_hash = compute_abstract_hash(abs_text)

            full_record = {
                "paper_id": pid,
                "abstract_hash": abs_hash,
                "doi": paper.get("doi"),
                "journal_ref": paper.get("journal_ref"),
                "title": paper.get("title", ""),
                "abstract": abs_text,
                "authors": paper.get("authors", []),
                "categories": paper.get("categories", [paper.get("primary_category", "cs.AI")]),
                "primary_category": paper.get("primary_category", "cs.AI"),
                "published_date": str(paper.get("published_date", "")),
                "crawled_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "pdf_url": pdf_url,
                "html_url": paper.get("html_url", pdf_url),
                "total_sections": extracted["total_sections"],
                "total_math_count": extracted["total_math_count"],
                "total_words": extracted["total_words"],
                "sections_json": extracted["sections_json"],
                "clean_full_text": extracted["clean_full_text"],
                "transformed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "cite_count": float(paper.get("cite_count", 0.0) or 0.0),
                "source": src,
                "tier": "tier2",
                "content_origin": content_origin,
            }

            batch_records.append(full_record)
            self.existing_ids.add(pid)
            collected_this_run += 1
            source_counts[src] = source_counts.get(src, 0) + 1

            logger.info(
                "[FULLTEXT ACCEPTED] #%d [%s %s] | %s | %d sections | %d words | %.2fs %s | Pool: [OR=%d, CVF=%d, DOI=%d, arXiv=%d] | Title: %s",
                collected_this_run, src.upper(), method, pid, extracted["total_sections"], extracted["total_words"], ext_duration, method,
                source_counts.get("openreview", 0), source_counts.get("cvf", 0), source_counts.get("doi", 0), source_counts.get("arxiv", 0),
                paper.get("title", "")[:50]
            )

            # Stream Telemetry to FLOW Panel
            broadcast_telemetry({
                "stage": "BATCH_PROGRESS",
                "paper_id": pid,
                "title": paper.get("title", ""),
                "source": src,
                "tier": "tier2",
                "total_sections": extracted["total_sections"],
                "total_words": extracted["total_words"],
                "accepted_count": len(self.existing_ids),
                "source_breakdown": source_counts,
            })

            # Flush batch to Parquet
            if len(batch_records) >= batch_size:
                self._save_batch_to_silver(batch_records)
                batch_records = []

        # 2. If more papers needed, supplement from arXiv API
        if collected_this_run < max_papers:
            logger.info("[ARXIV LIVE SUPPLEMENT] Candidates pool exhausted; supplementing from arXiv API...")
            for category in self.categories:
                if collected_this_run >= max_papers:
                    break
                start_offset = 0
                while start_offset < 10000 and collected_this_run < max_papers:
                    live_candidates = self.fetch_arxiv_candidates(category, start=start_offset, max_results=50)
                    if not live_candidates:
                        break
                    for paper in live_candidates:
                        pid = paper["paper_id"]
                        if pid in self.existing_ids:
                            continue
                        if self.total_shards > 1 and self.shard_index is not None:
                            if int(hashlib.md5(str(pid).encode("utf-8")).hexdigest(), 16) % self.total_shards != self.shard_index:
                                continue
                        t0_ext = time.time()
                        extracted = self.extract_fulltext_and_sections(pdf_path, paper)
                        if self.clean_pdf and pdf_path and pdf_path.exists():
                            try:
                                pdf_path.unlink()
                            except Exception:
                                pass
                        if not extracted:
                            pdf_path = self.download_pdf(pid, paper["pdf_url"])
                            if not pdf_path:
                                continue
                            extracted = self.extract_fulltext_and_sections(pdf_path, paper)
                            if not extracted:
                                continue
                            method = "Marker"
                            content_origin = "arxiv_marker_fulltext"
                        ext_duration = time.time() - t0_ext
                        abs_hash = compute_abstract_hash(paper["abstract"])
                        full_record = {
                            "paper_id": pid,
                            "abstract_hash": abs_hash,
                            "doi": paper["doi"],
                            "journal_ref": paper["journal_ref"],
                            "title": paper["title"],
                            "abstract": paper["abstract"],
                            "authors": paper["authors"],
                            "categories": paper["categories"],
                            "primary_category": paper["primary_category"],
                            "published_date": paper["published_date"],
                            "crawled_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                            "pdf_url": paper["pdf_url"],
                            "html_url": paper["html_url"],
                            "total_sections": extracted["total_sections"],
                            "total_math_count": extracted["total_math_count"],
                            "total_words": extracted["total_words"],
                            "sections_json": extracted["sections_json"],
                            "clean_full_text": extracted["clean_full_text"],
                            "transformed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                            "cite_count": 0.0,
                            "source": "arxiv",
                            "tier": "tier2",
                            "content_origin": content_origin,
                        }
                        batch_records.append(full_record)
                        self.existing_ids.add(pid)
                        collected_this_run += 1
                        source_counts["arxiv"] = source_counts.get("arxiv", 0) + 1

                        logger.info(
                            "[FULLTEXT ACCEPTED] #%d [ARXIV LIVE %s] | %s | %d sections | %d words | %.2fs %s",
                            collected_this_run, method, pid, extracted["total_sections"], extracted["total_words"], ext_duration, method
                        )
                        broadcast_telemetry({
                            "stage": "BATCH_PROGRESS",
                            "paper_id": pid,
                            "title": paper["title"],
                            "source": "arxiv",
                            "tier": "tier2",
                            "total_sections": extracted["total_sections"],
                            "total_words": extracted["total_words"],
                            "accepted_count": len(self.existing_ids),
                            "source_breakdown": source_counts,
                        })
                        if len(batch_records) >= batch_size:
                            self._save_batch_to_silver(batch_records)
                            batch_records = []
                        if collected_this_run >= max_papers:
                            break
                    start_offset += 50

        # Save remaining records
        if batch_records:
            self._save_batch_to_silver(batch_records)

        duration = time.time() - t0_global
        logger.info("=" * 80)
        logger.info("HARVEST COMPLETE: Collected %d full-text papers in %.2fs (Total in Silver: %d)",
                    collected_this_run, duration, len(self.existing_ids))
        logger.info("Distribution: OpenReview=%d | CVF=%d | DOI=%d | arXiv=%d",
                    source_counts.get("openreview", 0), source_counts.get("cvf", 0),
                    source_counts.get("doi", 0), source_counts.get("arxiv", 0))
        logger.info("=" * 80)
        return collected_this_run

    def _save_batch_to_silver(self, records: List[Dict[str, Any]]):
        """Appends new batch of full-text papers to Silver Parquet table."""
        sanitized_records = [sanitize_surrogates(r) for r in records]
        df_new = pd.DataFrame(sanitized_records)
        if self.silver_path.exists():
            df_old = pd.read_parquet(self.silver_path)
            df_combined = pd.concat([df_old, df_new], ignore_index=True).drop_duplicates(subset=["paper_id"], keep="last")
        else:
            df_combined = df_new

        df_combined.to_parquet(self.silver_path, compression="zstd", index=False)
        logger.info("[SILVER SAVED] Vaulted %d new full-text records to %s (Total: %d papers)",
                    len(records), self.silver_path.name, len(df_combined))

        if self.sync_r2 and self.r2:
            try:
                self.r2.upload_file(
                    self.silver_path,
                    self.r2_key,
                    content_type="application/vnd.apache.parquet"
                )
                logger.info("[R2 SYNC] Successfully synced %s to Cloudflare R2 (%s).",
                            self.silver_path.name, self.r2_key)
            except Exception as e:
                logger.warning("[R2 SYNC NOTE] %s", e)


def merge_shards(silver_dir: Path, sync_r2: bool = False):
    """Merges all fulltext_papers*.parquet files into a single master fulltext_papers.parquet."""
    shard_files = list(silver_dir.glob("fulltext_papers*.parquet"))
    if not shard_files:
        logger.warning("[MERGE] No fulltext_papers parquet files found in %s.", silver_dir)
        return

    logger.info("[MERGE] Consolidating %d files: %s", len(shard_files), [f.name for f in shard_files])
    dfs = []
    for f in shard_files:
        try:
            dfs.append(pd.read_parquet(f))
        except Exception as e:
            logger.warning("[MERGE WARNING] Could not read %s: %s", f.name, e)

    if not dfs:
        return

    combined = pd.concat(dfs, ignore_index=True).drop_duplicates(subset=["paper_id"], keep="last")
    master_path = silver_dir / "fulltext_papers.parquet"
    combined.to_parquet(master_path, compression="zstd", index=False)
    logger.info("[MERGE COMPLETE] Master table %s written with %d unique full-text papers!",
                master_path.name, len(combined))

    if sync_r2:
        try:
            r2 = R2Client()
            r2.upload_file(
                master_path,
                "silver/tier2/fulltext_papers.parquet",
                content_type="application/vnd.apache.parquet"
            )
            logger.info("[R2 SYNC] Successfully uploaded merged master fulltext_papers.parquet to Cloudflare R2.")
        except Exception as e:
            logger.warning("[R2 SYNC NOTE] %s", e)


def main():
    parser = argparse.ArgumentParser(description="Tier 2 Pure Full-Text Harvester via Marker 2.0 (with Distributed Sharding).")
    parser.add_argument("--test-limit", type=int, default=None, help="Run a quick validation batch of N papers.")
    parser.add_argument("--max-papers", type=int, default=50000, help="Target number of full-text papers to collect.")
    parser.add_argument("--batch-size", type=int, default=50, help="Flush to Parquet after every N papers.")
    parser.add_argument("--sync-r2", action="store_true", help="Sync to Cloudflare R2 bucket.")
    parser.add_argument("--shard-index", type=int, default=None, help="Index of this machine shard (0-indexed, e.g., 0 or 1).")
    parser.add_argument("--total-shards", type=int, default=1, help="Total number of parallel machine shards (e.g., 2).")
    parser.add_argument("--merge-shards", action="store_true", help="Merge all local shard parquets into master fulltext_papers.parquet.")
    parser.add_argument("--keep-pdf", action="store_true", help="Keep raw PDFs on disk instead of cleaning them after extraction.")
    args = parser.parse_args()

    silver_dir = settings.ROOT_DIR / "data" / "silver" / "tier2"

    if args.merge_shards:
        merge_shards(silver_dir, sync_r2=args.sync_r2)
        return

    target = args.test_limit if args.test_limit is not None else args.max_papers
    harvester = Tier2FullTextHarvester(
        sync_r2=args.sync_r2,
        shard_index=args.shard_index,
        total_shards=args.total_shards,
        clean_pdf=not args.keep_pdf,
    )
    harvester.run_harvest(max_papers=target, batch_size=args.batch_size if args.test_limit is None else 1)


if __name__ == "__main__":
    main()
