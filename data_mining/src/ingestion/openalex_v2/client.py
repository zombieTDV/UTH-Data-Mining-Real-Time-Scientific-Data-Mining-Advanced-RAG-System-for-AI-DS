"""Shared HTTP client factory for the OpenAlex V2 pipeline.

A single long-lived httpx.Client is constructed per collector run
(plan section 3.9). Connection pooling, keep-alive, and timeout
defaults are configured here. The module does NOT know about
rate-limit headers, retries, or cursor invariants - those live in
rate_limit.py, retry.py, and cursor_invariant.py respectively.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Optional

import httpx


DEFAULT_USER_AGENT = "UTH-Scientific-DataMining-OpenAlexCollector/2.0"
DEFAULT_CONNECT_TIMEOUT_SECONDS = 10.0
DEFAULT_READ_TIMEOUT_SECONDS = 60.0
DEFAULT_WRITE_TIMEOUT_SECONDS = 30.0
DEFAULT_POOL_TIMEOUT_SECONDS = 10.0
DEFAULT_MAX_KEEPALIVE_CONNECTIONS = 16
DEFAULT_MAX_CONNECTIONS = 32


@dataclass(frozen=True)
class TimeoutConfig:
    connect: float = DEFAULT_CONNECT_TIMEOUT_SECONDS
    read: float = DEFAULT_READ_TIMEOUT_SECONDS
    write: float = DEFAULT_WRITE_TIMEOUT_SECONDS
    pool: float = DEFAULT_POOL_TIMEOUT_SECONDS

    def to_httpx(self) -> httpx.Timeout:
        return httpx.Timeout(
            connect=self.connect,
            read=self.read,
            write=self.write,
            pool=self.pool,
        )


@dataclass(frozen=True)
class ConnectionPoolConfig:
    max_keepalive_connections: int = DEFAULT_MAX_KEEPALIVE_CONNECTIONS
    max_connections: int = DEFAULT_MAX_CONNECTIONS
    keepalive_expiry: float = 30.0

    def to_httpx_limits(self) -> httpx.Limits:
        return httpx.Limits(
            max_keepalive_connections=self.max_keepalive_connections,
            max_connections=self.max_connections,
            keepalive_expiry=self.keepalive_expiry,
        )


def build_request_headers(
    api_key: str,
    *,
    user_agent: str = DEFAULT_USER_AGENT,
    extra: Optional[Mapping[str, str]] = None,
) -> dict[str, str]:
    if not api_key or not api_key.strip():
        raise ValueError("OPENALEX_API_KEY is required")
    headers = {
        "Authorization": "Bearer " + api_key.strip(),
        "Accept": "application/json",
        "User-Agent": user_agent,
    }
    if extra:
        for key, value in extra.items():
            headers[key] = value
    return headers


def build_http_client(
    *,
    timeout: Optional[TimeoutConfig] = None,
    pool: Optional[ConnectionPoolConfig] = None,
    follow_redirects: bool = True,
) -> httpx.Client:
    timeout = timeout or TimeoutConfig()
    pool = pool or ConnectionPoolConfig()
    return httpx.Client(
        timeout=timeout.to_httpx(),
        limits=pool.to_httpx_limits(),
        follow_redirects=follow_redirects,
        headers={"User-Agent": DEFAULT_USER_AGENT},
    )
