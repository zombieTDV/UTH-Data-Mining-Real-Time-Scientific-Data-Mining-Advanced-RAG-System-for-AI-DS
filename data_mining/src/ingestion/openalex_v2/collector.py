"""V2 collector orchestrator (V2).

This is the single composition layer that wires together the
other modules:

  scope  -> scope_fingerprint  -> preflight (optional)
  -> checkpoint_v2 (load or reconstruct)
  -> shared httpx.Client
  -> request per page
       -> cursor_invariant
       -> writer (Parquet)
       -> r2_client.safe_upload (raw + parquet)
       -> commit_manifest.write_commit_manifest
       -> checkpoint_v2.save + mirror
  -> next cursor (loop)

It does NOT implement the underlying logic; each concern lives
in its own module. The collector only owns the page-by-page
transaction order from plan section 6.
"""

from __future__ import annotations

import datetime as dt
import gzip
import io
import json
import logging
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Optional

import httpx

from src.ingestion.openalex_v2.checkpoint_v2 import (
    CheckpointV2,
    assert_checkpoint_matches_scope,
    load_checkpoint,
    mirror_checkpoint_to_r2,
    save_checkpoint_atomic,
)
from src.ingestion.openalex_v2.client import build_http_client, build_request_headers
from src.ingestion.openalex_v2.commit_manifest import (
    ArtifactRef,
    PageCommit,
    write_commit_manifest,
)
from src.ingestion.openalex_v2.cursor_invariant import (
    CursorVerdict,
    assert_cursor_invariant,
    extract_next_cursor,
    extract_results,
)
from src.ingestion.openalex_v2.paths import (
    commit_manifest_key,
    parquet_part_key,
    raw_page_key,
    scope_manifest_key,
)
from src.ingestion.openalex_v2.r2_client import safe_upload_bytes
from src.ingestion.openalex_v2.rate_limit import RateLimitSnapshot
from src.ingestion.openalex_v2.recovery import reconstruct_state
from src.ingestion.openalex_v2.request import RequestConfig, request_openalex
from src.ingestion.openalex_v2.schema import (
    BRONZE_SCHEMA_FINGERPRINT_V1,
    SCHEMA_VERSION_V1,
)
from src.ingestion.openalex_v2.scope import OpenAlexScope
from src.ingestion.openalex_v2.scope_fingerprint import scope_identity
from src.ingestion.openalex_v2.writer import project_records, write_parquet_part
from src.storage.r2_client import R2Client


LOGGER = logging.getLogger(__name__)


@dataclass
class CollectorConfig:
    run_id: str
    layout_version: str = "v2"
    field_policy_version: str = "v1"
    collector_version: str = "v2"
    request_config: Optional[RequestConfig] = None


def _short_cursor(cursor: Optional[str], length: int = 8) -> str:
    if cursor is None:
        return "END"
    if cursor == "*":
        return "START"
    if len(cursor) <= length * 2:
        return cursor
    return f"{cursor[:length]}...{cursor[-length:]}"


def _initial_checkpoint(
    *,
    scope: OpenAlexScope,
    scope_fingerprint: str,
    scope_id: str,
    config: CollectorConfig,
) -> CheckpointV2:
    return CheckpointV2(
        scope_fingerprint=scope_fingerprint,
        scope_id=scope_id,
        layout_version=config.layout_version,
        schema_version=SCHEMA_VERSION_V1,
        field_policy_version=config.field_policy_version,
        collector_version=config.collector_version,
        run_id=config.run_id,
        state="RUNNING",
        page_number=1,
        next_cursor="*",
        terminal=False,
    )


def _resolve_resume(
    *,
    r2: R2Client,
    scope_id: str,
    scope_fingerprint: str,
    config: CollectorConfig,
    local_path: Path,
) -> CheckpointV2:
    cp: Optional[CheckpointV2] = None
    if local_path.exists():
        cp = load_checkpoint(local_path)
    if cp is not None:
        assert_checkpoint_matches_scope(
            cp,
            expected_scope_fingerprint=scope_fingerprint,
            expected_scope_id=scope_id,
        )
        if cp.terminal:
            return cp

    state = reconstruct_state(r2, scope_id=scope_id)
    if cp is None and state.last_committed_page == 0:
        return _initial_checkpoint(
            scope=OpenAlexScope.__class__,
            scope_fingerprint=scope_fingerprint,
            scope_id=scope_id,
            config=config,
        )

    next_page = state.next_page_to_crawl
    if state.is_complete:
        rebuilt = CheckpointV2(
            scope_fingerprint=scope_fingerprint,
            scope_id=scope_id,
            layout_version=config.layout_version,
            schema_version=SCHEMA_VERSION_V1,
            field_policy_version=config.field_policy_version,
            collector_version=config.collector_version,
            run_id=config.run_id,
            state="COMPLETE",
            page_number=state.last_committed_page,
            next_cursor=None,
            terminal=True,
        )
        return rebuilt

    rebuilt = _initial_checkpoint(
        scope=OpenAlexScope.__class__,
        scope_fingerprint=scope_fingerprint,
        scope_id=scope_id,
        config=config,
    )
    object.__setattr__(rebuilt, "page_number", next_page)
    object.__setattr__(rebuilt, "next_cursor", state.last_committed_next_cursor or "*")
    object.__setattr__(rebuilt, "state", "RECOVERED")
    return rebuilt


def _build_filter_string(scope: OpenAlexScope) -> str:
    from src.ingestion.openalex_v2.preflight import build_filter_string
    return build_filter_string(scope)


def collect(
    *,
    scope: OpenAlexScope,
    api_key: str,
    r2: R2Client,
    config: CollectorConfig,
    checkpoint_path: Path,
    max_pages: Optional[int] = None,
) -> CheckpointV2:
    identity = scope_identity(
        scope,
        schema_version=SCHEMA_VERSION_V1,
        field_policy_version=config.field_policy_version,
        layout_version=config.layout_version,
        collector_version=config.collector_version,
    )
    scope_id = identity["scope_id"]
    scope_fingerprint = identity["scope_fingerprint"]

    body = {
        "scope_id": scope_id,
        "scope_fingerprint": scope_fingerprint,
        "entity": scope.entity,
        "mode": scope.mode,
        "start_date": scope.start_date,
        "end_date": scope.end_date,
        "subfield_mode": scope.subfield_mode,
        "subfield_ids": sorted(scope.subfield_ids),
        "per_page": scope.per_page,
        "schema_version": SCHEMA_VERSION_V1,
        "field_policy_version": config.field_policy_version,
        "layout_version": config.layout_version,
        "collector_version": config.collector_version,
        "filter_string": _build_filter_string(scope),
    }
    safe_upload_bytes(
        r2,
        data=json.dumps(body, ensure_ascii=False, sort_keys=True).encode("utf-8"),
        key=scope_manifest_key(scope_id),
        content_type="application/json; charset=utf-8",
        metadata={"scope_id": scope_id, "scope_fingerprint": scope_fingerprint},
    )

    checkpoint = _resolve_resume(
        r2=r2,
        scope_id=scope_id,
        scope_fingerprint=scope_fingerprint,
        config=config,
        local_path=checkpoint_path,
    )
    if checkpoint.terminal:
        return checkpoint

    headers = build_request_headers(api_key)
    request_cfg = config.request_config or RequestConfig()
    filter_value = _build_filter_string(scope)

    with build_http_client() as http_client:
        page_count = 0
        staging_root = Path(tempfile.mkdtemp(prefix="openalex-v2-"))
        try:
            while True:
                page_count += 1
                if max_pages is not None and page_count > max_pages:
                    LOGGER.info(
                        "OPENALEX-V2 | SCOPE=%s | max_pages reached | stop",
                        scope_id,
                    )
                    break

                current_cursor = checkpoint.next_cursor
                payload, snapshot = request_openalex(
                    client=http_client,
                    url="https://api.openalex.org/works",
                    params={
                        "filter": filter_value,
                        "per-page": scope.per_page,
                        "cursor": current_cursor,
                    },
                    headers=headers,
                    config=request_cfg,
                )
                results = extract_results(payload)
                next_cursor = extract_next_cursor(payload)
                verdict = assert_cursor_invariant(
                    results,
                    current_cursor=current_cursor,
                    next_cursor=next_cursor,
                )

                page_number = checkpoint.page_number
                requested_at = dt.datetime.now(dt.timezone.utc).isoformat()

                raw_bytes = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
                buf = io.BytesIO()
                with gzip.GzipFile(fileobj=buf, mode="wb", mtime=0) as gz:
                    gz.write(raw_bytes)
                raw_gz = buf.getvalue()

                raw_key = raw_page_key(scope_id, page_number)
                raw_upload = safe_upload_bytes(
                    r2,
                    data=raw_gz,
                    key=raw_key,
                    content_type="application/gzip",
                    metadata={
                        "scope_id": scope_id,
                        "page_number": str(page_number),
                    },
                )
                if raw_upload.get("status") == "CONFLICT":
                    raise RuntimeError(
                        f"R2 conflict on {raw_key}: same key, different SHA. "
                        f"local={raw_upload.get('sha256')} "
                        f"remote={raw_upload.get('remote_sha256')}"
                    )
                raw_ref = ArtifactRef(
                    key=raw_upload["key"],
                    sha256=raw_upload["sha256"],
                    size_bytes=raw_upload["size_bytes"],
                )

                parquet_ref: Optional[ArtifactRef] = None
                if verdict is not CursorVerdict.TERMINAL_OK:
                    projected = project_records(
                        results,
                        scope_id=scope_id,
                        run_id=config.run_id,
                        page_number=page_number,
                    )
                    part_path = staging_root / f"part-{page_number:06d}.parquet"
                    write_parquet_part(projected, part_path=part_path)
                    parquet_key = parquet_part_key(scope_id, page_number)
                    part_upload = safe_upload_bytes(
                        r2,
                        data=part_path.read_bytes(),
                        key=parquet_key,
                        content_type="application/vnd.apache.parquet",
                        metadata={
                            "scope_id": scope_id,
                            "page_number": str(page_number),
                            "schema_version": SCHEMA_VERSION_V1,
                            "schema_fingerprint": BRONZE_SCHEMA_FINGERPRINT_V1,
                        },
                    )
                    if part_upload.get("status") == "CONFLICT":
                        raise RuntimeError(
                            f"R2 conflict on {parquet_key}: same key, different SHA"
                        )
                    parquet_ref = ArtifactRef(
                        key=part_upload["key"],
                        sha256=part_upload["sha256"],
                        size_bytes=part_upload["size_bytes"],
                    )
                    part_path.unlink(missing_ok=True)

                commit = PageCommit(
                    scope_id=scope_id,
                    run_id=config.run_id,
                    page_number=page_number,
                    request_cursor=current_cursor,
                    request_filter=filter_value,
                    request_per_page=scope.per_page,
                    request_requested_at=requested_at,
                    record_count=len(results),
                    next_cursor=next_cursor,
                    terminal=(verdict is CursorVerdict.TERMINAL_OK),
                    raw=raw_ref,
                    parquet=parquet_ref,
                    rate_limit=snapshot,
                    schema_version=SCHEMA_VERSION_V1,
                    schema_fingerprint=BRONZE_SCHEMA_FINGERPRINT_V1,
                )
                cm_result = write_commit_manifest(r2, commit)
                if cm_result.get("status") == "CONFLICT":
                    raise RuntimeError(
                        f"R2 conflict on commit manifest for page {page_number}"
                    )

                checkpoint.page_number = page_number + 1
                checkpoint.next_cursor = next_cursor
                checkpoint.terminal = (verdict is CursorVerdict.TERMINAL_OK)
                checkpoint.last_uploaded_sha_raw = raw_ref.sha256
                checkpoint.last_uploaded_sha_parquet = parquet_ref.sha256 if parquet_ref else None
                checkpoint.last_updated = dt.datetime.now(dt.timezone.utc).isoformat()
                if checkpoint.terminal:
                    checkpoint.state = "COMPLETE"

                save_checkpoint_atomic(checkpoint, checkpoint_path)
                mirror_checkpoint_to_r2(r2, checkpoint)

                LOGGER.info(
                    "OPENALEX-V2 | SCOPE=%s | PAGE=%06d | +%d | "
                    "RAW=OK | PARQUET=%s | CURSOR=%s | NEXT=%s",
                    scope_id,
                    page_number,
                    len(results),
                    "OK" if parquet_ref else "SKIP",
                    _short_cursor(current_cursor),
                    _short_cursor(next_cursor),
                )

                if checkpoint.terminal:
                    break
        finally:
            try:
                staging_root.rmdir()
            except OSError:
                for leftover in staging_root.iterdir():
                    try:
                        leftover.unlink()
                    except OSError:
                        pass
                try:
                    staging_root.rmdir()
                except OSError:
                    pass

    return checkpoint
