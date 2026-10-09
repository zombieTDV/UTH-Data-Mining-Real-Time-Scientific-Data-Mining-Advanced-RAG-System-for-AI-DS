"""Lakehouse Deduplication Service based on Normalized Abstract Hashing.

Ensures absolute deduplication across arXiv, OpenReview, CVF, and Zenodo:
- Normalizes abstract text (lowercased, whitespace-collapsed, math-symbol cleaned).
- Computes cryptographic SHA-256 hash (64 hex characters).
- Maintains fast in-memory set loaded from data/manifests/lakehouse_abstract_hashes.json.
- Provides O(1) duplicate checks and thread-safe hash recording.
"""

import json
import logging
import threading
from pathlib import Path
from typing import Dict, Optional, Set, Tuple

from src.config.settings import settings
from src.utils.hasher import compute_abstract_hash, normalize_abstract_text

logger = logging.getLogger("lakehouse_deduplicator")


class LakehouseDeduplicator:
    """Singleton-ready thread-safe abstract hash deduplicator for all Lakehouse ingestion tiers."""

    _instance: Optional["LakehouseDeduplicator"] = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self, manifest_path: Optional[Path] = None):
        if getattr(self, "_initialized", False):
            return

        self.manifest_path = manifest_path or (
            settings.ROOT_DIR / "data" / "manifests" / "lakehouse_abstract_hashes.json"
        )
        self.manifest_path.parent.mkdir(parents=True, exist_ok=True)
        self._hashes: Dict[str, str] = {}  # hash -> paper_id
        self._new_entries = 0
        self._io_lock = threading.Lock()
        self._load_manifest()
        self._initialized = True

    def _load_manifest(self):
        """Loads indexed abstract hashes from manifest file into memory."""
        if not self.manifest_path.exists():
            logger.info("[DEDUP] Manifest not found at %s. Starting with empty registry.", self.manifest_path)
            return

        try:
            with open(self.manifest_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict) and "hashes" in data:
                    self._hashes = data["hashes"]
                elif isinstance(data, dict):
                    self._hashes = data
                logger.info("[DEDUP] Loaded %d known abstract hashes from manifest.", len(self._hashes))
        except Exception as e:
            logger.error("[DEDUP] Error reading manifest %s: %s", self.manifest_path, e)
            self._hashes = {}

    def compute_hash(self, abstract: str, title: str = "") -> str:
        """Computes SHA-256 hash from normalized abstract or fallback title."""
        target_text = str(abstract).strip() if abstract and len(str(abstract).strip()) > 30 else str(title).strip()
        return compute_abstract_hash(target_text)

    def is_duplicate(self, abstract: str, title: str = "") -> Tuple[bool, str]:
        """Checks if abstract/title is already present in Lakehouse.
        
        Returns:
            Tuple[bool, str]: (is_duplicate, calculated_hash)
        """
        h = self.compute_hash(abstract, title)
        with self._io_lock:
            is_dup = h in self._hashes
        return is_dup, h

    def record(self, abstract_hash: str, paper_id: str) -> bool:
        """Records a new paper hash into the registry. Returns True if newly added, False if existed."""
        with self._io_lock:
            if abstract_hash in self._hashes:
                return False
            self._hashes[abstract_hash] = str(paper_id)
            self._new_entries += 1
            return True

    def save(self):
        """Persists updated hashes back to JSON manifest on disk."""
        with self._io_lock:
            if self._new_entries == 0 and self.manifest_path.exists():
                return

            manifest_data = {
                "total_unique_hashes": len(self._hashes),
                "updated_at": settings.ROOT_DIR.name,
                "hashes": self._hashes,
            }

            temp_path = self.manifest_path.with_suffix(".tmp")
            try:
                with open(temp_path, "w", encoding="utf-8") as f:
                    json.dump(manifest_data, f)
                temp_path.replace(self.manifest_path)
                logger.info("[DEDUP] Saved %d total hashes (+%d new) to %s", len(self._hashes), self._new_entries, self.manifest_path)
                self._new_entries = 0
            except Exception as e:
                logger.error("[DEDUP] Failed to write manifest: %s", e)
                if temp_path.exists():
                    temp_path.unlink()

    def __len__(self) -> int:
        return len(self._hashes)
