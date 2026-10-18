"""
backend/app/api/endpoints/explorer.py
-----------------------------------------
MinIO Lakehouse Explorer and File Viewer (route prefix /explorer).

1. The inventory is a real listing of the MinIO bucket, cached in memory for a few minutes.
2. POST /explorer/sync forces a fresh listing.
3. Previews read Parquet schema/rows with S3 range reads and JSON/text objects directly from MinIO.
Nothing is written to local disk.
"""

import json
import logging
import threading
import time
import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from backend.app.core.config import settings
from backend.app.services.lake import lake

logger = logging.getLogger("explorer")

router = APIRouter(prefix="/explorer", tags=["MinIO Lakehouse Explorer"])

INVENTORY_TTL_SECONDS = 300
JSON_PREVIEW_MAX_BYTES = 1_000_000
FREE_TIER_QUOTA_GB = settings.LAKEHOUSE_BUDGET_GB
_inventory: Dict[str, Any] = {"at": 0.0, "data": None}
_inventory_lock = threading.Lock()


# ==============================================================================
# Pydantic Schemas
# ==============================================================================

class FileItemDto(BaseModel):
    key: str
    name: str
    zone: str  # "bronze" | "silver" | "gold"
    category: str
    size_bytes: int
    size_formatted: str
    extension: str
    last_modified: Optional[str] = None
    row_count: Optional[int] = None


class ExplorerTreeResponse(BaseModel):
    bucket_name: str
    total_objects: int
    total_size_bytes: int
    total_size_gb: float
    free_tier_quota_gb: float = 20.0
    used_percentage: float
    cost_shield_active: bool = True
    last_synced: str
    class_a_operations: str = "n/a"
    class_b_operations: str = "n/a"
    storage_class: str = "Standard"
    public_access: str = "Private"
    overage_gb: float = 0.0
    estimated_overage_cost_usd: float = 0.0
    zones: Dict[str, List[FileItemDto]]
    zone_stats: Dict[str, Dict[str, Any]]


class ParquetSchemaColumn(BaseModel):
    name: str
    type: str
    nullable: bool = True


class FilePreviewResponse(BaseModel):
    key: str
    name: str
    extension: str
    size_bytes: int
    size_formatted: str
    total_rows: Optional[int] = None
    column_count: Optional[int] = None
    schema_columns: Optional[List[ParquetSchemaColumn]] = None
    sample_rows: Optional[List[Dict[str, Any]]] = None
    json_data: Optional[Any] = None
    raw_text: Optional[str] = None
    preview_type: str  # "parquet" | "json" | "binary"
    last_modified: Optional[str] = None


# ==============================================================================
# Helper Functions
# ==============================================================================

def format_size(size_bytes: int) -> str:
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.2f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"


def classify_zone(key: str) -> tuple[str, str]:
    """Returns (zone, category) for an object key."""
    k = key.lower()
    if k.startswith("silver/"):
        if "cvf" in k:
            return "silver", "CVF / CVPR 2024"
        if "openreview" in k:
            return "silver", "OpenReview Lakehouse"
        return "silver", "Cleaned Academic Parquet"
    if k.startswith("gold/"):
        return ("gold", "Data Mining Artifacts") if "mining" in k else ("gold", "Gold Analytical Parquet")
    if k.startswith("bronze/"):
        for needle, label in (("arxiv", "arXiv Preprints (OAI-PMH)"), ("openalex", "OpenAlex Citation Vault"), ("openreview", "OpenReview Raw Vault"), ("cvf", "CVF Raw Vault")):
            if needle in k:
                return "bronze", label
        return "bronze", "Bronze Ingestion Vault"
    return "bronze", "State / Manifests / Archive"


def _collapse_bronze(objects: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Bronze holds thousands of small objects: report one row per directory (two levels deep)."""
    groups: Dict[str, Dict[str, Any]] = {}
    for o in objects:
        parts = o["key"].split("/")
        gkey = "/".join(parts[:3]) + "/" if len(parts) > 3 else o["key"]
        g = groups.setdefault(gkey, {"key": gkey, "size": 0, "count": 0, "last_modified": None})
        g["size"] += o["size"]
        g["count"] += 1
    return [{"key": g["key"], "size_bytes": g["size"], "last_modified": None, "row_count": g["count"] if g["key"].endswith("/") else None} for g in groups.values()]


def build_inventory(force: bool = False) -> Dict[str, Any]:
    with _inventory_lock:
        if not force and _inventory["data"] and time.time() - _inventory["at"] < INVENTORY_TTL_SECONDS:
            return _inventory["data"]
        objects = lake.scan_bucket()
        files: List[Dict[str, Any]] = []
        bronze = [o for o in objects if o["key"].startswith("bronze/")]
        files.extend(_collapse_bronze(bronze))
        for o in objects:
            if o["key"].startswith("bronze/"):
                continue
            files.append({"key": o["key"], "size_bytes": o["size"], "last_modified": None,
                          "row_count": lake.parquet_rows(o["key"]) if o["key"].endswith(".parquet") and "/parts/" not in o["key"] else None})
        total_bytes = sum(o["size"] for o in objects)
        data = {
            "bucket_name": lake.bucket,
            "last_synced": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "total_objects": len(objects),
            "total_size_bytes": total_bytes,
            "total_size_gb": round(total_bytes / (1024**3), 3),
            "files": files,
            "zone_raw": {
                z: (sum(1 for o in objects if classify_zone(o["key"])[0] == z), sum(o["size"] for o in objects if classify_zone(o["key"])[0] == z))
                for z in ("bronze", "silver", "gold")
            },
        }
        _inventory.update(at=time.time(), data=data)
        return data


# ==============================================================================
# API Routes
# ==============================================================================

def _tree_response(inv: Dict[str, Any]) -> ExplorerTreeResponse:
    total_gb = inv["total_size_gb"]
    zones: Dict[str, List[FileItemDto]] = {"bronze": [], "silver": [], "gold": []}
    for item in inv["files"]:
        k = item["key"]
        zone, cat = classify_zone(k)
        ext = "dir" if k.endswith("/") else (Path(k).suffix.lstrip(".").lower() or "bin")
        sz = item.get("size_bytes", 0)
        zones.setdefault(zone, []).append(FileItemDto(
            key=k, name=k if k.endswith("/") else (Path(k).name or k), zone=zone, category=cat, size_bytes=sz,
            size_formatted=format_size(sz), extension=ext, last_modified=item.get("last_modified"), row_count=item.get("row_count"),
        ))
    zone_stats: Dict[str, Dict[str, Any]] = {}
    for z, (count, size) in inv["zone_raw"].items():
        zone_stats[z] = {"count": count, "size_bytes": size, "size_formatted": format_size(size)}
    overage = max(0.0, round(total_gb - FREE_TIER_QUOTA_GB, 2))
    return ExplorerTreeResponse(
        bucket_name=inv["bucket_name"],
        total_objects=inv["total_objects"],
        total_size_bytes=inv["total_size_bytes"],
        total_size_gb=total_gb,
        free_tier_quota_gb=FREE_TIER_QUOTA_GB,
        used_percentage=round(total_gb / FREE_TIER_QUOTA_GB * 100.0, 1),
        cost_shield_active=True,
        last_synced=inv["last_synced"],
        overage_gb=overage,
        estimated_overage_cost_usd=round(overage * 0.015, 3),
        zones=zones,
        zone_stats=zone_stats,
    )


@router.get("/tree", response_model=ExplorerTreeResponse)
async def get_explorer_tree() -> ExplorerTreeResponse:
    """Medallion asset hierarchy from a live (briefly cached) MinIO listing."""
    return _tree_response(build_inventory())


@router.post("/sync", response_model=ExplorerTreeResponse)
async def trigger_manual_sync() -> ExplorerTreeResponse:
    """Force a fresh MinIO listing."""
    try:
        return _tree_response(build_inventory(force=True))
    except Exception as err:
        logger.error("[EXPLORER] Sync error: %s", err)
        raise HTTPException(status_code=502, detail=f"MinIO listing failed: {err}")


def _clean_value(v: Any) -> Any:
    if hasattr(v, "tolist"):
        return v.tolist()
    if isinstance(v, float) and (v != v or v in (float("inf"), float("-inf"))):
        return None
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return v


@router.get("/preview", response_model=FilePreviewResponse)
async def get_file_preview(key: str = Query(..., description="S3 key of the object to preview")) -> FilePreviewResponse:
    """Schema + 50 sample rows for Parquet, parsed content for JSON, metadata for anything else."""
    key_clean = key.strip().lstrip("/")
    if ".." in key_clean.split("/"):
        raise HTTPException(status_code=400, detail="Invalid key")
    head = lake.head(key_clean)
    if head is None:
        raise HTTPException(status_code=404, detail=f"Object not found: {key_clean}")

    name, ext = Path(key_clean).name, Path(key_clean).suffix.lstrip(".").lower()
    size = head["size"]
    modified = head["last_modified"].strftime("%Y-%m-%d %H:%M:%S")
    base = dict(key=key_clean, name=name, size_bytes=size, size_formatted=format_size(size), last_modified=modified)

    if ext == "parquet":
        try:
            d = lake.dataset(key_clean)
            cols = [ParquetSchemaColumn(name=f.name, type=str(f.type), nullable=f.nullable) for f in d.schema]
            sample = d.head(50).to_pylist()
            return FilePreviewResponse(
                **base, extension="parquet", total_rows=lake.parquet_rows(key_clean), column_count=len(cols), schema_columns=cols,
                sample_rows=[{k: _clean_value(v) for k, v in r.items()} for r in sample], preview_type="parquet",
            )
        except Exception as err:
            logger.error("[EXPLORER] Parquet preview error for %s: %s", key_clean, err)
            raise HTTPException(status_code=500, detail=f"Parquet extraction error: {err}")

    if ext == "json":
        if size > JSON_PREVIEW_MAX_BYTES:
            return FilePreviewResponse(**base, extension="json", json_data={"notice": f"File larger than {JSON_PREVIEW_MAX_BYTES // 1000} KB; preview omitted."}, preview_type="json")
        try:
            data = json.loads(lake.storage.get_text(key_clean))
        except Exception as err:
            raise HTTPException(status_code=500, detail=f"JSON read error: {err}")
        rows = len(data) if isinstance(data, list) else (len(data.get("rules", [])) if isinstance(data, dict) and "rules" in data else 1)
        shown = data if size < 100_000 else {"notice": "File > 100KB. Sample truncated.", "keys": list(data.keys()) if isinstance(data, dict) else len(data)}
        return FilePreviewResponse(**base, extension="json", total_rows=rows, json_data=shown, preview_type="json")

    return FilePreviewResponse(**base, extension=ext or "bin", preview_type="binary", raw_text=f"Binary object: s3://{lake.bucket}/{key_clean}")
