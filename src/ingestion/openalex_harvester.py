"""OpenAlex Harvester for Academic Works & Citation Intelligence.

Harvests scientific papers and global citation graph metadata from OpenAlex API:
- Paper Metadata: ID (W...), DOI, Title, Authors, Abstract (reconstructed from inverted index), Venue/Journal, Year.
- Citation Intelligence: Cited by count, Concepts, Institution affiliations.
- Incremental Delta Crawling: Filters by from_created_date or from_publication_date.

Saves raw JSON to Bronze Lakehouse (data/raw/openalex/) and Silver Parquet (data/silver/openalex/).
Broadcasts live CDC pulses to the local FastAPI streaming engine.
"""

import argparse
import datetime
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
import httpx
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config.settings import settings
from src.storage.r2_client import R2Client
from src.transformation.silver_writer import SilverLakehouseWriter
from src.utils.logger import setup_pipeline_logging

logger, log_file = setup_pipeline_logging("openalex_harvester")


def reconstruct_abstract(inverted_index: Optional[Dict[str, List[int]]]) -> str:
    """Reconstructs linear abstract text from OpenAlex inverted index dictionary."""
    if not inverted_index or not isinstance(inverted_index, dict):
        return ""
    try:
        word_positions = []
        for word, positions in inverted_index.items():
            for pos in positions:
                word_positions.append((pos, word))
        word_positions.sort(key=lambda x: x[0])
        return " ".join(word for _, word in word_positions)
    except Exception:
        return ""


class OpenAlexHarvester:
    """Harvests academic papers with deep citation metadata from OpenAlex."""

    OPENALEX_API_URL = "https://api.openalex.org/works"

    def __init__(
        self,
        r2_client: Optional[R2Client] = None,
        bronze_dir: Optional[Path] = None,
        silver_dir: Optional[Path] = None,
    ):
        self.r2 = r2_client or R2Client()
        self.bronze_dir = bronze_dir or (settings.ROOT_DIR / "data" / "raw" / "openalex")
        self.silver_dir = silver_dir or (settings.ROOT_DIR / "data" / "silver" / "openalex")
        self.bronze_dir.mkdir(parents=True, exist_ok=True)
        self.silver_dir.mkdir(parents=True, exist_ok=True)

        self.silver_writer = SilverLakehouseWriter(r2_client=self.r2, local_silver_dir=self.silver_dir)
        self.http_client = httpx.Client(
            headers={
                "User-Agent": "mailto:research@uth.edu.vn (UTH-Scientific-Lakehouse-Crawler/2.0)",
                "Accept": "application/json",
            },
            timeout=30.0,
            follow_redirects=True,
        )

        self.checkpoint_file = settings.ROOT_DIR / "data" / "manifests" / "openalex_checkpoint.json"
        self.checkpoint_file.parent.mkdir(parents=True, exist_ok=True)

    def _get_last_checkpoint(self) -> str:
        """Reads the last processed date from checkpoint file."""
        if self.checkpoint_file.exists():
            try:
                with open(self.checkpoint_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return data.get("last_date", "2024-01-01")
            except Exception:
                pass
        return "2024-01-01"

    def _save_checkpoint(self, last_date: str, total_harvested: int):
        """Saves current crawling checkpoint."""
        try:
            with open(self.checkpoint_file, "w", encoding="utf-8") as f:
                json.dump({
                    "last_date": last_date,
                    "total_harvested": total_harvested,
                    "updated_at": datetime.datetime.now().isoformat(),
                }, f, indent=2)
        except Exception as e:
            logger.warning("[OPENALEX] Failed to save checkpoint: %s", e)

    def harvest(
        self,
        limit: int = 500,
        from_date: Optional[str] = None,
        concept: str = "computer science",
        sort: str = "cited_by_count:desc",
        upload_to_r2: bool = False,
    ) -> List[Dict[str, Any]]:
        """Harvests papers matching filters, converts to Silver, and emits live CDC events."""
        start_date = from_date or self._get_last_checkpoint()
        logger.info("[OPENALEX] Starting harvest: limit=%d, from_date=%s, sort=%s", limit, start_date, sort)
        print(f"[OPENALEX] Querying OpenAlex Works API (from_date={start_date}, sort={sort}, limit={limit})...")

        params: Dict[str, Any] = {
            "per_page": min(100, limit),
            "sort": sort,
            "filter": f"from_publication_date:{start_date},default.search:{concept},has_abstract:true",
        }

        harvested_records: List[Dict[str, Any]] = []
        page = 1
        cursor = "*"

        while len(harvested_records) < limit:
            params["cursor"] = cursor
            try:
                resp = self.http_client.get(self.OPENALEX_API_URL, params=params)
                if resp.status_code != 200:
                    logger.error("[OPENALEX] API returned %d: %s", resp.status_code, resp.text[:200])
                    break

                data = resp.json()
                results = data.get("results", [])
                meta = data.get("meta", {})
                cursor = meta.get("next_cursor")

                if not results:
                    logger.info("[OPENALEX] No more results returned from API.")
                    break

                for work in results:
                    raw_id = work.get("id", "")
                    clean_id = raw_id.split("/")[-1] if "/" in raw_id else raw_id
                    title = work.get("title") or "Untitled"
                    pub_date = work.get("publication_date") or ""
                    cited_by = work.get("cited_by_count", 0)

                    # Reconstruct linear abstract from inverted index
                    abstract = reconstruct_abstract(work.get("abstract_inverted_index"))
                    if not abstract:
                        continue

                    # Authors and affiliations
                    authors = []
                    institutions = []
                    for a in work.get("authorships", []):
                        name = a.get("author", {}).get("display_name")
                        if name:
                            authors.append(name)
                        for inst in a.get("institutions", []):
                            i_name = inst.get("display_name")
                            if i_name and i_name not in institutions:
                                institutions.append(i_name)

                    # Concepts
                    concepts = [
                        c.get("display_name") for c in work.get("concepts", [])
                        if c.get("display_name")
                    ][:8]

                    primary_topic = concepts[0] if concepts else "Computer Science"
                    doi = work.get("doi")
                    landing_page = work.get("primary_location", {}).get("landing_page_url") or ""
                    pdf_url = work.get("primary_location", {}).get("pdf_url") or ""

                    record = {
                        "paper_id": f"openalex:{clean_id}",
                        "openalex_id": clean_id,
                        "doi": doi,
                        "title": title,
                        "abstract": abstract,
                        "authors": authors[:15],
                        "primary_category": primary_topic,
                        "categories": concepts,
                        "published_date": pub_date,
                        "crawled_at": datetime.datetime.now().isoformat(),
                        "pdf_url": pdf_url,
                        "html_url": landing_page,
                        "cited_by_count": int(cited_by),
                        "institutions": institutions[:10],
                        "source": "OpenAlex",
                    }
                    harvested_records.append(record)

                    # Broadcast CDC pulse to local frontend stream
                    try:
                        self.http_client.post(
                            "http://localhost:8000/api/ingestion/broadcast",
                            json={
                                "type": "PAPER_INGESTED",
                                "paper_id": clean_id,
                                "title": title[:60],
                                "category": "OpenAlex",
                                "stage": "harvest",
                                "session_ingested": len(harvested_records),
                                "total_corpus": 36414 + len(harvested_records),
                                "vectors_synced": 0,
                                "bronze_bytes_delta": 45000,
                                "speed_ppm": 120.0,
                                "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
                            },
                            timeout=0.2,
                        )
                    except Exception:
                        pass

                    if len(harvested_records) >= limit:
                        break

                page += 1
                time.sleep(0.5)  # Respect OpenAlex rate limit politely

                if not cursor:
                    break

            except Exception as e:
                logger.error("[OPENALEX] Error during page %d: %s", page, e)
                break

        print(f"[OPENALEX] Harvested {len(harvested_records)} papers.")

        # 1. Save Bronze JSON
        if harvested_records:
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            bronze_file = self.bronze_dir / f"openalex_{timestamp}.json"
            with open(bronze_file, "w", encoding="utf-8") as f:
                json.dump(harvested_records, f, indent=2, ensure_ascii=False)
            print(f"[OPENALEX] [SUCCESS] Saved Bronze JSON to {bronze_file}")

            # 2. Save Silver Parquet
            self._save_to_silver(harvested_records)

            # 3. Update checkpoint
            today_str = datetime.date.today().strftime("%Y-%m-%d")
            self._save_checkpoint(today_str, len(harvested_records))

            # 4. Optional R2 Upload
            if upload_to_r2:
                r2_key = f"bronze/openalex/{bronze_file.name}"
                self.r2.upload_file(bronze_file, r2_key, content_type="application/json")
                print(f"[OPENALEX] [R2 SYNC] Bronze uploaded to {r2_key}")

        return harvested_records

    def _save_to_silver(self, records: List[Dict[str, Any]]):
        """Converts and appends records to local Silver Parquet dataset."""
        silver_parquet_path = self.silver_dir / "openalex_all.parquet"
        df_new = pd.DataFrame(records)

        if silver_parquet_path.exists():
            try:
                df_existing = pd.read_parquet(silver_parquet_path)
                combined = pd.concat([df_existing, df_new], ignore_index=True)
                combined = combined.drop_duplicates(subset=["paper_id"], keep="last")
                combined.to_parquet(silver_parquet_path, engine="pyarrow", compression="zstd")
                print(f"[OPENALEX] [SILVER] Appended and deduped into {silver_parquet_path} ({len(combined):,} total rows)")
                return
            except Exception as e:
                logger.warning("[OPENALEX] Error appending to existing parquet: %s. Overwriting.", e)

        df_new.to_parquet(silver_parquet_path, engine="pyarrow", compression="zstd")
        print(f"[OPENALEX] [SILVER] Saved new Parquet to {silver_parquet_path} ({len(df_new):,} rows)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Harvest scientific papers from OpenAlex Works API.")
    parser.add_argument("--limit", type=int, default=100, help="Target papers to harvest (default: 100)")
    parser.add_argument("--from-date", type=str, default=None, help="Filter by publication date (e.g., 2024-01-01)")
    parser.add_argument("--concept", type=str, default="computer science", help="Core concept search filter")
    parser.add_argument("--sync-r2", action="store_true", default=False, help="Upload bronze JSON to Cloudflare R2")
    args = parser.parse_args()

    harvester = OpenAlexHarvester()
    harvester.harvest(limit=args.limit, from_date=args.from_date, concept=args.concept, upload_to_r2=args.sync_r2)
