"""Adaptive throttle: monitor latency / error rate and adjust concurrency.

Per Rule #15: When latency goes up or error rate goes up, decrease concurrency
              and increase delay. When things are healthy, slowly relax.
"""

import logging
import statistics
import threading
import time
from collections import deque
from typing import Deque, Optional

logger = logging.getLogger(__name__)


class AdaptiveThrottle:
    """Sliding-window monitor of latency and error rate per source.

    Outputs a throttle_factor in (0, 1] that downstream code multiplies into
    the inter-request delay. factor=1.0 = no throttling, factor=0.5 = 2x slower.
    """

    def __init__(
        self,
        window_size: int = 50,
        healthy_latency_p95: float = 1.0,
        unhealthy_latency_p95: float = 3.0,
        healthy_error_rate: float = 0.01,
        unhealthy_error_rate: float = 0.10,
    ):
        self.window_size = window_size
        self.healthy_latency_p95 = healthy_latency_p95
        self.unhealthy_latency_p95 = unhealthy_latency_p95
        self.healthy_error_rate = healthy_error_rate
        self.unhealthy_error_rate = unhealthy_error_rate
        self._samples: Deque[float] = deque(maxlen=window_size)
        self._errors: Deque[int] = deque(maxlen=window_size)
        self._lock = threading.Lock()

    def record(self, latency: float, error: bool):
        with self._lock:
            self._samples.append(latency)
            self._errors.append(1 if error else 0)

    def _percentile(self, values, p: float) -> float:
        if not values:
            return 0.0
        s = sorted(values)
        idx = max(0, min(len(s) - 1, int(round(p * (len(s) - 1)))))
        return s[idx]

    def factor(self) -> float:
        """Return a throttle factor in (0, 1]. Lower means back off more."""
        with self._lock:
            samples = list(self._samples)
            errors = list(self._errors)
        if len(samples) < 5:
            return 1.0
        p95 = self._percentile(samples, 0.95)
        err_rate = (sum(errors) / len(errors)) if errors else 0.0

        # Map latency and error rate into [0, 1] pressure.
        latency_pressure = max(
            0.0,
            min(1.0, (p95 - self.healthy_latency_p95) / max(0.001, self.unhealthy_latency_p95 - self.healthy_latency_p95)),
        )
        error_pressure = max(
            0.0,
            min(1.0, (err_rate - self.healthy_error_rate) / max(0.001, self.unhealthy_error_rate - self.healthy_error_rate)),
        )
        pressure = max(latency_pressure, error_pressure)
        # factor: 1.0 when pressure=0, 0.25 when pressure=1
        factor = 1.0 - 0.75 * pressure
        return max(0.25, min(1.0, factor))

    def snapshot(self) -> dict:
        with self._lock:
            samples = list(self._samples)
            errors = list(self._errors)
        p95 = self._percentile(samples, 0.95) if samples else 0.0
        err_rate = (sum(errors) / len(errors)) if errors else 0.0
        return {
            "samples": len(samples),
            "p95_latency": p95,
            "error_rate": err_rate,
            "factor": self.factor(),
        }
