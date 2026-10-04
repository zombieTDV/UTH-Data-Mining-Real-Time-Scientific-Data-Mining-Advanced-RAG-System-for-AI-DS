"""
backend/app/services/retrieval_service.py
-----------------------------------------
Vector and Full-Text Retrieval Service wrapping LanceDB Gold Table
with robust auto-seeding and keyword fallback.
"""

import logging
from typing import List, Optional
import lancedb
from backend.app.core.config import settings
from backend.app.schemas.search import ChunkDto, SearchRequest
from backend.app.services.gold_corpus import CANONICAL_SCIENTIFIC_CHUNKS, ensure_lancedb_seeded

logger = logging.getLogger("retrieval_service")


class RetrievalService:
    def __init__(self):
        self.db = None
        self.table = None
        self._ready = False
        self._init_db()

    def _init_db(self):
        try:
            logger.info("[RETRIEVAL] Verifying LanceDB at: %s (table: %s)", settings.LANCEDB_URI, settings.LANCEDB_TABLE)
            ensure_lancedb_seeded(settings.LANCEDB_URI, settings.LANCEDB_TABLE)
            storage_options = None
            if settings.LANCEDB_URI.startswith("s3://"):
                storage_options = {
                    "endpoint": settings.R2_ENDPOINT_URL,
                    "aws_access_key_id": settings.R2_ACCESS_KEY_ID,
                    "aws_secret_access_key": settings.R2_SECRET_ACCESS_KEY,
                    "region": "auto",
                }
            self.db = lancedb.connect(settings.LANCEDB_URI, storage_options=storage_options)
            self.table = self.db.open_table(settings.LANCEDB_TABLE)
            # Verify table can be read
            self.table.head(1)
            self._ready = True
            logger.info("[RETRIEVAL] [SUCCESS] Opened LanceDB table: %s (%d rows)", settings.LANCEDB_TABLE, len(self.table))
        except Exception as e:
            logger.error("[RETRIEVAL] [ERROR] Failed to connect or read LanceDB: %s", str(e))
            self._ready = False

    def is_ready(self) -> bool:
        return self._ready and self.table is not None

    def search(self, req: SearchRequest) -> List[ChunkDto]:
        k = req.top_k or 5
        results: List[ChunkDto] = []

        if self.is_ready():
            try:
                # 1. Primary path: Full-Text Search via LanceDB Inverted Index
                query_builder = self.table.search(req.query, query_type="fts")
                if req.category:
                    query_builder = query_builder.where(f"primary_category = '{req.category}'")

                rows = query_builder.limit(k).to_pandas()

                for _, r in rows.iterrows():
                    raw_authors = r.get("authors")
                    if hasattr(raw_authors, "tolist"):
                        authors_list = [str(a) for a in raw_authors.tolist()]
                    elif isinstance(raw_authors, list):
                        authors_list = [str(a) for a in raw_authors]
                    else:
                        authors_list = [str(raw_authors)] if raw_authors else []

                    raw_score = float(r.get("_score", 1.0)) if "_score" in r else 1.0
                    # Normalize FTS BM25 score into a 0.80 - 0.98 similarity range
                    norm_score = min(0.98, max(0.80, 0.82 + (raw_score / 50.0)))

                    results.append(
                        ChunkDto(
                            chunk_id=str(r.get("chunk_id", "")),
                            paper_id=str(r.get("paper_id", "")),
                            title=str(r.get("title", "")),
                            text=str(r.get("text", "")),
                            abstract=str(r.get("abstract", "")) if r.get("abstract") else None,
                            authors=authors_list,
                            year=int(r.get("year", 2024)) if r.get("year") else 2024,
                            primary_category=str(r.get("primary_category", "")) if r.get("primary_category") else None,
                            section_title=str(r.get("section_title", "")) if r.get("section_title") else None,
                            score=round(norm_score, 4),
                            source=f"{settings.LANCEDB_URI}/{settings.LANCEDB_TABLE}",
                        )
                    )

                if results:
                    return results
            except Exception as e:
                logger.warning("[RETRIEVAL] LanceDB search encountered exception: %s. Using fallback matcher.", str(e))

        # 2. Resilient Fallback: Canonical In-Memory Corpus Matcher
        return self._fallback_keyword_search(req.query, req.category, k)

    def _fallback_keyword_search(self, query: str, category: Optional[str], top_k: int) -> List[ChunkDto]:
        tokens = [t.lower().strip("?,.!") for t in query.split() if len(t) > 2]
        scored_chunks = []

        for c in CANONICAL_SCIENTIFIC_CHUNKS:
            if category and c.get("primary_category") != category:
                continue

            content = (f"{c.get('paper_id', '')} {c.get('title', '')} {c.get('text', '')} {c.get('section_title', '')}").lower()
            match_count = sum(1 for tok in tokens if tok in content)

            if match_count > 0:
                score = round(min(0.96, 0.80 + (match_count * 0.03)), 4)
                scored_chunks.append((match_count, score, c))

        # Sort descending by match count
        scored_chunks.sort(key=lambda x: x[0], reverse=True)
        top_matches = scored_chunks[:top_k]

        results = []
        for _, score, c in top_matches:
            results.append(
                ChunkDto(
                    chunk_id=c["chunk_id"],
                    paper_id=c["paper_id"],
                    title=c["title"],
                    text=c["text"],
                    abstract=c.get("abstract"),
                    authors=c.get("authors", []),
                    year=c.get("year", 2024),
                    primary_category=c.get("primary_category"),
                    section_title=c.get("section_title"),
                    score=score,
                    source="canonical_gold_corpus",
                )
            )
        return results

    def get_paper(self, paper_id: str) -> List[ChunkDto]:
        if self.is_ready():
            try:
                rows = self.table.search().where(f"paper_id = '{paper_id}'").limit(20).to_pandas()
                results = []
                for _, r in rows.iterrows():
                    results.append(
                        ChunkDto(
                            chunk_id=str(r.get("chunk_id", "")),
                            paper_id=str(r.get("paper_id", "")),
                            title=str(r.get("title", "")),
                            text=str(r.get("text", "")),
                            primary_category=str(r.get("primary_category", "")),
                            section_title=str(r.get("section_title", "")),
                            source=f"{settings.LANCEDB_URI}/{settings.LANCEDB_TABLE}",
                        )
                    )
                if results:
                    return results
            except Exception as e:
                logger.error("[RETRIEVAL] Error fetching paper %s: %s", paper_id, str(e))

        # Fallback to in-memory corpus
        return [
            ChunkDto(
                chunk_id=c["chunk_id"],
                paper_id=c["paper_id"],
                title=c["title"],
                text=c["text"],
                abstract=c.get("abstract"),
                authors=c.get("authors", []),
                year=c.get("year", 2024),
                primary_category=c.get("primary_category"),
                section_title=c.get("section_title"),
                score=0.90,
                source="canonical_gold_corpus",
            )
            for c in CANONICAL_SCIENTIFIC_CHUNKS
            if c.get("paper_id") == paper_id
        ]


retrieval_service = RetrievalService()
