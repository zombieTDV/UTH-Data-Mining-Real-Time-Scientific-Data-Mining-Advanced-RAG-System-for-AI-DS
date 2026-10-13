"""Lakehouse Re-Hashing & Deduplication Migration Script.

Scans all existing Silver Parquet tables across 4 sources (arXiv, OpenReview, CVF, Zenodo),
computes normalized SHA-256 abstract hashes, resolves cross-source duplicates,
and updates the Silver layer & manifests for unified Deduplication and R2 synchronization.

Usage:
    python scripts/rehash_lakehouse_data.py [--sync-r2]
"""

import argparse
import datetime
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config.settings import settings
from src.storage.r2_client import R2Client
from src.utils.hasher import compute_abstract_hash
from src.utils.logger import setup_pipeline_logging

logger, log_file = setup_pipeline_logging("rehash_lakehouse_data")


def rehash_parquet_table(
    parquet_path: Path,
    source_name: str,
    global_hashes_seen: Dict[str, str],
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """Reads a Silver Parquet table, computes/adds abstract_hash, and checks duplicates."""
    if not parquet_path.exists():
        logger.warning("[%s] Parquet file not found: %s", source_name, parquet_path)
        return pd.DataFrame(), {"count": 0, "new_unique": 0, "duplicates": 0}

    print(f"\n[{source_name.upper()}] Loading Parquet: {parquet_path.relative_to(settings.ROOT_DIR)}...")
    df = pd.read_parquet(parquet_path)
    initial_count = len(df)
    print(f"[{source_name.upper()}] Initial rows: {initial_count:,}")

    # Compute abstract hashes
    abstract_hashes = []
    for idx, row in df.iterrows():
        raw_abs = str(row.get("abstract", "") or row.get("title", ""))
        h = compute_abstract_hash(raw_abs)
        abstract_hashes.append(h)

    df["abstract_hash"] = abstract_hashes

    # Detect duplicates
    unique_rows = []
    intra_dups = 0
    cross_dups = 0
    table_seen_hashes: Set[str] = set()

    for idx, row in df.iterrows():
        h = row["abstract_hash"]
        paper_id = str(row.get("paper_id", ""))

        if h in table_seen_hashes:
            intra_dups += 1
            continue
        table_seen_hashes.add(h)

        if h in global_hashes_seen:
            cross_dups += 1
            # Record duplicate reference
            logger.info(
                "[%s] Cross-source duplicate detected: %s (matches %s)",
                source_name,
                paper_id,
                global_hashes_seen[h],
            )
            continue

        global_hashes_seen[h] = f"{source_name}:{paper_id}"
        unique_rows.append(row)

    df_cleaned = pd.DataFrame(unique_rows)
    print(
        f"[{source_name.upper()}] Deduplication result: {len(df_cleaned):,} unique papers "
        f"({intra_dups} intra-source dups, {cross_dups} cross-source dups removed)."
    )

    # Save back to Parquet
    df_cleaned.to_parquet(parquet_path, index=False)
    print(f"[{source_name.upper()}] [SAVED] Updated Parquet with 'abstract_hash' column.")

    stats = {
        "source": source_name,
        "path": str(parquet_path),
        "initial_count": initial_count,
        "unique_count": len(df_cleaned),
        "intra_dups": intra_dups,
        "cross_dups": cross_dups,
    }
    return df_cleaned, stats


def main():
    parser = argparse.ArgumentParser(description="Rehash and deduplicate all Lakehouse Silver datasets.")
    parser.add_argument("--sync-r2", action="store_true", default=False, help="Upload rehashed Parquet tables to Cloudflare R2.")
    args = parser.parse_args()

    start_time = time.time()
    print("=" * 80)
    print("LAKEHOUSE DEDUPLICATION & RE-HASHING MIGRATION (SHA-256 ABSTRACT HASH)")
    print(f"Target: All Silver Parquet Tables | Sync R2: {args.sync_r2}")
    print("=" * 80)

    silver_base = settings.ROOT_DIR / "data" / "silver"
    targets = [
        ("arXiv (Year 2026)", silver_base / "year=2026" / "papers.parquet", "silver/year=2026/papers.parquet"),
        ("OpenReview", silver_base / "openreview" / "openreview_all.parquet", "silver/openreview/openreview_all.parquet"),
        ("CVF (CVPR 2024)", silver_base / "cvf" / "cvpr2024.parquet", "silver/cvf/cvpr2024.parquet"),
        ("Zenodo", silver_base / "zenodo" / "zenodo_all.parquet", "silver/zenodo/zenodo_all.parquet"),
    ]

    global_hashes: Dict[str, str] = {}
    summary_stats = []

    for name, local_path, r2_key in targets:
        if local_path.exists():
            _, stats = rehash_parquet_table(local_path, name, global_hashes)
            stats["r2_key"] = r2_key
            summary_stats.append(stats)
        else:
            print(f"\n[SKIP] {name}: File not found at {local_path}")

    # Save unified Hash Manifest
    manifest_dir = settings.ROOT_DIR / "data" / "manifests"
    manifest_dir.mkdir(parents=True, exist_ok=True)
    manifest_file = manifest_dir / "lakehouse_abstract_hashes.json"

    with open(manifest_file, "w", encoding="utf-8") as f:
        json.dump({
            "total_unique_hashes": len(global_hashes),
            "updated_at": datetime.datetime.now().isoformat(),
            "hashes": global_hashes,
        }, f, indent=2)

    print(f"\n[MANIFEST] Saved master abstract hash index ({len(global_hashes):,} unique papers) to {manifest_file}")

    # Optional R2 Sync
    if args.sync_r2:
        print("\n>>> SYNCHRONIZING REHASHED PARQUET TABLES TO CLOUDFLARE R2...")
        r2 = R2Client()
        if r2.is_configured:
            for item in summary_stats:
                p_path = Path(item["path"])
                r_key = item["r2_key"]
                if p_path.exists():
                    r2.upload_file(p_path, r_key, content_type="application/vnd.apache.parquet")
                    print(f"  • [R2 UPLOAD] {r_key} ({p_path.stat().st_size / (1024*1024):.2f} MB)")
            # Upload hash manifest
            r2.upload_file(manifest_file, "lakehouse/lakehouse_abstract_hashes.json", content_type="application/json")
            print("  • [R2 UPLOAD] lakehouse/lakehouse_abstract_hashes.json")
        else:
            print("[R2 WARNING] R2 Client credentials not configured. Skipped remote upload.")

    elapsed = round(time.time() - start_time, 2)
    print("\n" + "=" * 80)
    print(f"RE-HASHING & DEDUPLICATION COMPLETE IN {elapsed}s!")
    print(f"Total Unique Academic Papers in Silver Lakehouse: {len(global_hashes):,}")
    print("=" * 80)


if __name__ == "__main__":
    main()
