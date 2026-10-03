"""Per-domain rate limiter (token-bucket).

Per Rule #3: Each domain has its own RateLimiter.
Per Rule #10: Low concurrency + rate limit = predictable load.

A token-bucket model:
  - Bucket has capacity = burst size.
  - Tokens refill at rate = rps tokens/second.
  - acquire(n=1) blocks until n tokens are available.

When rps <= 0, the limiter is a no-op (no rate limiting).
"""

import threading
import time
from collections import defaultdict
from typing import Dict, Optional

from src.ingestion.common.jitter import compute_delay, sleep_jittered


class TokenBucket:
    """Single token-bucket for one domain."""

    def __init__(self, rps: float, capacity: Optional[float] = None):
        if rps <= 0:
            self.rps = 0.0
            self.capacity = 0.0
            self.tokens = 0.0
            self.last_refill = time.monotonic()
            self.lock = threading.Lock()
            return
        self.rps = float(rps)
        # Allow burst up to max(1, 2 * rps) by default, so legitimate bursts are OK.
        self.capacity = float(capacity if capacity is not None else max(1.0, self.rps))
        self.tokens = self.capacity
        self.last_refill = time.monotonic()
        self.lock = threading.Lock()

    def _refill(self):
        now = time.monotonic()
        elapsed = now - self.last_refill
        if elapsed <= 0:
            return
        self.tokens = min(self.capacity, self.tokens + elapsed * self.rps)
        self.last_refill = now

    def acquire(self, tokens: float = 1.0, timeout: Optional[float] = None) -> bool:
        """Acquire tokens. Blocks until available or timeout (None = forever).

        Returns True if acquired, False if timed out.
        """
        if self.rps <= 0:
            return True
        deadline = None if timeout is None else time.monotonic() + timeout
        while True:
            with self.lock:
                self._refill()
                if self.tokens >= tokens:
                    self.tokens -= tokens
                    return True
                # Compute wait time until enough tokens
                needed = tokens - self.tokens
                wait = needed / self.rps
            if deadline is not None and time.monotonic() + wait > deadline:
                return False
            # Sleep a fraction, then re-check
            time.sleep(min(wait, 0.5))


class DomainRateLimiter:
    """Manages one token-bucket per domain (per Rule #3)."""

    _registry: Dict[str, "DomainRateLimiter"] = {}
    _registry_lock = threading.Lock()

    def __init__(self, default_rps: float = 1.0):
        self.default_rps = default_rps
        self.buckets: Dict[str, TokenBucket] = {}
        self.lock = threading.Lock()

    @classmethod
    def get(cls, name: str = "default", default_rps: float = 1.0) -> "DomainRateLimiter":
        """Get or create a named rate limiter (singleton per name)."""
        with cls._registry_lock:
            if name not in cls._registry:
                cls._registry[name] = cls(default_rps=default_rps)
            return cls._registry[name]

    def configure(self, domain: str, rps: float, capacity: Optional[float] = None):
        """Configure a per-domain bucket."""
        with self.lock:
            self.buckets[domain] = TokenBucket(rps=rps, capacity=capacity)

    def acquire(self, domain: str, tokens: float = 1.0, timeout: Optional[float] = None) -> bool:
        """Acquire tokens for a domain. If unconfigured, falls back to default."""
        with self.lock:
            bucket = self.buckets.get(domain)
        if bucket is None:
            bucket = TokenBucket(rps=self.default_rps)
        return bucket.acquire(tokens=tokens, timeout=timeout)

    def wait_for(self, domain: str, tokens: float = 1.0) -> None:
        """Block until tokens are available for the domain."""
        self.acquire(domain, tokens=tokens, timeout=None)

    def sleep_jittered(self, base_seconds: float) -> float:
        """Sleep a jittered delay (per Rule #4)."""
        return sleep_jittered(base_seconds)

    def snapshot(self) -> Dict[str, Dict[str, float]]:
        """Return current bucket state for monitoring."""
        with self.lock:
            out = {}
            for d, b in self.buckets.items():
                with b.lock:
                    b._refill()
                    out[d] = {
                        "rps": b.rps,
                        "capacity": b.capacity,
                        "tokens": b.tokens,
                    }
            return out


# Domain-specific default rate limiters (lazy-created)
def get_rate_limiter_for_domain(domain: str) -> DomainRateLimiter:
    """Convenience: get the shared per-domain limiter, auto-configured from settings."""
    from src.config.settings import settings

    mapping = {
        "api.openalex.org": settings.OPENALEX_RATE_LIMIT_RPS,
        "api.openreview.net": settings.OPENREVIEW_RATE_LIMIT_RPS,
        "api.semanticscholar.org": 1.0,  # free tier
        "www.kdd.org": settings.KDD_RATE_LIMIT_RPS,
        "dl.acm.org": settings.KDD_RATE_LIMIT_RPS,
        "icml.cc": settings.ICML_RATE_LIMIT_RPS,
        "proceedings.mlr.press": settings.ICML_RATE_LIMIT_RPS,
        "iclr.cc": settings.ICLR_RATE_LIMIT_RPS,
        "openreview.net": settings.ICLR_RATE_LIMIT_RPS,
        "neurips.cc": settings.NEURIPS_RATE_LIMIT_RPS,
        "papers.nips.cc": settings.NEURIPS_RATE_LIMIT_RPS,
        "proceedings.neurips.cc": settings.NEURIPS_RATE_LIMIT_RPS,
    }
    rps = mapping.get(domain, 1.0)
    limiter = DomainRateLimiter.get(name=domain, default_rps=rps)
    limiter.configure(domain=domain, rps=rps)
    return limiter
