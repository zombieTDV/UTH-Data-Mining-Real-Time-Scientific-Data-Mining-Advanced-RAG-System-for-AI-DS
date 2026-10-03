"""JSONL Bronze writer for the conference pipeline.

Why JSONL batched instead of 1-file-per-paper:
    - For OpenAlex with per_page=200 and ~5000 papers per venue per year, writing
      1 file per paper would mean ~20,000 PUTs to R2 per venue per year.
    - Batching 200 papers into a single .jsonl file reduces PUTs ~200x.
    - SHA-256 is still computed over the entire batch payload, so the
      "Immutable Raw Invariant" from REFACTOR_STATUS.md is preserved.
    - Per-paper IDs are listed in a sidecar ``_manifest.json`` for fast
      lookup without parsing the JSONL.

Bronze layout (R2 / Local):
    bronze/conferences/<venue>/year=<year>/batch_<sha256>.jsonl
    bronze/conferences/<venue>/year=<year>/_manifest/<sha256>.json
"""

import datetime
import hashlib
import json
import logging
import threading
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

logger = logging.getLogger(__name__)


class JsonlBronzeWriter:
    """Batched JSONL writer.

    Usage:
        writer = JsonlBronzeWriter(
            object_store=...,
            base_prefix="bronze/conferences",
            max_batch_size=200,
        )
        for paper in stream:
            writer.add(paper)
        writer.flush()  # ensure last batch is uploaded
    """

    def __init__(
        self,
        object_store,
        base_prefix: str,
        max_batch_size: int = 200,
        max_batch_bytes: int = 5 * 1024 * 1024,  # 5 MB upper bound
        venue: str = "",
    ):
        self.object_store = object_store
        self.base_prefix = base_prefix.rstrip("/")
        self.max_batch_size = max_batch_size
        self.max_batch_bytes = max_batch_bytes
        self.venue = venue

        self._buffer: List[Dict[str, Any]] = []
        self._buffer_bytes: int = 0
        self._lock = threading.Lock()
        self._total_flushed: int = 0
        self._total_papers: int = 0

    @staticmethod
    def _encode(paper: Dict[str, Any]) -> bytes:
        return (json.dumps(paper, ensure_ascii=False, sort_keys=True) + "\n").encode("utf-8")

    def add(self, paper: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Add a paper to the buffer. Flushes automatically when thresholds are hit.

        Returns the upload summary dict from the underlying store if a flush
        happened, otherwise None.
        """
        encoded = self._encode(paper)
        with self._lock:
            self._buffer.append(paper)
            self._buffer_bytes += len(encoded)
            self._total_papers += 1
            should_flush = (
                len(self._buffer) >= self.max_batch_size
                or self._buffer_bytes >= self.max_batch_bytes
            )
            if should_flush:
                return self._flush_locked()
        return None

    def extend(self, papers: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Add many papers; return list of upload summaries for flushed batches."""
        summaries: List[Dict[str, Any]] = []
        for p in papers:
            s = self.add(p)
            if s is not None:
                summaries.append(s)
        return summaries

    def flush(self) -> Optional[Dict[str, Any]]:
        """Force a flush of the remaining buffer."""
        with self._lock:
            if not self._buffer:
                return None
            return self._flush_locked()

    def _flush_locked(self) -> Dict[str, Any]:
        """Flush the current buffer. Caller must hold the lock."""
        if not self._buffer:
            return {"count": 0, "batches": 0}
        # Year is taken from the first paper; if heterogeneous, split per year.
        # For OpenAlex/OpenReview, all papers in a single _fetch_year share the
        # same year, so we keep one batch.
        year = self._buffer[0].get("year") or "unknown"
        batch_bytes = b"".join(self._encode(p) for p in self._buffer)
        digest = hashlib.sha256(batch_bytes).hexdigest()
        # Filename includes venue + year + sha256 of contents
        prefix = f"{self.base_prefix}/{self.venue.lower()}/year={year}"
        key = f"{prefix}/batch_{digest}.jsonl"
        metadata = {
            "venue": self.venue,
            "year": str(year),
            "paper_count": str(len(self._buffer)),
            "sha256": digest,
            "ingested_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }
        res = self.object_store.upload_bytes(
            data=batch_bytes,
            key=key,
            content_type="application/x-ndjson",
            metadata=metadata,
        )
        # Sidecar manifest mapping sha256 -> paper_ids
        manifest = {
            "key": key,
            "venue": self.venue,
            "year": year,
            "paper_count": len(self._buffer),
            "sha256": digest,
            "size_bytes": len(batch_bytes),
            "paper_ids": [p.get("paper_id") for p in self._buffer if p.get("paper_id")],
            "ingested_at": metadata["ingested_at"],
        }
        manifest_key = f"{prefix}/_manifest/{digest}.json"
        try:
            self.object_store.upload_json(payload=manifest, key=manifest_key)
        except Exception as exc:  # noqa: BLE001
            logger.warning("[bronze] manifest upload failed for %s: %s", key, exc)

        summary = {
            "key": key,
            "uri": res["uri"],
            "sha256": digest,
            "size_bytes": res["size_bytes"],
            "paper_count": len(self._buffer),
            "year": year,
        }
        self._total_flushed += 1
        self._buffer = []
        self._buffer_bytes = 0
        return summary

    @property
    def total_papers(self) -> int:
        return self._total_papers

    @property
    def total_flushed(self) -> int:
        return self._total_flushed
