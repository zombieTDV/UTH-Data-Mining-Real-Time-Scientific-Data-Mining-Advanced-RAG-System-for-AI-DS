"""MinIO S3 & Local Lakehouse Storage Inspection Tool.

Calculates real-time storage metrics:
- Total object count and volume in Bytes, MB, GB on MinIO S3.
- Granular breakdown by Medallion Lakehouse Zone (Bronze, Silver, Gold).
- Local disk cache usage comparison.

Usage:
    ./.venv/bin/python tools/check_storage.py
"""

import sys
import os
from pathlib import Path
from typing import Any, Dict, List, Tuple
from tabulate import tabulate

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config.settings import settings
from src.storage.minio_client import StorageClient


def format_size(bytes_val: int) -> str:
    """Chuyen doi byte sang dinh dang de doc (Bytes, KB, MB, GB)."""
    if bytes_val < 1024:
        return f"{bytes_val} B"
    elif bytes_val < 1024 ** 2:
        return f"{bytes_val / 1024:.2f} KB"
    elif bytes_val < 1024 ** 3:
        return f"{bytes_val / (1024 ** 2):.2f} MB"
    else:
        return f"{bytes_val / (1024 ** 3):.3f} GB"


def get_dir_size(path: Path) -> Tuple[int, int]:
    """Tinh dung luong va so file trong thu muc local."""
    total_size = 0
    total_files = 0
    if not path.exists():
        return 0, 0
    for entry in path.rglob("*"):
        if entry.is_file():
            total_files += 1
            total_size += entry.stat().st_size
    return total_size, total_files


def inspect_storage() -> Dict[str, Any]:
    """Quet toan bo bucket MinIO de thong ke dung luong va so luong objects."""
    storage = StorageClient()
    s3_client = storage.s3
    bucket_name = storage.bucket_name

    paginator = s3_client.get_paginator("list_objects_v2")
    pages = paginator.paginate(Bucket=bucket_name)

    total_objects = 0
    total_bytes = 0

    # Phan loai theo cac tang Medallion
    zones = {
        "bronze/": {"label": "Bronze: Raw Payloads & HTML", "count": 0, "bytes": 0},
        "silver/": {"label": "Silver: Cleaned Parquet Tables", "count": 0, "bytes": 0},
        "gold/": {"label": "Gold: LanceDB & Mining Models", "count": 0, "bytes": 0},
        "manifests/": {"label": "Manifests: Dedup Hashes & Checkpoints", "count": 0, "bytes": 0},
        "other": {"label": "Other Objects / Uncategorized", "count": 0, "bytes": 0},
    }

    for page in pages:
        contents = page.get("Contents", [])
        for item in contents:
            total_objects += 1
            size = item.get("Size", 0)
            key = item.get("Key", "")
            total_bytes += size

            categorized = False
            for prefix in ["bronze/", "silver/", "gold/", "manifests/"]:
                if key.startswith(prefix):
                    zones[prefix]["count"] += 1
                    zones[prefix]["bytes"] += size
                    categorized = True
                    break

            if not categorized:
                zones["other"]["count"] += 1
                zones["other"]["bytes"] += size

    return {
        "bucket_name": bucket_name,
        "endpoint": settings.MINIO_ENDPOINT_URL,
        "total_objects": total_objects,
        "total_bytes": total_bytes,
        "zones": zones,
    }


def main():
    print("=" * 80)
    print("[STORAGE AUDIT] KIEM TRA DUNG LUONG VA SUC CHUA MINIO S3 & LOCAL LAKEHOUSE")
    print("=" * 80)

    try:
        storage_data = inspect_storage()
    except Exception as e:
        print(f"[ERROR] Khong the ket noi toi MinIO S3: {e}")
        sys.exit(1)

    bucket_name = storage_data["bucket_name"]
    total_objects = storage_data["total_objects"]
    total_bytes = storage_data["total_bytes"]
    total_gb = total_bytes / (1024 ** 3)

    # 1. Tong quan Bucket
    print(f"\n[1] THONG TIN MINIO S3 BUCKET:")
    print(f"    - Ten Bucket:         {bucket_name}")
    print(f"    - Endpoint MinIO:     {storage_data['endpoint']}")
    print(f"    - Tong so objects:    {total_objects:,} files")
    print(f"    - Tong dung luong:    {format_size(total_bytes)} ({total_gb:.4f} GB)")

    # 2. Chi tiet tung phan vung Medallion
    print(f"\n[2] PHAN BO DUNG LUONG THEO TANG (MEDALLION LAKEHOUSE):")
    zone_rows = []
    for k, v in storage_data["zones"].items():
        if v["count"] > 0:
            pct = (v["bytes"] / max(1, total_bytes)) * 100
            zone_rows.append([
                v["label"],
                f"{v['count']:,}",
                format_size(v["bytes"]),
                f"{pct:.1f}%",
            ])

    if zone_rows:
        print(tabulate(zone_rows, headers=["Phan vung (Zone)", "So objects", "Dung luong", "Ty le"], tablefmt="pipe"))
    else:
        print("    [NOTICE] Bucket hien dang trong (0 objects).")

    # 3. Kiem tra dung luong dia cuc bo (Local Cache)
    print(f"\n[3] DUNG LUONG LUU TRU CUC BO (LOCAL DISK CACHE):")
    local_paths = [
        ("data/raw", "Local Raw Cache", settings.ROOT_DIR / "data" / "raw"),
        ("data/silver", "Local Silver Parquet", settings.ROOT_DIR / "data" / "silver"),
        ("data/gold/lancedb", "Local Gold LanceDB Vectors", settings.ROOT_DIR / "data" / "gold" / "lancedb"),
        ("logs", "Pipeline Logs", settings.ROOT_DIR / "logs"),
    ]
    local_rows = []
    total_local_bytes = 0
    total_local_files = 0
    for rel_path, desc, p in local_paths:
        sz, files = get_dir_size(p)
        total_local_bytes += sz
        total_local_files += files
        local_rows.append([desc, str(p.relative_to(settings.ROOT_DIR)), f"{files:,}", format_size(sz)])

    local_rows.append(["TONG CONG LOCAL", "data/ + logs/", f"{total_local_files:,}", format_size(total_local_bytes)])
    print(tabulate(local_rows, headers=["Thanh phan", "Duong dan", "So file", "Dung luong"], tablefmt="pipe"))

    print("\n" + "=" * 80)
    print(f"[KET LUAN] MinIO S3 Lakehouse dang luu tru {total_objects:,} objects voi dung luong {total_gb:.4f} GB.")
    print("=" * 80)


if __name__ == "__main__":
    main()
