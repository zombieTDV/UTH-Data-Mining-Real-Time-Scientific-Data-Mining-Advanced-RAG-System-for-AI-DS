"""OpenAlex rate-limit and budget header parsing (V2).

The collector must consume the following response headers:

  X-RateLimit-Limit
  X-RateLimit-Remaining
  X-RateLimit-Credits-Used
  X-RateLimit-Reset

This module turns those headers into a typed RateLimitSnapshot
and decides the next action:

  CONTINUE         budget healthy
  THROTTLE         below soft threshold, caller should slow down
  HARD_STOP        below hard threshold, caller must graceful stop

This module does not perform HTTP, sleep, or decide retry counts.
Those responsibilities live in retry.py and request.py.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Mapping, Optional


class BudgetAction(str, Enum):
    CONTINUE = "CONTINUE"
    THROTTLE = "THROTTLE"
    HARD_STOP = "HARD_STOP"


class OpenAlexBudgetExceeded(RuntimeError):
    pass


@dataclass(frozen=True)
class RateLimitSnapshot:
    limit: Optional[int]
    remaining: Optional[int]
    credits_used: Optional[int]
    reset_seconds: Optional[int]
    retry_after_seconds: Optional[float]

    @property
    def has_numeric_remaining(self) -> bool:
        return self.remaining is not None

    def remaining_ratio(self) -> Optional[float]:
        if self.remaining is None or self.limit in (None, 0):
            return None
        return max(0.0, min(1.0, self.remaining / self.limit))


def _safe_int(value: Optional[str]) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def _safe_float(value: Optional[str]) -> Optional[float]:
    if value is None:
        return None
    try:
        result = float(str(value).strip())
        return result if result >= 0 else None
    except (TypeError, ValueError):
        return None


def parse_rate_limit_headers(
    headers: Mapping[str, str],
) -> RateLimitSnapshot:
    normalised = {key.lower(): value for key, value in headers.items()}
    return RateLimitSnapshot(
        limit=_safe_int(normalised.get("x-ratelimit-limit")),
        remaining=_safe_int(normalised.get("x-ratelimit-remaining")),
        credits_used=_safe_int(normalised.get("x-ratelimit-credits-used")),
        reset_seconds=_safe_int(normalised.get("x-ratelimit-reset")),
        retry_after_seconds=_safe_float(normalised.get("retry-after")),
    )


@dataclass(frozen=True)
class BudgetThresholds:
    soft_remaining: int = 200
    hard_remaining: int = 0

    def __post_init__(self) -> None:
        if self.soft_remaining < self.hard_remaining:
            raise ValueError(
                f"soft_remaining ({self.soft_remaining}) must be >= "
                f"hard_remaining ({self.hard_remaining})"
            )
        if self.soft_remaining < 0 or self.hard_remaining < 0:
            raise ValueError("thresholds must be >= 0")


def classify_budget(
    snapshot: RateLimitSnapshot,
    thresholds: BudgetThresholds,
) -> BudgetAction:
    if snapshot.remaining is None:
        return BudgetAction.CONTINUE
    if snapshot.remaining <= thresholds.hard_remaining:
        return BudgetAction.HARD_STOP
    if snapshot.remaining <= thresholds.soft_remaining:
        return BudgetAction.THROTTLE
    return BudgetAction.CONTINUE


def assert_not_budget_exhausted(
    snapshot: RateLimitSnapshot,
    thresholds: BudgetThresholds,
) -> None:
    action = classify_budget(snapshot, thresholds)
    if action is BudgetAction.HARD_STOP:
        reset = snapshot.reset_seconds
        raise OpenAlexBudgetExceeded(
            f"OpenAlex daily budget exhausted (remaining={snapshot.remaining}, "
            f"limit={snapshot.limit}); reset in {reset} seconds"
        )
