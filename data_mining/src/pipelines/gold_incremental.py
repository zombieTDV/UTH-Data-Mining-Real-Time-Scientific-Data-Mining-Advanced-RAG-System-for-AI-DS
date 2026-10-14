import logging
from pathlib import Path
from typing import Optional

from src.gold.checkpoint import GoldCheckpoint
from src.gold.writer import GoldPipelineWriter, PipelineStats


logger = logging.getLogger(__name__)


class IncrementalGoldPipeline(GoldPipelineWriter):
    def __init__(
        self,
        silver_dir: Path,
        output_dir: Path,
        spec: "NomicV15Spec",
        silver_scope_id: str,
        silver_version: str,
        batch_size: int = 32,
        allow_title_only: bool = False,
        checkpoint_path: Optional[Path] = None,
        registry_path: Optional[Path] = None,
    ):
        super().__init__(
            silver_dir=silver_dir,
            output_dir=output_dir,
            spec=spec,
            silver_scope_id=silver_scope_id,
            silver_version=silver_version,
            batch_size=batch_size,
            allow_title_only=allow_title_only,
            checkpoint_path=checkpoint_path,
            registry_path=registry_path,
        )
        self._checkpoint_loaded = False

    def _load_checkpoint(self) -> bool:
        if self.checkpoint.checkpoint_path and self.checkpoint.checkpoint_path.exists():
            try:
                loaded = GoldCheckpoint.load(self.checkpoint.checkpoint_path)
                self.checkpoint = loaded
                self._checkpoint_loaded = True
                logger.info(
                    "Checkpoint loaded: pipeline_id=%s state=%s "
                    "last_partition=%s docs_seen=%d",
                    loaded.pipeline_id,
                    loaded.state,
                    loaded.last_partition,
                    loaded.documents_seen,
                )
                return True
            except Exception as e:
                logger.warning("Could not load checkpoint: %s. Starting fresh.", e)
        return False

    def run(self, silver_files: Optional[list[Path]] = None) -> PipelineStats:
        self._load_checkpoint()

        if silver_files is None:
            silver_files = sorted(self._silver_dir.rglob("papers.parquet"))

        if self._checkpoint_loaded and self.checkpoint.last_partition:
            seen_partitions = set()
            filtered = []
            for sf in silver_files:
                partition = sf.parent.name
                if partition not in seen_partitions:
                    seen_partitions.add(partition)
                    if partition <= self.checkpoint.last_partition:
                        logger.info("Skipping partition (already processed): %s", partition)
                        continue
                filtered.append(sf)
            silver_files = filtered
            logger.info("Checkpoint resume: processing %d remaining partitions", len(silver_files))
        else:
            logger.info("No checkpoint found. Starting fresh: %d partitions", len(silver_files))

        for silver_path in silver_files:
            self._process_partition(silver_path)

        self.stats.batches_processed += 1
        logger.info(
            "Incremental pipeline complete: seen=%d embedded=%d skipped=%d chunks=%d",
            self.stats.documents_seen,
            self.stats.documents_embedded,
            self.stats.documents_skipped,
            self.stats.chunks_written,
        )
        return self.stats

    @property
    def _silver_dir(self) -> Path:
        return self.silver_dir

    @property
    def state(self) -> str:
        return self.checkpoint.state

    def get_progress(self) -> dict:
        return {
            "pipeline_id": self.checkpoint.pipeline_id,
            "state": self.checkpoint.state,
            "last_partition": self.checkpoint.last_partition,
            "last_batch_id": self.checkpoint.last_batch_id,
            "documents_seen": self.checkpoint.documents_seen,
            "documents_embedded": self.checkpoint.documents_embedded,
            "documents_skipped": self.checkpoint.documents_skipped,
            "chunks_written": self.checkpoint.chunks_written,
        }
