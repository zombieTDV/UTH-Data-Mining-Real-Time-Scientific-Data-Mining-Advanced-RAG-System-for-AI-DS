"""robots.txt and ToS policy checker.

Per Rule #2: Read robots.txt + ToS; do not crawl forbidden paths.
A small, conservative parser. Falls back to "allow" if robots.txt is missing
or unreachable, but records a warning.

Only used to gate HTML scraping paths. For official APIs (OpenAlex, OpenReview)
the policy is governed by their ToS, not robots.txt.
"""

import logging
import re
import threading
from typing import Dict, Optional, Tuple
from urllib.parse import urlsplit

import httpx

from src.ingestion.common.user_agent import build_default_headers

logger = logging.getLogger(__name__)


class RobotsPolicy:
    """Parse + cache robots.txt for one origin."""

    def __init__(self, origin: str, fetch_timeout: float = 5.0):
        self.origin = origin.rstrip("/")
        self.fetch_timeout = fetch_timeout
        self._groups: list = []  # list of dict(user_agents, allow, disallow)
        self._lock = threading.Lock()
        self._fetched = False

    @property
    def robots_url(self) -> str:
        return f"{self.origin}/robots.txt"

    def fetch(self, client: Optional[httpx.Client] = None) -> None:
        if self._fetched:
            return
        own_client = client is None
        client = client or httpx.Client(
            headers=build_default_headers("robots-checker"),
            timeout=self.fetch_timeout,
            follow_redirects=True,
        )
        try:
            resp = client.get(self.robots_url)
            if resp.status_code == 200:
                self._parse(resp.text)
            else:
                logger.info("[robots] %s returned %s; allow-by-default", self.robots_url, resp.status_code)
        except Exception as exc:  # noqa: BLE001
            logger.warning("[robots] failed to fetch %s: %s; allow-by-default", self.robots_url, exc)
        finally:
            if own_client:
                client.close()
            self._fetched = True

    def _parse(self, text: str) -> None:
        groups = []
        current: Optional[dict] = None
        wildcard = False
        for raw_line in text.splitlines():
            line = raw_line.split("#", 1)[0].strip()
            if not line:
                continue
            if line.lower().startswith("user-agent:"):
                agents = [line.split(":", 1)[1].strip()]
                if agents[0] == "*":
                    wildcard = True
                current = {"agents": agents, "allow": [], "disallow": []}
                groups.append(current)
            elif current is None:
                continue
            elif line.lower().startswith("allow:"):
                path = line.split(":", 1)[1].strip()
                current["allow"].append(path)
            elif line.lower().startswith("disallow:"):
                path = line.split(":", 1)[1].strip()
                current["disallow"].append(path)
        self._groups = groups
        self._wildcard = wildcard

    def is_allowed(self, path: str, user_agent: str = "UTH-AIDS-ResearchBot/2.0") -> bool:
        """Return True if the path is allowed for the given user agent.

        Per RFC 9309, the matching group is the most specific user-agent
        group, and within that group the longest matching rule wins (with
        Allow > Disallow on ties).
        """
        if not self._fetched:
            self.fetch()
        # Pick the most specific user-agent group
        chosen = None
        for g in self._groups:
            if user_agent in g["agents"]:
                chosen = g
                break
        if chosen is None:
            for g in self._groups:
                if "*" in g["agents"]:
                    chosen = g
                    break
        if chosen is None:
            return True

        best_len = -1
        best_decision = True  # default per spec when no rule matches
        for rule in chosen.get("allow", []):
            if rule and self._match(rule, path) and len(rule) > best_len:
                best_len = len(rule)
                best_decision = True
        for rule in chosen.get("disallow", []):
            if rule and self._match(rule, path) and len(rule) > best_len:
                best_len = len(rule)
                best_decision = False
            elif rule and self._match(rule, path) and len(rule) == best_len:
                # Tie: Allow wins.
                best_decision = True
        return best_decision

    @staticmethod
    def _match(rule: str, path: str) -> bool:
        # Convert glob-ish * to regex
        regex = re.escape(rule).replace(r"\*", ".*")
        return re.match(f"^{regex}", path) is not None


class RobotsRegistry:
    """Process-wide cache of RobotsPolicy objects keyed by origin."""

    _cache: Dict[str, RobotsPolicy] = {}
    _lock = threading.Lock()

    @classmethod
    def get(cls, origin: str) -> RobotsPolicy:
        with cls._lock:
            if origin not in cls._cache:
                cls._cache[origin] = RobotsPolicy(origin=origin)
            return cls._cache[origin]

    @classmethod
    def is_allowed(cls, url: str) -> bool:
        parts = urlsplit(url)
        origin = f"{parts.scheme}://{parts.netloc}"
        policy = cls.get(origin)
        return policy.is_allowed(parts.path or "/")
