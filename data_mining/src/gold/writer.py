import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import numpy as np
import pyarrow.parquet as pq

from src.gold.checkpoint import GoldCheckpoint
from src.gold.contracts import GoldDocument
from src.gold.openalex_adapter import OpenAlexAdapter
from src.gold.registry import GoldRegistry
from src.gold.vector_writer import VectorWriter
from src.models.embeddings.nomic_v15 import NomicV15Spec


logger = logging.getLogger(__name__)


@dataclass
class PipelineStats:
    documents_seen: int = 0
    documents_embedded: int = 0
    documents_skipped: int = 0
    chunks_written: int = 0
    batches_processed: int = 0


class GoldPipelineWriter:
    def __init__(
        self,
        silver_dir: Path,
        output_dir: Path,
        spec: NomicV15Spec,
        silver_scope_id: str,
        silver_version: str,
        batch_size: int = 32,
        allow_title_only: bool = False,
        registry_path: Optional[Path] = None,
        checkpoint_path: Optional[Path] = None,
    ):
        self.silver_dir = Path(silver_dir)
        self.output_dir = Path(output_dir)
        self.spec = spec
        self.batch_size = batch_size
        self.stats = PipelineStats()
        self.run_id = f"gold_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}"

        self.adapter = OpenAlexAdapter(allow_title_only=allow_title_only)
        self.registry = GoldRegistry(registry_path=registry_path)
        self.vector_writer = VectorWriter(
            output_dir=self.output_dir / "vectors",
            spec=self.spec,
            embedding_dim=spec.base_dimension,
        )
        self.checkpoint = GoldCheckpoint(
            pipeline_id=self.run_id,
            silver_scope_id=silver_scope_id,
            silver_version=silver_version,
            spec=self.spec,
            checkpoint_path=checkpoint_path,
        )

    def _embed_batch(self, documents: list[GoldDocument]) -> tuple[list[GoldDocument], np.ndarray, list[int]]:
        from src.models.embeddings.nomic_v15 import NomicV15Encoder

        encoder = NomicV15Encoder(
            model_dir=self._resolve_model_dir(),
            spec=self.spec,
            device="auto",
        )
        texts = [doc.text for doc in documents]
        result = encoder.encode_batch(texts, self.spec.document_prefix)
        return documents, result.vectors, result.tokens_per_sample

    def _resolve_model_dir(self) -> Path:
        default = Path("models") / self.spec.repo_id.split("/")[-1] / self.spec.revision
        if default.exists():
            return default
        raise FileNotFoundError(
            f"Model not found at {default}. "
            f"Run: python -m src.pipelines.prepare_embedding_model"
        )

    def _should_embed(self, doc: GoldDocument) -> bool:
        return not self.registry.is_indexed(
            paper_id=doc.paper_id,
            source_content_hash=doc.source_content_hash,
            embedding_config_hash=self.spec.config_hash(),
        )

    def run(self, silver_files: Optional[list[Path]] = None) -> PipelineStats:
        if silver_files is None:
            silver_files = list(self.silver_dir.rglob("papers.parquet"))
        logger.info("Silver files: %d", len(silver_files))
        logger.info("Batch size: %d", self.batch_size)

        for silver_path in silver_files:
            self._process_partition(silver_path)

        self.stats.batches_processed += 1
        logger.info(
            "Pipeline complete: seen=%d embedded=%d skipped=%d chunks=%d",
            self.stats.documents_seen,
            self.stats.documents_embedded,
            self.stats.documents_skipped,
            self.stats.chunks_written,
        )
        return self.stats

    def _process_partition(self, silver_path: Path) -> None:
        partition = silver_path.parent.name
        logger.info("Processing partition: %s", partition)

        table = pq.read_table(str(silver_path))
        row_dicts = []
        for i in range(table.num_rows):
            d = {}
            for c in table.schema.names:
                d[c] = table.column(c)[i].as_py()
            row_dicts.append(d)

        documents = self.adapter.adapt_batch(
            row_dicts,
            silver_schema_version=self.checkpoint.silver_version,
        )

        part_seen = 0
        part_skipped = 0
        part_embedded = 0
        part_chunks = 0
        to_embed: list[GoldDocument] = []
        for doc in documents:
            part_seen += 1
            if self._should_embed(doc):
                to_embed.append(doc)
            else:
                part_skipped += 1

        if to_embed:
            embedded_docs, vectors, token_counts = self._embed_batch(to_embed)

            vr = self.vector_writer.write_batch(
                documents=embedded_docs,
                vectors=vectors,
                token_counts=token_counts,
                gold_run_id=self.run_id,
                partition=partition,
            )
            part_chunks = vr.rows_written
            part_embedded = len(embedded_docs)

            for doc in embedded_docs:
                self.registry.register(
                    paper_id=doc.paper_id,
                    chunk_id=doc.chunk_id(),
                    embedding_id=f"placeholder",
                    source_content_hash=doc.source_content_hash,
                    embedding_config_hash=self.spec.config_hash(),
                    gold_snapshot_id=None,
                )

        self.stats.documents_seen += part_seen
        self.stats.documents_skipped += part_skipped
        self.stats.documents_embedded += part_embedded
        self.stats.chunks_written += part_chunks

        self.checkpoint.advance_batch(
            partition=partition,
            batch_id=0,
            docs_seen=part_seen,
            docs_embedded=part_embedded,
            docs_skipped=part_skipped,
            chunks=part_chunks,
        )

    def close(self) -> None:
        self.registry.close()
        self.vector_writer.flush()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False
