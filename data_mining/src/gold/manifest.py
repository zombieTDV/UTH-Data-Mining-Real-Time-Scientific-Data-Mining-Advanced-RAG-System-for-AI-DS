import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from src.gold.contracts import GOLD_SCHEMA_VERSION
from src.models.embeddings.nomic_v15 import NomicV15Spec


logger = logging.getLogger(__name__)


class GoldRunManifest:
    def __init__(
        self,
        run_id: str,
        silver_prefix: str,
        silver_scope_id: str,
        silver_schema_version: str,
        spec: NomicV15Spec,
        gold_schema_version: str = GOLD_SCHEMA_VERSION,
    ):
        self.run_id = run_id
        self.silver_prefix = silver_prefix
        self.silver_scope_id = silver_scope_id
        self.silver_schema_version = silver_schema_version
        self.spec = spec
        self.gold_schema_version = gold_schema_version
        self._started_at = datetime.now(timezone.utc).isoformat()
        self._completed_at: Optional[str] = None
        self._statistics: dict = {}
        self._vector_parquet_prefix: Optional[str] = None
        self._lancedb_snapshot: Optional[str] = None
        self._snapshot_files: list[str] = []

    def set_output(
        self,
        vector_parquet_prefix: str,
        lancedb_snapshot: str,
    ) -> None:
        self._vector_parquet_prefix = vector_parquet_prefix
        self._lancedb_snapshot = lancedb_snapshot

    def set_statistics(
        self,
        documents_total: int,
        documents_skipped: int,
        documents_embedded: int,
        chunks_total: int,
        tokens_total: int,
        parquet_bytes: int,
        lancedb_rows: int,
        r2_files_uploaded: int,
        r2_bytes_uploaded: int,
        snapshot_build_seconds: float,
        snapshot_publish_seconds: float,
    ) -> None:
        self._statistics = {
            "documents_total": documents_total,
            "documents_skipped": documents_skipped,
            "documents_embedded": documents_embedded,
            "chunks_total": chunks_total,
            "tokens_total": tokens_total,
            "parquet_bytes": parquet_bytes,
            "lancedb_rows": lancedb_rows,
            "r2_files_uploaded": r2_files_uploaded,
            "r2_bytes_uploaded": r2_bytes_uploaded,
            "snapshot_build_seconds": snapshot_build_seconds,
            "snapshot_publish_seconds": snapshot_publish_seconds,
        }

    def mark_completed(self) -> None:
        self._completed_at = datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> dict:
        manifest = {
            "run_id": self.run_id,
            "pipeline": "openalex_gold_v1",
            "source": {
                "silver_prefix": self.silver_prefix,
                "silver_scope_id": self.silver_scope_id,
                "silver_schema_version": self.silver_schema_version,
            },
            "model": {
                "id": self.spec.repo_id,
                "revision": self.spec.revision,
                "fingerprint": self.spec.fingerprint(),
                "dimension": self.spec.base_dimension,
            },
            "embedding": {
                "max_length": self.spec.pipeline_max_length,
                "pooling_version": self.spec.pooling_version,
                "prefix_policy": self.spec.document_prefix,
            },
            "output": {
                "gold_schema_version": self.gold_schema_version,
                "vector_parquet_prefix": self._vector_parquet_prefix,
                "lancedb_snapshot": self._lancedb_snapshot,
            },
            "statistics": self._statistics,
            "started_at": self._started_at,
            "completed_at": self._completed_at,
        }
        return manifest

    def save(self, path: Path) -> None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(self.to_dict(), f, indent=2)
        logger.info("Run manifest saved: %s", path)

    @classmethod
    def load(cls, path: Path) -> "GoldRunManifest":
        with open(path) as f:
            data = json.load(f)
        spec = NomicV15Spec(
            repo_id=data["model"]["id"],
            revision=data["model"]["revision"],
        )
        manifest = cls(
            run_id=data["run_id"],
            silver_prefix=data["source"]["silver_prefix"],
            silver_scope_id=data["source"]["silver_scope_id"],
            silver_schema_version=data["source"]["silver_schema_version"],
            spec=spec,
            gold_schema_version=data["output"]["gold_schema_version"],
        )
        manifest._started_at = data["started_at"]
        manifest._completed_at = data.get("completed_at")
        manifest._statistics = data.get("statistics", {})
        manifest._vector_parquet_prefix = data["output"].get("vector_parquet_prefix")
        manifest._lancedb_snapshot = data["output"].get("lancedb_snapshot")
        logger.info("Run manifest loaded: %s", path)
        return manifest
