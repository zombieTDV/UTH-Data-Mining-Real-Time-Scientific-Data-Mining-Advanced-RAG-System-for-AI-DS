"""Unit tests for src.ingestion.common modules.

These tests run offline (no network) and exercise the engineering rules
documented in the project constitution:

    - jitter / backoff
    - rate limiter (per-domain)
    - circuit breaker
    - checkpoint (atomic)
    - adaptive throttle
    - robots parser
    - dead letter queue
    - http client cache
"""

import json
import time
from pathlib import Path

import pytest


# --------------------- jitter ---------------------

def test_compute_delay_zero_base_returns_zero():
    from src.ingestion.common.jitter import compute_delay
    assert compute_delay(0) == 0.0
    assert compute_delay(-1) == 0.0


def test_compute_delay_within_jitter_band():
    from src.ingestion.common.jitter import compute_delay
    base = 1.0
    jitter = 0.3
    for _ in range(200):
        d = compute_delay(base, jitter=jitter)
        # Allowed range: 0.7 .. 1.3
        assert 0.7 <= d <= 1.3


def test_interval_from_rps():
    from src.ingestion.common.jitter import interval_from_rps
    assert interval_from_rps(10) == 0.1
    assert interval_from_rps(0) == 0.0
    assert interval_from_rps(-1) == 0.0


# --------------------- backoff ---------------------

def test_parse_retry_after_integer():
    from src.ingestion.common.backoff import parse_retry_after
    assert parse_retry_after("60") == 60.0
    assert parse_retry_after("  120  ") == 120.0


def test_parse_retry_after_empty_or_none():
    from src.ingestion.common.backoff import parse_retry_after
    assert parse_retry_after(None) is None
    assert parse_retry_after("") is None
    assert parse_retry_after("garbage") is None


def test_compute_backoff_grows_and_caps():
    from src.ingestion.common.backoff import compute_backoff
    assert compute_backoff(0, base=2.0, factor=2.0, max_delay=60.0, jitter=0) == 2.0
    assert compute_backoff(1, base=2.0, factor=2.0, max_delay=60.0, jitter=0) == 4.0
    assert compute_backoff(10, base=2.0, factor=2.0, max_delay=60.0, jitter=0) == 60.0
    assert compute_backoff(-5, base=2.0, factor=2.0, max_delay=60.0, jitter=0) == 2.0


def test_is_retryable_status():
    from src.ingestion.common.backoff import is_retryable_status
    assert is_retryable_status(429) is True
    assert is_retryable_status(503) is True
    assert is_retryable_status(500) is True
    assert is_retryable_status(408) is True
    assert is_retryable_status(404) is False
    assert is_retryable_status(200) is False
    assert is_retryable_status(401) is False


# --------------------- rate limiter ---------------------

def test_token_bucket_no_rate_returns_immediately():
    from src.ingestion.common.rate_limiter import TokenBucket
    bucket = TokenBucket(rps=0)
    assert bucket.acquire(timeout=1) is True
    assert bucket.acquire(timeout=1) is True


def test_token_bucket_blocks_under_burst():
    from src.ingestion.common.rate_limiter import TokenBucket
    bucket = TokenBucket(rps=10, capacity=1)  # burst = 1
    # First request passes immediately
    assert bucket.acquire(timeout=0.1) is True
    # Second request must wait ~0.1s; timeout=0 should fail
    assert bucket.acquire(timeout=0) is False


def test_domain_rate_limiter_configure_and_acquire():
    from src.ingestion.common.rate_limiter import DomainRateLimiter
    lim = DomainRateLimiter.get("test-domain", default_rps=100)
    lim.configure("test-domain", rps=100)
    assert lim.acquire("test-domain", timeout=1) is True
    snap = lim.snapshot()
    assert "test-domain" in snap


# --------------------- circuit breaker ---------------------

def test_circuit_opens_after_threshold():
    from src.ingestion.common.circuit_breaker import CircuitBreaker, CircuitOpenError
    cb = CircuitBreaker(name="t", failure_threshold=3, cooldown_seconds=60)
    for _ in range(3):
        with pytest.raises(RuntimeError):
            cb.call(lambda: (_ for _ in ()).throw(RuntimeError("boom")))
    assert cb.state.value == "open"
    with pytest.raises(CircuitOpenError):
        cb.call(lambda: 1)


def test_circuit_half_open_then_closed():
    from src.ingestion.common.circuit_breaker import CircuitBreaker
    cb = CircuitBreaker(name="t2", failure_threshold=2, cooldown_seconds=0.0)
    for _ in range(2):
        try:
            cb.call(lambda: (_ for _ in ()).throw(RuntimeError("x")))
        except Exception:
            pass
    # cooldown=0 -> allow_request moves to HALF_OPEN
    assert cb.allow_request() is True
    cb.record_success()
    assert cb.state.value == "closed"


# --------------------- checkpoint ---------------------

def test_checkpoint_atomic_save_load(tmp_path: Path):
    from src.ingestion.common.checkpoint import CheckpointStore
    store = CheckpointStore(tmp_path / "ck.json")
    assert store.load() == {}
    store.save({"foo": "bar", "n": 1})
    state = store.load()
    assert state["foo"] == "bar"
    assert "last_updated" in state


def test_checkpoint_merge_update(tmp_path: Path):
    from src.ingestion.common.checkpoint import CheckpointStore
    store = CheckpointStore(tmp_path / "ck.json")
    state = store.merge_update({"a": 1})
    state = store.merge_update({"b": 2})
    assert state == {**state, "a": 1, "b": 2} and state["a"] == 1 and state["b"] == 2


# --------------------- adaptive throttle ---------------------

def test_adaptive_throttle_factor_default_one():
    from src.ingestion.common.adaptive_throttle import AdaptiveThrottle
    at = AdaptiveThrottle()
    assert at.factor() == 1.0
    snap = at.snapshot()
    assert snap["factor"] == 1.0
    assert snap["samples"] == 0


def test_adaptive_throttle_drops_on_errors():
    from src.ingestion.common.adaptive_throttle import AdaptiveThrottle
    at = AdaptiveThrottle()
    for _ in range(50):
        at.record(latency=4.0, error=True)
    f = at.factor()
    assert f < 1.0
    assert f >= 0.25


# --------------------- robots parser ---------------------

def test_robots_parser_allows_and_disallows():
    from src.ingestion.common.robots_checker import RobotsPolicy
    p = RobotsPolicy(origin="https://example.com")
    p._parse(
        "\n".join(
            [
                "User-Agent: *",
                "Disallow: /private/",
                "Allow: /private/public/",
            ]
        )
    )
    p._fetched = True
    # The default UA is not "BadBot", so the * group applies.
    assert p.is_allowed("/index") is True
    assert p.is_allowed("/private/x") is False
    assert p.is_allowed("/private/public/y") is True


# --------------------- dead-letter queue ---------------------

def test_dlq_push_and_read(tmp_path: Path):
    from src.ingestion.common.dead_letter import DeadLetterQueue
    dlq = DeadLetterQueue(base_dir=tmp_path / "dlq")
    dlq.push("openalex", "KDD:2024", {"foo": 1}, "boom", attempts=5)
    rows = dlq.read_day("openalex", time.strftime("%Y-%m-%d"))
    assert len(rows) == 1
    assert rows[0]["error"] == "boom"
    assert rows[0]["attempts"] == 5


# --------------------- http cache ---------------------

def test_http_cache_put_get_clear():
    from src.ingestion.common.http_client import HttpCache
    c = HttpCache()
    c.put("https://x/y", etag="abc", last_modified="now")
    e = c.get("https://x/y")
    assert e["etag"] == "abc"
    c.clear()
    assert c.get("https://x/y") == {}


# --------------------- content_hash ---------------------

def test_content_hash_dedup_key_stable():
    from src.ingestion.common.content_hash import compute_sha256
    p1 = {"title": "A", "abstract": "X", "year": 2024}
    p2 = {"title": "a", "abstract": "x", "year": "2024"}
    p3 = {"title": "B", "abstract": "X", "year": 2024}
    # Re-implement the dedup key to verify stability across case/format
    def key(p):
        t = (p.get("title") or "").lower().strip()
        a = (p.get("abstract") or "").lower().strip()
        y = p.get("year") or ""
        return compute_sha256(f"{t}|{a}|{y}")
    assert key(p1) == key(p2)
    assert key(p1) != key(p3)
