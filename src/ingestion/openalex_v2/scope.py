"""OpenAlex crawl scope data model (V2).

This module defines the canonical representation of one OpenAlex crawl
scope. It is intentionally pure-data: no I/O, no network, no logging.
The module only validates that a scope is well-formed and exposes a
deterministic JSON shape that downstream layers (filter builder,
fingerprint) consume.
"""

from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass, field, asdict
from typing import Iterable, Tuple


_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_SCOPE_MODE_BACKFILL = "backfill"
_SCOPE_MODE_SYNC = "sync"
_SCOPE_MODES = (_SCOPE_MODE_BACKFILL, _SCOPE_MODE_SYNC)

_SUBFIELD_MODE_ANY_TOPIC = "any_topic"
_SUBFIELD_MODE_PRIMARY_TOPIC = "primary_topic"
_SUBFIELD_MODES = (_SUBFIELD_MODE_ANY_TOPIC, _SUBFIELD_MODE_PRIMARY_TOPIC)


def _parse_iso_date(value: str, *, field_name: str) -> dt.date:
    if not isinstance(value, str) or not _DATE_RE.match(value):
        raise ValueError(f"{field_name} must be in YYYY-MM-DD format: {value!r}")
    try:
        return dt.date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"{field_name} is not a valid calendar date: {value!r}") from exc


def _normalise_subfields(subfield_ids: Iterable[str]) -> Tuple[str, ...]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in subfield_ids:
        token = str(raw).strip()
        if not token:
            continue
        if token in seen:
            continue
        seen.add(token)
        cleaned.append(token)
    if not cleaned:
        raise ValueError("At least one OpenAlex subfield ID is required")
    return tuple(cleaned)


def _validate_subfield_mode(subfield_mode: str) -> str:
    if subfield_mode not in _SUBFIELD_MODES:
        raise ValueError(
            f"subfield_mode must be one of {_SUBFIELD_MODES}, got {subfield_mode!r}"
        )
    return subfield_mode


def _validate_mode(mode: str) -> str:
    if mode not in _SCOPE_MODES:
        raise ValueError(
            f"mode must be one of {_SCOPE_MODES}, got {mode!r}"
        )
    return mode


def _validate_per_page(per_page: int) -> int:
    if per_page < 1 or per_page > 200:
        raise ValueError(
            f"per_page must be between 1 and 200, got {per_page}"
        )
    return per_page


@dataclass(frozen=True)
class OpenAlexScope:
    mode: str
    start_date: str
    end_date: str
    subfield_ids: Tuple[str, ...]
    subfield_mode: str = _SUBFIELD_MODE_ANY_TOPIC
    per_page: int = 100
    entity: str = "works"

    def __post_init__(self) -> None:
        _validate_mode(self.mode)
        start = _parse_iso_date(self.start_date, field_name="start_date")
        end = _parse_iso_date(self.end_date, field_name="end_date")
        if start > end:
            raise ValueError(
                f"start_date must be <= end_date ({self.start_date} > {self.end_date})"
            )
        _validate_subfield_mode(self.subfield_mode)
        _validate_per_page(self.per_page)
        object.__setattr__(self, "subfield_ids", _normalise_subfields(self.subfield_ids))

    @property
    def date_range_days(self) -> int:
        start = dt.date.fromisoformat(self.start_date)
        end = dt.date.fromisoformat(self.end_date)
        return (end - start).days + 1

    def covers_single_day(self) -> bool:
        return self.start_date == self.end_date

    def to_canonical_dict(self) -> dict:
        payload = asdict(self)
        payload["subfield_ids"] = sorted(payload["subfield_ids"])
        return payload

    @classmethod
    def from_years(
        cls,
        years: Iterable[int],
        *,
        subfield_ids: Iterable[str],
        subfield_mode: str = _SUBFIELD_MODE_ANY_TOPIC,
        per_page: int = 100,
    ) -> "OpenAlexScope":
        normalised: list[int] = sorted({int(year) for year in years})
        if not normalised:
            raise ValueError("At least one year is required")
        start = f"{normalised[0]:04d}-01-01"
        end = f"{normalised[-1]:04d}-12-31"
        return cls(
            mode=_SCOPE_MODE_BACKFILL,
            start_date=start,
            end_date=end,
            subfield_ids=_normalise_subfields(subfield_ids),
            subfield_mode=subfield_mode,
            per_page=per_page,
        )

    @classmethod
    def from_single_date(
        cls,
        date: str,
        *,
        subfield_ids: Iterable[str],
        subfield_mode: str = _SUBFIELD_MODE_ANY_TOPIC,
        per_page: int = 100,
    ) -> "OpenAlexScope":
        parsed = _parse_iso_date(date, field_name="date")
        return cls(
            mode=_SCOPE_MODE_BACKFILL,
            start_date=parsed.isoformat(),
            end_date=parsed.isoformat(),
            subfield_ids=_normalise_subfields(subfield_ids),
            subfield_mode=subfield_mode,
            per_page=per_page,
        )

    @classmethod
    def from_date_range(
        cls,
        start_date: str,
        end_date: str,
        *,
        subfield_ids: Iterable[str],
        subfield_mode: str = _SUBFIELD_MODE_ANY_TOPIC,
        per_page: int = 100,
    ) -> "OpenAlexScope":
        return cls(
            mode=_SCOPE_MODE_BACKFILL,
            start_date=start_date,
            end_date=end_date,
            subfield_ids=_normalise_subfields(subfield_ids),
            subfield_mode=subfield_mode,
            per_page=per_page,
        )


SCOPE_MODE_BACKFILL = _SCOPE_MODE_BACKFILL
SCOPE_MODE_SYNC = _SCOPE_MODE_SYNC
SUBFIELD_MODE_ANY_TOPIC = _SUBFIELD_MODE_ANY_TOPIC
SUBFIELD_MODE_PRIMARY_TOPIC = _SUBFIELD_MODE_PRIMARY_TOPIC
