from fastapi import HTTPException

from backend.app.api.endpoints.mining.constants import ARTIFACT_NOT_FOUND_STATUS


def raise_artifact_not_found(error: FileNotFoundError) -> None:
    raise HTTPException(status_code=ARTIFACT_NOT_FOUND_STATUS, detail=str(error))
