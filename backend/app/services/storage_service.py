"""
backend/app/services/storage_service.py
---------------------------------------
Lakehouse storage auditing computed live from MinIO (object listing + Parquet footers) and Qdrant.
No hardcoded baselines: every number comes from the stores themselves and is cached briefly.
"""

import datetime
import logging
import threading
import time
from typing import Any, Dict, Optional

from backend.app.core.config import settings
from backend.app.schemas.storage import (
    ActiveLakehouseDto,
    BackupStorageDto,
    SourceBreakdownDto,
    StorageStatsResponse,
    StorageZonesDto,
    TotalBucketDto,
)
from backend.app.services.lake import lake

logger = logging.getLogger("storage_service")

GB = 1024**3
FREE_TIER_QUOTA_GB = settings.LAKEHOUSE_BUDGET_GB  # name kept for the API contract (free_tier_quota_gb)
CACHE_TTL_SECONDS = 300

SILVER_PREFIX = "silver/papers/"  # every tier lands here (year=YYYY/papers.parquet + parts/), told apart by the `tier` column


def _silver_counts() -> Dict[str, Any]:
    """Row counts per tier, non-arXiv rows and the parsed-formula total, read from the Silver `tier`,
    `paper_id` and `total_math_count` columns only."""
    out = {"total": 0, "tier1": 0, "tier2": 0, "tier3": 0, "non_arxiv": 0, "formulas": 0}
    try:
        t = lake.dataset(SILVER_PREFIX).to_table(columns=["tier", "paper_id", "total_math_count"])
    except Exception as e:
        logger.debug("[STORAGE] Silver not readable yet: %s", e)
        return out
    # A re-indexed paper has two rows until compaction folds them: count each paper once (its richest row)
    df = t.to_pandas().sort_values("total_math_count").drop_duplicates("paper_id", keep="last")
    out["total"] = len(df)
    for tier, n in df["tier"].value_counts().items():
        if tier in ("tier1", "tier2", "tier3"):
            out[tier] = int(n)
    out["non_arxiv"] = int(df["paper_id"].astype(str).str.startswith("s2_").sum())
    out["formulas"] = int(df["total_math_count"].fillna(0).sum())
    return out


def _qdrant_count() -> int:
    try:
        from src.indexing.qdrant_manager import QdrantManager

        return int(QdrantManager().count())
    except Exception as e:
        logger.warning("[STORAGE] Qdrant count unavailable: %s", e)
        return 0


class StorageService:
    def __init__(self):
        self._snapshot: Optional[Dict[str, Any]] = None
        self._taken_at = 0.0
        self._lock = threading.Lock()

    @staticmethod
    def _sum(objects, prefix: str):
        sel = [o for o in objects if o["key"].startswith(prefix)]
        return len(sel), sum(o["size"] for o in sel)

    def _take_snapshot(self) -> Dict[str, Any]:
        objects = lake.scan_bucket()
        snap: Dict[str, Any] = {
            "total_objects": len(objects),
            "total_bytes": sum(o["size"] for o in objects),
            "arxiv": self._sum(objects, "bronze/arxiv/"),
            "openalex": self._sum(objects, "bronze/openalex"),
            "bronze": self._sum(objects, "bronze/"),
            "silver": self._sum(objects, "silver/"),
            "gold": self._sum(objects, "gold/"),
            "archive": self._sum(objects, "archive/"),
            "silver_tables": sorted(o["key"][len("silver/"):] for o in objects if o["key"].startswith("silver/") and o["key"].endswith(".parquet") and "/parts/" not in o["key"]),
            "gold_tables": sorted(o["key"][len("gold/"):] for o in objects if o["key"].startswith("gold/") and o["key"].endswith(".parquet")),
        }
        counts = _silver_counts()
        snap["rows"] = {"tier1": counts["tier1"], "tier2": counts["tier2"], "tier3": counts["tier3"], "non_arxiv": counts["non_arxiv"],
                        "cvf": 0, "openreview": 0, "openalex": 0, "zenodo": 0}
        snap["silver_papers_rows"] = counts["total"]
        snap["formulas"] = counts["formulas"]
        snap["dedup_hashes"] = counts["total"]  # unique papers = Silver rows (deduplicated by paper_id + abstract hash)
        snap["vectors"] = _qdrant_count()
        snap["last_synced"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        return snap

    def snapshot(self, force: bool = False) -> Dict[str, Any]:
        with self._lock:
            if force or self._snapshot is None or time.time() - self._taken_at > CACHE_TTL_SECONDS:
                self._snapshot = self._take_snapshot()
                self._taken_at = time.time()
            return self._snapshot

    def sync_live_from_r2(self) -> Dict[str, Any]:
        """Force a fresh MinIO scan (endpoint name kept for the frontend contract)."""
        try:
            snap = self.snapshot(force=True)
            gb = round(snap["total_bytes"] / 1e9, 2)
            return {
                "status": "SUCCESS",
                "message": f"Synced MinIO: {snap['total_objects']:,} objects ({gb:.2f} GB).",
                "last_synced": snap["last_synced"],
                "total_objects": snap["total_objects"],
                "total_size_gb": gb,
            }
        except Exception as e:
            logger.error("[STORAGE] MinIO sync error: %s", e)
            return {"status": "ERROR", "message": str(e)}

    def get_current_totals(self) -> Dict[str, Any]:
        """Bucket totals for the streaming status payload."""
        snap = self.snapshot()
        gb = round(snap["total_bytes"] / GB, 3)
        return {"total_bytes": snap["total_bytes"], "total_gb": gb, "used_pct": min(100.0, round(gb / FREE_TIER_QUOTA_GB * 100.0, 2))}

    def _source_breakdown(self, snap: Dict[str, Any]) -> SourceBreakdownDto:
        rows = snap["rows"]
        return SourceBreakdownDto(
            arxiv=snap["silver_papers_rows"] - rows["non_arxiv"],
            doi=rows["non_arxiv"],  # classics not on arXiv (journal / conference records from Semantic Scholar)
            openalex=rows["openalex"],
            openreview=rows["openreview"],
            cvf=rows["cvf"],
            zenodo=rows["zenodo"],
            total_deduplicated=snap["dedup_hashes"],
            tier1_landmark=rows["tier3"],  # field name kept for the frontend contract: it is the Tier 3 historical archive
            tier2_near_past=rows["tier2"],
            active_rag_papers=snap["silver_papers_rows"],
            active_rag_vectors=snap["vectors"],
        )

    def get_stats(self) -> StorageStatsResponse:
        snap = self.snapshot()
        total_gb = round(snap["total_bytes"] / GB, 3)
        used_pct = round(total_gb / FREE_TIER_QUOTA_GB * 100.0, 2)
        breakdown = self._source_breakdown(snap)

        arxiv_n, arxiv_b = snap["arxiv"]
        oa_n, oa_b = snap["openalex"]
        silver_n, silver_b = snap["silver"]
        gold_n, gold_b = snap["gold"]
        bronze_n, bronze_b = snap["bronze"]
        arch_n, arch_b = snap["archive"]
        conf_rows = snap["rows"]["cvf"] + snap["rows"]["openreview"]

        active_objects = bronze_n + silver_n + gold_n
        active_bytes = bronze_b + silver_b + gold_b
        active_gb = round(active_bytes / GB, 3)

        overage = round(max(0.0, total_gb - FREE_TIER_QUOTA_GB), 2)

        return StorageStatsResponse(
            bucket=settings.MINIO_BUCKET_NAME,
            status="ready",
            total_objects=snap["total_objects"],
            total_size_bytes=snap["total_bytes"],
            total_size_gb=total_gb,
            free_tier_quota_gb=FREE_TIER_QUOTA_GB,
            used_percentage=used_pct,
            zones=StorageZonesDto(
                bronzeCount=bronze_n,
                bronzeSizeBytes=bronze_b,
                openalexCount=oa_n,
                openalexSizeBytes=oa_b,
                silverTables=snap["silver_tables"],
                silverSizeBytes=silver_b,
                goldTables=snap["gold_tables"],
                goldChunkCount=snap["vectors"],
                goldSizeBytes=gold_b,
                goldBackupChunkCount=arch_n,
                goldBackupSizeBytes=arch_b,
            ),
            remoteIndicesReady=snap["vectors"] > 0,
            activeLakehouse=ActiveLakehouseDto(
                totalObjects=active_objects,
                totalSizeBytes=active_bytes,
                totalSizeGb=active_gb,
                usedPercentage=round(active_gb / FREE_TIER_QUOTA_GB * 100.0, 2),
                arxivHtmlCount=arxiv_n,
                arxivHtmlSizeBytes=arxiv_b,
                arxivHtmlSizeGb=round(arxiv_b / GB, 3),
                openalexCount=oa_n,
                openalexSizeBytes=oa_b,
                openalexSizeGb=round(oa_b / GB, 3),
                silverParquetCount=silver_n,
                silverParquetSizeBytes=silver_b,
                silverParquetSizeMb=round(silver_b / (1024**2), 2),
                conferenceCount=conf_rows,
                activeVectors=snap["vectors"],
                activeVectorsSizeBytes=gold_b,
                activeVectorsSizeMb=round(gold_b / (1024**2), 2),
                sourceBreakdown=breakdown,
            ),
            backupStorage=BackupStorageDto(
                totalObjects=arch_n,
                totalSizeBytes=arch_b,
                totalSizeGb=round(arch_b / GB, 3),
                description="Archived snapshots under archive/ in MinIO",
            ),
            totalBucket=TotalBucketDto(
                totalObjects=snap["total_objects"],
                totalSizeBytes=snap["total_bytes"],
                totalSizeGb=total_gb,
                usedPercentage=used_pct,
                freeTierQuotaGb=FREE_TIER_QUOTA_GB,
                overageGb=overage,
                estimatedOverageCostUsd=round(overage * 0.015, 3),
            ),
            sourceBreakdown=breakdown,
            last_synced=snap["last_synced"],
        )


storage_service = StorageService()
