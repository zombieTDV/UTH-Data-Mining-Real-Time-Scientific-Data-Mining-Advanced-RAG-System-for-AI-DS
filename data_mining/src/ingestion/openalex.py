"""Resumable metadata-only collector for the OpenAlex Works API."""

from __future__ import annotations

import datetime as dt
import gzip
import json
import logging
import os
import tempfile
import time
from pathlib import Path
from typing import Any, Iterable, Mapping, MutableMapping, Optional

import httpx
import pyarrow as pa
import pyarrow.parquet as pq
from botocore.exceptions import ClientError

from src.config.settings import settings
from src.storage.r2_client import R2Client
from src.exceptions.ingestion_exception import OpenAlexBudgetExceeded


# Logger config for OpenAlex:
# OPENALEX | YEAR=2024 | PART=00124 | +100 |
# CURSOR=abc...xyz | NEXT=def...uvw | R2=OK

LOGGER = logging.getLogger(__name__)


class _OpenAlexHTTPLogFilter(logging.Filter):
    """Hide only default HTTPX logs for OpenAlex requests."""

    def filter(self, record: logging.LogRecord) -> bool:
        return "api.openalex.org" not in record.getMessage()


logging.getLogger("httpx").addFilter(_OpenAlexHTTPLogFilter())


def _short_cursor(cursor: Optional[str], length: int = 8) -> str:
    if cursor is None:
        return "END"

    if cursor == "*":
        return "START"

    if len(cursor) <= length * 2:
        return cursor

    return f"{cursor[:length]}...{cursor[-length:]}"


OPENALEX_BASE_URL = "https://api.openalex.org"
OPENALEX_WORKS_URL = f"{OPENALEX_BASE_URL}/works"

OPENALEX_START_DATE = "2017-06-01"
OPENALEX_END_DATE = "2026-09-30"
EXCLUDED_FIELDS = {
    "abstract_inverted_index",
    "apc_list",
    "apc_paid",
    "sustainable_development_goals",
    "x_sdgs",
    "study_designs",
    "awards",
    "funders",
}
BRONZE_PREFIX = "bronze/openalex/raw_metadata"
RAW_BRONZE_PREFIX = "bronze/openalex/raw"
MANIFEST_PREFIX = "bronze/openalex/manifests"
CHECKPOINT_FILENAME = "openalex_checkpoint.json"
REGISTRY_FILENAME = "openalex_dedup_keys.json"


def build_headers(api_key: str) -> dict[str, str]:
    """Build OpenAlex request headers without exposing the key in logs."""
    if not api_key.strip():
        raise ValueError("OPENALEX_API_KEY is required")
    return {
        "Authorization": "Bearer " + api_key,
        "Accept": "application/json",
        "User-Agent": "UTH-Scientific-DataMining-OpenAlexCollector/1.0",
    }


def build_work_filter(
    start_date: str,
    end_date: str,
    subfield_ids: Iterable[str],
) -> str:
    """Build a date and any-topic-subfield OpenAlex filter."""
    ids = [str(value).strip() for value in subfield_ids if str(value).strip()]
    if not ids:
        raise ValueError("At least one OpenAlex subfield ID is required")
    return (
        f"from_publication_date:{start_date},"
        f"to_publication_date:{end_date},"
        f"topics.subfield.id:{'|'.join(ids)}"
    )


def clean_work(work: Mapping[str, Any]) -> dict[str, Any]:
    """Remove only the explicitly excluded top-level fields."""
    return {key: value for key, value in work.items() if key not in EXCLUDED_FIELDS}


def _retry_delay(response: Optional[httpx.Response], attempt: int) -> float:
    if response is not None:
        retry_after = response.headers.get("Retry-After")
        if retry_after:
            try:
                return max(float(retry_after), 0.0)
            except ValueError:
                pass
    return float(2**attempt)


def request_openalex(
    endpoint: str,
    params: Mapping[str, Any],
    headers: Mapping[str, str],
    *,
    client: Optional[httpx.Client] = None,
    last_request_at: Optional[MutableMapping[str, float]] = None,
) -> dict[str, Any]:
    """Request one OpenAlex page with throttling and bounded retries."""
    request_client = client or httpx.Client(timeout=settings.OPENALEX_TIMEOUT_SECONDS)
    request_state = last_request_at if last_request_at is not None else {}
    interval = 1.0 / settings.OPENALEX_REQUESTS_PER_SECOND

    try:
        for attempt in range(settings.OPENALEX_MAX_RETRIES + 1):
            elapsed = time.monotonic() - request_state.get("value", 0.0)
            if elapsed < interval:
                time.sleep(interval - elapsed)

            try:
                response = request_client.get(
                    endpoint,
                    params=dict(params),
                    headers=dict(headers),
                    timeout=settings.OPENALEX_TIMEOUT_SECONDS,
                )
                request_state["value"] = time.monotonic()
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                if attempt >= settings.OPENALEX_MAX_RETRIES:
                    raise RuntimeError("OpenAlex request failed after retries") from exc
                time.sleep(_retry_delay(None, attempt))
                continue

            if response.status_code == 429 :
                    remaining = response.headers.get("X-RateLimit-Remaining")
                    reset = response.headers.get("X-RateLimit-Reset")

                    if remaining == "0":
                        raise OpenAlexBudgetExceeded(
                            f"OpenAlex daily budget exhausted; reset in {reset} seconds"
                        )

                    if attempt >= settings.OPENALEX_MAX_RETRIES:
                        response.raise_for_status()

                    time.sleep(_retry_delay(response, attempt))
                    continue

            if response.status_code >= 500:
                    if attempt >= settings.OPENALEX_MAX_RETRIES:
                        response.raise_for_status()

                    time.sleep(_retry_delay(response, attempt))
                    continue

            if response.status_code in (401, 403):
                raise RuntimeError(
                    f"OpenAlex authentication/authorization failed ({response.status_code})"
                )
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                raise RuntimeError("OpenAlex returned a non-object JSON response")
            return payload
    finally:
        if client is None:
            request_client.close()

    raise RuntimeError("OpenAlex request did not return a response")


def _year_bounds(year: int) -> tuple[str, str]:
    start = max(OPENALEX_START_DATE, f"{year:04d}-01-01")
    end = min(OPENALEX_END_DATE, f"{year:04d}-12-31")
    if start > end:
        raise ValueError(f"Year {year} is outside the configured OpenAlex date range")
    return start, end


def _checkpoint_path(checkpoint_dir: Optional[Path]) -> Path:
    directory = checkpoint_dir or (settings.ROOT_DIR / "data" / "manifests")
    directory.mkdir(parents=True, exist_ok=True)
    return directory / CHECKPOINT_FILENAME


def _load_checkpoint(path: Path, crawl_filter: str) -> dict[str, Any]:
    if not path.exists():
        return {"crawl_filter": crawl_filter, "years": {}}
    try:
        checkpoint = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Cannot read OpenAlex checkpoint: {path}") from exc
    if checkpoint.get("crawl_filter") != crawl_filter:
        raise RuntimeError(
            "OpenAlex checkpoint belongs to a different filter; "
            "move it aside before starting a new crawl"
        )
    return checkpoint


def _save_checkpoint(path: Path, checkpoint: Mapping[str, Any]) -> None:
    temporary = path.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(checkpoint, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    os.replace(temporary, path)


def _write_part(records: list[dict[str, Any]], path: Path, schema: Optional[pa.Schema]) -> pa.Schema:
    if not records:
        raise ValueError("Cannot write an empty OpenAlex Parquet part")
    try:
        table = pa.Table.from_pylist(records, schema=schema)
    except (pa.ArrowException, TypeError, ValueError) as exc:
        raise RuntimeError(
            "OpenAlex records are incompatible with the established Parquet schema"
        ) from exc
    path.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(table, path, compression="zstd")
    return table.schema


def _upload_part(
    records: list[dict[str, Any]],
    *,
    year: int,
    part_number: int,
    r2_client: R2Client,
    staging_dir: Path,
    schema: Optional[pa.Schema],
) -> tuple[pa.Schema, dict[str, Any]]:
    path = staging_dir / f"part-{part_number:05d}.parquet"
    try:
        established_schema = _write_part(records, path, schema)
        key = f"{BRONZE_PREFIX}/{year}/part-{part_number:05d}.parquet"
        result = r2_client.upload_file(
            file_path=path,
            key=key,
            content_type="application/vnd.apache.parquet",
        )
        if not result.get("sha256"):
            raise RuntimeError(f"R2 upload returned no integrity hash for {key}")
        return established_schema, result
    finally:
        path.unlink(missing_ok=True)


def _upload_raw_page(
    payload: Mapping[str, Any],
    *,
    year: int,
    page_number: int,
    r2_client: R2Client,
    staging_dir: Path,
) -> dict[str, Any]:
    path = staging_dir / f"page-{page_number:05d}.json.gz"
    try:
        with gzip.open(path, "wt", encoding="utf-8") as stream:
            json.dump(payload, stream, ensure_ascii=False)
        result = r2_client.upload_file(
            file_path=path,
            key=f"{RAW_BRONZE_PREFIX}/{year}/page-{page_number:05d}.json.gz",
            content_type="application/gzip",
        )
        if not result.get("sha256"):
            raise RuntimeError(
                f"R2 upload returned no integrity hash for raw page {year}/{page_number}"
            )
        return result
    finally:
        path.unlink(missing_ok=True)


def collect_year(
    year: int,
    api_key: str,
    r2_client: R2Client,
    *,
    checkpoint: dict[str, Any],
    checkpoint_path: Path,
    client: Optional[httpx.Client] = None,
    part_size: int = settings.OPENALEX_PER_PAGE,
) -> None:
    """Collect one year, advancing the checkpoint only after each upload."""
    if part_size != settings.OPENALEX_PER_PAGE:
        raise ValueError("OpenAlex pages must map to exactly one Parquet part")
    start_date, end_date = _year_bounds(year)
    filter_value = build_work_filter(start_date, end_date, settings.OPENALEX_SUBFIELDS)
    state = checkpoint.setdefault("years", {}).setdefault(
        str(year),
        {"cursor": "*", "part_number": 1, "complete": False},
    )
    if state.get("complete"):
        return

    headers = build_headers(api_key)
    request_state: dict[str, float] = {}
    schema: Optional[pa.Schema] = None
    if int(state["part_number"]) > 1:
        first_key = f"{BRONZE_PREFIX}/{year}/part-00001.parquet"
        try:
            schema = _read_r2_parquet(r2_client, first_key).schema
        except (ClientError, KeyError, OSError, pa.ArrowException) as exc:
            raise RuntimeError(
                f"Cannot restore the established schema for OpenAlex year {year}"
            ) from exc
    staging_root = Path(tempfile.mkdtemp(prefix="openalex-"))
    try:
        while True:
            current_cursor = state["cursor"]

            payload = request_openalex(
                OPENALEX_WORKS_URL,
                {
                    "filter": filter_value,
                    "per-page": settings.OPENALEX_PER_PAGE,
                    "cursor": current_cursor,
                },
                headers,
                client=client,
                last_request_at=request_state,
            )

            results = payload.get("results", [])

            if not isinstance(results, list):
                raise RuntimeError(
                    "OpenAlex response has an invalid results field"
                )

            current_part = int(state["part_number"])
            raw_upload = _upload_raw_page(
                payload,
                year=year,
                page_number=current_part,
                r2_client=r2_client,
                staging_dir=staging_root,
            )

            meta = payload.get("meta", {})
            next_cursor = (
                meta.get("next_cursor")
                if isinstance(meta, dict)
                else None
            )

            if not results:
                state["complete"] = True
                state["cursor"] = None
                state["last_uploaded_sha256"] = raw_upload["sha256"]
                state["last_updated"] = (
                    dt.datetime.now(dt.timezone.utc).isoformat()
                )
                LOGGER.info(
                    "OPENALEX | YEAR=%d | PART=%05d | +0 | "
                    "RAW=OK | PARQUET=SKIP | CURSOR=%s | NEXT=END",
                    year,
                    current_part,
                    _short_cursor(current_cursor),
                )
                _save_checkpoint(checkpoint_path, checkpoint)
                return

            records = [
                clean_work(work)
                for work in results
                if isinstance(work, dict)
            ]
            if not records:
                raise RuntimeError(
                    "OpenAlex non-empty response contained no Work objects"
                )

            schema, parquet_upload = _upload_part(
                records,
                year=year,
                part_number=current_part,
                r2_client=r2_client,
                staging_dir=staging_root,
                schema=schema,
            )

            LOGGER.info(
                "OPENALEX | YEAR=%d | PART=%05d | +%d | "
                "RAW=OK | PARQUET=OK | CURSOR=%s | NEXT=%s",
                year,
                current_part,
                len(records),
                _short_cursor(current_cursor),
                _short_cursor(next_cursor),
            )

            state["part_number"] = current_part + 1
            state["last_uploaded_sha256"] = parquet_upload["sha256"]
            state["last_raw_uploaded_sha256"] = raw_upload["sha256"]
            state["last_updated"] = (
                dt.datetime.now(dt.timezone.utc).isoformat()
            )

            if not next_cursor or next_cursor == state["cursor"]:
                state["complete"] = True
                state["cursor"] = None
                _save_checkpoint(checkpoint_path, checkpoint)
                return

            state["cursor"] = next_cursor
            _save_checkpoint(checkpoint_path, checkpoint)
    finally:
        staging_root.rmdir()


def _read_r2_parquet(r2_client: R2Client, key: str) -> pa.Table:
    response = r2_client.s3.get_object(Bucket=r2_client.bucket_name, Key=key)
    body = response["Body"].read()
    return pq.read_table(pa.BufferReader(body))


def deduplicate_after_crawl(
    r2_client: R2Client,
    *,
    years: Iterable[int] = range(2017, 2027),
    local_manifest_dir: Optional[Path] = None,
) -> dict[str, Any]:
    """Build dedup keys only after all collection partitions are complete."""
    configured_years = tuple(int(year) for year in years)
    objects = [
        item
        for year in configured_years
        for item in r2_client.list_objects(prefix=f"{BRONZE_PREFIX}/{year}/")
    ]
    keys: dict[str, dict[str, Optional[str]]] = {}
    for item in objects:
        key = item["key"]
        if not key.endswith(".parquet"):
            continue
        table = _read_r2_parquet(r2_client, key)
        for row in table.to_pylist():
            openalex_id = row.get("id")
            if not openalex_id:
                continue
            keys[str(openalex_id)] = {
                "openalex_id": str(openalex_id),
                "doi": row.get("doi"),
            }

    registry = sorted(keys.values(), key=lambda item: item["openalex_id"])
    payload = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "count": len(registry),
        "keys": registry,
    }
    manifest_dir = local_manifest_dir or (settings.ROOT_DIR / "data" / "manifests")
    manifest_dir.mkdir(parents=True, exist_ok=True)
    local_path = manifest_dir / REGISTRY_FILENAME
    local_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    r2_client.upload_json(payload, f"{MANIFEST_PREFIX}/{REGISTRY_FILENAME}")
    return payload


def collect_openalex(
    api_key: Optional[str] = None,
    r2_client: Optional[R2Client] = None,
    *,
    checkpoint_dir: Optional[Path] = None,
    years: Iterable[int] = range(2017, 2027),
) -> dict[str, Any]:
    """Run all configured years, then deduplicate the complete R2 crawl."""
    configured_years = tuple(int(year) for year in years)
    key = api_key or settings.OPENALEX_API_KEY
    client = r2_client or R2Client()
    crawl_filter = build_work_filter(OPENALEX_START_DATE, OPENALEX_END_DATE, settings.OPENALEX_SUBFIELDS)
    checkpoint_path = _checkpoint_path(checkpoint_dir)
    checkpoint = _load_checkpoint(checkpoint_path, crawl_filter)

    try:
        for year in configured_years:
            collect_year(
                year,
                key,
                client,
                checkpoint=checkpoint,
                checkpoint_path=checkpoint_path,
            )
    except KeyboardInterrupt:
        LOGGER.warning("OPENALEX | INTERRUPTED | Last durable checkpoint preserved")
        raise

    if not all(
        checkpoint.get("years", {}).get(str(year), {}).get("complete", False)
        for year in configured_years
    ):
        raise RuntimeError("OpenAlex crawl did not complete all configured years")
    return deduplicate_after_crawl(
        client,
        years=configured_years,
        local_manifest_dir=checkpoint_path.parent,
    )
