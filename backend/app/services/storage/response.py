from backend.app.core.config import settings
from backend.app.schemas.storage import StorageStatsResponse, StorageZonesDto
from backend.app.services.storage.constants import (
    DEFAULT_BUCKET,
    FREE_TIER_GB,
    STATUS_READY,
)
from backend.app.services.storage.zones import (
    get_gold_chunk_count,
    list_gold_tables,
    list_silver_tables,
)


def resolve_bucket() -> str:
    return settings.R2_BUCKET_NAME or DEFAULT_BUCKET


def build_zones_dto(bronze_count: int, bronze_bytes: int, silver_bytes: int, gold_bytes: int) -> StorageZonesDto:
    return StorageZonesDto(
        bronzeCount=bronze_count,
        bronzeSizeBytes=bronze_bytes,
        silverTables=list_silver_tables(),
        silverSizeBytes=silver_bytes,
        goldTables=list_gold_tables(),
        goldChunkCount=get_gold_chunk_count(),
        goldSizeBytes=gold_bytes,
    )


def build_stats_response(
    bronze_count: int,
    bronze_bytes: int,
    silver_bytes: int,
    gold_bytes: int,
    total_bytes: int,
    total_gb: float,
    used_pct: float,
    total_objects: int,
) -> StorageStatsResponse:
    return StorageStatsResponse(
        bucket=resolve_bucket(),
        status=STATUS_READY,
        total_objects=total_objects,
        total_size_bytes=total_bytes,
        total_size_gb=total_gb,
        free_tier_quota_gb=FREE_TIER_GB,
        used_percentage=used_pct,
        zones=build_zones_dto(bronze_count, bronze_bytes, silver_bytes, gold_bytes),
        remoteIndicesReady=True,
    )
