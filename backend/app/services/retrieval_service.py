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
from backend.app.services.embedder_service import embedder_service

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

    def _compute_lexical_score(self, query: str, text: str, title: Optional[str] = None, section: Optional[str] = None) -> float:
        """In-memory lexical scoring focusing on exact scientific acronyms, identifiers, and keyword matches."""
        if not text:
            return 0.0

        q_lower = query.lower()
        t_lower = text.lower()
        title_lower = (title or "").lower()
        sec_lower = (section or "").lower()

        score = 0.0

        # 1. Exact phrase match bonus
        if len(q_lower) > 5 and q_lower in t_lower:
            score += 5.0
        if title_lower and len(q_lower) > 5 and q_lower in title_lower:
            score += 8.0

        # 2. Extract technical terms and acronyms (e.g. DPO, LoRA, RoPE, GQA, r=16)
        words = re.findall(r"\b[A-Za-z0-9_-]{2,}\b", query)
        stopwords = {"what", "is", "the", "of", "in", "and", "for", "to", "a", "an", "how", "does", "by", "with", "on", "from"}
        meaningful_terms = [w for w in words if w.lower() not in stopwords]

        if not meaningful_terms:
            return 0.0

        matched_terms = 0
        for term in meaningful_terms:
            t_term_lower = term.lower()
            is_acronym = term.isupper() and len(term) >= 2

            # Check in body text
            if t_term_lower in t_lower:
                matched_terms += 1
                score += 3.0 if is_acronym else 1.0

            # Check in title (2x bonus)
            if title_lower and t_term_lower in title_lower:
                score += 4.0 if is_acronym else 2.0

            # Check in section title
            if sec_lower and t_term_lower in sec_lower:
                score += 1.5

        # Term coverage ratio
        coverage = matched_terms / len(meaningful_terms)
        score += coverage * 3.0

        # Normalize score into bounded range [0.0, 1.0]
        norm_lexical = min(1.0, score / max(1.0, len(meaningful_terms) * 5.0))
        return norm_lexical

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
            mode = (req.mode or "vector").lower()
            rule_expansions = self._expand_rules(req.query, req.category)

            # Retrieve candidate pool for authority reranking and fusion
            candidate_limit = max(k * 2, 10)

            # Execute search on LanceDB
            if mode in ("vector", "dense", "hybrid"):
                query_vector = embedder_service.embed_query(req.query)
                if query_vector is not None:
                    query_builder = self.table.search(query_vector).metric("cosine")
                else:
                    logger.warning("[RETRIEVAL] Dense embedding unavailable, falling back to text search.")
                    query_builder = self.table.search(req.query)
            else:
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

                # Calculate base similarity score
                if "_distance" in r:
                    base_score = max(0.0, round(1.0 - float(r["_distance"]), 4))
                elif "_score" in r:
                    base_score = float(r["_score"])
                else:
                    base_score = 0.85

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

            # Apply Reciprocal Rank Fusion (RRF) when mode is 'hybrid'
            if mode == "hybrid" and candidates:
                # Rank indices by dense score
                dense_ranked = sorted(range(len(candidates)), key=lambda i: candidates[i].score or 0.0, reverse=True)
                dense_rank_map = {idx: rank + 1 for rank, idx in enumerate(dense_ranked)}

                # Rank indices by lexical matching score
                lexical_scores = [
                    self._compute_lexical_score(req.query, c.text, c.title, c.section_title)
                    for c in candidates
                ]
                lexical_ranked = sorted(range(len(candidates)), key=lambda i: lexical_scores[i], reverse=True)
                lexical_rank_map = {idx: rank + 1 for rank, idx in enumerate(lexical_ranked)}

                # Combine via RRF (k=60)
                for i, c in enumerate(candidates):
                    r_dense = dense_rank_map[i]
                    r_lex = lexical_rank_map[i]
                    rrf_score = (1.0 / (60.0 + r_dense)) + (1.0 / (60.0 + r_lex))

                    # Scale RRF score into [0.70, 0.95] range
                    max_rrf = 2.0 / 61.0
                    scaled_rrf = 0.70 + (rrf_score / max_rrf) * 0.25

                    # Re-apply normalized PageRank boost
                    norm_pr = c.authority_score or 0.0
                    fused_boosted = scaled_rrf * (1.0 + 0.25 * norm_pr) if norm_pr > 0 else scaled_rrf
                    c.score = round(fused_boosted, 4)

            # Re-rank candidates by final score and slice to top-k
            candidates.sort(key=lambda c: c.score or 0.0, reverse=True)
            return candidates[:k]
        except Exception as e:
            logger.error("[RETRIEVAL] Search execution failed: %s", str(e))
            return []

    def get_paper(self, paper_id: str) -> List[ChunkDto]:
        if not self.is_ready():
            return []
        try:
            # Query chunks from LanceDB
            clean_pid = paper_id.replace("arXiv:", "").strip()
            rows = self.table.search().where(f"paper_id = '{clean_pid}'").limit(20).to_pandas()
            
            # Fetch paper metadata from Silver Parquet if available
            paper_meta = {}
            if settings.SILVER_PARQUET.exists():
                try:
                    import pyarrow.parquet as pq
                    import pyarrow.compute as pc
                    table = pq.read_table(
                        settings.SILVER_PARQUET,
                        columns=["paper_id", "title", "abstract", "authors", "primary_category", "year", "doi"]
                    )
                    filtered = table.filter(pc.equal(table["paper_id"], clean_pid))
                    if filtered.num_rows > 0:
                        paper_meta = filtered.to_pylist()[0]
                except Exception as meta_err:
                    logger.debug("[RETRIEVAL] Could not read metadata from parquet: %s", meta_err)

            results = []
            for _, r in rows.iterrows():
                raw_authors = paper_meta.get("authors") or r.get("authors") or []
                if hasattr(raw_authors, "tolist"):
                    authors_list = [str(a) for a in raw_authors.tolist()]
                elif isinstance(raw_authors, list):
                    authors_list = [str(a) for a in raw_authors]
                else:
                    authors_list = [str(raw_authors)] if raw_authors else []

                results.append(
                    ChunkDto(
                        chunk_id=str(r.get("chunk_id", "")),
                        paper_id=clean_pid,
                        title=str(paper_meta.get("title") or r.get("title", "")),
                        text=str(r.get("text", "")),
                        abstract=str(paper_meta.get("abstract")) if paper_meta.get("abstract") else None,
                        authors=authors_list,
                        year=int(paper_meta.get("year", 2026)) if paper_meta.get("year") else 2026,
                        primary_category=str(paper_meta.get("primary_category") or r.get("primary_category", "")),
                        section_title=str(r.get("section_title", "")),
                        doi=str(paper_meta.get("doi")) if paper_meta.get("doi") else None,
                        source=f"{settings.LANCEDB_URI}/{settings.LANCEDB_TABLE}",
                    )
                )
            return results
        except Exception as e:
            logger.error("[RETRIEVAL] Error fetching paper %s: %s", paper_id, str(e))
            return []



retrieval_service = RetrievalService()
