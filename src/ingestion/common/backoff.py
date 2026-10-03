"""Exponential backoff with jitter and Retry-After support.

Per Rule #5: 2s -> 4s -> 8s -> 16s -> 32s + jitter, no infinite retry.
Per Rule #6: Honor Retry-After header when present.
"""

import logging
import random
import time
from typing import Optional, Tuple

from src.ingestion.common.jitter import compute_delay

logger = logging.getLogger(__name__)


class BackoffError(Exception):
    """Raised when max retries are exhausted."""


class TransientHttpError(Exception):
    """Raised when an HTTP response is worth retrying.

    Carries the underlying status code + optional Retry-After value so the
    retry helper can apply the right backoff policy.
    """

    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        retry_after: Optional[str] = None,
        response=None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.retry_after = retry_after
        self.response = response


def parse_retry_after(value: Optional[str]) -> Optional[float]:
    """Parse a Retry-After header value. Returns seconds or None.

    Supports both:
      - Integer seconds: "60"
      - HTTP-date: "Wed, 21 Oct 2015 07:28:00 GMT"
    """
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    # Try integer seconds first.
    try:
        return max(0.0, float(value))
    except ValueError:
        pass
    # Try HTTP-date format.
    try:
        from email.utils import parsedate_to_datetime
        import datetime as _dt

        target = parsedate_to_datetime(value)
        if target is None:
            return None
        now = _dt.datetime.now(_dt.timezone.utc)
        delta = (target - now).total_seconds()
        return max(0.0, delta)
    except (TypeError, ValueError):
        return None


def compute_backoff(
    attempt: int,
    base: float = 2.0,
    factor: float = 2.0,
    max_delay: float = 60.0,
    jitter: float = 0.3,
) -> float:
    """Compute exponential backoff with jitter.

    Args:
        attempt: 0-based attempt index.
        base: Base delay in seconds.
        factor: Multiplier per attempt.
        max_delay: Upper bound.
        jitter: Jitter ratio in [0, 1].

    Returns:
        Delay in seconds.
    """
    if attempt < 0:
        attempt = 0
    delay = base * (factor ** attempt)
    delay = min(delay, max_delay)
    if jitter > 0:
        delay = compute_delay(delay, jitter=jitter)
    return max(0.0, delay)


def is_retryable_status(status_code: int) -> bool:
    """Whether the HTTP status code is worth retrying."""
    if status_code == 408:  # Request Timeout
        return True
    if status_code == 425:  # Too Early
        return True
    if status_code == 429:  # Too Many Requests
        return True
    if 500 <= status_code < 600:  # Server errors
        return True
    return False


def backoff_sleep(
    attempt: int,
    retry_after: Optional[str] = None,
    base: float = 2.0,
    max_delay: float = 60.0,
) -> Tuple[float, str]:
    """Sleep for an exponential backoff duration, honoring Retry-After.

    Returns (delay_seconds, reason).
    """
    explicit = parse_retry_after(retry_after)
    if explicit is not None:
        delay = min(explicit, max_delay)
        time.sleep(max(0.0, delay))
        return delay, f"retry-after={explicit:.1f}s"
    delay = compute_backoff(attempt=attempt, base=base, max_delay=max_delay)
    time.sleep(delay)
    return delay, f"exp_backoff={delay:.1f}s"


def http_with_retries(
    fetch_fn,
    max_retries: int = 5,
    base_delay: float = 2.0,
    max_delay: float = 60.0,
    on_retry=None,
    label: str = "request",
):
    """Call fetch_fn() and retry on TransientHttpError with backoff.

    fetch_fn must be a callable returning an httpx.Response. It should
    raise TransientHttpError when a status code is retryable, and
    raise_for_status() (or let non-retryable errors propagate) otherwise.
    """
    last_exc: Optional[Exception] = None
    for attempt in range(max_retries):
        try:
            return fetch_fn()
        except TransientHttpError as exc:
            last_exc = exc
            if attempt == max_retries - 1:
                break
            delay, reason = backoff_sleep(
                attempt,
                retry_after=exc.retry_after,
                base=base_delay,
                max_delay=max_delay,
            )
            if on_retry:
                try:
                    on_retry(attempt, exc, delay, reason)
                except Exception:  # noqa: BLE001
                    pass
            logger.warning(
                "[%s] retry %d/%d after %s (%.1fs, status=%s): %s",
                label,
                attempt + 1,
                max_retries,
                reason,
                delay,
                exc.status_code,
                exc,
            )
    raise BackoffError(
        f"{label} failed after {max_retries} attempts: {last_exc}"
    )


def with_retries(
    fn,
    max_retries: int = 5,
    base_delay: float = 2.0,
    max_delay: float = 60.0,
    retryable_status=lambda status: is_retryable_status(status),
    on_retry=None,
    label: str = "request",
):
    """Decorator-style helper. Calls fn() and retries on transient errors.

    fn() must return either:
        (response_with_status, body)
      or raise an httpx/requests-like exception.
    """
    last_exc = None
    for attempt in range(max_retries):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            # Try to detect status code from common exception types
            status = getattr(exc, "response", None)
            status_code = getattr(status, "status_code", None)
            if status_code is None:
                status_code = getattr(exc, "status_code", None)
            retry_after = None
            if status is not None:
                retry_after = getattr(status, "headers", {}).get("Retry-After")
            # If status is 4xx (non-429), do not retry.
            if status_code is not None and not retryable_status(status_code):
                raise
            if attempt == max_retries - 1:
                break
            delay, reason = backoff_sleep(
                attempt, retry_after=retry_after, base=base_delay, max_delay=max_delay
            )
            if on_retry:
                try:
                    on_retry(attempt, exc, delay, reason)
                except Exception:  # noqa: BLE001
                    pass
            logger.warning(
                "[%s] retry %d/%d after %s (%.1fs): %s",
                label,
                attempt + 1,
                max_retries,
                reason,
                delay,
                exc,
            )
    raise BackoffError(f"{label} failed after {max_retries} attempts: {last_exc}")
