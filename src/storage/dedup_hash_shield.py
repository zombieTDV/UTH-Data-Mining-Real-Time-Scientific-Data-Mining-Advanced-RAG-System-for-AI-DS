"""
src/storage/dedup_hash_shield.py
--------------------------------
Deduplication Hash Shield for Lakehouse Ingestion Pipelines.
Extracts, hashes, and indexes all historical paper identifiers (DOIs, OpenAlex IDs, Title SHA256 hashes)
to ensure future crawling pipelines never download or process papers that were previously collected.
"""

import hashlib
import json
import logging
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
import duckdb
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from src.config.settings import settings
from src.storage.minio_client import StorageClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("dedup_shield")


def normalize_title(title: str) -> str:
    """Normalizes paper title for stable hashing (lowercase, alphanumeric + space)."""
    if not title or pd.isna(title):
        return ""
    t = str(title).lower().strip()
    t = re.sub(r"[^\w\s]", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def compute_title_sha256(title: str) -> str:
    """Computes SHA-256 hash of normalized title."""
    norm = normalize_title(title)
    if not norm:
        return ""
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()


def normalize_doi(doi: Optional[str]) -> str:
    """Normalizes DOI to lowercase clean string without URL prefixes."""
    if not doi or pd.isna(doi):
        return ""
    d = str(doi).strip().lower()
    for prefix in ["https://doi.org/", "http://doi.org/", "doi:"]:
        if d.startswith(prefix):
            d = d[len(prefix):]
    return d.strip()


class DedupHashShield:
    """Manages the lakehouse deduplication hash manifest."""

    MANIFEST_LOCAL_PATH = settings.ROOT_DIR / "data" / "manifests" / "openalex_dedup_hashes.parquet"
    R2_KEY = "manifests/openalex_dedup_hashes.parquet"

    def __init__(self):
        self.r2 = StorageClient()
        self._title_hashes: Set[str] = set()
        self._dois: Set[str] = set()
        self._paper_ids: Set[str] = set()
        self._loaded = False

    def build_shield_manifest(self, upload_to_r2: bool = True) -> Path:
        """Collects records from local Silver and Bronze datasets, creates deduplicated manifest."""
        logger.info("[DEDUP SHIELD] Building master deduplication manifest from local datasets...")
        self.MANIFEST_LOCAL_PATH.parent.mkdir(parents=True, exist_ok=True)

        records: List[Dict[str, Any]] = []

        # 1. Inspect data/silver/papers.parquet (OpenAlex historical papers)
        p_papers = settings.ROOT_DIR / "data" / "silver" / "papers.parquet"
        if p_papers.exists():
            df = duckdb.query(f"SELECT paper_id, openalex_id, title, doi, year FROM read_parquet('{p_papers.as_posix()}')").df()
            logger.info("  Loaded %d records from silver/papers.parquet", len(df))
            for _, row in df.iterrows():
                records.append({
                    "paper_id": str(row["paper_id"]) if pd.notna(row["paper_id"]) else "",
                    "openalex_id": str(row["openalex_id"]) if pd.notna(row["openalex_id"]) else "",
                    "doi": normalize_doi(row["doi"]),
                    "normalized_title": normalize_title(row["title"]),
                    "title_sha256": compute_title_sha256(row["title"]),
                    "year": int(row["year"]) if pd.notna(row["year"]) else 0,
                    "source": "openalex",
                })

        # 2. Inspect data/bronze/manifest/manifest.parquet
        p_manifest = settings.ROOT_DIR / "data" / "bronze" / "manifest" / "manifest.parquet"
        if p_manifest.exists():
            df = duckdb.query(f"SELECT paper_id, source_url FROM read_parquet('{p_manifest.as_posix()}')").df()
            logger.info("  Loaded %d records from bronze/manifest/manifest.parquet", len(df))
            for _, row in df.iterrows():
                pid = str(row["paper_id"]) if pd.notna(row["paper_id"]) else ""
                records.append({
                    "paper_id": pid,
                    "openalex_id": pid.replace("openalex:", ""),
                    "doi": "",
                    "normalized_title": "",
                    "title_sha256": "",
                    "year": 0,
                    "source": "openalex",
                })

        # 3. Inspect data/silver/year=2026/papers.parquet
        p_2026 = settings.ROOT_DIR / "data" / "silver" / "year=2026" / "papers.parquet"
        if p_2026.exists():
            df = duckdb.query(f"SELECT paper_id, doi, title, year, source FROM read_parquet('{p_2026.as_posix()}')").df()
            logger.info("  Loaded %d records from silver/year=2026/papers.parquet", len(df))
            for _, row in df.iterrows():
                records.append({
                    "paper_id": str(row["paper_id"]) if pd.notna(row["paper_id"]) else "",
                    "openalex_id": "",
                    "doi": normalize_doi(row["doi"]),
                    "normalized_title": normalize_title(row["title"]),
                    "title_sha256": compute_title_sha256(row["title"]),
                    "year": int(row["year"]) if pd.notna(row["year"]) else 2026,
                    "source": str(row["source"]) if pd.notna(row["source"]) else "arxiv",
                })

        # 4. Inspect Tier 1 & Tier 2 datasets
        p_tier1 = settings.ROOT_DIR / "data" / "silver" / "tier1" / "landmark_papers.parquet"
        if p_tier1.exists():
            df = duckdb.query(f"SELECT paper_id, doi, title, published_date, source FROM read_parquet('{p_tier1.as_posix()}')").df()
            logger.info("  Loaded %d records from tier1/landmark_papers.parquet", len(df))
            for _, row in df.iterrows():
                pub = str(row["published_date"]) if pd.notna(row["published_date"]) else ""
                y = int(pub[:4]) if pub and pub[:4].isdigit() else 0
                records.append({
                    "paper_id": str(row["paper_id"]) if pd.notna(row["paper_id"]) else "",
                    "openalex_id": "",
                    "doi": normalize_doi(row["doi"]),
                    "normalized_title": normalize_title(row["title"]),
                    "title_sha256": compute_title_sha256(row["title"]),
                    "year": y,
                    "source": str(row["source"]) if pd.notna(row["source"]) else "tier1",
                })

        p_tier2 = settings.ROOT_DIR / "data" / "silver" / "tier2" / "near_past_papers.parquet"
        if p_tier2.exists():
            df = duckdb.query(f"SELECT paper_id, doi, title, published_date, source FROM read_parquet('{p_tier2.as_posix()}')").df()
            logger.info("  Loaded %d records from tier2/near_past_papers.parquet", len(df))
            for _, row in df.iterrows():
                pub = str(row["published_date"]) if pd.notna(row["published_date"]) else ""
                y = int(pub[:4]) if pub and pub[:4].isdigit() else 0
                records.append({
                    "paper_id": str(row["paper_id"]) if pd.notna(row["paper_id"]) else "",
                    "openalex_id": "",
                    "doi": normalize_doi(row["doi"]),
                    "normalized_title": normalize_title(row["title"]),
                    "title_sha256": compute_title_sha256(row["title"]),
                    "year": y,
                    "source": str(row["source"]) if pd.notna(row["source"]) else "tier2",
                })

        # Build DataFrame & Deduplicate
        df_all = pd.DataFrame(records)
        logger.info("[DEDUP SHIELD] Total raw records collected: %d", len(df_all))

        # Prefer rows that have non-empty title_sha256 and non-empty doi
        df_all["has_title"] = df_all["title_sha256"].str.len() > 0
        df_all = df_all.sort_values(by=["has_title"], ascending=False)
        df_dedup = df_all.drop_duplicates(subset=["paper_id"], keep="first").drop(columns=["has_title"])

        logger.info("[DEDUP SHIELD] Deduplicated unique paper IDs: %d", len(df_dedup))
        logger.info("  Non-empty title hashes: %d", (df_dedup["title_sha256"].str.len() > 0).sum())
        logger.info("  Non-empty DOIs: %d", (df_dedup["doi"].str.len() > 0).sum())

        # Write to compressed Parquet
        table = pa.Table.from_pandas(df_dedup)
        pq.write_table(table, self.MANIFEST_LOCAL_PATH, compression="zstd")
        sz_kb = self.MANIFEST_LOCAL_PATH.stat().st_size / 1024
        logger.info("[DEDUP SHIELD] Saved manifest to %s (%.1f KB)", self.MANIFEST_LOCAL_PATH, sz_kb)

        if upload_to_r2:
            logger.info("[DEDUP SHIELD] Uploading manifest to R2 key '%s'...", self.R2_KEY)
            res = self.r2.upload_file(self.MANIFEST_LOCAL_PATH, self.R2_KEY, content_type="application/vnd.apache.parquet")
            logger.info("  [SUCCESS] Uploaded to R2 | sha256: %s...", res["sha256"][:12])

        return self.MANIFEST_LOCAL_PATH

    def load(self):
        """Loads shield index into memory for fast crawler querying."""
        if self._loaded:
            return

        if not self.MANIFEST_LOCAL_PATH.exists():
            # Try to download from R2 if not present locally
            try:
                logger.info("[DEDUP SHIELD] Local manifest not found, downloading from R2...")
                self.r2.download_file_safe(self.R2_KEY, self.MANIFEST_LOCAL_PATH)
            except Exception as e:
                logger.warning("[DEDUP SHIELD] Could not download manifest from R2: %s", e)
                return

        df = pd.read_parquet(self.MANIFEST_LOCAL_PATH)
        for _, row in df.iterrows():
            if row["paper_id"]:
                self._paper_ids.add(row["paper_id"])
            if row["doi"]:
                self._dois.add(row["doi"])
            if row["title_sha256"]:
                self._title_hashes.add(row["title_sha256"])

        self._loaded = True
        logger.info("[DEDUP SHIELD] Loaded shield: %d IDs, %d DOIs, %d Title Hashes",
                    len(self._paper_ids), len(self._dois), len(self._title_hashes))

    def is_duplicate(self, title: Optional[str] = None, doi: Optional[str] = None, paper_id: Optional[str] = None) -> bool:
        """Returns True if the paper exists in historical records."""
        if not self._loaded:
            self.load()

        if paper_id and paper_id in self._paper_ids:
            return True
        if doi and normalize_doi(doi) in self._dois:
            return True
        if title:
            h = compute_title_sha256(title)
            if h and h in self._title_hashes:
                return True

        return False


if __name__ == "__main__":
    shield = DedupHashShield()
    shield.build_shield_manifest(upload_to_r2=True)
    shield.load()
    print(f"Shield verification: is_duplicate('Attention Is All You Need') = {shield.is_duplicate('Attention Is All You Need')}")
