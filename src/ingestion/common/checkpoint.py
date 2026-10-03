"""Atomic checkpoint save/load.

Per Rule #7: Save checkpoints incrementally; never re-crawl.
Per Rule #12: Write to .tmp + os.replace for atomicity.
"""

import datetime
import json
import os
import tempfile
import threading
from pathlib import Path
from typing import Any, Dict, Optional


class CheckpointStore:
    """Thread-safe, atomic JSON checkpoint on local filesystem.

    For production, use storage.checkpoint_store.R2CheckpointStore to back this
    with Cloudflare R2 for durability.
    """

    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def load(self) -> Dict[str, Any]:
        if not self.path.exists():
            return {}
        try:
            with self._lock:
                with open(self.path, "r", encoding="utf-8") as f:
                    return json.load(f)
        except (OSError, json.JSONDecodeError):
            return {}

    def save(self, state: Dict[str, Any]) -> None:
        """Atomically write state to disk."""
        if "last_updated" not in state:
            state = dict(state)
            state["last_updated"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self._lock:
            fd, tmp_path = tempfile.mkstemp(
                dir=str(self.path.parent), prefix=f".{self.path.name}.", suffix=".tmp"
            )
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as f:
                    json.dump(state, f, indent=2, ensure_ascii=False)
                os.replace(tmp_path, self.path)
            except Exception:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)
                raise

    def merge_update(self, partial: Dict[str, Any]) -> Dict[str, Any]:
        """Load current state, update with partial, save, and return the new state."""
        current = self.load()
        current.update(partial)
        self.save(current)
        return current

    def clear(self) -> None:
        with self._lock:
            if self.path.exists():
                self.path.unlink()
