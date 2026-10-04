"""Preflight checks for the OpenAlex V2 pipeline (V2).

Before a large crawl, preflight (plan section 3.12) does a small
network probe:

  1. validate API key (a 1-request /me or /works sanity call)
  2. read current rate-limit budget from response headers
  3. request the scope with per-page=1 and read meta.count
  4. estimate pages = ceil(count / 100)
  5. estimate API request cost = pages (cursor pagination)
  6. emit warnings when estimated_pages > configured safety

Preflight has its own request config (low retry, low RPS) and
does NOT write to R2.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Mapping, Optional

import httpx

from src.ingestion.openalex_v2.client import build_http_client, build_request_headers
from src.ingestion.openalex_v2.rate_limit import (
    BudgetThresholds,
    RateLimitSnapshot,
    parse_rate_limit_headers,
)
from src.ingestion.openalex_v2.request import RequestConfig, _ThrottleState
from src.ingestion.openalex_v2.retry import RetryConfig
from src.ingestion.openalex_v2.scope import OpenAlexScope


OPENALEX_WORKS_URL = "https://api.openalex.org/works"


@dataclass(frozen=True)
class PreflightResult:
    scope_id: str
    filter_string: str
    start_date: str
    end_date: str
    subfield_mode: str
    estimated_count: Optional[int]
    estimated_pages: Optional[int]
    per_page: int
    budget: RateLimitSnapshot
    warnings: tuple[str, ...] = field(default_factory=tuple)
    errors: tuple[str, ...] = field(default_factory=tuple)

    @property
    def healthy(self) -> bool:
        return not self.errors


def build_filter_string(scope: OpenAlexScope) -> str:
    if scope.subfield_mode == "primary_topic":
        subfield_predicate = "primary_topic.subfield.id"
    else:
        subfield_predicate = "topics.subfield.id"
    subfields = "|".join(sorted(scope.subfield_ids))
    return (
        f"from_publication_date:{scope.start_date},"
        f"to_publication_date:{scope.end_date},"
        f"{subfield_predicate}:{subfields}"
    )


def _estimate_pages(count: Optional[int], per_page: int) -> Optional[int]:
    if count is None or count < 0:
        return None
    return max(1, math.ceil(count / per_page))


def run_preflight(
    *,
    scope: OpenAlexScope,
    api_key: str,
    safety_max_pages: int = 50_000,
    force_large: bool = False,
    client: Optional[httpx.Client] = None,
    request_config: Optional[RequestConfig] = None,
) -> PreflightResult:
    if not scope.subfield_ids:
        raise ValueError("OpenAlexScope.subfield_ids must not be empty")

    owns_client = client is None
    http_client = client or build_http_client()
    cfg = request_config or RequestConfig(
        retry=RetryConfig(max_attempts=3, base_delay_seconds=1.0, cap_delay_seconds=10.0),
    )
    headers = build_request_headers(api_key)
    filter_string = build_filter_string(scope)
    params = {
        "filter": filter_string,
        "per-page": 1,
    }

    errors: list[str] = []
    warnings: list[str] = []
    estimated_count: Optional[int] = None
    budget_snapshot = RateLimitSnapshot(
        limit=None,
        remaining=None,
        credits_used=None,
        reset_seconds=None,
        retry_after_seconds=None,
    )

    try:
        http_client.headers.update(headers)
        state = _ThrottleState()
        response = http_client.get(
            OPENALEX_WORKS_URL,
            params=params,
            headers=headers,
        )
        state.last_request_at = 0.0
        budget_snapshot = parse_rate_limit_headers(response.headers)
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            errors.append("preflight response is not a JSON object")
        else:
            meta = payload.get("meta")
            if not isinstance(meta, dict):
                errors.append("preflight response.meta is not a dict")
            else:
                count = meta.get("count")
                if isinstance(count, int) and count >= 0:
                    estimated_count = count
                else:
                    errors.append(f"preflight meta.count invalid: {count!r}")
    except (httpx.HTTPError, ValueError) as exc:
        errors.append(f"preflight HTTP failed: {exc}")

    estimated_pages = _estimate_pages(estimated_count, scope.per_page)

    if estimated_pages is not None and estimated_pages > safety_max_pages:
        msg = (
            f"estimated_pages={estimated_pages} exceeds safety_max_pages="
            f"{safety_max_pages}; pass force_large=True to proceed"
        )
        if not force_large:
            errors.append(msg)
        else:
            warnings.append(msg)

    if budget_snapshot.remaining is not None and budget_snapshot.remaining < 1000:
        warnings.append(
            f"low remaining budget: {budget_snapshot.remaining}/{budget_snapshot.limit}"
        )

    if owns_client:
        http_client.close()

    return PreflightResult(
        scope_id=scope.entity,
        filter_string=filter_string,
        start_date=scope.start_date,
        end_date=scope.end_date,
        subfield_mode=scope.subfield_mode,
        estimated_count=estimated_count,
        estimated_pages=estimated_pages,
        per_page=scope.per_page,
        budget=budget_snapshot,
        warnings=tuple(warnings),
        errors=tuple(errors),
    )
