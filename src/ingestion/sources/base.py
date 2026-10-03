"""Abstract base class for conference source adapters.

Each adapter implements the 14-step pipeline from docs:
    0.  DEFINE SCOPE
    1.  SOURCE DISCOVERY
    2.  ACCESS STRATEGY
    3.  SCHEDULER + CHECKPOINT
    4.  REQUEST / FETCH
    5.  SAVE RAW IMMEDIATELY
    6.  VALIDATE RESPONSE
    7.  PARSE + NORMALIZE
    8.  DEDUPLICATE + VERSION CHECK
    9.  DOMAIN / QUALITY FILTER
    10. ENRICH IF NEEDED
    11. STORE CLEAN DATA
    12. COMMIT CHECKPOINT
    13. MONITOR + RETRY + RE-COLLECT

The adapter exposes a small surface:
    discover()           -> list of source IDs (e.g., "KDD:2024")
    fetch_metadata()     -> normalized paper dicts (Research-friendly schema)
    fetch_full_text()    -> optional; only when needed
    source_id            -> string identifying the source (e.g., "openalex")
    venue                -> KDD / ICML / ICLR / NeurIPS
    strategy             -> api | openreview | scrape
"""

import abc
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# Research-friendly normalized schema (kept narrow and stable).
REQUIRED_FIELDS = (
    "paper_id",
    "title",
    "abstract",
    "authors",
    "year",
    "venue",
    "source",
    "pdf_url",
    "doi",
    "keywords",
    "citation_count",
)


class BaseSourceAdapter(abc.ABC):
    """Base interface for all conference source adapters."""

    # Class-level identifiers
    source_id: str = "base"
    venue: str = ""
    strategy: str = "base"

    def __init__(self, year_from: int, year_to: int):
        self.year_from = year_from
        self.year_to = year_to

    # ----------------- Adapter surface -----------------

    @abc.abstractmethod
    def discover(self) -> List[str]:
        """Step 1: enumerate available (venue, year) combinations to harvest.

        Returns:
            List of identifiers like ["KDD:2024", "ICML:2023", ...].
        """
        raise NotImplementedError

    @abc.abstractmethod
    def fetch_metadata(self, target: str) -> List[Dict[str, Any]]:
        """Step 4-7: fetch + parse + normalize.

        Args:
            target: One element from discover() (e.g., "KDD:2024").

        Returns:
            List of normalized paper dicts (Research-friendly schema).
        """
        raise NotImplementedError

    # Optional: override if the source supports full-text download
    def fetch_full_text(self, paper: Dict[str, Any]) -> Optional[bytes]:
        """Step 10: optionally download the full text of a paper."""
        return None

    # ----------------- Helpers -----------------

    def validate(self, paper: Dict[str, Any]) -> bool:
        """Step 6 + 9: ensure required fields are present and within scope."""
        for field in REQUIRED_FIELDS:
            if field not in paper or paper[field] in (None, "", []):
                logger.debug("[%s] missing field %s in %s", self.source_id, field, paper.get("paper_id"))
                return False
        try:
            year = int(paper["year"])
        except (TypeError, ValueError):
            return False
        if year < self.year_from or year > self.year_to:
            return False
        return True

    def normalize_year(self, value: Any) -> Optional[int]:
        """Coerce a publication year to int, accepting int, str, or datetime-like."""
        if value is None:
            return None
        if isinstance(value, int):
            return value
        if isinstance(value, str):
            v = value.strip()
            if len(v) >= 4 and v[:4].isdigit():
                return int(v[:4])
            return None
        return None
