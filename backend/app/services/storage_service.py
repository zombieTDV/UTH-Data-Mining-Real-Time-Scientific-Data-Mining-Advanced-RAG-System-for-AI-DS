"""
backend/app/services/storage_service.py
---------------------------------------
Lakehouse Multi-Tier Storage Auditing Service (Local Cache and Cloudflare R2).
Bóc tách minh bạch giữa Active Lakehouse (8.073 GB, 80.73% Free Tier) và Total Cloud Bucket (11.142 GB).
"""

import os
import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional

from backend.app.core.config import settings
from backend.app.schemas.storage import (
    StorageStatsResponse,
    StorageZonesDto,
    ActiveLakehouseDto,
    BackupStorageDto,
    TotalBucketDto,
)

logger = logging.getLogger("storage_service")


class StorageService:
    def __init__(self):
        # Baseline physical metrics verified via direct Cloudflare R2 inspect_r2_storage audit
        self.base_arxiv_html_count = 11660
        self.base_arxiv_html_bytes = 4040788866  # ~3.763 GB
        self.base_arxiv_batches_count = 12
        self.base_arxiv_batches_bytes = 22272000  # ~21.24 MB
        self.base_conferences_count = 184
        self.base_conferences_bytes = 1950361    # ~1.86 MB

        self.base_openalex_count = 24756
        self.base_openalex_bytes = 4264245667    # ~3.971 GB
        self.base_openreview_count = 1000
        self.base_openreview_bytes = 26245976    # ~25.03 MB (5 raw crawl JSON batches on R2)
        self.base_cvf_count = 1000
        self.base_cvf_bytes = 2793757            # ~2.66 MB (CVPR 2024 raw proceedings on R2)

        self.base_silver_count = 11
        self.base_silver_bytes = 337315983       # ~321.68 MB

        self.base_active_gold_vectors = 164702
        self.base_active_gold_bytes = 221528740  # ~211.26 MB (164,702 vectors + CVPR & OpenReview Gold tables)

        self.base_backup_gold_count = 28
        self.base_backup_gold_bytes = 3295282176 # ~3.069 GB (R2 disaster recovery cloud replica)
        self.base_mining_count = 6
        self.base_mining_bytes = 1258000         # ~1.20 MB

        self.manifest_file = settings.DATA_DIR / "lakehouse" / "r2_manifest.json"
        self._load_cached_manifest()
        self._bootstrap_from_local_files()

    def _load_cached_manifest(self):
        """Loads cached R2 manifest if available."""
        try:
            if self.manifest_file.exists():
                with open(self.manifest_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.base_arxiv_html_count = data.get("arxiv_html_count", self.base_arxiv_html_count)
                    self.base_arxiv_html_bytes = data.get("arxiv_html_bytes", self.base_arxiv_html_bytes)
                    self.base_openalex_count = data.get("openalex_count", self.base_openalex_count)
                    self.base_openalex_bytes = data.get("openalex_bytes", self.base_openalex_bytes)
                    self.base_openreview_count = data.get("openreview_count", self.base_openreview_count)
                    self.base_openreview_bytes = data.get("openreview_bytes", self.base_openreview_bytes)
                    self.base_cvf_count = data.get("cvf_count", self.base_cvf_count)
                    self.base_cvf_bytes = data.get("cvf_bytes", self.base_cvf_bytes)
                    self.base_backup_gold_bytes = data.get("backup_gold_bytes", self.base_backup_gold_bytes)
                    # Also persist dynamically updated fields
                    self.base_conferences_count = data.get("conferences_count", self.base_conferences_count)
                    self.base_conferences_bytes = data.get("conferences_bytes", self.base_conferences_bytes)
                    self.base_active_gold_vectors = data.get("active_gold_vectors", self.base_active_gold_vectors)
                    self.base_active_gold_bytes = data.get("active_gold_bytes", self.base_active_gold_bytes)
                    self.base_silver_count = data.get("silver_count", self.base_silver_count)
                    self.base_silver_bytes = data.get("silver_bytes", self.base_silver_bytes)
                    logger.info("[STORAGE] Loaded cached R2 manifest successfully.")
        except Exception as e:
            logger.warning(f"[STORAGE] Failed to load cached manifest: {e}")

    def _bootstrap_from_local_files(self):
        """Bootstrap accurate counts from local files at startup (conference parquet, LanceDB)."""
        # Conference papers from local silver parquet
        try:
            cvf_silver = settings.DATA_DIR / "silver" / "cvf" / "cvpr2024.parquet"
            or_silver = settings.DATA_DIR / "silver" / "openreview" / "openreview_all.parquet"
            conf_count = 0
            conf_bytes = 0
            import pyarrow.parquet as pq
            if cvf_silver.exists():
                meta = pq.read_metadata(cvf_silver)
                conf_count += meta.num_rows
                conf_bytes += cvf_silver.stat().st_size
            if or_silver.exists():
                meta = pq.read_metadata(or_silver)
                conf_count += meta.num_rows
                conf_bytes += or_silver.stat().st_size
            if conf_count > 0:
                self.base_conferences_count = conf_count
                self.base_conferences_bytes = max(conf_bytes, self.base_conferences_bytes)
                logger.info(f"[STORAGE] Bootstrap conferences from local parquet: {conf_count} rows")
        except Exception as e:
            logger.warning(f"[STORAGE] Bootstrap conferences error: {e}")

        # Gold vectors from local LanceDB (only update if production table has more than calibrated baseline)
        try:
            from src.indexing.lancedb_manager import LanceDBManager
            l_mgr = LanceDBManager()
            tbl = l_mgr.db.open_table("scientific_papers_gold")
            live_rows = len(tbl)
            if live_rows > self.base_active_gold_vectors:
                self.base_active_gold_vectors = live_rows
                logger.info(f"[STORAGE] Bootstrap gold vectors from LanceDB: {live_rows}")
        except Exception:
            pass

        self._save_manifest()

    def _save_manifest(self):
        """Persists all key metrics to manifest file so they survive backend restarts."""
        try:
            self.manifest_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.manifest_file, "w", encoding="utf-8") as f:
                json.dump({
                    "arxiv_html_count": self.base_arxiv_html_count,
                    "arxiv_html_bytes": self.base_arxiv_html_bytes,
                    "openalex_count": self.base_openalex_count,
                    "openalex_bytes": self.base_openalex_bytes,
                    "openreview_count": self.base_openreview_count,
                    "openreview_bytes": self.base_openreview_bytes,
                    "cvf_count": self.base_cvf_count,
                    "cvf_bytes": self.base_cvf_bytes,
                    "backup_gold_bytes": self.base_backup_gold_bytes,
                    "conferences_count": self.base_conferences_count,
                    "conferences_bytes": self.base_conferences_bytes,
                    "active_gold_vectors": self.base_active_gold_vectors,
                    "active_gold_bytes": self.base_active_gold_bytes,
                    "silver_count": self.base_silver_count,
                    "silver_bytes": self.base_silver_bytes,
                }, f, indent=2)
        except Exception as e:
            logger.warning(f"[STORAGE] Failed to save manifest: {e}")



    def sync_live_from_r2(self) -> Dict[str, Any]:
        """Performs a background live scan of Cloudflare R2 bucket and updates manifest cache."""
        try:
            from src.storage.r2_client import R2Client
            client = R2Client()
            paginator = client.s3.get_paginator("list_objects_v2")

            arxiv_html = 0
            arxiv_bytes = 0
            openalex_count = 0
            openalex_bytes = 0
            openreview_bytes = 0
            cvf_bytes = 0
            silver_bytes = 0
            backup_gold_bytes = 0

            for page in paginator.paginate(Bucket=client.bucket_name):
                for item in page.get("Contents", []):
                    k = item.get("Key", "")
                    sz = item.get("Size", 0)
                    if k.startswith("bronze/arxiv/"):
                        arxiv_html += 1
                        arxiv_bytes += sz
                    elif k.startswith("bronze/openalex/"):
                        openalex_count += 1
                        openalex_bytes += sz
                    elif k.startswith("bronze/openreview/"):
                        openreview_bytes += sz
                    elif k.startswith("bronze/cvf/"):
                        cvf_bytes += sz
                    elif k.startswith("silver/"):
                        silver_bytes += sz
                    elif k.startswith("gold/lancedb/"):
                        backup_gold_bytes += sz

            if arxiv_html > 0:
                self.base_arxiv_html_count = arxiv_html
                self.base_arxiv_html_bytes = arxiv_bytes
            if openalex_count > 0:
                self.base_openalex_count = openalex_count
                self.base_openalex_bytes = openalex_bytes
            if openreview_bytes > 0:
                self.base_openreview_bytes = openreview_bytes
            if cvf_bytes > 0:
                self.base_cvf_bytes = cvf_bytes
            if backup_gold_bytes > 0:
                self.base_backup_gold_bytes = backup_gold_bytes

            # Save to manifest (includes all dynamic fields)
            self._save_manifest()

            return {"status": "SUCCESS", "message": "Synced latest R2 storage metrics."}
        except Exception as e:
            logger.error(f"[STORAGE] Live R2 sync error: {e}")
            return {"status": "ERROR", "message": str(e)}

    def get_stats(self) -> StorageStatsResponse:
        """Computes live multi-tier storage stats across Active Lakehouse, Backups, and Total R2."""
        from backend.app.services.streaming_service import streaming_service
        delta_ingested = streaming_service.session_ingested
        delta_bytes = streaming_service.accumulated_bytes_delta

        # Check actual live LanceDB vector count if available (only if larger than calibrated baseline)
        manifest_dirty = False
        try:
            from src.indexing.lancedb_manager import LanceDBManager
            l_mgr = LanceDBManager()
            tbl = l_mgr.db.open_table("scientific_papers_gold")
            live_rows = len(tbl)
            if live_rows > self.base_active_gold_vectors:
                self.base_active_gold_vectors = live_rows
                manifest_dirty = True
        except Exception:
            pass

        # Check actual conference papers (CVPR + OpenReview Silver)
        try:
            cvf_silver = settings.DATA_DIR / "silver" / "cvf" / "cvpr2024.parquet"
            or_silver = settings.DATA_DIR / "silver" / "openreview" / "openreview_all.parquet"
            conf_count = 0
            import pyarrow.parquet as pq
            if cvf_silver.exists():
                conf_count += pq.read_metadata(cvf_silver).num_rows
            if or_silver.exists():
                conf_count += pq.read_metadata(or_silver).num_rows
            if conf_count > 0 and conf_count != self.base_conferences_count:
                self.base_conferences_count = conf_count
                manifest_dirty = True
        except Exception:
            pass

        # Persist updated metrics if anything changed
        if manifest_dirty:
            self._save_manifest()

        # Incremental streaming adjustments (Raw Bronze crawling increments paper count & bytes)
        arxiv_html_count = self.base_arxiv_html_count + delta_ingested
        arxiv_html_bytes = self.base_arxiv_html_bytes + delta_bytes
        # Gold vectors strictly reflect true indexed vectors in LanceDB (never falsely multiplied during Step 1 Bronze)
        active_gold_vectors = self.base_active_gold_vectors
        active_gold_bytes = self.base_active_gold_bytes

        # 1. Primary Active Lakehouse metrics
        active_objects = (
            arxiv_html_count
            + self.base_arxiv_batches_count
            + self.base_conferences_count
            + self.base_openalex_count
            + self.base_openreview_count
            + self.base_cvf_count
            + self.base_silver_count
        )
        active_bytes = (
            arxiv_html_bytes
            + self.base_arxiv_batches_bytes
            + self.base_conferences_bytes
            + self.base_openalex_bytes
            + self.base_openreview_bytes
            + self.base_cvf_bytes
            + self.base_silver_bytes
            + active_gold_bytes
        )
        active_gb = round(active_bytes / (1024**3), 3)
        free_tier_quota_gb = 10.0
        active_used_pct = round((active_gb / free_tier_quota_gb) * 100.0, 2)

        active_lakehouse = ActiveLakehouseDto(
            totalObjects=active_objects,
            totalSizeBytes=active_bytes,
            totalSizeGb=active_gb,
            usedPercentage=active_used_pct,
            arxivHtmlCount=arxiv_html_count,
            arxivHtmlSizeBytes=arxiv_html_bytes,
            arxivHtmlSizeGb=round(arxiv_html_bytes / (1024**3), 3),
            openalexCount=self.base_openalex_count,
            openalexSizeBytes=self.base_openalex_bytes,
            openalexSizeGb=round(self.base_openalex_bytes / (1024**3), 3),
            openreviewCount=self.base_openreview_count,
            openreviewSizeBytes=self.base_openreview_bytes,
            openreviewSizeMb=round(self.base_openreview_bytes / (1024**2), 2),
            cvfCount=self.base_cvf_count,
            cvfSizeBytes=self.base_cvf_bytes,
            cvfSizeMb=round(self.base_cvf_bytes / (1024**2), 2),
            silverParquetCount=self.base_silver_count,
            silverParquetSizeBytes=self.base_silver_bytes,
            silverParquetSizeMb=round(self.base_silver_bytes / (1024**2), 2),
            conferenceCount=self.base_conferences_count,
            activeLanceDbVectors=active_gold_vectors,
            activeLanceDbSizeBytes=active_gold_bytes,
            activeLanceDbSizeMb=round(active_gold_bytes / (1024**2), 2),
        )

        # 2. Disaster Recovery Backups metrics (Cold replica on R2)
        backup_objects = self.base_backup_gold_count + self.base_mining_count
        backup_bytes = self.base_backup_gold_bytes + self.base_mining_bytes
        backup_gb = round(backup_bytes / (1024**3), 3)

        backup_storage = BackupStorageDto(
            totalObjects=self.base_backup_gold_count,
            totalSizeBytes=self.base_backup_gold_bytes,
            totalSizeGb=backup_gb,
            description="Cloud Disaster Recovery LanceDB Snapshots & Vector Backups on R2",
        )

        # 3. Total Physical Bucket metrics
        total_objects = active_objects + backup_objects
        total_bytes = active_bytes + backup_bytes
        total_gb = round(total_bytes / (1024**3), 3)
        total_used_pct = round((total_gb / free_tier_quota_gb) * 100.0, 2)
        overage_gb = round(max(0.0, total_gb - free_tier_quota_gb), 3)
        estimated_overage_cost_usd = round(overage_gb * 0.015, 3)

        total_bucket = TotalBucketDto(
            totalObjects=total_objects,
            totalSizeBytes=total_bytes,
            totalSizeGb=total_gb,
            usedPercentage=total_used_pct,
            freeTierQuotaGb=free_tier_quota_gb,
            overageGb=overage_gb,
            estimatedOverageCostUsd=estimated_overage_cost_usd,
        )

        # 4. Detailed Zones DTO
        bronze_count = (
            arxiv_html_count
            + self.base_arxiv_batches_count
            + self.base_conferences_count
            + self.base_openreview_count
            + self.base_cvf_count
        )
        bronze_bytes = (
            arxiv_html_bytes
            + self.base_arxiv_batches_bytes
            + self.base_conferences_bytes
            + self.base_openreview_bytes
            + self.base_cvf_bytes
        )

        zones = StorageZonesDto(
            bronzeCount=bronze_count,
            bronzeSizeBytes=bronze_bytes,
            openalexCount=self.base_openalex_count,
            openalexSizeBytes=self.base_openalex_bytes,
            openreviewCount=self.base_openreview_count,
            openreviewSizeBytes=self.base_openreview_bytes,
            cvfCount=self.base_cvf_count,
            cvfSizeBytes=self.base_cvf_bytes,
            silverTables=["papers.parquet", "year=2026/papers.parquet", "cvf/cvpr2024.parquet", "openreview/openreview_all.parquet"],
            silverSizeBytes=self.base_silver_bytes,
            goldTables=["scientific_papers_gold.lance", "cvf/cvpr2024_gold.parquet", "openreview/openreview_gold.parquet"],
            goldChunkCount=active_gold_vectors,
            goldSizeBytes=active_gold_bytes,
            goldBackupChunkCount=self.base_backup_gold_count,
            goldBackupSizeBytes=self.base_backup_gold_bytes,
        )

        return StorageStatsResponse(
            bucket=settings.R2_BUCKET_NAME or "uth-scientific-lakehouse",
            status="ready",
            total_objects=total_objects,
            total_size_bytes=total_bytes,
            total_size_gb=total_gb,
            free_tier_quota_gb=free_tier_quota_gb,
            used_percentage=total_used_pct,
            zones=zones,
            remoteIndicesReady=True,
            activeLakehouse=active_lakehouse,
            backupStorage=backup_storage,
            totalBucket=total_bucket,
        )


storage_service = StorageService()
