"""Transparent User-Agent for the UTH conference crawler.

A clear, identifiable UA is preferred over fake browser fingerprints.
Per Rule #11: identifies the project, version, and contact email.
"""

from src.config.settings import settings

DEFAULT_BOT_NAME = "UTH-AIDS-ResearchBot"
DEFAULT_BOT_VERSION = "2.0"
DEFAULT_CONTACT_EMAIL = "data-mining@uth.edu.vn"


def build_user_agent(component: str = "crawler") -> str:
    """Build a transparent User-Agent string.

    Format: UTH-AIDS-ResearchBot/2.0 (component; contact: data-mining@uth.edu.vn)
    """
    contact = settings.OPENALEX_EMAIL or DEFAULT_CONTACT_EMAIL
    return f"{DEFAULT_BOT_NAME}/{DEFAULT_BOT_VERSION} ({component}; contact: {contact})"


def build_default_headers(component: str = "crawler") -> dict:
    """Build default HTTP headers for outgoing requests."""
    return {
        "User-Agent": build_user_agent(component),
        "Accept": "application/json, text/html;q=0.9, */*;q=0.5",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate",
        "DNT": "1",
    }
