"""Explicit OpenAlex Bronze Parquet projection schema v1 (V2).

Per plan Section 3.3 and Section 13, the schema must not depend on
the first page. This module defines:

  - BRONZE_SCHEMA_V1:        canonical Arrow schema
  - FIELD_POLICY_V1:         which top-level fields are kept
  - JSON_ENCODED_FIELDS_V1:  fields serialised as canonical JSON
  - PROVENANCE_COLUMNS_V1:   bookkeeping columns added at write time
  - resolve_schema_fingerprint(): deterministic hash of the schema
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, FrozenSet, List, Mapping, Optional, Tuple

import pyarrow as pa


SCHEMA_VERSION_V1 = "openalex-bronze-v1"
FIELD_POLICY_VERSION_V1 = "v1"
LAYOUT_VERSION_V2 = "v2"


FIELD_POLICY_V1: FrozenSet[str] = frozenset(
    {
        "id",
        "doi",
        "ids",
        "display_name",
        "title",
        "publication_year",
        "publication_date",
        "type",
        "language",
        "authorships",
        "primary_location",
        "locations",
        "best_oa_location",
        "open_access",
        "primary_topic",
        "topics",
        "keywords",
        "cited_by_count",
        "referenced_works",
        "related_works",
        "created_date",
        "updated_date",
    }
)


EXCLUDED_FIELDS_V1: FrozenSet[str] = frozenset(
    {
        "abstract_inverted_index",
        "apc_list",
        "apc_paid",
        "sustainable_development_goals",
        "x_sdgs",
        "study_designs",
        "awards",
        "funders",
    }
)


JSON_ENCODED_FIELDS_V1: FrozenSet[str] = frozenset(
    {
        "ids",
        "authorships",
        "primary_location",
        "locations",
        "best_oa_location",
        "open_access",
        "primary_topic",
        "topics",
        "keywords",
        "referenced_works",
        "related_works",
    }
)


PRIMITIVE_ARROW_FIELDS_V1: Mapping[str, pa.DataType] = {
    "id": pa.string(),
    "doi": pa.string(),
    "display_name": pa.string(),
    "title": pa.string(),
    "publication_year": pa.int32(),
    "publication_date": pa.string(),
    "type": pa.string(),
    "language": pa.string(),
    "cited_by_count": pa.int32(),
    "created_date": pa.string(),
    "updated_date": pa.string(),
}


PROVENANCE_COLUMNS_V1: Mapping[str, pa.DataType] = {
    "_ingested_at": pa.string(),
    "_source": pa.string(),
    "_scope_id": pa.string(),
    "_run_id": pa.string(),
    "_page_number": pa.int32(),
    "_schema_version": pa.string(),
}


def build_bronze_schema_v1() -> pa.Schema:
    fields: List[pa.Field] = []
    for name in sorted(PRIMITIVE_ARROW_FIELDS_V1.keys()):
        fields.append(pa.field(name, PRIMITIVE_ARROW_FIELDS_V1[name], nullable=True))
    for name in sorted(JSON_ENCODED_FIELDS_V1):
        fields.append(pa.field(f"{name}_json", pa.string(), nullable=True))
    for name, dtype in PROVENANCE_COLUMNS_V1.items():
        fields.append(pa.field(name, dtype, nullable=True))
    return pa.schema(fields)


BRONZE_SCHEMA_V1: pa.Schema = build_bronze_schema_v1()


def project_record(
    work: Mapping[str, Any],
    *,
    scope_id: str,
    run_id: str,
    page_number: int,
    ingested_at: str,
) -> Dict[str, Any]:
    row: Dict[str, Any] = {}
    for name in PRIMITIVE_ARROW_FIELDS_V1.keys():
        if name in work:
            row[name] = work.get(name)
        else:
            row[name] = None
    for name in JSON_ENCODED_FIELDS_V1:
        value = work.get(name)
        if value is None:
            row[f"{name}_json"] = None
        else:
            row[f"{name}_json"] = json.dumps(
                value, ensure_ascii=False, separators=(",", ":")
            )
    row["_ingested_at"] = ingested_at
    row["_source"] = "openalex"
    row["_scope_id"] = scope_id
    row["_run_id"] = run_id
    row["_page_number"] = int(page_number)
    row["_schema_version"] = SCHEMA_VERSION_V1
    return row


def schema_fingerprint(schema: pa.Schema) -> str:
    payload = {
        "version": SCHEMA_VERSION_V1,
        "fields": [
            {"name": f.name, "type": str(f.type), "nullable": f.nullable}
            for f in schema
        ],
    }
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


BRONZE_SCHEMA_FINGERPRINT_V1: str = schema_fingerprint(BRONZE_SCHEMA_V1)
