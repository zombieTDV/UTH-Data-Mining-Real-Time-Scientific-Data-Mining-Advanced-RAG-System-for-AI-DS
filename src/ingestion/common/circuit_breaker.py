"""Circuit breaker pattern.

Per Rule #17: 10 failures -> OPEN for 10 min, then try again.

States:
    CLOSED    -> requests pass through
    OPEN      -> requests fail fast (CircuitOpenError)
    HALF_OPEN -> one trial request; success -> CLOSED, failure -> OPEN
"""

import logging
import threading
import time
from enum import Enum
from typing import Callable, Optional

from src.config.settings import settings

logger = logging.getLogger(__name__)


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitOpenError(Exception):
    """Raised when the circuit is open and a call is attempted."""

    def __init__(self, name: str, retry_after: float):
        super().__init__(f"Circuit '{name}' is OPEN; retry after {retry_after:.1f}s")
        self.name = name
        self.retry_after = retry_after


class CircuitBreaker:
    """Single circuit breaker."""

    def __init__(
        self,
        name: str,
        failure_threshold: Optional[int] = None,
        cooldown_seconds: Optional[float] = None,
        on_state_change: Optional[Callable[[str, CircuitState, CircuitState], None]] = None,
    ):
        self.name = name
        self.failure_threshold = failure_threshold or settings.CRAWLER_CIRCUIT_BREAKER_THRESHOLD
        self.cooldown_seconds = float(
            cooldown_seconds if cooldown_seconds is not None else settings.CRAWLER_CIRCUIT_BREAKER_COOLDOWN
        )
        self.on_state_change = on_state_change

        self._state = CircuitState.CLOSED
        self._failures = 0
        self._opened_at: Optional[float] = None
        self._lock = threading.Lock()

    @property
    def state(self) -> CircuitState:
        with self._lock:
            return self._state

    def _set_state(self, new_state: CircuitState):
        with self._lock:
            if new_state == self._state:
                return
            old = self._state
            self._state = new_state
            if new_state == CircuitState.OPEN:
                self._opened_at = time.monotonic()
            elif new_state == CircuitState.CLOSED:
                self._failures = 0
                self._opened_at = None
            elif new_state == CircuitState.HALF_OPEN:
                self._opened_at = None
        if self.on_state_change:
            try:
                self.on_state_change(self.name, old, new_state)
            except Exception:  # noqa: BLE001
                pass
        logger.info("[CB %s] state %s -> %s", self.name, old.value, new_state.value)

    def _maybe_transition_to_half_open(self):
        """If cooldown elapsed, move OPEN -> HALF_OPEN."""
        with self._lock:
            if self._state == CircuitState.OPEN and self._opened_at is not None:
                elapsed = time.monotonic() - self._opened_at
                if elapsed >= self.cooldown_seconds:
                    new = CircuitState.HALF_OPEN
                else:
                    new = None
            else:
                new = None
        if new is not None:
            self._set_state(new)

    def allow_request(self) -> bool:
        """Return True if a request can be attempted now."""
        self._maybe_transition_to_half_open()
        with self._lock:
            return self._state in (CircuitState.CLOSED, CircuitState.HALF_OPEN)

    def call(self, fn: Callable, *args, **kwargs):
        """Run fn() if the circuit allows; otherwise raise CircuitOpenError."""
        if not self.allow_request():
            with self._lock:
                remaining = self.cooldown_seconds
                if self._opened_at is not None:
                    remaining = max(0.0, self.cooldown_seconds - (time.monotonic() - self._opened_at))
            raise CircuitOpenError(self.name, remaining)
        try:
            result = fn(*args, **kwargs)
        except Exception:
            self.record_failure()
            raise
        self.record_success()
        return result

    def record_success(self):
        with self._lock:
            was_half_open = self._state == CircuitState.HALF_OPEN
            self._failures = 0
        if was_half_open:
            self._set_state(CircuitState.CLOSED)

    def record_failure(self):
        with self._lock:
            self._failures += 1
            should_open = (
                self._state == CircuitState.HALF_OPEN
                or self._failures >= self.failure_threshold
            )
        if should_open:
            self._set_state(CircuitState.OPEN)

    def reset(self):
        self._set_state(CircuitState.CLOSED)


class CircuitBreakerRegistry:
    """Registry of named breakers, e.g., one per source domain."""

    _breakers: dict = {}
    _lock = threading.Lock()

    @classmethod
    def get(cls, name: str, **kwargs) -> CircuitBreaker:
        with cls._lock:
            if name not in cls._breakers:
                cls._breakers[name] = CircuitBreaker(name=name, **kwargs)
            return cls._breakers[name]

    @classmethod
    def all_states(cls) -> dict:
        with cls._lock:
            return {n: b.state.value for n, b in cls._breakers.items()}

    @classmethod
    def reset_all(cls):
        with cls._lock:
            for b in cls._breakers.values():
                b.reset()
