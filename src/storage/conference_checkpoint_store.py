"""Checkpoint store backed by the existing R2/Local object stores.

The conference pipeline keeps a JSON checkpoint per (source, venue) so it
can resume from the last successful (year, cursor) pair.
"""

import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional

from src.ingestion.common.checkpoint import CheckpointStore

logger = logging.getLogger(__name__)


class ConferenceCheckpointStore:
    """Checkpoint store that lives under data/manifests/conferences/.

    For production durability, we mirror the JSON to R2 under
    `bronze/conferences/_checkpoints/<source>.json`. The local copy is
    always the source of truth; R2 is a backup.
    """

    def __init__(self, base_dir: Path, object_store=None):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self._local: Dict[str, CheckpointStore] = {}
        self._object_store = object_store  # R2Client or LocalObjectStore (optional)

    def _path_for(self, source: str, venue: str) -> Path:
        return self.base_dir / f"{source.lower()}_{venue.lower()}.json"

    def _store(self, source: str, venue: str) -> CheckpointStore:
        key = f"{source}:{venue}"
        if key not in self._local:
            self._local[key] = CheckpointStore(self._path_for(source, venue))
        return self._local[key]

    def load(self, source: str, venue: str) -> Dict[str, Any]:
        return self._store(source, venue).load()

    def save(self, source: str, venue: str, state: Dict[str, Any]) -> None:
        store = self._store(source, venue)
        store.save(state)
        # Mirror to object store if provided
        if self._object_store is not None:
            try:
                key = f"bronze/conferences/_checkpoints/{source.lower()}_{venue.lower()}.json"
                self._object_store.upload_json(
                    payload=state,
                    key=key,
                    metadata={"source": source, "venue": venue},
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "[checkpoint:%s:%s] failed to mirror to object store: %s", source, venue, exc
                )

    def merge(self, source: str, venue: str, partial: Dict[str, Any]) -> Dict[str, Any]:
        store = self._store(source, venue)
        merged = store.merge_update(partial)
        if self._object_store is not None:
            try:
                self._object_store.upload_json(
                    payload=merged,
                    key=f"bronze/conferences/_checkpoints/{source.lower()}_{venue.lower()}.json",
                )
            except Exception:  # noqa: BLE001
                pass
        return merged
