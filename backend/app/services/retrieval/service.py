import logging
from typing import List

import lancedb

from backend.app.core.config import settings
from backend.app.schemas.search import ChunkDto, SearchRequest
from backend.app.services.retrieval.connection import build_storage_options
from backend.app.services.retrieval.defaults import DEFAULT_SEARCH_MODE
from backend.app.services.retrieval.queries import build_paper_query, build_search_query
from backend.app.services.retrieval.row_mapper import to_paper_chunk, to_search_chunk

logger = logging.getLogger("retrieval_service")


class RetrievalService:
    def __init__(self):
        self.db = None
        self.table = None
        self._ready = False
        self._init_db()

    def _init_db(self):
        try:
            logger.info("[RETRIEVAL] Connecting to LanceDB at: %s", settings.LANCEDB_URI)
            storage_options = build_storage_options()
            self.db = lancedb.connect(settings.LANCEDB_URI, storage_options=storage_options)
            self.table = self.db.open_table(settings.LANCEDB_TABLE)
            self._ready = True
            logger.info(
                "[RETRIEVAL] [SUCCESS] Opened LanceDB table: %s (%d rows)",
                settings.LANCEDB_TABLE,
                len(self.table),
            )
        except Exception as e:
            logger.error("[RETRIEVAL] [ERROR] Failed to connect to LanceDB: %s", str(e))
            self._ready = False

    def is_ready(self) -> bool:
        return self._ready and self.table is not None

    def _resolve_mode(self, req: SearchRequest) -> str:
        return (req.mode or DEFAULT_SEARCH_MODE).lower()

    def search(self, req: SearchRequest) -> List[ChunkDto]:
        if not self.is_ready():
            logger.warning("[RETRIEVAL] LanceDB table not ready. Returning empty list.")
            return []

        try:
            self._resolve_mode(req)
            query_builder = build_search_query(
                self.table,
                req.query,
                req.category,
                req.top_k,
            )
            rows = query_builder.to_pandas()
            return [to_search_chunk(r) for _, r in rows.iterrows()]
        except Exception as e:
            logger.error("[RETRIEVAL] Search execution failed: %s", str(e))
            return []

    def get_paper(self, paper_id: str) -> List[ChunkDto]:
        if not self.is_ready():
            return []
        try:
            rows = build_paper_query(self.table, paper_id).to_pandas()
            return [to_paper_chunk(r) for _, r in rows.iterrows()]
        except Exception as e:
            logger.error("[RETRIEVAL] Error fetching paper %s: %s", paper_id, str(e))
            return []


retrieval_service = RetrievalService()
