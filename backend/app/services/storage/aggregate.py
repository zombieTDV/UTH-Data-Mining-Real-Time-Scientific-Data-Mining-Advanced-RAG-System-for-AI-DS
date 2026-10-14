from backend.app.services.storage.constants import (
    BYTES_PER_GB,
    FREE_TIER_GB,
    GOLD_INDEX_OBJECTS,
    INGESTION_OBJECTS,
    SILVER_INDEX_OBJECTS,
)


def sum_total_bytes(bronze_bytes: int, silver_bytes: int, gold_bytes: int) -> int:
    return bronze_bytes + silver_bytes + gold_bytes


def convert_to_gb(total_bytes: int) -> float:
    return round(total_bytes / BYTES_PER_GB, 3)


def compute_used_percentage(total_gb: float) -> float:
    return round((total_gb / FREE_TIER_GB) * 100.0, 2)


def compute_total_objects(bronze_count: int) -> int:
    return bronze_count + SILVER_INDEX_OBJECTS + GOLD_INDEX_OBJECTS + INGESTION_OBJECTS
