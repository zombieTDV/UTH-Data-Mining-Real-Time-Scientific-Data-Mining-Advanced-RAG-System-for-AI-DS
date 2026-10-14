import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from src.config.settings import settings
from src.models.embeddings.nomic_v15 import NomicV15Spec


logger = logging.getLogger(__name__)


@dataclass
class LatestPointer:
    snapshot_id: str
    table_name: str
    r2_prefix: str
    model_id: str
    model_revision: str
    model_fingerprint: str
    embedding_dim: int
    gold_schema_version: str
    run_manifest: Optional[str]
    published_at: str

    def to_dict(self) -> dict:
        return {
            "snapshot_id": self.snapshot_id,
            "table_name": self.table_name,
            "r2_prefix": self.r2_prefix,
            "model_id": self.model_id,
            "model_revision": self.model_revision,
            "model_fingerprint": self.model_fingerprint,
            "embedding_dim": self.embedding_dim,
            "gold_schema_version": self.gold_schema_version,
            "run_manifest": self.run_manifest,
            "published_at": self.published_at,
        }


class GoldSnapshotManager:
    LATEST_FILENAME = "_latest.json"

    def __init__(
        self,
        spec: Optional[NomicV15Spec] = None,
        gold_schema_version: str = "openalex-gold-v1",
    ):
        self.spec = spec or NomicV15Spec()
        self.gold_schema_version = gold_schema_version
        self._r2_client = None

    @property
    def r2_client(self):
        if self._r2_client is None:
            import boto3
            from botocore.config import Config

            self._r2_client = boto3.client(
                "s3",
                endpoint_url=settings.get_r2_endpoint(),
                aws_access_key_id=settings.R2_ACCESS_KEY_ID,
                aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
                config=Config(signature_version="s3v4"),
            )
        return self._r2_client

    def _local_latest_path(self) -> Path:
        return settings.ROOT_DIR / "data" / "gold" / self.LATEST_FILENAME

    def _r2_latest_key(self) -> str:
        return f"gold/openalex/v1/{self.LATEST_FILENAME}"

    def read_latest(self) -> Optional[LatestPointer]:
        local_path = self._local_latest_path()
        if local_path.exists():
            return self._read_from_file(local_path)

        if settings.R2_ACCESS_KEY_ID:
            return self._read_from_r2()

        return None

    def _read_from_file(self, path: Path) -> LatestPointer:
        with open(path) as f:
            data = json.load(f)
        return LatestPointer(
            snapshot_id=data["snapshot_id"],
            table_name=data["table_name"],
            r2_prefix=data["r2_prefix"],
            model_id=data["model_id"],
            model_revision=data["model_revision"],
            model_fingerprint=data["model_fingerprint"],
            embedding_dim=data["embedding_dim"],
            gold_schema_version=data["gold_schema_version"],
            run_manifest=data.get("run_manifest"),
            published_at=data["published_at"],
        )

    def _read_from_r2(self) -> Optional[LatestPointer]:
        try:
            obj = self.r2_client.get_object(
                Bucket=settings.R2_BUCKET_NAME,
                Key=self._r2_latest_key(),
            )
            body = obj["Body"].read().decode("utf-8")
            data = json.loads(body)
            return LatestPointer(
                snapshot_id=data["snapshot_id"],
                table_name=data["table_name"],
                r2_prefix=data["r2_prefix"],
                model_id=data["model_id"],
                model_revision=data["model_revision"],
                model_fingerprint=data["model_fingerprint"],
                embedding_dim=data["embedding_dim"],
                gold_schema_version=data["gold_schema_version"],
                run_manifest=data.get("run_manifest"),
                published_at=data["published_at"],
            )
        except Exception as e:
            logger.warning("Could not read _latest from R2: %s", e)
            return None

    def write_latest(
        self,
        snapshot_id: str,
        table_name: str,
        r2_prefix: str,
        run_manifest: Optional[str] = None,
    ) -> LatestPointer:
        pointer = LatestPointer(
            snapshot_id=snapshot_id,
            table_name=table_name,
            r2_prefix=r2_prefix,
            model_id=self.spec.repo_id,
            model_revision=self.spec.revision,
            model_fingerprint=self.spec.fingerprint(),
            embedding_dim=self.spec.base_dimension,
            gold_schema_version=self.gold_schema_version,
            run_manifest=run_manifest,
            published_at=datetime.now(timezone.utc).isoformat(),
        )

        local_path = self._local_latest_path()
        local_path.parent.mkdir(parents=True, exist_ok=True)
        with open(local_path, "w") as f:
            json.dump(pointer.to_dict(), f, indent=2)
        logger.info("Latest pointer written locally: %s", local_path)

        if settings.R2_ACCESS_KEY_ID:
            self.r2_client.put_object(
                Bucket=settings.R2_BUCKET_NAME,
                Key=self._r2_latest_key(),
                Body=json.dumps(pointer.to_dict(), indent=2),
                ContentType="application/json",
            )
            logger.info("Latest pointer published to R2: %s", self._r2_latest_key())

        return pointer

    def verify_compatibility(self, query_spec: NomicV15Spec) -> bool:
        pointer = self.read_latest()
        if pointer is None:
            return True

        if pointer.model_fingerprint != query_spec.fingerprint():
            logger.error(
                "Model fingerprint mismatch: index=%s query=%s",
                pointer.model_fingerprint, query_spec.fingerprint(),
            )
            return False

        if pointer.embedding_dim != query_spec.base_dimension:
            logger.error(
                "Embedding dimension mismatch: index=%d query=%d",
                pointer.embedding_dim, query_spec.base_dimension,
            )
            return False

        logger.info("Query compatibility verified: fingerprint=%s dim=%d",
                     pointer.model_fingerprint[:8], pointer.embedding_dim)
        return True
