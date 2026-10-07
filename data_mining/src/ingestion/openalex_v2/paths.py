"""R2 key/path builder for the OpenAlex V2 namespace (V2).

Centralises every R2 key so the rest of the collector never has
to construct keys inline. Per plan section 5 the V2 layout is:

  bronze/openalex/v2/
    scopes/{scope_id}/
      scope.json
      raw/page-000001.json.gz
      raw_metadata/part-000001.parquet
      commits/page-000001.commit.json
      checkpoints/checkpoint.json

Different scopes never share keys. All key formats are
deterministic so the same logical page always lands on the same
key (idempotent uploads are possible).
"""

from __future__ import annotations

from typing import Final


LAYOUT_VERSION_V2: Final[str] = "v2"
BRONZE_V2_ROOT: Final[str] = "bronze/openalex/v2"


def scope_root(scope_id: str) -> str:
    return f"{BRONZE_V2_ROOT}/scopes/{scope_id}"


def scope_manifest_key(scope_id: str) -> str:
    return f"{scope_root(scope_id)}/scope.json"


def raw_page_key(scope_id: str, page_number: int) -> str:
    return f"{scope_root(scope_id)}/raw/page-{page_number:06d}.json.gz"


def parquet_part_key(scope_id: str, part_number: int) -> str:
    return f"{scope_root(scope_id)}/raw_metadata/part-{part_number:06d}.parquet"


def commit_manifest_key(scope_id: str, page_number: int) -> str:
    return f"{scope_root(scope_id)}/commits/page-{page_number:06d}.commit.json"


def checkpoint_r2_key(scope_id: str) -> str:
    return f"{scope_root(scope_id)}/checkpoints/checkpoint.json"


def page_number_from_key(key: str) -> int | None:
    import re
    m = re.search(r"page-(\d+)\.(?:json\.gz|commit\.json)$", key)
    if not m:
        return None
    return int(m.group(1))


def part_number_from_key(key: str) -> int | None:
    import re
    m = re.search(r"part-(\d+)\.parquet$", key)
    if not m:
        return None
    return int(m.group(1))
