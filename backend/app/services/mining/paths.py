import logging
from pathlib import Path

from backend.app.core.config import settings
from backend.app.services.mining.constants import FALLBACK_ARTIFACT_DIR

logger = logging.getLogger("mining_service")


def resolve_artifact_path(filename: str) -> Path:
    file_path = settings.MINING_ARTIFACTS_DIR / filename
    if file_path.exists():
        return file_path

    logger.warning(
        "[MINING] Artifact %s not found at %s. Attempting fallback.", filename, file_path
    )
    return settings.PROJECT_ROOT_DIR.joinpath(*FALLBACK_ARTIFACT_DIR, filename)
