from typing import Dict

from backend.app.api.endpoints.mining.constants import (
    TRIGGER_QUEUED_MESSAGE,
    TRIGGER_QUEUED_STATUS,
    TRIGGER_UPLOAD_TO_R2,
)
from data_mining.src.mining.mining_engine import MiningEngine


def run_mining_pipeline() -> None:
    engine = MiningEngine()
    engine.run_all(upload_to_r2=TRIGGER_UPLOAD_TO_R2)


def build_trigger_response() -> Dict[str, str]:
    return {
        "status": TRIGGER_QUEUED_STATUS,
        "message": TRIGGER_QUEUED_MESSAGE,
    }
