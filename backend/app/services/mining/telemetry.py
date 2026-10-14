import datetime
import json
from typing import Any, Dict

from backend.app.services.mining.constants import (
    TELEMETRY_DEFAULT_EXECUTION_SECONDS,
    TELEMETRY_DEFAULT_STATUS,
    TELEMETRY_TOTAL_PAPERS,
)


def build_telemetry_payload(manifest: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "timestamp": datetime.datetime.now().isoformat(),
        "status": manifest.get("status", TELEMETRY_DEFAULT_STATUS),
        "total_execution_seconds": manifest.get(
            "total_execution_seconds", TELEMETRY_DEFAULT_EXECUTION_SECONDS
        ),
        "total_papers": TELEMETRY_TOTAL_PAPERS,
        "modules": manifest.get("modules", {}),
    }


def serialize_telemetry(manifest: Dict[str, Any]) -> str:
    return json.dumps(build_telemetry_payload(manifest))
