"""Retry / backoff / jitter policy for the OpenAlex V2 pipeline.

Per plan section 3.10 the policy is:

  1. if Retry-After is present, honor it;
  2. otherwise use capped exponential backoff with jitter;
  3. never retry on auth failure (401, 403);
  4. on 429, the caller checks budget state separately.

This module is pure-function and testable: given an attempt
number, a response, and a config, it returns either:
  - RETRY_SLEEP seconds to wait
  - RAISE  decision to surface to caller

It does NOT actually sleep, it does NOT make HTTP requests.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from enum import Enum
from typing import Optional

import httpx


class RetryDecision(str, Enum):
    SLEEP = "SLEEP"
    RAISE = "RAISE"
    GIVE_UP = "GIVE_UP"


class OpenAlexAuthError(RuntimeError):
    pass


class OpenAlexTransientError(RuntimeError):
    pass


class OpenAlexProtocolError(RuntimeError):
    pass


@dataclass(frozen=True)
class RetryConfig:
    max_attempts: int = 5
    base_delay_seconds: float = 1.0
    cap_delay_seconds: float = 60.0
    jitter_full: bool = True

    def __post_init__(self) -> None:
        if self.max_attempts < 1:
            raise ValueError(f"max_attempts must be >= 1, got {self.max_attempts}")
        if self.base_delay_seconds <= 0:
            raise ValueError(f"base_delay_seconds must be > 0, got {self.base_delay_seconds}")
        if self.cap_delay_seconds < self.base_delay_seconds:
            raise ValueError(
                f"cap_delay_seconds ({self.cap_delay_seconds}) must be >= "
                f"base_delay_seconds ({self.base_delay_seconds})"
            )


def _parse_retry_after(value: Optional[str]) -> Optional[float]:
    if not value:
        return None
    try:
        return max(0.0, float(value))
    except (TypeError, ValueError):
        return None


def compute_backoff_seconds(
    attempt: int,
    config: RetryConfig,
    *,
    retry_after: Optional[str] = None,
    rng: Optional[random.Random] = None,
) -> float:
    if attempt < 0:
        raise ValueError(f"attempt must be >= 0, got {attempt}")
    if retry_after is not None:
        seconds = _parse_retry_after(retry_after)
        if seconds is not None:
            return seconds
    rng = rng or random.Random()
    cap = config.cap_delay_seconds
    base = config.base_delay_seconds
    raw = min(cap, base * (2 ** attempt))
    if config.jitter_full:
        return rng.uniform(0.0, raw)
    return raw


def decide_retry(
    *,
    response: Optional[httpx.Response],
    attempt: int,
    config: RetryConfig,
    next_attempts: int,
) -> tuple[RetryDecision, float]:
    if response is None:
        return RetryDecision.GIVE_UP, 0.0

    status = response.status_code

    if status in (401, 403):
        raise OpenAlexAuthError(
            f"OpenAlex authentication/authorization failed ({status})"
        )

    if status == 200:
        return RetryDecision.SLEEP, 0.0

    if status == 429:
        if next_attempts <= 0:
            return RetryDecision.RAISE, 0.0
        delay = compute_backoff_seconds(
            attempt,
            config,
            retry_after=response.headers.get("Retry-After"),
        )
        return RetryDecision.SLEEP, delay

    if 500 <= status < 600:
        if next_attempts <= 0:
            return RetryDecision.RAISE, 0.0
        delay = compute_backoff_seconds(
            attempt,
            config,
            retry_after=response.headers.get("Retry-After"),
        )
        return RetryDecision.SLEEP, delay

    return RetryDecision.RAISE, 0.0


def is_retryable_status(status_code: int) -> bool:
    if status_code == 429:
        return True
    if 500 <= status_code < 600:
        return True
    return False
