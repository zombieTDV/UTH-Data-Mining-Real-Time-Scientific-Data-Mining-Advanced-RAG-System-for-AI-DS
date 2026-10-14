import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from src.gold.contracts import GOLD_SCHEMA_VERSION
from src.models.embeddings.nomic_v15 import NomicV15Spec


logger = logging.getLogger(__name__)

PIPELINE_STATE_RUNNING = "RUNNING"
PIPELINE_STATE_COMPLETED = "COMPLETED"
PIPELINE_STATE_FAILED = "FAILED"


class GoldCheckpoint:
    def __init__(
        self,
        pipeline_id: str,
        silver_scope_id: str,
        silver_version: str,
        spec: NomicV15Spec,
        checkpoint_path: Optional[Path] = None,
    ):
        self.pipeline_id = pipeline_id
        self.silver_scope_id = silver_scope_id
        self.silver_version = silver_version
        self.spec = spec
        self.checkpoint_path = checkpoint_path

        self.last_partition: Optional[str] = None
        self.last_batch_id: int = 0
        self.documents_seen: int = 0
        self.documents_embedded: int = 0
        self.documents_skipped: int = 0
        self.chunks_written: int = 0
        self.state: str = PIPELINE_STATE_RUNNING
        self._created_at = datetime.now(timezone.utc)

    def to_dict(self) -> dict:
        return {
            "pipeline": "openalex_gold_v1",
            "pipeline_id": self.pipeline_id,
            "silver_scope_id": self.silver_scope_id,
            "silver_version": self.silver_version,
            "model_fingerprint": self.spec.fingerprint(),
            "embedding_config_hash": self.spec.config_hash(),
            "gold_schema_version": GOLD_SCHEMA_VERSION,
            "last_partition": self.last_partition,
            "last_batch_id": self.last_batch_id,
            "documents_seen": self.documents_seen,
            "documents_embedded": self.documents_embedded,
            "documents_skipped": self.documents_skipped,
            "chunks_written": self.chunks_written,
            "state": self.state,
            "created_at": self._created_at.isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

    def save(self, path: Optional[Path] = None) -> Path:
        target = path or self.checkpoint_path
        if target is None:
            raise ValueError("checkpoint_path not set and no path provided")
        target = Path(target)
        target.parent.mkdir(parents=True, exist_ok=True)
        with open(target, "w") as f:
            json.dump(self.to_dict(), f, indent=2)
        logger.info("Checkpoint saved: %s", target)
        return target

    @classmethod
    def load(cls, path: Path) -> "GoldCheckpoint":
        with open(path) as f:
            data = json.load(f)
        spec = NomicV15Spec(
            repo_id=data.get("model_id", "nomic-ai/nomic-embed-text-v1.5"),
            revision=data.get("model_revision", ""),
        )
        ckpt = cls(
            pipeline_id=data["pipeline_id"],
            silver_scope_id=data["silver_scope_id"],
            silver_version=data["silver_version"],
            spec=spec,
            checkpoint_path=path,
        )
        ckpt.last_partition = data.get("last_partition")
        ckpt.last_batch_id = data.get("last_batch_id", 0)
        ckpt.documents_seen = data.get("documents_seen", 0)
        ckpt.documents_embedded = data.get("documents_embedded", 0)
        ckpt.documents_skipped = data.get("documents_skipped", 0)
        ckpt.chunks_written = data.get("chunks_written", 0)
        ckpt.state = data.get("state", PIPELINE_STATE_RUNNING)
        logger.info("Checkpoint loaded: %s state=%s", path, ckpt.state)
        return ckpt

    def advance_batch(
        self,
        partition: str,
        batch_id: int,
        docs_seen: int,
        docs_embedded: int,
        docs_skipped: int,
        chunks: int,
    ) -> None:
        self.last_partition = partition
        self.last_batch_id = batch_id
        self.documents_seen += docs_seen
        self.documents_embedded += docs_embedded
        self.documents_skipped += docs_skipped
        self.chunks_written += chunks
        if self.checkpoint_path:
            self.save()
