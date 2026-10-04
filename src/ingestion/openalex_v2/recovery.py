"""R2-based recovery for the OpenAlex V2 pipeline (V2).

Per plan section 7, when the local checkpoint is missing or
incomplete, the collector must be able to reconstruct the next
resumable cursor from R2 commit manifests.

Algorithm (per plan section 7.2):

  1. list all commits/page-NNNNNN.commit.json in scope
  2. find the highest CONTIGUOUS prefix (1,2,3,4,5 = OK;
     1,2,3,5 = GAP, stop at 3)
  3. if the contiguous run ends with a terminal=true commit,
     the scope is COMPLETE
  4. otherwise, resume from the run's next_cursor + 1
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, List, Optional

from src.ingestion.openalex_v2.commit_manifest import PageCommit
from src.ingestion.openalex_v2.paths import (
    commit_manifest_key,
    page_number_from_key,
    scope_root,
)
from src.ingestion.openalex_v2.r2_client import iter_objects
from src.storage.r2_client import R2Client


@dataclass
class ReconstructedState:
    scope_id: str
    last_committed_page: int
    last_committed_next_cursor: Optional[str]
    terminal: bool
    gap_detected: bool
    gap_after_page: Optional[int]
    total_commits_seen: int

    @property
    def next_page_to_crawl(self) -> int:
        return self.last_committed_page + 1

    @property
    def is_complete(self) -> bool:
        return self.terminal and not self.gap_detected


def list_commit_objects(r2: R2Client, scope_id: str) -> List[tuple[int, str]]:
    prefix = f"{scope_root(scope_id)}/commits/"
    pairs: list[tuple[int, str]] = []
    for obj in iter_objects(r2, prefix=prefix):
        page = page_number_from_key(obj["key"])
        if page is None:
            continue
        pairs.append((page, obj["key"]))
    pairs.sort(key=lambda pair: pair[0])
    return pairs


def fetch_commit(r2: R2Client, key: str) -> PageCommit:
    body = r2.s3.get_object(Bucket=r2.bucket_name, Key=key)["Body"].read()
    data = json.loads(body.decode("utf-8"))
    return PageCommit.from_dict(data)


def reconstruct_state(
    r2: R2Client,
    *,
    scope_id: str,
    max_page: int = 1_000_000,
) -> ReconstructedState:
    pairs = list_commit_objects(r2, scope_id)
    if not pairs:
        return ReconstructedState(
            scope_id=scope_id,
            last_committed_page=0,
            last_committed_next_cursor=None,
            terminal=False,
            gap_detected=False,
            gap_after_page=None,
            total_commits_seen=0,
        )

    page_set = {p for p, _ in pairs if 1 <= p <= max_page}
    if not page_set:
        return ReconstructedState(
            scope_id=scope_id,
            last_committed_page=0,
            last_committed_next_cursor=None,
            terminal=False,
            gap_detected=False,
            gap_after_page=None,
            total_commits_seen=len(pairs),
        )

    contiguous_run: list[int] = []
    expected = 1
    while expected in page_set:
        contiguous_run.append(expected)
        expected += 1

    last_page = contiguous_run[-1]
    last_key = commit_manifest_key(scope_id, last_page)
    last_commit = fetch_commit(r2, last_key)

    gap_detected = len(pairs) > len(contiguous_run)
    gap_after = contiguous_run[-1] if gap_detected else None

    return ReconstructedState(
        scope_id=scope_id,
        last_committed_page=last_page,
        last_committed_next_cursor=last_commit.next_cursor,
        terminal=last_commit.terminal,
        gap_detected=gap_detected,
        gap_after_page=gap_after,
        total_commits_seen=len(pairs),
    )
