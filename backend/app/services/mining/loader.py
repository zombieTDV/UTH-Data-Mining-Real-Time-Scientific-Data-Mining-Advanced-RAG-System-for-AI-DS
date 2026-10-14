import json
import logging
from pathlib import Path
from typing import Any, Dict

from backend.app.services.mining.constants import ARTIFACT_NOT_FOUND_MESSAGE
from backend.app.services.mining.paths import resolve_artifact_path

logger = logging.getLogger("mining_service")


class ArtifactLoader:
    def __init__(self) -> None:
        self._cache: Dict[str, Any] = {}

    def _load_json(self, filename: str) -> Dict[str, Any]:
        if filename in self._cache:
            return self._cache[filename]

        file_path: Path = resolve_artifact_path(filename)
        if not file_path.exists():
            raise FileNotFoundError(ARTIFACT_NOT_FOUND_MESSAGE.format(filename=filename))

        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        self._cache[filename] = data
        return data

    def clear(self) -> None:
        self._cache.clear()
