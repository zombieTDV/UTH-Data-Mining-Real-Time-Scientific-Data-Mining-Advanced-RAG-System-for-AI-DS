import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import duckdb

from src.gold.contracts import GOLD_SCHEMA_VERSION
from src.models.embeddings.nomic_v15 import NomicV15Spec


logger = logging.getLogger(__name__)


class GoldRegistry:
    def __init__(
        self,
        registry_path: Optional[Path] = None,
    ):
        self.registry_path = registry_path or (
            Path("/tmp")
        )
        self._conn: Optional[duckdb.DuckDBPyConnection] = None

    @property
    def conn(self) -> duckdb.DuckDBPyConnection:
        if self._conn is None:
            self._conn = duckdb.connect(str(self.registry_path / "gold_registry.duckdb"))
            self._ensure_schema()
        return self._conn

    def _ensure_schema(self) -> None:
        self.conn.execute("""
            CREATE SEQUENCE IF NOT EXISTS registry_id_seq
        """)
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS gold_registry (
                registry_id BIGINT DEFAULT nextval('registry_id_seq'),
                paper_id VARCHAR NOT NULL,
                chunk_id VARCHAR NOT NULL UNIQUE,
                embedding_id VARCHAR NOT NULL UNIQUE,
                source_content_hash VARCHAR NOT NULL,
                embedding_config_hash VARCHAR NOT NULL,
                gold_snapshot_id VARCHAR,
                embedded_at VARCHAR NOT NULL,
                PRIMARY KEY (chunk_id, embedding_config_hash)
            )
        """)
        self.conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_paper_id ON gold_registry(paper_id)
        """)
        self.conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_content_hash ON gold_registry(source_content_hash)
        """)

    def lookup(
        self,
        paper_id: str,
        source_content_hash: str,
        embedding_config_hash: str,
    ) -> Optional[str]:
        result = self.conn.execute("""
            SELECT embedding_id
            FROM gold_registry
            WHERE paper_id = ?
              AND source_content_hash = ?
              AND embedding_config_hash = ?
            LIMIT 1
        """, [paper_id, source_content_hash, embedding_config_hash]).fetchone()
        return result[0] if result else None

    def is_indexed(
        self,
        paper_id: str,
        source_content_hash: str,
        embedding_config_hash: str,
    ) -> bool:
        return self.lookup(paper_id, source_content_hash, embedding_config_hash) is not None

    def register(
        self,
        paper_id: str,
        chunk_id: str,
        embedding_id: str,
        source_content_hash: str,
        embedding_config_hash: str,
        gold_snapshot_id: Optional[str] = None,
    ) -> None:
        embedded_at = datetime.now(timezone.utc).isoformat()
        self.conn.execute("""
            INSERT INTO gold_registry
                (paper_id, chunk_id, embedding_id, source_content_hash,
                 embedding_config_hash, gold_snapshot_id, embedded_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (chunk_id, embedding_config_hash)
            DO UPDATE SET
                embedding_id = excluded.embedding_id,
                gold_snapshot_id = excluded.gold_snapshot_id,
                embedded_at = excluded.embedded_at
        """, [
            paper_id, chunk_id, embedding_id,
            source_content_hash, embedding_config_hash,
            gold_snapshot_id, embedded_at,
        ])

    def get_stats(self) -> dict:
        total = self.conn.execute("SELECT COUNT(*) FROM gold_registry").fetchone()[0]
        unique_papers = self.conn.execute(
            "SELECT COUNT(DISTINCT paper_id) FROM gold_registry"
        ).fetchone()[0]
        return {
            "total_chunks": total,
            "unique_papers": unique_papers,
            "schema_version": GOLD_SCHEMA_VERSION,
        }

    def close(self) -> None:
        if self._conn is not None:
            self._conn.close()
            self._conn = None
