"""HTTP request layer for the OpenAlex V2 pipeline (V2).

This module composes client.py, rate_limit.py, retry.py into a
single request() function. It is the ONLY place that calls
httpx.Client.get, sleeps, and inspects status codes.

It does NOT:
  - touch cursor invariants (cursor_invariant.py does that)
  - touch Parquet or R2 (writer.py / r2_client.py do that)
  - decide when to stop (collector.py does that)

Layering:
  request.py
    -> client.py      (shared httpx.Client)
    -> rate_limit.py  (parse budget headers, raise on HARD_STOP)
    -> retry.py       (decide sleep, raise on auth/non-retryable)
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Mapping, Optional

import httpx

from src.ingestion.openalex_v2.client import build_request_headers
from src.ingestion.openalex_v2.rate_limit import (
    BudgetThresholds,
    RateLimitSnapshot,
    assert_not_budget_exhausted,
    parse_rate_limit_headers,
)
from src.ingestion.openalex_v2.retry import (
    OpenAlexTransientError,
    RetryConfig,
    RetryDecision,
    decide_retry,
)


@dataclass(frozen=True)
class RequestConfig:
    retry: RetryConfig = None  # type: ignore[assignment]
    budget: BudgetThresholds = None  # type: ignore[assignment]
    requests_per_second: float = 5.0

    def __post_init__(self) -> None:
        object.__setattr__(self, "retry", self.retry or RetryConfig())
        object.__setattr__(self, "budget", self.budget or BudgetThresholds())
        if self.requests_per_second <= 0:
            raise ValueError(
                f"requests_per_second must be > 0, got {self.requests_per_second}"
            )


@dataclass
class _ThrottleState:
    last_request_at: float = 0.0


def _enforce_throttle(state: _ThrottleState, requests_per_second: float) -> None:
    if state.last_request_at <= 0:
        return
    interval = 1.0 / requests_per_second
    elapsed = time.monotonic() - state.last_request_at
    if elapsed < interval:
        time.sleep(interval - elapsed)


def request_openalex(
    *,
    client: httpx.Client,
    url: str,
    params: Mapping[str, Any],
    headers: Mapping[str, str],
    config: RequestConfig,
    throttle_state: Optional[_ThrottleState] = None,
) -> tuple[dict[str, Any], RateLimitSnapshot]:
    state = throttle_state or _ThrottleState()
    attempt = 0
    response: Optional[httpx.Response] = None

    while True:
        _enforce_throttle(state, config.requests_per_second)
        try:
            response = client.get(
                url,
                params=dict(params),
                headers=dict(headers),
            )
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            next_attempts = max(0, config.retry.max_attempts - attempt)
            if next_attempts <= 0:
                raise OpenAlexTransientError(
                    f"OpenAlex request failed after {attempt + 1} attempts"
                ) from exc
            _, delay = decide_retry(
                response=None,
                attempt=attempt,
                config=config.retry,
                next_attempts=next_attempts,
            )
            if delay > 0:
                time.sleep(delay)
            attempt += 1
            continue

        state.last_request_at = time.monotonic()

        snapshot = parse_rate_limit_headers(response.headers)
        assert_not_budget_exhausted(snapshot, config.budget)

        next_attempts = max(0, config.retry.max_attempts - attempt)
        decision, delay = decide_retry(
            response=response,
            attempt=attempt,
            config=config.retry,
            next_attempts=next_attempts,
        )

        if decision is RetryDecision.SLEEP and response.status_code == 200:
            payload = response.json()
            if not isinstance(payload, dict):
                raise OpenAlexTransientError(
                    "OpenAlex returned a non-object JSON response"
                )
            return payload, snapshot

        if decision is RetryDecision.SLEEP:
            if delay > 0:
                time.sleep(delay)
            attempt += 1
            continue

        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise OpenAlexTransientError(
                "OpenAlex returned a non-object JSON response"
            )
        return payload, snapshot


def build_request_args(
    *,
    api_key: str,
    user_agent: Optional[str] = None,
) -> dict[str, str]:
    return build_request_headers(api_key, user_agent=user_agent) if user_agent else build_request_headers(api_key)
