"""Page commit manifest data model and R2 writer (V2).

Per plan section 6, after a page's raw and Parquet artifacts are
uploaded and verified, the collector writes:

  commits/page-000123.commit.json

This is the logical "transaction" boundary. A page is durable if
and only if its commit manifest exists in R2.

The module is a pure data layer:
  - PageCommit dataclass
  - to_dict / from_dict serialisation
  - write_commit_manifest() helper that uses safe_upload_bytes
    from openalex_v2.r2_client

It does NOT:
  - decide when to write (collector.py does that)
  - read existing commits (recovery.py does that)
  - validate cursor invariants (cursor_invariant.py does that)
"""

from __future__ import annotations

import datetime as dt
from dataclasses import asdict, dataclass, field
from typing import Any, Mapping, Optional

from src.ingestion.openalex_v2.paths import commit_manifest_key
from src.ingestion.openalex_v2.r2_client import safe_upload_bytes
from src.ingestion.openalex_v2.rate_limit import RateLimitSnapshot
from src.storage.r2_client import R2Client


COMMIT_MANIFEST_VERSION = 1


@dataclass
class ArtifactRef:
    key: str
    sha256: str
    size_bytes: int

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "ArtifactRef":
        return cls(
            key=str(data["key"]),
            sha256=str(data["sha256"]),
            size_bytes=int(data["size_bytes"]),
        )


@dataclass
class PageCommit:
    scope_id: str
    run_id: str
    page_number: int
    request_cursor: Optional[str]
    request_filter: str
    request_per_page: int
    request_requested_at: str
    record_count: int
    next_cursor: Optional[str]
    terminal: bool
    raw: ArtifactRef
    parquet: Optional[ArtifactRef]
    rate_limit: RateLimitSnapshot
    schema_version: str
    schema_fingerprint: str
    committed_at: str = field(default_factory=lambda: dt.datetime.now(dt.timezone.utc).isoformat())
    manifest_version: int = COMMIT_MANIFEST_VERSION

    def to_dict(self) -> dict[str, Any]:
        data = {
            "manifest_version": self.manifest_version,
            "scope_id": self.scope_id,
            "run_id": self.run_id,
            "page_number": self.page_number,
            "request_cursor": self.request_cursor,
            "request_filter": self.request_filter,
            "request_per_page": self.request_per_page,
            "request_requested_at": self.request_requested_at,
            "record_count": self.record_count,
            "next_cursor": self.next_cursor,
            "terminal": self.terminal,
            "raw": self.raw.to_dict(),
            "parquet": self.parquet.to_dict() if self.parquet is not None else None,
            "rate_limit": {
                "limit": self.rate_limit.limit,
                "remaining": self.rate_limit.remaining,
                "credits_used": self.rate_limit.credits_used,
                "reset_seconds": self.rate_limit.reset_seconds,
                "retry_after_seconds": self.rate_limit.retry_after_seconds,
            },
            "schema_version": self.schema_version,
            "schema_fingerprint": self.schema_fingerprint,
            "committed_at": self.committed_at,
        }
        return data

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "PageCommit":
        raw_data = data["raw"]
        parquet_data = data.get("parquet")
        rl_data = data["rate_limit"]
        return cls(
            scope_id=str(data["scope_id"]),
            run_id=str(data["run_id"]),
            page_number=int(data["page_number"]),
            request_cursor=data.get("request_cursor"),
            request_filter=str(data["request_filter"]),
            request_per_page=int(data["request_per_page"]),
            request_requested_at=str(data["request_requested_at"]),
            record_count=int(data["record_count"]),
            next_cursor=data.get("next_cursor"),
            terminal=bool(data["terminal"]),
            raw=ArtifactRef.from_dict(raw_data),
            parquet=ArtifactRef.from_dict(parquet_data) if parquet_data else None,
            rate_limit=RateLimitSnapshot(
                limit=rl_data.get("limit"),
                remaining=rl_data.get("remaining"),
                credits_used=rl_data.get("credits_used"),
                reset_seconds=rl_data.get("reset_seconds"),
                retry_after_seconds=rl_data.get("retry_after_seconds"),
            ),
            schema_version=str(data["schema_version"]),
            schema_fingerprint=str(data["schema_fingerprint"]),
            committed_at=str(data.get("committed_at", dt.datetime.now(dt.timezone.utc).isoformat())),
            manifest_version=int(data.get("manifest_version", COMMIT_MANIFEST_VERSION)),
        )


def write_commit_manifest(
    r2: R2Client,
    commit: PageCommit,
) -> dict[str, Any]:
    key = commit_manifest_key(commit.scope_id, commit.page_number)
    import json
    body = json.dumps(commit.to_dict(), ensure_ascii=False, sort_keys=True).encode("utf-8")
    metadata = {
        "scope_id": commit.scope_id,
        "run_id": commit.run_id,
        "page_number": str(commit.page_number),
        "terminal": "true" if commit.terminal else "false",
        "schema_version": commit.schema_version,
        "schema_fingerprint": commit.schema_fingerprint,
    }
    return safe_upload_bytes(
        r2,
        data=body,
        key=key,
        content_type="application/json; charset=utf-8",
        metadata=metadata,
    )
