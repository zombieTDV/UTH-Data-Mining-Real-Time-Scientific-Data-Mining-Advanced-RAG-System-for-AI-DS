"""Dead-Letter Queue for failed records.

Per Rule #18: After max retries, write to DLQ for later inspection.
Format: JSON Lines (one record per line), one file per (source, date).
"""

import datetime
import json
import logging
import threading
from pathlib import Path
from typing import Any, Dict, Optional

from src.config.settings import settings

logger = logging.getLogger(__name__)


class DeadLetterQueue:
    """Append-only DLQ of records that exhausted retries."""

    def __init__(self, base_dir: Optional[Path] = None):
        self.base_dir = Path(base_dir or settings.CRAWLER_DEAD_LETTER_DIR)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def _path_for(self, source: str, date: Optional[str] = None) -> Path:
        date = date or datetime.date.today().isoformat()
        return self.base_dir / source / f"{date}.jsonl"

    def push(
        self,
        source: str,
        record_id: str,
        payload: Any,
        error: str,
        attempts: int,
        extra: Optional[Dict[str, Any]] = None,
    ) -> Path:
        path = self._path_for(source)
        path.parent.mkdir(parents=True, exist_ok=True)
        entry = {
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "source": source,
            "record_id": record_id,
            "attempts": attempts,
            "error": error,
            "payload": payload,
            "extra": extra or {},
        }
        line = json.dumps(entry, ensure_ascii=False)
        with self._lock:
            with open(path, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        logger.error("[DLQ:%s] %s -> %s", source, record_id, path)
        return path

    def list_sources(self):
        return sorted(p.name for p in self.base_dir.iterdir() if p.is_dir())

    def list_dates(self, source: str):
        d = self.base_dir / source
        if not d.is_dir():
            return []
        return sorted(p.name for p in d.iterdir() if p.suffix == ".jsonl")

    def read_day(self, source: str, date: str):
        path = self._path_for(source, date)
        if not path.exists():
            return []
        with open(path, "r", encoding="utf-8") as f:
            return [json.loads(line) for line in f if line.strip()]
