"""Jittered delay calculation.

Per Rule #4: delay = base * (1 + random.uniform(-jitter, +jitter))
Jitter reduces burst synchronization but is NOT for impersonating humans.
"""

import random
import time
from typing import Optional

from src.config.settings import settings


def compute_delay(base_seconds: float, jitter: Optional[float] = None) -> float:
    """Compute a jittered delay.

    Args:
        base_seconds: Nominal delay (e.g., 1.0 / rps).
        jitter: Jitter ratio in [0, 1]. If None, uses settings.RATE_LIMIT_JITTER.

    Returns:
        Adjusted delay in seconds (>= 0).
    """
    if base_seconds <= 0:
        return 0.0
    ratio = settings.RATE_LIMIT_JITTER if jitter is None else max(0.0, min(1.0, jitter))
    multiplier = 1.0 + random.uniform(-ratio, ratio)
    return max(0.0, base_seconds * multiplier)


def sleep_jittered(base_seconds: float, jitter: Optional[float] = None) -> float:
    """Sleep for a jittered delay. Returns the actual time slept."""
    delay = compute_delay(base_seconds, jitter)
    if delay > 0:
        time.sleep(delay)
    return delay


def interval_from_rps(rps: float) -> float:
    """Convert requests-per-second to inter-request interval (seconds)."""
    if rps <= 0:
        return 0.0
    return 1.0 / rps
