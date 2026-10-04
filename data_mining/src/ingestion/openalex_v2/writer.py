"""Parquet writer for OpenAlex Bronze projection v1 (V2).

This module is the *only* place that touches pyarrow. It enforces:

  - the schema is ALWAYS BRONZE_SCHEMA_V1, never inferred from data;
  - nullable fields stay nullable even if the first page has all
    non-null values;
  - the write is atomic (write to temp file, then rename);
  - the file is removed from the staging directory after the caller
    uploads it (caller owns the lifecycle).

Layering: writer.py uses schema.py; it does not import r2_client.
"""

from __future__ import annotations

import datetime as dt
import os
import tempfile
from pathlib import Path
from typing import Any, Iterable, Mapping

import pyarrow as pa
import pyarrow.parquet as pq

from src.ingestion.openalex_v2.schema import (
    BRONZE_SCHEMA_V1,
    project_record,
)


def _ingested_at_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def project_records(
    works: Iterable[Mapping[str, Any]],
    *,
    scope_id: str,
    run_id: str,
    page_number: int,
    ingested_at: Optional[str] = None,
) -> list[dict[str, Any]]:
    ts = ingested_at or _ingested_at_now()
    return [
        project_record(
            work,
            scope_id=scope_id,
            run_id=run_id,
            page_number=page_number,
            ingested_at=ts,
        )
        for work in works
    ]


def write_parquet_part(
    rows: list[dict[str, Any]],
    *,
    part_path: Path,
) -> pa.Table:
    if not rows:
        raise ValueError("Cannot write an empty OpenAlex Parquet part")
    required = {f.name for f in BRONZE_SCHEMA_V1}
    for index, row in enumerate(rows):
        missing = required.difference(row.keys())
        if missing:
            raise RuntimeError(
                f"Row {index} is missing required Bronze v1 columns: "
                f"{sorted(missing)}"
            )
    try:
        table = pa.Table.from_pylist(rows, schema=BRONZE_SCHEMA_V1)
    except (pa.ArrowException, TypeError, ValueError) as exc:
        raise RuntimeError(
            "OpenAlex records are incompatible with BRONZE_SCHEMA_V1"
        ) from exc
    part_path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        prefix=part_path.name + ".",
        suffix=".tmp",
        dir=str(part_path.parent),
    )
    os.close(fd)
    tmp_path = Path(tmp_name)
    try:
        pq.write_table(table, tmp_path, compression="zstd")
        os.replace(tmp_path, part_path)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise
    return table
