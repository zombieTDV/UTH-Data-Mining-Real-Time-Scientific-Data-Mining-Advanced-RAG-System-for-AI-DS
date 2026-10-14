from backend.app.schemas.storage import StorageStatsResponse
from backend.app.services.storage.aggregate import (
    compute_total_objects,
    compute_used_percentage,
    convert_to_gb,
    sum_total_bytes,
)
from backend.app.services.storage.response import build_stats_response
from backend.app.services.storage.zones import measure_bronze, measure_gold, measure_silver


class StorageService:
    def get_stats(self) -> StorageStatsResponse:
        bronze_count, bronze_bytes = measure_bronze()
        silver_bytes = measure_silver()
        gold_bytes = measure_gold()

        total_bytes = sum_total_bytes(bronze_bytes, silver_bytes, gold_bytes)
        total_gb = convert_to_gb(total_bytes)
        used_pct = compute_used_percentage(total_gb)
        total_objects = compute_total_objects(bronze_count)

        return build_stats_response(
            bronze_count,
            bronze_bytes,
            silver_bytes,
            gold_bytes,
            total_bytes,
            total_gb,
            used_pct,
            total_objects,
        )


storage_service = StorageService()
