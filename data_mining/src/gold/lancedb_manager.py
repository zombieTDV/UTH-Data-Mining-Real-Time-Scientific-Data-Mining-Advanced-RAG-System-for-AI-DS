import logging
from pathlib import Path
from typing import Optional

import lancedb
import pandas as pd

from src.config.settings import settings
from src.gold.schema import GOLD_TABLE_NAME, gold_arrow_schema
from src.models.embeddings.nomic_v15 import NomicV15Spec


logger = logging.getLogger(__name__)


class GoldLanceDBManager:
    def __init__(
        self,
        db_path: Optional[Path] = None,
        spec: Optional[NomicV15Spec] = None,
        embedding_dim: int = 768,
        r2_client: Optional["R2Client"] = None,
    ):
        self.db_path = Path(db_path or (settings.ROOT_DIR / "data" / "gold" / "lancedb"))
        self.db_path.mkdir(parents=True, exist_ok=True)
        self.spec = spec or NomicV15Spec()
        self.embedding_dim = embedding_dim
        self.table_name = f"{GOLD_TABLE_NAME}_{self.spec.fingerprint()[:8]}"
        self._schema = gold_arrow_schema(embedding_dim=embedding_dim)
        self.db = lancedb.connect(str(self.db_path))
        self._r2_client = r2_client

    def table_exists(self) -> bool:
        return self.table_name in self.db.table_names()

    def open_table(self):
        if not self.table_exists():
            raise FileNotFoundError(f"Table not found: {self.table_name}")
        return self.db.open_table(self.table_name)

    def create_table(self) -> "lancedb.table.Table":
        if self.table_exists():
            logger.info("Table already exists: %s", self.table_name)
            return self.open_table()

        import pyarrow.parquet as pq

        empty_data = {field.name: [] for field in self._schema}
        empty_path = self.db_path / "_schema_init.parquet"
        pq.write_table(
            pq.table_from_pydict(empty_data, schema=self._schema),
            str(empty_path),
        )
        table = self.db.create_table(
            self.table_name,
            data=str(empty_path),
            mode="overwrite",
        )
        empty_path.unlink(missing_ok=True)

        table.create_index(
            column="vector",
            index_type="IVF_FLAT",
            num_partitions=256,
            num_sub_vectors=self.embedding_dim,
        )
        logger.info("Table created: %s", self.table_name)
        return table

    def upsert(self, rows: list[dict]) -> int:
        if not rows:
            return 0

        if not self.table_exists():
            self.create_table()

        table = self.open_table()

        df = pd.DataFrame(rows)

        if "embedding_id" in df.columns:
            table.merge_insert("embedding_id") \
                .when_matched_update_all() \
                .when_not_matched_insert_all() \
                .execute(df)
        else:
            table.add(df)

        return len(rows)

    def search(
        self,
        query_vector: list[float],
        limit: int = 5,
        filter_expr: Optional[str] = None,
    ) -> "pd.DataFrame":
        table = self.open_table()
        search_query = table.search(query_vector).limit(limit)

        if filter_expr:
            search_query = search_query.where(filter_expr, prefilter=True)

        return search_query.to_pandas()

    def search_by_filter(
        self,
        filter_expr: str,
        limit: int = 100,
    ) -> "pd.DataFrame":
        table = self.open_table()
        return table.search().where(filter_expr, prefilter=True).limit(limit).to_pandas()

    def get_row_count(self) -> int:
        if not self.table_exists():
            return 0
        table = self.open_table()
        return table.to_lance().count_rows()

    def get_stats(self) -> dict:
        return {
            "table_name": self.table_name,
            "model_fingerprint": self.spec.fingerprint(),
            "embedding_dim": self.embedding_dim,
            "row_count": self.get_row_count(),
        }

    def snapshot_dir(self) -> Path:
        return self.db_path / "snapshots"

    def close_writers(self) -> None:
        if self.table_exists():
            table = self.open_table()
            if hasattr(table, "to_lance"):
                lance_table = table.to_lance()
                if hasattr(lance_table, "close"):
                    lance_table.close()
