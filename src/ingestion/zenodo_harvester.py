"""Zenodo Harvester with Immediate Marker PDF Engine & LaTeX Preservation.

Harvests peer-reviewed and open-access scientific publications from Zenodo:
- Queries Zenodo REST API (with OAI-PMH fallback against WAF/rate limits).
- Downloads official full-text PDFs immediately into Bronze storage.
- Automatically executes Marker PDF-to-Markdown engine, extracting LaTeX math ($ ... $, $$ ... $$).
- Saves Bronze JSON payloads and writes Silver Parquet (data/silver/zenodo/).
- Dispatches live telemetry pulses to local frontend/dashboard.
"""

import argparse
import datetime
import json
import logging
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
import httpx
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import xmltodict

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config.settings import settings
from src.storage.r2_client import R2Client
from src.transformation.marker_extractor import MarkerPdfExtractor
from src.transformation.silver_writer import SilverLakehouseWriter
from src.utils.logger import setup_pipeline_logging

logger, log_file = setup_pipeline_logging("zenodo_harvester")


class ZenodoHarvester:
    """Harvests academic publications from Zenodo, downloads PDFs, and runs Marker conversion."""

    ZENODO_API_URL = "https://zenodo.org/api/records"
    ZENODO_OAI_URL = "https://zenodo.org/oai2d"

    def __init__(
        self,
        r2_client: Optional[R2Client] = None,
        bronze_dir: Optional[Path] = None,
        silver_dir: Optional[Path] = None,
        pdf_dir: Optional[Path] = None,
        access_token: Optional[str] = None,
    ):
        self.r2 = r2_client or R2Client()
        self.bronze_dir = bronze_dir or (settings.ROOT_DIR / "data" / "raw" / "zenodo")
        self.silver_dir = silver_dir or (settings.ROOT_DIR / "data" / "silver" / "zenodo")
        self.pdf_dir = pdf_dir or (settings.ROOT_DIR / "data" / "raw" / "zenodo" / "pdfs")
        self.markdown_dir = settings.ROOT_DIR / "data" / "raw" / "zenodo" / "markdowns"

        self.bronze_dir.mkdir(parents=True, exist_ok=True)
        self.silver_dir.mkdir(parents=True, exist_ok=True)
        self.pdf_dir.mkdir(parents=True, exist_ok=True)
        self.markdown_dir.mkdir(parents=True, exist_ok=True)

        self.access_token = access_token or settings.ZENODO_ACCESS_TOKEN
        self.silver_writer = SilverLakehouseWriter(r2_client=self.r2, local_silver_dir=self.silver_dir)
        self.marker_extractor = MarkerPdfExtractor()

        headers = {
            "User-Agent": "UTH-Scientific-DataMining-ZenodoHarvester/2.0 (academic research; contact: data-mining@uth.edu.vn)",
            "Accept": "application/json",
        }
        if self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"

        self.http_client = httpx.Client(
            headers=headers,
            timeout=45.0,
            follow_redirects=True,
        )

        self.checkpoint_file = settings.ROOT_DIR / "data" / "manifests" / "zenodo_checkpoint.json"
        self.checkpoint_file.parent.mkdir(parents=True, exist_ok=True)

    def _broadcast_cdc_pulse(self, title: str, category: str = "Zenodo", count: int = 1):
        """Dispatches real-time ingestion pulse to the UI dashboard bridge."""
        try:
            httpx.post(
                "http://localhost:8000/api/ingestion/broadcast",
                json={
                    "event": "ingest_paper",
                    "title": title[:80] + "..." if len(title) > 80 else title,
                    "category": category,
                    "count": count,
                    "timestamp": datetime.datetime.now().isoformat(),
                },
                timeout=0.2,
            )
        except Exception:
            pass

    def _clean_html_text(self, raw_html: str) -> str:
        """Strips HTML tags from abstract or description text."""
        if not raw_html:
            return ""
        clean = re.sub(r"<[^>]+>", " ", raw_html)
        return re.sub(r"\s+", " ", clean).strip()

    def fetch_records_via_api(self, query: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Queries Zenodo REST API for scientific publications."""
        logger.info("[ZENODO] Querying REST API with query: '%s', limit=%d", query, limit)
        params = {
            "q": query,
            "type": "publication",
            "sort": "mostrecent",
            "size": min(50, limit),
        }

        try:
            resp = self.http_client.get(self.ZENODO_API_URL, params=params)
            if resp.status_code == 200:
                data = resp.json()
                hits = data.get("hits", {}).get("hits", [])
                logger.info("[ZENODO] REST API returned %d candidate publications.", len(hits))
                return hits
            else:
                logger.warning("[ZENODO] REST API returned HTTP %d. Switching to OAI-PMH.", resp.status_code)
                return []
        except Exception as e:
            logger.warning("[ZENODO] REST API connection error: %s. Switching to OAI-PMH.", e)
            return []

    def fetch_records_via_oai(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Queries Zenodo OAI-PMH protocol when REST API encounters rate limits or WAF restrictions."""
        logger.info("[ZENODO] Fetching records via OAI-PMH endpoint (%s)...", self.ZENODO_OAI_URL)
        params = {
            "verb": "ListRecords",
            "metadataPrefix": "oai_dc",
        }

        records: List[Dict[str, Any]] = []
        try:
            resp = self.http_client.get(self.ZENODO_OAI_URL, params=params)
            if resp.status_code == 200:
                parsed = xmltodict.parse(resp.text)
                records_raw = parsed.get("OAI-PMH", {}).get("ListRecords", {}).get("record", [])
                if isinstance(records_raw, dict):
                    records_raw = [records_raw]

                for item in records_raw:
                    header = item.get("header", {})
                    if header.get("@status") == "deleted":
                        continue
                    oai_id = header.get("identifier", "")
                    clean_id = oai_id.split(":")[-1]
                    meta = item.get("metadata", {}).get("oai_dc:dc", {})

                    title = meta.get("dc:title", "")
                    if isinstance(title, list):
                        title = " ".join(title)

                    desc = meta.get("dc:description", "")
                    if isinstance(desc, list):
                        desc = " ".join(desc)

                    creators = meta.get("dc:creator", [])
                    if isinstance(creators, str):
                        creators = [creators]

                    records.append({
                        "id": clean_id,
                        "metadata": {
                            "title": title,
                            "description": desc,
                            "creators": [{"name": c} for c in creators],
                            "publication_date": header.get("datestamp", ""),
                            "doi": f"10.5281/zenodo.{clean_id}",
                        },
                        "files": [],
                    })
                    if len(records) >= limit:
                        break
        except Exception as e:
            logger.error("[ZENODO] OAI-PMH fetching failed: %s", e)

        return records

    def download_and_parse_pdf(self, record_id: str, files_list: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Finds PDF attachment, downloads it, and immediately converts it to LaTeX Markdown via Marker."""
        pdf_file_info = None
        for f in files_list:
            fname = f.get("key", "").lower()
            if fname.endswith(".pdf"):
                pdf_file_info = f
                break

        if not pdf_file_info:
            # Check if direct link exists
            record_num = str(record_id).replace("zenodo:", "")
            pdf_url = f"https://zenodo.org/records/{record_num}/files/article.pdf"
        else:
            links = pdf_file_info.get("links", {})
            pdf_url = links.get("content") or links.get("self")

        markdown_content = ""
        latex_count = 0
        local_pdf_path = self.pdf_dir / f"{record_id}.pdf"
        local_md_path = self.markdown_dir / f"{record_id}.md"

        if pdf_url and not local_pdf_path.exists():
            try:
                logger.info("[ZENODO] Downloading PDF for %s from %s...", record_id, pdf_url)
                with self.http_client.stream("GET", pdf_url) as r:
                    if r.status_code == 200:
                        with open(local_pdf_path, "wb") as f_out:
                            for chunk in r.iter_bytes(chunk_size=65536):
                                f_out.write(chunk)
                        logger.info("[ZENODO] Downloaded PDF (%d bytes) to %s", local_pdf_path.stat().st_size, local_pdf_path.name)
            except Exception as e:
                logger.warning("[ZENODO] Failed to download PDF for %s: %s", record_id, e)

        # Execute Marker PDF Engine immediately
        if local_pdf_path.exists() and local_pdf_path.stat().st_size > 1024:
            try:
                logger.info("[ZENODO MARKER] Executing Marker PDF extraction on %s...", local_pdf_path.name)
                markdown_content, marker_meta = self.marker_extractor.convert_pdf_to_markdown(local_pdf_path)
                latex_count = marker_meta.get("latex_formulas_detected", 0)

                # Save generated Markdown to lakehouse storage
                if markdown_content:
                    with open(local_md_path, "w", encoding="utf-8") as f_md:
                        f_md.write(markdown_content)
                    logger.info("[ZENODO MARKER] Extracted %d chars with %d LaTeX formulas for %s", len(markdown_content), latex_count, record_id)
            except Exception as e:
                logger.error("[ZENODO MARKER] Error executing Marker on %s: %s", record_id, e)

        return {
            "has_pdf": local_pdf_path.exists(),
            "pdf_path": str(local_pdf_path) if local_pdf_path.exists() else None,
            "markdown_path": str(local_md_path) if local_md_path.exists() else None,
            "markdown_content": markdown_content,
            "latex_formulas_count": latex_count,
        }

    def harvest(
        self,
        limit: int = 50,
        query: Optional[str] = None,
        upload_to_r2: bool = False,
    ) -> List[Dict[str, Any]]:
        """Harvests publications, immediately runs Marker PDF conversion, and writes Silver Parquet."""
        search_query = query or settings.ZENODO_DEFAULT_QUERY
        logger.info("[ZENODO] Starting harvest: limit=%d, query='%s'", limit, search_query)
        print(f"\n[ZENODO] Querying Zenodo Open Science Repository (limit={limit}, query='{search_query}')...")

        raw_hits = self.fetch_records_via_api(query=search_query, limit=limit)
        if not raw_hits:
            raw_hits = self.fetch_records_via_oai(limit=limit)

        harvested_records: List[Dict[str, Any]] = []

        for item in raw_hits[:limit]:
            clean_id = str(item.get("id", ""))
            if not clean_id:
                continue

            metadata = item.get("metadata", {})
            title = metadata.get("title", "Untitled Research Paper")
            raw_desc = metadata.get("description", "")
            abstract = self._clean_html_text(raw_desc)
            if not abstract:
                abstract = title

            creators = [
                c.get("name", "") for c in metadata.get("creators", []) if isinstance(c, dict) and c.get("name")
            ]
            pub_date = metadata.get("publication_date", str(datetime.date.today()))
            doi = metadata.get("doi", f"10.5281/zenodo.{clean_id}")
            keywords = metadata.get("keywords", [])
            if isinstance(keywords, str):
                keywords = [k.strip() for k in keywords.split(",")]

            # Run Immediate Marker PDF Extraction
            pdf_data = self.download_and_parse_pdf(clean_id, item.get("files", []))

            # Full enriched text prioritizing Marker's LaTeX Markdown
            full_context_text = pdf_data["markdown_content"] or abstract

            paper_dict: Dict[str, Any] = {
                "paper_id": f"zenodo:{clean_id}",
                "title": title,
                "authors": creators,
                "abstract": abstract,
                "publication_date": pub_date,
                "year": int(pub_date[:4]) if len(pub_date) >= 4 and pub_date[:4].isdigit() else datetime.date.today().year,
                "doi": doi,
                "primary_category": "Open Science / Data Mining",
                "keywords": keywords,
                "source": "Zenodo",
                "has_pdf": pdf_data["has_pdf"],
                "pdf_path": pdf_data["pdf_path"],
                "markdown_path": pdf_data["markdown_path"],
                "markdown_content": pdf_data["markdown_content"],
                "latex_formulas_count": pdf_data["latex_formulas_count"],
                "full_text": full_context_text,
                "harvested_at": datetime.datetime.now().isoformat(),
            }

            harvested_records.append(paper_dict)
            self._broadcast_cdc_pulse(title=title, category="Zenodo", count=1)
            print(f"  • [HARVESTED & MARKER] {title[:65]}... (LaTeX formulas: {pdf_data['latex_formulas_count']})")

        print(f"\n[ZENODO] Harvested & processed {len(harvested_records)} publications with Marker PDF Engine.")

        # Save Bronze JSON Vault
        if harvested_records:
            now_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            bronze_file = self.bronze_dir / f"zenodo_{now_str}.json"
            with open(bronze_file, "w", encoding="utf-8") as f:
                json.dump(harvested_records, f, ensure_ascii=False, indent=2)
            print(f"[ZENODO] [SUCCESS] Saved Bronze JSON to {bronze_file}")

            # Save Silver Parquet
            df_new = pd.DataFrame(harvested_records)
            silver_parquet_path = self.silver_dir / "zenodo_all.parquet"

            if silver_parquet_path.exists():
                try:
                    df_existing = pd.read_parquet(silver_parquet_path)
                    combined = pd.concat([df_existing, df_new], ignore_index=True).drop_duplicates(subset=["paper_id"], keep="last")
                    combined.to_parquet(silver_parquet_path, index=False)
                    print(f"[ZENODO] [SILVER] Appended and deduped into {silver_parquet_path} ({len(combined):,} total rows)")
                except Exception as e:
                    logger.warning("[ZENODO] Error appending to existing parquet: %s. Overwriting.", e)
                    df_new.to_parquet(silver_parquet_path, index=False)
            else:
                df_new.to_parquet(silver_parquet_path, index=False)
                print(f"[ZENODO] [SILVER] Saved new Parquet to {silver_parquet_path} ({len(df_new):,} rows)")

            # Optional R2 Cloud Sync
            if upload_to_r2 and self.r2.is_configured:
                r2_key = f"silver/zenodo/zenodo_all.parquet"
                self.r2.upload_file(silver_parquet_path, r2_key, content_type="application/vnd.apache.parquet")
                print(f"[ZENODO] [R2 SYNC] Silver Parquet uploaded to {r2_key}")

        return harvested_records


def main():
    parser = argparse.ArgumentParser(description="Harvest publications from Zenodo Open Science Repository.")
    parser.add_argument("--limit", type=int, default=50, help="Number of records to harvest (default: 50)")
    parser.add_argument("--query", type=str, default=None, help="Search query string")
    parser.add_argument("--sync-r2", action="store_true", default=False, help="Upload outputs to Cloudflare R2")
    args = parser.parse_args()

    harvester = ZenodoHarvester()
    harvester.harvest(limit=args.limit, query=args.query, upload_to_r2=args.sync_r2)


if __name__ == "__main__":
    main()
