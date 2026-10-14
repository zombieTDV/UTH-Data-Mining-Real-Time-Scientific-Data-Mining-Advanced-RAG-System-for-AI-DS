from typing import Any, Dict

from backend.app.services.mining import mining_service


def read_manifest() -> Dict[str, Any]:
    return mining_service.get_manifest()
