"""
src/pipelines/sync_to_r2.py
---------------------------
Sync local Bronze raw payloads, Silver Parquet tables, and Gold LanceDB vector index
for CVPR and OpenReview directly to Cloudflare R2 Lakehouse.
"""

import logging
from pathlib import Path
from src.config.settings import settings
from src.storage.r2_client import R2Client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("r2_sync")


def sync_multi_source_lakehouse_to_r2():
    r2 = R2Client()
    logger.info("[R2 SYNC] Connecting to Cloudflare R2 bucket '%s'...", r2.bucket_name)

    # 1. Sync Bronze & Silver files
    files_to_sync = [
        # Bronze Raw Payloads
        ("data/raw/cvf/cvpr2024_20261007_163212.json", "bronze/cvf/cvpr2024_20261007_163212.json", "application/json"),
        ("data/raw/openreview/openreview_all_20261007_155300.json", "bronze/openreview/openreview_all_20261007_155300.json", "application/json"),
        # Silver Parquet Cleaned Tables
        ("data/silver/cvf/cvpr2024.parquet", "silver/cvf/cvpr2024.parquet", "application/vnd.apache.parquet"),
        ("data/silver/openreview/openreview_all.parquet", "silver/openreview/openreview_all.parquet", "application/vnd.apache.parquet"),
        # Gold Parquet Cleaned Tables
        ("data/gold/parquets/cvpr2024_gold.parquet", "gold/cvf/cvpr2024_gold.parquet", "application/vnd.apache.parquet"),
        ("data/gold/parquets/openreview_gold.parquet", "gold/openreview/openreview_gold.parquet", "application/vnd.apache.parquet"),
    ]

    synced_count = 0
    total_bytes = 0

    for local_rel, r2_key, ctype in files_to_sync:
        p = settings.ROOT_DIR / local_rel
        if p.exists():
            sz = p.stat().st_size
            logger.info("[UPLOADING] %s (%d bytes) -> %s...", p.name, sz, r2_key)
            res = r2.upload_file(p, r2_key, content_type=ctype)
            logger.info("  [SUCCESS] Uploaded %s | sha256: %s...", r2_key, res["sha256"][:12])
            synced_count += 1
            total_bytes += sz
        else:
            logger.warning("[SKIP] Local file not found: %s", p)

    # 2. Sync LanceDB Gold vector table incrementally
    local_gold = settings.ROOT_DIR / "data" / "gold" / "lancedb" / "scientific_papers_gold.lance"
    if local_gold.exists():
        logger.info("[GOLD SYNC] Scanning LanceDB Gold files for R2 sync...")
        local_files = [f.relative_to(local_gold.parent) for f in local_gold.rglob("*") if f.is_file()]
        r2_objs = r2.list_objects(prefix="gold/lancedb/scientific_papers_gold.lance/", max_keys=1000)
        r2_keys = {o["key"] for o in r2_objs}

        missing_on_r2 = []
        for rel in local_files:
            r2_key = f"gold/lancedb/{rel}"
            if r2_key not in r2_keys:
                missing_on_r2.append((local_gold.parent / rel, r2_key))

        if missing_on_r2:
            logger.info("[GOLD SYNC] Uploading %d new/updated LanceDB Gold files...", len(missing_on_r2))
            for loc, r2_key in missing_on_r2:
                sz = loc.stat().st_size
                r2.upload_file(loc, r2_key)
                synced_count += 1
                total_bytes += sz
            logger.info("  [SUCCESS] LanceDB Gold vector index is 100%% synced with Cloudflare R2!")
        else:
            logger.info("[GOLD SYNC] LanceDB Gold is already up-to-date on Cloudflare R2.")

    logger.info("[ALL DONE] Synced %d Lakehouse files (%.2f MB) to Cloudflare R2!", synced_count, total_bytes / (1024 * 1024))


if __name__ == "__main__":
    sync_multi_source_lakehouse_to_r2()
