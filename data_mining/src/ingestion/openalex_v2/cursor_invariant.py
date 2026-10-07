"""Cursor invariant state machine for OpenAlex pagination (V2).

The plan (Section 3.2 and Section 12) requires that the collector
never silently mark a scope complete when the response shape is
anomalous. This module classifies a (results, current_cursor,
next_cursor) triple into a verdict:

  - TERMINAL_OK    results == [] AND next_cursor is None
  - CONTINUE       results != [] AND next_cursor is not None
                   AND next_cursor != current_cursor
  - INVARIANT_ERROR  any other combination

INVARIANT_ERROR is never collapsed into a successful terminal.
The caller is expected to raise an OpenAlexCursorInvariantError
when the verdict is INVARIANT_ERROR.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Iterable, List, Optional


class CursorVerdict(str, Enum):
    TERMINAL_OK = "TERMINAL_OK"
    CONTINUE = "CONTINUE"
    INVARIANT_ERROR = "INVARIANT_ERROR"


class OpenAlexCursorInvariantError(RuntimeError):
    pass


@dataclass(frozen=True)
class CursorContext:
    current_cursor: Optional[str]
    next_cursor: Optional[str]
    result_count: int


def classify_cursor(context: CursorContext) -> CursorVerdict:
    current = context.current_cursor
    nxt = context.next_cursor
    count = context.result_count

    if count == 0 and nxt is None:
        return CursorVerdict.TERMINAL_OK

    if count == 0 and nxt is not None:
        return CursorVerdict.INVARIANT_ERROR

    if count > 0 and nxt is None:
        return CursorVerdict.INVARIANT_ERROR

    if nxt == current:
        return CursorVerdict.INVARIANT_ERROR

    return CursorVerdict.CONTINUE


def assert_cursor_invariant(
    results: Iterable[object],
    *,
    current_cursor: Optional[str],
    next_cursor: Optional[str],
) -> CursorVerdict:
    count = sum(1 for _ in results)
    verdict = classify_cursor(
        CursorContext(
            current_cursor=current_cursor,
            next_cursor=next_cursor,
            result_count=count,
        )
    )
    if verdict is CursorVerdict.INVARIANT_ERROR:
        raise OpenAlexCursorInvariantError(
            "OpenAlex cursor invariant violated: "
            f"current={current_cursor!r}, next={next_cursor!r}, count={count}"
        )
    return verdict


def extract_results(payload: object) -> List[dict]:
    if not isinstance(payload, dict):
        raise OpenAlexCursorInvariantError("OpenAlex payload is not a dict")
    results = payload.get("results")
    if not isinstance(results, list):
        raise OpenAlexCursorInvariantError("OpenAlex payload.results is not a list")
    return [item for item in results if isinstance(item, dict)]


def extract_next_cursor(payload: object) -> Optional[str]:
    if not isinstance(payload, dict):
        raise OpenAlexCursorInvariantError("OpenAlex payload is not a dict")
    meta = payload.get("meta")
    if not isinstance(meta, dict):
        raise OpenAlexCursorInvariantError("OpenAlex payload.meta is not a dict")
    nxt = meta.get("next_cursor")
    if nxt is None:
        return None
    if not isinstance(nxt, str):
        raise OpenAlexCursorInvariantError(
            f"OpenAlex next_cursor must be str or None, got {type(nxt).__name__}"
        )
    return nxt
