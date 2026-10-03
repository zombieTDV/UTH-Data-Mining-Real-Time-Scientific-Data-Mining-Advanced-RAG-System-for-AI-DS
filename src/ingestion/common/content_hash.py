"""Re-export of compute_sha256 for the conference pipeline.

Per Rule #19: Compare SHA-256 to skip unchanged payloads.
"""

from src.utils.hasher import compute_sha256  # noqa: F401

__all__ = ["compute_sha256"]
