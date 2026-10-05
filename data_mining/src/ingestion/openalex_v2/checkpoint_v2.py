"""V2 checkpoint: fingerprint-bound, atomic, R2-mirrored (V2).

Per plan section 3.6 the local checkpoint is bound to the scope
fingerprint. A checkpoint that does not match the current scope
must be rejected — never silently reused.

Per plan section 3.19 the file is written atomically via a temp
file + os.replace; the temp is cleaned up on error.

Per plan section 6 the local checkpoint is mirrored to R2 so the
collector can recover when the local file is lost.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping, Optional

from src.ingestion.openalex_v2.paths import checkpoint_r2_key
from src.ingestion.openalex_v2.r2_client import safe_upload_bytes
from src.storage.r2_client import R2Client


CHECKPOINT_VERSION = 2


class OpenAlexCheckpointMismatch(RuntimeError):
    pass


@dataclass
class CheckpointV2:
    scope_fingerprint: str
    scope_id: str
    layout_version: str
    schema_version: str
    field_policy_version: str
    collector_version: str
    run_id: str
    state: str = "PENDING"
    page_number: int = 1
    next_cursor: Optional[str] = None
    terminal: bool = False
    last_uploaded_sha_raw: Optional[str] = None
    last_uploaded_sha_parquet: Optional[str] = None
    last_updated: str = field(default_factory=lambda: dt.datetime.now(dt.timezone.utc).isoformat())
    checkpoint_version: int = CHECKPOINT_VERSION

    def to_dict(self) -> dict[str, Any]:
        return {
            "checkpoint_version": self.checkpoint_version,
            "scope_fingerprint": self.scope_fingerprint,
            "scope_id": self.scope_id,
            "layout_version": self.layout_version,
            "schema_version": self.schema_version,
            "field_policy_version": self.field_policy_version,
            "collector_version": self.collector_version,
            "run_id": self.run_id,
            "state": self.state,
            "page_number": self.page_number,
            "next_cursor": self.next_cursor,
            "terminal": self.terminal,
            "last_uploaded_sha_raw": self.last_uploaded_sha_raw,
            "last_uploaded_sha_parquet": self.last_uploaded_sha_parquet,
            "last_updated": self.last_updated,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "CheckpointV2":
        return cls(
            checkpoint_version=int(data.get("checkpoint_version", 1)),
            scope_fingerprint=str(data["scope_fingerprint"]),
            scope_id=str(data["scope_id"]),
            layout_version=str(data.get("layout_version", "v2")),
            schema_version=str(data.get("schema_version", "openalex-bronze-v1")),
            field_policy_version=str(data.get("field_policy_version", "v1")),
            collector_version=str(data.get("collector_version", "v2")),
            run_id=str(data.get("run_id", "")),
            state=str(data.get("state", "PENDING")),
            page_number=int(data.get("page_number", 1)),
            next_cursor=data.get("next_cursor"),
            terminal=bool(data.get("terminal", False)),
            last_uploaded_sha_raw=data.get("last_uploaded_sha_raw"),
            last_uploaded_sha_parquet=data.get("last_uploaded_sha_parquet"),
            last_updated=str(data.get("last_updated", dt.datetime.now(dt.timezone.utc).isoformat())),
        )


def save_checkpoint_atomic(checkpoint: CheckpointV2, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
    os.close(fd)
    tmp_path = Path(tmp_name)
    try:
        tmp_path.write_text(
            json.dumps(checkpoint.to_dict(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        os.replace(tmp_path, path)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise


def load_checkpoint(path: Path) -> Optional[CheckpointV2]:
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Cannot read OpenAlex checkpoint: {path}") from exc
    return CheckpointV2.from_dict(data)


def assert_checkpoint_matches_scope(
    checkpoint: CheckpointV2,
    *,
    expected_scope_fingerprint: str,
    expected_scope_id: str,
) -> None:
    if (
        checkpoint.scope_fingerprint != expected_scope_fingerprint
        or checkpoint.scope_id != expected_scope_id
    ):
        raise OpenAlexCheckpointMismatch(
            f"Checkpoint belongs to a different scope "
            f"(scope_fingerprint={checkpoint.scope_fingerprint!r}, "
            f"scope_id={checkpoint.scope_id!r}); "
            f"move it aside before starting a new crawl"
        )


def mirror_checkpoint_to_r2(
    r2: R2Client,
    checkpoint: CheckpointV2,
) -> dict[str, Any]:
    key = checkpoint_r2_key(checkpoint.scope_id)
    body = json.dumps(checkpoint.to_dict(), ensure_ascii=False, sort_keys=True).encode("utf-8")
    return safe_upload_bytes(
        r2,
        data=body,
        key=key,
        content_type="application/json; charset=utf-8",
        metadata={
            "scope_id": checkpoint.scope_id,
            "scope_fingerprint": checkpoint.scope_fingerprint,
            "checkpoint_version": str(checkpoint.checkpoint_version),
        },
    )
