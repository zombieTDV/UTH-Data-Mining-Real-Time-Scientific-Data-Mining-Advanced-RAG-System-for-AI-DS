"""Deterministic scope fingerprint and human-readable scope_id (V2).

Given an OpenAlexScope (or any policy bundle), produce:

  - scope_fingerprint: SHA-256 hex of the canonical JSON payload
  - scope_id: first 16 hex chars + slug

The canonical payload is sorted by key, subfield IDs are sorted,
dates are ISO strings, integers are plain. The same logical scope
always produces the same fingerprint.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import asdict
from typing import Any, Mapping

from src.ingestion.openalex_v2.scope import OpenAlexScope


_FINGERPRINT_TRUNCATE = 16
_SLUG_SAFE_RE = re.compile(r"[^a-z0-9]+")


def _canonicalise(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _canonicalise(value[k]) for k in sorted(value.keys())}
    if isinstance(value, (list, tuple)):
        return [_canonicalise(item) for item in value]
    if isinstance(value, (set, frozenset)):
        return sorted(_canonicalise(item) for item in value)
    return value


def _canonical_json(payload: Mapping[str, Any]) -> str:
    normalised = _canonicalise(dict(payload))
    return json.dumps(
        normalised,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )


def compute_scope_fingerprint(payload: Mapping[str, Any]) -> str:
    canonical = _canonical_json(payload)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _scope_slug(start_date: str, end_date: str, mode: str) -> str:
    raw = f"{mode}-{start_date}-{end_date}".lower()
    slug = _SLUG_SAFE_RE.sub("-", raw).strip("-")
    return slug or "scope"


def scope_identity(
    scope: OpenAlexScope,
    *,
    schema_version: str,
    field_policy_version: str,
    layout_version: str,
    collector_version: str,
) -> dict[str, str]:
    payload = {
        "source": "openalex",
        "entity": scope.entity,
        "mode": scope.mode,
        "start_date": scope.start_date,
        "end_date": scope.end_date,
        "subfield_mode": scope.subfield_mode,
        "subfield_ids": sorted(scope.subfield_ids),
        "per_page": scope.per_page,
        "schema_version": schema_version,
        "field_policy_version": field_policy_version,
        "layout_version": layout_version,
        "collector_version": collector_version,
    }
    fingerprint = compute_scope_fingerprint(payload)
    short = fingerprint[:_FINGERPRINT_TRUNCATE]
    slug = _scope_slug(scope.start_date, scope.end_date, scope.mode)
    return {
        "scope_fingerprint": fingerprint,
        "scope_id": f"{slug}-{short}",
    }
