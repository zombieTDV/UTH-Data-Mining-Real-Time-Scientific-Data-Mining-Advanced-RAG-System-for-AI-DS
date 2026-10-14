import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

from src.gold.contracts import GoldDocument
from src.gold.schema import gold_arrow_schema
from src.models.embeddings.nomic_v15 import NomicV15Spec


logger = logging.getLogger(__name__)


@dataclass
class VectorWriteResult:
    rows_written: int
    parquet_path: Path
    bytes_written: int


class VectorWriter:
    def __init__(
        self,
        output_dir: Path,
        spec: NomicV15Spec,
        embedding_dim: int = 768,
    ):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.spec = spec
        self.embedding_dim = embedding_dim
        self.schema = gold_arrow_schema(embedding_dim=embedding_dim)
        self.part_writers: dict[str, list[dict]] = {}

    def _build_row(
        self,
        doc: GoldDocument,
        vector: np.ndarray,
        token_count: int,
        gold_run_id: str,
    ) -> dict:
        from hashlib import sha256

        embedding_config_key = self.spec.config_hash()
        raw_id = f"{doc.paper_id}{doc.chunk_id()}{doc.source_content_hash}{embedding_config_key}"
        embedding_id = sha256(raw_id.encode()).hexdigest()

        row = {
            "embedding_id": embedding_id,
            "chunk_id": doc.chunk_id(),
            "paper_id": doc.paper_id,
            "source": doc.source,
            "title": doc.title,
            "text": doc.text,
            "doi": doc.doi,
            "authors_json": doc.authors_json,
            "publication_date": doc.publication_date,
            "updated_date": doc.updated_date,
            "primary_topic": doc.primary_topic,
            "topics_json": doc.topics_json,
            "vector": vector.flatten().tolist(),
            "word_count": doc.text.count(" ") + doc.text.count("\n") + 1,
            "token_count": token_count,
            "source_content_hash": doc.source_content_hash,
            "silver_schema_version": doc.silver_schema_version,
            "model_id": self.spec.repo_id,
            "model_revision": self.spec.revision,
            "model_fingerprint": self.spec.fingerprint(),
            "embedding_dim": self.embedding_dim,
            "max_length": self.spec.pipeline_max_length,
            "pooling_version": self.spec.pooling_version,
            "prefix_policy": self.spec.document_prefix,
            "embedding_config_hash": self.spec.config_hash(),
            "text_builder_version": doc.text_builder_version,
            "chunker_version": "abstract-v1",
            "gold_run_id": gold_run_id,
            "embedded_at": datetime.now(timezone.utc).isoformat(),
        }
        return row

    def write_batch(
        self,
        documents: list[GoldDocument],
        vectors: np.ndarray,
        token_counts: list[int],
        gold_run_id: str,
        partition: Optional[str] = None,
    ) -> VectorWriteResult:
        if len(documents) != len(vectors) or len(documents) != len(token_counts):
            raise ValueError(
                f"Mismatch: {len(documents)} docs, {len(vectors)} vectors, "
                f"{len(token_counts)} token counts"
            )

        rows = []
        for doc, vec, tokens in zip(documents, vectors, token_counts):
            rows.append(self._build_row(doc, vec, tokens, gold_run_id))

        table = pa.Table.from_pydict(
            {field.name: [r[field.name] for r in rows] for field in self.schema},
            schema=self.schema,
        )

        partition_key = partition or "default"
        if partition_key not in self.part_writers:
            self.part_writers[partition_key] = []

        part_dir = self.output_dir / f"partition={partition_key}"
        part_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        part_path = part_dir / f"part-{ts}-{len(rows)}.parquet"

        pq.write_table(table, str(part_path), compression="zstd")
        bytes_written = part_path.stat().st_size

        self.part_writers[partition_key].append(part_path)

        logger.info(
            "Written batch: %d rows to %s (%.1f KB)",
            len(rows), part_path, bytes_written / 1024,
        )

        return VectorWriteResult(
            rows_written=len(rows),
            parquet_path=part_path,
            bytes_written=bytes_written,
        )

    def flush(self) -> list[Path]:
        flushed = []
        for paths in self.part_writers.values():
            flushed.extend(paths)
        self.part_writers.clear()
        return flushed
