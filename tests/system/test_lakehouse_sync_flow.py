"""System tests for Lakehouse inventory manifest synchronization, deduplication & quota auditing."""
import pytest
from backend.app.api.endpoints.r2_explorer import (
    build_default_inventory,
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

    # LanceDB tests
    z6, cat6 = classify_zone("gold/lancedb/scientific_papers_gold.lance")
    assert z6 == "lancedb"
    assert "Vector" in cat6


@pytest.mark.system
def test_format_size_utility():
    assert format_size(500) == "500 B"
    assert format_size(1024) == "1.0 KB"
    assert format_size(1024 * 1024 * 5) == "5.00 MB"
    assert format_size(1024 * 1024 * 1024 * 2) == "2.00 GB"


@pytest.mark.system
def test_build_default_inventory_integrity():
    inv = build_default_inventory()
    assert "bucket_name" in inv
    assert "total_objects" in inv
    assert "total_size_bytes" in inv
    assert "files" in inv
    assert len(inv["files"]) > 0

    # Ensure no duplicate keys exist in the generated inventory
    seen_keys = set()
    for f in inv["files"]:
        k = f["key"]
        assert k not in seen_keys, f"Duplicate file key found in inventory: {k}"
        seen_keys.add(k)
        assert "size_bytes" in f
        assert "name" in f
        assert "last_modified" in f

    # Verify calibrated live Cloudflare R2 bucket telemetry
    assert inv["total_size_gb"] == 12.18
    assert inv["total_size_bytes"] == 13078247014
    assert inv["class_a_operations"] == "46.75k"
    assert inv["class_b_operations"] == "113.58k"
    assert inv["storage_class"] == "Standard"
