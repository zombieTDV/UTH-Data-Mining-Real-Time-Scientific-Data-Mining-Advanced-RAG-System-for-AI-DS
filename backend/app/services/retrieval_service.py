"""
backend/app/services/retrieval_service.py
-----------------------------------------
Vector and Full-Text Retrieval Service wrapping LanceDB Gold Table.
"""

import logging
from typing import List, Optional, Tuple
import lancedb
from backend.app.core.config import settings
from backend.app.schemas.search import ChunkDto, SearchRequest

logger = logging.getLogger("retrieval_service")


import json
import re
from pathlib import Path


class RetrievalService:
    def __init__(self):
        self.db = None
        self.table = None
        self._ready = False
        self.influencers: List[dict] = []
        self.max_pagerank: float = 0.012632
        self.rules: List[dict] = []
        self._init_db()
        self._init_graph_and_rules()

    def _init_graph_and_rules(self):
        """Loads citation network influencers and frequent association rules from Lakehouse Gold."""
        try:
            mining_dir = settings.MINING_ARTIFACTS_DIR
            if not mining_dir.exists():
                mining_dir = settings.PROJECT_ROOT_DIR / "data" / "gold" / "mining"

            graph_path = mining_dir / "graph_coauthorship.json"
            if graph_path.exists():
                with open(graph_path, "r", encoding="utf-8") as f:
                    g_data = json.load(f)
                    infs = g_data.get("top_influencers", [])
                    for item in infs:
                        raw = item.get("author", "")
                        m = re.search(r"\(([^)]+)\)", raw)
                        author_part = m.group(1).replace("et al.", "").strip() if m else raw
                        self.influencers.append({
                            "raw": raw,
                            "author_clean": author_part.lower(),
                            "pagerank": float(item.get("pagerank", 0.0)),
                        })
                    if self.influencers:
                        self.max_pagerank = max((i["pagerank"] for i in self.influencers), default=0.012632)
                logger.info("[RETRIEVAL] [SUCCESS] Loaded %d graph influencers (Max PageRank: %.6f)", len(self.influencers), self.max_pagerank)

            rules_path = mining_dir / "association_rules.json"
            if rules_path.exists():
                with open(rules_path, "r", encoding="utf-8") as f:
                    r_data = json.load(f)
                    self.rules = r_data.get("rules", [])
                logger.info("[RETRIEVAL] [SUCCESS] Loaded %d FP-Growth association rules", len(self.rules))
        except Exception as e:
            logger.warning("[RETRIEVAL] [WARN] Could not load graph/rules artifacts: %s", str(e))

    def _match_authority(self, authors: List[str]) -> Tuple[float, Optional[str]]:
        """Matches chunk authors against high-PageRank citation nodes."""
        if not authors or not self.influencers:
            return 0.0, None

        best_pr = 0.0
        best_author = None
        for a in authors:
            a_lower = a.lower().strip()
            for inf in self.influencers:
                if inf["author_clean"] in a_lower or a_lower in inf["author_clean"]:
                    if inf["pagerank"] > best_pr:
                        best_pr = inf["pagerank"]
                        best_author = a
        if best_pr > 0.0:
            norm_pr = min(1.0, best_pr / max(1e-6, self.max_pagerank))
            return norm_pr, best_author
        return 0.0, None

    def _expand_rules(self, query: str, category: Optional[str]) -> List[str]:
        """Expands query context using mined association rules."""
        if not self.rules:
            return []
        q_lower = query.lower()
        expanded: List[str] = []
        for r in self.rules:
            antecedents = [a.lower().replace("cat:", "").replace("tag:", "") for a in r.get("antecedents", [])]
            consequents = [c.replace("cat:", "").replace("tag:", "") for c in r.get("consequents", [])]
            match = False
            if category and any(category.lower() == ant for ant in antecedents):
                match = True
            elif any(ant in q_lower for ant in antecedents):
                match = True
            if match:
                for c in consequents:
                    if c not in expanded:
                        expanded.append(c)
        return expanded[:3]

    def _init_db(self):
        try:
            logger.info("[RETRIEVAL] Connecting to LanceDB at: %s", settings.LANCEDB_URI)
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
            self._ready = True
            logger.info("[RETRIEVAL] [SUCCESS] Opened LanceDB table: %s (%d rows)", settings.LANCEDB_TABLE, len(self.table))
        except Exception as e:
            logger.error("[RETRIEVAL] [ERROR] Failed to connect to LanceDB: %s", str(e))
            self._ready = False

    def is_ready(self) -> bool:
        return self._ready and self.table is not None

    def search(self, req: SearchRequest) -> List[ChunkDto]:
        if not self.is_ready():
            logger.warning("[RETRIEVAL] LanceDB table not ready. Returning empty list.")
            return []

        try:
            k = req.top_k or 5
            mode = (req.mode or "fts").lower()
            rule_expansions = self._expand_rules(req.query, req.category)

            # Retrieve candidate pool for authority reranking
            candidate_limit = max(k * 2, 10)
            query_builder = self.table.search(req.query)
            if req.category:
                query_builder = query_builder.where(f"primary_category = '{req.category}'")

            rows = query_builder.limit(candidate_limit).to_pandas()

            candidates: List[ChunkDto] = []
            for _, r in rows.iterrows():
                raw_authors = r.get("authors")
                if hasattr(raw_authors, "tolist"):
                    authors_list = [str(a) for a in raw_authors.tolist()]
                elif isinstance(raw_authors, list):
                    authors_list = [str(a) for a in raw_authors]
                else:
                    authors_list = [str(raw_authors)] if raw_authors else []

                base_score = float(r.get("_score", 0.85)) if "_score" in r else 0.85
                norm_pr, auth_author = self._match_authority(authors_list)
                # Boost score by up to 25% based on normalized PageRank
                boosted_score = base_score * (1.0 + 0.25 * norm_pr) if norm_pr > 0 else base_score

                candidates.append(
                    ChunkDto(
                        chunk_id=str(r.get("chunk_id", "")),
                        paper_id=str(r.get("paper_id", "")),
                        title=str(r.get("title", "")),
                        text=str(r.get("text", "")),
                        abstract=str(r.get("abstract", "")) if r.get("abstract") else None,
                        authors=authors_list,
                        year=int(r.get("year", 2026)) if r.get("year") else 2026,
                        primary_category=str(r.get("primary_category", "")) if r.get("primary_category") else None,
                        section_title=str(r.get("section_title", "")) if r.get("section_title") else None,
                        score=round(boosted_score, 4),
                        source=f"{settings.LANCEDB_URI}/{settings.LANCEDB_TABLE}",
                        authority_score=round(norm_pr, 4) if norm_pr > 0 else None,
                        authority_author=auth_author,
                        rule_expansions=rule_expansions if rule_expansions else None,
                    )
                )

            # Re-rank candidates by boosted score and slice to top-k
            candidates.sort(key=lambda c: c.score or 0.0, reverse=True)
            return candidates[:k]
        except Exception as e:
            logger.error("[RETRIEVAL] Search execution failed: %s", str(e))
            return []
        except Exception as e:
            logger.error("[RETRIEVAL] Search execution failed: %s", str(e))
            return []

    def get_paper(self, paper_id: str) -> List[ChunkDto]:
        if not self.is_ready():
            return []
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
            return results
        except Exception as e:
            logger.error("[RETRIEVAL] Error fetching paper %s: %s", paper_id, str(e))
            return []


retrieval_service = RetrievalService()
