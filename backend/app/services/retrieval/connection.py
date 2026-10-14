import logging

import lancedb

from backend.app.core.config import settings

logger = logging.getLogger("retrieval_service")

R2_REGION = "auto"


def build_storage_options():
    if not settings.LANCEDB_URI.startswith("s3://"):
        return None
    return {
        "endpoint": settings.R2_ENDPOINT_URL,
        "aws_access_key_id": settings.R2_ACCESS_KEY_ID,
        "aws_secret_access_key": settings.R2_SECRET_ACCESS_KEY,
        "region": R2_REGION,
    }
