import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from src.config.settings import settings
from src.utils.hasher import compute_sha256


logger = logging.getLogger(__name__)


@dataclass
class FileHash:
    relative_path: str
    sha256: str
    size_bytes: int


@dataclass
class PublishResult:
    snapshot_id: str
    files_uploaded: int
    bytes_uploaded: int
    r2_prefix: str
    all_verified: bool


class GoldSnapshotPublisher:
    def __init__(
        self,
        r2_client: Optional["boto3.client"] = None,
        gold_r2_prefix: str = "gold/openalex/v1/",
    ):
        self._r2_client = r2_client
        self.gold_r2_prefix = gold_r2_prefix

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

    def _hash_directory(self, snapshot_dir: Path) -> list[FileHash]:
        file_hashes = []
        for file_path in sorted(snapshot_dir.rglob("*")):
            if file_path.is_file():
                rel = str(file_path.relative_to(snapshot_dir))
                sha = compute_sha256(file_path)
                size = file_path.stat().st_size
                file_hashes.append(FileHash(relative_path=rel, sha256=sha, size_bytes=size))
        return file_hashes

    def _upload_and_verify(
        self,
        local_path: Path,
        r2_key: str,
    ) -> bool:
        self.r2_client.upload_file(str(local_path), settings.R2_BUCKET_NAME, r2_key)

        head = self.r2_client.head_object(
            Bucket=settings.R2_BUCKET_NAME,
            Key=r2_key,
        )
        return head["ContentLength"] == local_path.stat().st_size

    def publish(
        self,
        snapshot_dir: Path,
        snapshot_id: Optional[str] = None,
    ) -> PublishResult:
        if not snapshot_dir.exists():
            raise FileNotFoundError(f"Snapshot directory not found: {snapshot_dir}")

        snapshot_id = snapshot_id or (
            f"gold_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}"
        )
        snapshot_r2_prefix = f"{self.gold_r2_prefix}snapshots/{snapshot_id}/"
        manifest_r2_key = f"{snapshot_r2_prefix}snapshot_manifest.json"

        logger.info("Publishing snapshot: %s", snapshot_id)
        logger.info("R2 prefix: %s", snapshot_r2_prefix)

        file_hashes = self._hash_directory(snapshot_dir)
        logger.info("Files to upload: %d", len(file_hashes))

        files_uploaded = 0
        bytes_uploaded = 0
        all_verified = True

        for fh in file_hashes:
            local_path = snapshot_dir / fh.relative_path
            r2_key = f"{snapshot_r2_prefix}{fh.relative_path}"

            ok = self._upload_and_verify(local_path, r2_key)
            if not ok:
                logger.error("Verification failed for: %s", r2_key)
                all_verified = False

            files_uploaded += 1
            bytes_uploaded += fh.size_bytes

        snapshot_manifest = {
            "snapshot_id": snapshot_id,
            "published_at": datetime.now(timezone.utc).isoformat(),
            "r2_prefix": snapshot_r2_prefix,
            "files": [
                {"path": fh.relative_path, "sha256": fh.sha256, "size": fh.size_bytes}
                for fh in file_hashes
            ],
            "total_files": len(file_hashes),
            "total_bytes": bytes_uploaded,
        }

        import tempfile
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(snapshot_manifest, f, indent=2)
            manifest_temp = f.name

        self._upload_and_verify(Path(manifest_temp), manifest_r2_key)
        Path(manifest_temp).unlink(missing_ok=True)

        logger.info(
            "Snapshot published: %s, files=%d, bytes=%d, verified=%s",
            snapshot_id, files_uploaded, bytes_uploaded, all_verified,
        )

        return PublishResult(
            snapshot_id=snapshot_id,
            files_uploaded=files_uploaded,
            bytes_uploaded=bytes_uploaded,
            r2_prefix=snapshot_r2_prefix,
            all_verified=all_verified,
        )
