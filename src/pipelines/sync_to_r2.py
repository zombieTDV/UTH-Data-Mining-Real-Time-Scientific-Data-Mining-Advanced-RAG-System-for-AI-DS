"""
src/pipelines/sync_to_r2.py
---------------------------
Sync local Bronze raw payloads and Silver Parquet tables for CVPR and OpenReview
directly to Cloudflare R2 Lakehouse.
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

    files_to_sync = [
        # Bronze Raw Payloads
        ("data/raw/cvf/cvpr2024_20261007_163212.json", "bronze/cvf/cvpr2024_20261007_163212.json", "application/json"),
        ("data/raw/openreview/openreview_all_20261007_155300.json", "bronze/openreview/openreview_all_20261007_155300.json", "application/json"),
        # Silver Parquet Cleaned Tables
        ("data/silver/cvf/cvpr2024.parquet", "silver/cvf/cvpr2024.parquet", "application/vnd.apache.parquet"),
        ("data/silver/openreview/openreview_all.parquet", "silver/openreview/openreview_all.parquet", "application/vnd.apache.parquet"),
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

    logger.info("[ALL DONE] Synced %d multi-source Lakehouse files (%.2f MB) to R2!", synced_count, total_bytes / (1024 * 1024))


if __name__ == "__main__":
    sync_multi_source_lakehouse_to_r2()
