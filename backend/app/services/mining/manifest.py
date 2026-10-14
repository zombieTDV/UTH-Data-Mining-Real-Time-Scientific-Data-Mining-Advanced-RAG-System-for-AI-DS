from typing import Any, Dict

from backend.app.services.mining.constants import (
    MANIFEST_FILENAME,
    MANIFEST_STANDBY_STATUS,
    MANIFEST_STANDBY_TOTAL_PAPERS,
)
from backend.app.services.mining.loader import ArtifactLoader


def build_manifest(loader: ArtifactLoader) -> Dict[str, Any]:
    try:
        return loader._load_json(MANIFEST_FILENAME)
    except Exception:
        return {
            "status": MANIFEST_STANDBY_STATUS,
            "total_papers": MANIFEST_STANDBY_TOTAL_PAPERS,
        }
