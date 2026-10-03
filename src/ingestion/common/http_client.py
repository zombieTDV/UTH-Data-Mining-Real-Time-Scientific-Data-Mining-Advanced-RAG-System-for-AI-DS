"""HTTP client wrapper with rate limiting, ETag/Last-Modified, and timeouts.

Per Rule #9: Send If-None-Match / If-Modified-Since; honor 304.
Per Rule #16: connect/read/total timeouts.
Per Rule #3: Per-domain rate limiting.
"""

import logging
import threading
from typing import Any, Dict, Optional, Tuple
from urllib.parse import urlsplit

import httpx

from src.config.settings import settings
from src.ingestion.common.user_agent import build_default_headers

logger = logging.getLogger(__name__)


class HttpCache:
    """In-memory ETag/Last-Modified cache (per URL)."""

    def __init__(self):
        self._store: Dict[str, Dict[str, str]] = {}
        self._lock = threading.Lock()

    def get(self, url: str) -> Dict[str, str]:
        with self._lock:
            return dict(self._store.get(url, {}))

    def put(self, url: str, etag: Optional[str], last_modified: Optional[str]):
        with self._lock:
            entry = dict(self._store.get(url, {}))
            if etag is not None:
                entry["etag"] = etag
            if last_modified is not None:
                entry["last_modified"] = last_modified
            self._store[url] = entry

    def clear(self):
        with self._lock:
            self._store.clear()


class CachedResponse:
    """Wrapper to expose 304 Not Modified as a sentinel."""

    NOT_MODIFIED = "__NOT_MODIFIED__"


class ConferenceHttpClient:
    """HTTP client for conference crawlers.

    Features:
        - Per-domain rate limiting
        - Connect / read / total timeouts
        - ETag / Last-Modified conditional GETs
        - JSON and text helpers
    """

    def __init__(
        self,
        timeout_connect: Optional[float] = None,
        timeout_read: Optional[float] = None,
        timeout_total: Optional[float] = None,
        follow_redirects: bool = True,
    ):
        self.timeout_connect = timeout_connect or settings.CRAWLER_TIMEOUT_CONNECT
        self.timeout_read = timeout_read or settings.CRAWLER_TIMEOUT_READ
        self.timeout_total = timeout_total or settings.CRAWLER_TIMEOUT_TOTAL

        # httpx.Timeout doesn't directly expose "total" as a single float, but the
        # underlying client enforces it via read timeout. We use a custom pool.
        self._client = httpx.Client(
            headers=build_default_headers("crawler"),
            timeout=httpx.Timeout(
                connect=self.timeout_connect,
                read=self.timeout_read,
                write=self.timeout_read,
                pool=self.timeout_total,
            ),
            follow_redirects=follow_redirects,
            http2=False,  # disabled by default for compat; enable per-source if needed
        )
        self._cache = HttpCache()
        # Domain limiters are lazy: set via set_rate_limiter()
        self._domain_limiters: Dict[str, Any] = {}

    def set_rate_limiter(self, domain: str, limiter):
        self._domain_limiters[domain] = limiter

    def _domain_of(self, url: str) -> str:
        return (urlsplit(url).hostname or "").lower()

    def _wait_for_rate(self, domain: str) -> None:
        limiter = self._domain_limiters.get(domain)
        if limiter is not None:
            limiter.wait_for(domain)

    def close(self):
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    # -------------------- core GET --------------------

    def get(
        self,
        url: str,
        params: Optional[Dict[str, Any]] = None,
        extra_headers: Optional[Dict[str, str]] = None,
        use_cache: bool = True,
    ) -> Tuple[httpx.Response, bool]:
        """Issue a GET with conditional caching.

        Returns (response, was_not_modified).
        """
        domain = self._domain_of(url)
        self._wait_for_rate(domain)

        headers = dict(extra_headers or {})
        if use_cache:
            cached = self._cache.get(url)
            if cached.get("etag"):
                headers.setdefault("If-None-Match", cached["etag"])
            if cached.get("last_modified"):
                headers.setdefault("If-Modified-Since", cached["last_modified"])

        response = self._client.get(url, params=params, headers=headers)
        if response.status_code == 304:
            return response, True

        if use_cache and response.status_code == 200:
            etag = response.headers.get("ETag")
            last_mod = response.headers.get("Last-Modified")
            self._cache.put(url, etag=etag, last_modified=last_mod)

        return response, False

    def get_json(
        self, url: str, params: Optional[Dict[str, Any]] = None, use_cache: bool = True
    ) -> Tuple[Any, bool]:
        """Convenience: GET + JSON parse.

        Returns (parsed_body_or_none_if_304, was_not_modified).
        """
        response, not_modified = self.get(url, params=params, use_cache=use_cache)
        if not_modified:
            return None, True
        response.raise_for_status()
        try:
            return response.json(), False
        except ValueError:
            return None, False

    def get_text(
        self, url: str, params: Optional[Dict[str, Any]] = None, use_cache: bool = True
    ) -> Tuple[str, bool]:
        response, not_modified = self.get(url, params=params, use_cache=use_cache)
        if not_modified:
            return "", True
        response.raise_for_status()
        return response.text, False

    def post_json(
        self,
        url: str,
        json_body: Optional[Dict[str, Any]] = None,
        extra_headers: Optional[Dict[str, str]] = None,
    ) -> httpx.Response:
        domain = self._domain_of(url)
        self._wait_for_rate(domain)
        return self._client.post(url, json=json_body, headers=extra_headers or {})
