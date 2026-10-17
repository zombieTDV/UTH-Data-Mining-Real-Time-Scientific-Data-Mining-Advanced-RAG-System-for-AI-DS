"""Lakehouse Deduplication Service based on Normalized Abstract Hashing.

Ensures absolute deduplication across arXiv, OpenReview, CVF, and Zenodo:
- Normalizes abstract text (lowercased, whitespace-collapsed, math-symbol cleaned).
- Computes cryptographic SHA-256 hash (64 hex characters).
- Maintains a fast in-memory set persisted to MinIO at manifests/lakehouse_abstract_hashes.json.
- Provides O(1) duplicate checks and thread-safe hash recording.
"""

import json
import logging
import threading
from typing import Dict, Optional, Set, Tuple

import datetime

from src.storage.lakehouse_io import LakehouseIO
from src.utils.hasher import compute_abstract_hash, normalize_abstract_text

logger = logging.getLogger("lakehouse_deduplicator")


class LakehouseDeduplicator:
    """Singleton-ready thread-safe abstract hash deduplicator for all Lakehouse ingestion tiers.

    The registry lives in MinIO (MANIFEST_KEY); nothing is written to local disk.
    """

    MANIFEST_KEY = "manifests/lakehouse_abstract_hashes.json"

    _instance: Optional["LakehouseDeduplicator"] = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self, io: Optional[LakehouseIO] = None, manifest_key: Optional[str] = None):
        if getattr(self, "_initialized", False):
            return

        self.io = io or LakehouseIO()
        self.manifest_key = manifest_key or self.MANIFEST_KEY
        self._hashes: Dict[str, str] = {}  # hash -> paper_id
        self._new_entries = 0
        self._io_lock = threading.Lock()
        self._load_manifest()
        self._initialized = True

    def _load_manifest(self):
        """Loads indexed abstract hashes from the MinIO manifest into memory."""
        data = self.io.get_json(self.manifest_key)
        if data is None:
            logger.info("[DEDUP] Manifest %s not found in MinIO. Starting with empty registry.", self.manifest_key)
            return
        if isinstance(data, dict) and "hashes" in data:
            self._hashes = data["hashes"]
        elif isinstance(data, dict):
            self._hashes = data
        logger.info("[DEDUP] Loaded %d known abstract hashes from MinIO.", len(self._hashes))

    def compute_hash(self, abstract: str, title: str = "") -> str:
        """Computes SHA-256 hash from normalized abstract or fallback title."""
        target_text = str(abstract).strip() if abstract and len(str(abstract).strip()) > 30 else str(title).strip()
        return compute_abstract_hash(target_text)

    def is_duplicate(self, abstract: str, title: str = "") -> Tuple[bool, str]:
        """Returns (is_duplicate, calculated_hash)."""
        h = self.compute_hash(abstract, title)
        with self._io_lock:
            is_dup = h in self._hashes
        return is_dup, h

    def record(self, abstract_hash: str, paper_id: str) -> bool:
        """Records a new paper hash. Returns True if newly added, False if it existed."""
        with self._io_lock:
            if abstract_hash in self._hashes:
                return False
            self._hashes[abstract_hash] = str(paper_id)
            self._new_entries += 1
            return True

    def save(self):
        """Persists updated hashes to the MinIO manifest (single atomic PUT)."""
        with self._io_lock:
            if self._new_entries == 0:
                return
            manifest_data = {
                "total_unique_hashes": len(self._hashes),
                "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "hashes": self._hashes,
            }
            try:
                self.io.put_json(self.manifest_key, manifest_data)
                # Tiny side file so the backend can show the registry size without downloading the whole manifest
                self.io.put_json(self.manifest_key.replace(".json", ".count.json"), {"total": len(self._hashes), "updated_at": manifest_data["updated_at"]})
                logger.info("[DEDUP] Saved %d total hashes (+%d new) to MinIO", len(self._hashes), self._new_entries)
                self._new_entries = 0
            except Exception as e:
                logger.error("[DEDUP] Failed to write manifest to MinIO: %s", e)

    def __len__(self) -> int:
        return len(self._hashes)

    def __contains__(self, abstract_hash: str) -> bool:
        return abstract_hash in self._hashes
