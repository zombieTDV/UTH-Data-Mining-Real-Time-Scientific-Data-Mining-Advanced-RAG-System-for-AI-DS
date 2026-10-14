import os
from typing import Tuple

from backend.app.core.config import settings
from backend.app.services.storage.constants import (
    FALLBACK_BRONZE_BYTES,
    FALLBACK_BRONZE_COUNT,
    FALLBACK_GOLD_BYTES,
    FALLBACK_SILVER_BYTES,
    GOLD_CHUNK_COUNT,
    GOLD_TABLE_NAME,
    SILVER_TABLE_NAME,
)


def measure_bronze() -> Tuple[int, int]:
    raw_html_dir = settings.DATA_DIR / "raw" / "html"
    if not raw_html_dir.exists():
        return FALLBACK_BRONZE_COUNT, FALLBACK_BRONZE_BYTES

    count = 0
    size = 0
    for root, _, files in os.walk(raw_html_dir):
        count += len(files)
        for name in files:
            size += os.path.getsize(os.path.join(root, name))
    return count, size


def measure_silver() -> int:
    if not settings.SILVER_PARQUET.exists():
        return FALLBACK_SILVER_BYTES
    return settings.SILVER_PARQUET.stat().st_size


def measure_gold() -> int:
    gold_dir = settings.DATA_DIR / "gold" / "lancedb"
    if not gold_dir.exists():
        return FALLBACK_GOLD_BYTES

    size = 0
    for root, _, files in os.walk(gold_dir):
        for name in files:
            size += os.path.getsize(os.path.join(root, name))
    return size


def list_silver_tables() -> list:
    return [SILVER_TABLE_NAME]


def list_gold_tables() -> list:
    return [GOLD_TABLE_NAME]


def get_gold_chunk_count() -> int:
    return GOLD_CHUNK_COUNT
