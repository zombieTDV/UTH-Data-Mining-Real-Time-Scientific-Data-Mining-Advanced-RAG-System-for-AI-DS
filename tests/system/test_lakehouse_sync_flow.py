"""System tests for Lakehouse inventory manifest synchronization, deduplication & quota auditing."""
import pytest
from backend.app.api.endpoints.explorer import (
    build_inventory,
    classify_zone,
    format_size,
)


@pytest.mark.system
def test_classify_zone_mapping():
    # Bronze tests
    z1, cat1 = classify_zone("bronze/arxiv/batch_001.json")
    assert z1 == "bronze"
    assert "arXiv" in cat1

    z2, cat2 = classify_zone("bronze/openalex/works.json")
    assert z2 == "bronze"
    assert "OpenAlex" in cat2

    # Silver tests
    z3, cat3 = classify_zone("silver/papers.parquet")
    assert z3 == "silver"
    assert "Parquet" in cat3

    z4, cat4 = classify_zone("silver/cvf/cvpr2024.parquet")
    assert z4 == "silver"
    assert "CVF" in cat4

    # Gold tests
    z5, cat5 = classify_zone("gold/mining/association_rules.json")
    assert z5 == "gold"
    assert "Data Mining" in cat5

    # Anything outside bronze/ silver/ gold/ (manifests, state, archive) is listed under bronze as "state"
    z6, cat6 = classify_zone("manifests/checkpoint.json")
    assert z6 == "bronze"
    assert "State" in cat6


@pytest.mark.system
def test_format_size_utility():
    assert format_size(500) == "500 B"
    assert format_size(1024) == "1.0 KB"
    assert format_size(1024 * 1024 * 5) == "5.00 MB"
    assert format_size(1024 * 1024 * 1024 * 2) == "2.00 GB"


@pytest.mark.system
def test_build_inventory_integrity():
    """Live listing of the MinIO bucket (needs MinIO running)."""
    inv = build_inventory(force=True)
    assert inv["bucket_name"]
    assert inv["total_objects"] > 0
    assert inv["total_size_bytes"] > 0
    assert len(inv["files"]) > 0

    # No duplicate keys in the generated inventory
    seen_keys = set()
    for f in inv["files"]:
        k = f["key"]
        assert k not in seen_keys, f"Duplicate file key found in inventory: {k}"
        seen_keys.add(k)
        assert "size_bytes" in f
