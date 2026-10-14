from backend.app.services.storage.service import StorageService, storage_service
from backend.app.services.storage.aggregate import (
    compute_total_objects,
    compute_used_percentage,
    convert_to_gb,
    sum_total_bytes,
)
from backend.app.services.storage.response import (
    build_stats_response,
    build_zones_dto,
    resolve_bucket,
)
from backend.app.services.storage.zones import (
    get_gold_chunk_count,
    list_gold_tables,
    list_silver_tables,
    measure_bronze,
    measure_gold,
    measure_silver,
)
