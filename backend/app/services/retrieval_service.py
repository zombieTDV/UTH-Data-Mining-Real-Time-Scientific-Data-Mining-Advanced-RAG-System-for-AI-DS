"""
backend/app/services/retrieval_service.py
-----------------------------------------
Vector and Full-Text Retrieval Service wrapping LanceDB Gold Table.
"""

import logging
from typing import Any, Dict, List, Optional, Set, Tuple
import lancedb
from backend.app.core.config import settings
from backend.app.schemas.search import ChunkDto, SearchRequest
from backend.app.services.embedder_service import embedder_service

logger = logging.getLogger("retrieval_service")


import json
import math
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

    @staticmethod
    def _normalize_authors(source_a: Any = None, source_b: Any = None) -> List[str]:
        raw = None
        if source_a is not None:
            if hasattr(source_a, "__len__"):
                if len(source_a) > 0:
                    raw = source_a
            else:
                raw = source_a
        if raw is None and source_b is not None:
            if hasattr(source_b, "__len__"):
                if len(source_b) > 0:
                    raw = source_b
            else:
                raw = source_b
        if raw is None:
            return []
        if hasattr(raw, "tolist"):
            return [str(a) for a in raw.tolist()]
        if isinstance(raw, (list, tuple, set)):
            return [str(a) for a in raw]
        return [str(raw)] if raw else []

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

        # 1. Exact phrase and title match bonus
        if len(q_lower) > 5 and q_lower in t_lower:
            score += 5.0
        if title_lower:
            if len(q_lower) > 5 and q_lower in title_lower:
                score += 8.0
            if len(title_lower) >= 8 and title_lower in q_lower:
                score += 10.0

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
            self.vector_dim = None
            self.table_name = settings.LANCEDB_TABLE

            # Check local Lakehouse Gold LanceDB first for sub-second retrieval
            local_gold = settings.PROJECT_ROOT_DIR / "data" / "gold" / "lancedb"
            if local_gold.exists():
                try:
                    logger.info("[RETRIEVAL] Checking local LanceDB at: %s", local_gold)
                    local_conn = lancedb.connect(str(local_gold))
                    tbl_list = local_conn.list_tables()
                    table_names = tbl_list.tables if hasattr(tbl_list, "tables") else list(tbl_list)
                    
                    target_table = None
                    if settings.LANCEDB_TABLE in table_names:
                        target_table = settings.LANCEDB_TABLE
                    elif settings.LANCEDB_URI.startswith("s3://"):
                        logger.info("[RETRIEVAL] Target table '%s' not found locally. Connecting to remote Cloudflare R2...", settings.LANCEDB_TABLE)
                    elif "scientific_papers_gold" in table_names:
                        target_table = "scientific_papers_gold"
                    elif "academic_chunks" in table_names:
                        target_table = "academic_chunks"
                    elif table_names:
                        target_table = table_names[0]

                    if target_table:
                        self.db = local_conn
                        self.table = self.db.open_table(target_table)
                        self.table_name = target_table
                        self._ready = True
                        if "vector" in self.table.schema.names:
                            self.vector_dim = getattr(self.table.schema.field("vector").type, "list_size", None)
                        logger.info("[RETRIEVAL] [SUCCESS] Opened local LanceDB table: %s (%d rows, vector_dim=%s)", target_table, len(self.table), self.vector_dim)
                        return
                except Exception as local_err:
                    logger.warning("[RETRIEVAL] Local LanceDB open failed (%s), falling back to remote config.", str(local_err))

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
            self.table_name = settings.LANCEDB_TABLE
            if "vector" in self.table.schema.names:
                self.vector_dim = getattr(self.table.schema.field("vector").type, "list_size", None)
            self._ready = True
            logger.info("[RETRIEVAL] [SUCCESS] Opened LanceDB table: %s (%d rows, vector_dim=%s)", settings.LANCEDB_TABLE, len(self.table), self.vector_dim)
        except Exception as e:
            logger.error("[RETRIEVAL] [ERROR] Failed to connect to LanceDB: %s", str(e))
            self._ready = False

    def is_ready(self) -> bool:
        return self._ready and self.table is not None

    def _extract_paper_id_from_query(self, query: str) -> Optional[str]:
        """Detects explicit paper IDs (e.g. openalex:W2594538354, W2594538354, 2310.01407) in user query."""
        m_oa = re.search(r"(?:openalex:)?(W\d{8,11})", query, re.IGNORECASE)
        if m_oa:
            return f"openalex:{m_oa.group(1).upper()}"
        m_ar = re.search(r"(?:arxiv:\s*)?(\d{4}\.\d{4,5}(?:v\d+)?)", query, re.IGNORECASE)
        if m_ar:
            return m_ar.group(1)
        return None

    def _lookup_paper_metadata(self, paper_id: str) -> dict:
        """Looks up full metadata for a paper across all Silver Parquet catalogs."""
        clean_pid = paper_id.replace("arXiv:", "").strip()
        search_paths = [
            settings.PROJECT_ROOT_DIR / "data" / "silver" / "papers.parquet",
            settings.PROJECT_ROOT_DIR / "data" / "silver" / "year=2026" / "papers.parquet",
            settings.SILVER_PARQUET,
        ]

        for p in search_paths:
            if not p or not p.exists():
                continue
            try:
                import pyarrow.parquet as pq
                import pyarrow.compute as pc
                tbl = pq.read_table(p)
                col_names = tbl.schema.names

                if "paper_id" in col_names:
                    filt = tbl.filter(pc.equal(tbl["paper_id"], clean_pid))
                    if filt.num_rows > 0:
                        return filt.to_pylist()[0]

                if "openalex_id" in col_names:
                    bare_id = clean_pid.replace("openalex:", "")
                    filt_oa = tbl.filter(pc.equal(tbl["openalex_id"], bare_id))
                    if filt_oa.num_rows > 0:
                        return filt_oa.to_pylist()[0]
            except Exception as err:
                logger.debug("[RETRIEVAL] Could not read metadata from %s: %s", p, err)
        return {}

    def _clean_query_for_title_matching(self, query: str) -> str:
        """Strips conversational noise, filler phrases, and common articles to extract core title/topic."""
        q = query.strip()
        cleaned = re.sub(
            r"^(?:tell\s+me\s+about|can\s+you\s+explain|could\s+you\s+explain|what\s+is|what\s+are|do\s+you\s+have|give\s+me|show\s+me|explain|describe|about)\s+",
            "",
            q,
            flags=re.IGNORECASE,
        ).strip()
        cleaned = re.sub(r"^(?:the|a|an)\s+", "", cleaned, flags=re.IGNORECASE).strip()
        cleaned = re.sub(
            r"\s+(?:paper|article|manuscript|study|thesis|document|work)\b.*$",
            "",
            cleaned,
            flags=re.IGNORECASE,
        ).strip()
        return cleaned

    def _search_title_matches(self, cleaned_title: str) -> List[dict]:
        """Queries Silver Parquet catalogs to find papers whose title closely matches the user's intent."""
        if not cleaned_title or len(cleaned_title) < 4:
            return []

        search_paths = [
            settings.PROJECT_ROOT_DIR / "data" / "silver" / "papers.parquet",
            settings.PROJECT_ROOT_DIR / "data" / "silver" / "year=2026" / "papers.parquet",
            settings.SILVER_PARQUET,
        ]

        import duckdb
        for p in search_paths:
            if not p or not p.exists():
                continue
            try:
                con = duckdb.connect()
                desc = con.execute(f"DESCRIBE SELECT * FROM '{p.as_posix()}'").df()
                cols = set(desc["column_name"].tolist())
                order_clause = "ORDER BY citation_count DESC" if "citation_count" in cols else ""
                sql = f"""
                    SELECT paper_id, title, year, doi
                    FROM '{p.as_posix()}'
                    WHERE lower(title) LIKE ?
                    {order_clause}
                    LIMIT 3
                """
                like_term = f"%{cleaned_title.lower()}%"
                df = con.execute(sql, [like_term]).df()
                if not df.empty:
                    return df.to_dict(orient="records")
            except Exception as err:
                logger.debug("[RETRIEVAL] Title search error on %s: %s", p, err)
        return []

    def search(self, req: SearchRequest) -> List[ChunkDto]:
        if not self.is_ready():
            logger.warning("[RETRIEVAL] LanceDB table not ready. Returning empty list.")
            return []

        try:
            k = req.top_k or 5
            mode = (req.mode or "vector").lower()
            rule_expansions = self._expand_rules(req.query, req.category)

            # Check for direct paper ID in query
            detected_pid = self._extract_paper_id_from_query(req.query)
            if detected_pid:
                try:
                    direct_rows = self.table.search().where(f"paper_id = '{detected_pid}'").limit(k * 2).to_pandas()
                    if direct_rows.empty and detected_pid.startswith("openalex:"):
                        bare = detected_pid.replace("openalex:", "")
                        direct_rows = self.table.search().where(f"paper_id = '{bare}'").limit(k * 2).to_pandas()

                    if not direct_rows.empty:
                        logger.info("[RETRIEVAL] Direct paper ID match for '%s': found %d chunks", detected_pid, len(direct_rows))
                        meta = self._lookup_paper_metadata(detected_pid)
                        pid_chunks: List[ChunkDto] = []
                        for idx, r in direct_rows.iterrows():
                            a_list = self._normalize_authors(meta.get("authors") if meta else None, r.get("authors"))

                            c_score = round(0.98 - idx * 0.01, 4)
                            pid_chunks.append(
                                ChunkDto(
                                    chunk_id=str(r.get("chunk_id", "")),
                                    paper_id=detected_pid,
                                    title=str(meta.get("title") or r.get("title", "")),
                                    text=str(r.get("text", "")),
                                    abstract=str(meta.get("abstract")) if meta.get("abstract") else None,
                                    authors=a_list,
                                    year=int(meta.get("year", r.get("year", 2026))) if (meta.get("year") or r.get("year")) else 2026,
                                    primary_category=str(meta.get("primary_category") or r.get("primary_category", "cs.AI")),
                                    section_title=str(r.get("section_title", "")),
                                    doi=str(meta.get("doi")) if meta.get("doi") else (str(r.get("doi")) if r.get("doi") else None),
                                    score=c_score,
                                    source=f"lancedb://{getattr(self, 'table_name', settings.LANCEDB_TABLE)}",
                                    rule_expansions=rule_expansions if rule_expansions else None,
                                )
                            )
                        if len(pid_chunks) >= k:
                            return pid_chunks[:k]
                except Exception as pid_err:
                    logger.debug("[RETRIEVAL] Direct paper ID search failed: %s", pid_err)

            # Direct Title Match Search: if user query targets a specific paper title
            cleaned_title_query = self._clean_query_for_title_matching(req.query)
            title_hits = self._search_title_matches(cleaned_title_query)
            title_chunks: List[ChunkDto] = []
            seen_chunk_ids = set()

            if title_hits:
                for th in title_hits:
                    pid = str(th.get("paper_id", ""))
                    try:
                        t_rows = self.table.search().where(f"paper_id = '{pid}'").limit(3).to_pandas()
                        if t_rows.empty and pid.startswith("openalex:"):
                            bare = pid.replace("openalex:", "")
                            t_rows = self.table.search().where(f"paper_id = '{bare}'").limit(3).to_pandas()
                        for _, tr in t_rows.iterrows():
                            cid = str(tr.get("chunk_id", ""))
                            if cid in seen_chunk_ids:
                                continue
                            seen_chunk_ids.add(cid)

                            raw_authors = tr.get("authors")
                            if hasattr(raw_authors, "tolist"):
                                authors_list = [str(a) for a in raw_authors.tolist()]
                            elif isinstance(raw_authors, list):
                                authors_list = [str(a) for a in raw_authors]
                            else:
                                authors_list = [str(raw_authors)] if raw_authors else []

                            norm_pr, auth_author = self._match_authority(authors_list)
                            if norm_pr == 0.0 and "pagerank" in tr and tr["pagerank"] is not None:
                                try:
                                    pr_val = float(tr["pagerank"])
                                    if pr_val > 0:
                                        norm_pr = min(1.0, pr_val / max(1e-6, self.max_pagerank))
                                except Exception:
                                    pass

                            title_chunks.append(
                                ChunkDto(
                                    chunk_id=cid,
                                    paper_id=pid,
                                    title=str(th.get("title") or tr.get("title", "")),
                                    text=str(tr.get("text", "")),
                                    abstract=str(tr.get("abstract")) if tr.get("abstract") else None,
                                    authors=authors_list,
                                    year=int(th.get("year") or tr.get("year", 2026)),
                                    primary_category=str(th.get("primary_category") or tr.get("primary_category", "cs.AI")),
                                    section_title=str(tr.get("section_title", "")),
                                    doi=str(th.get("doi")) if th.get("doi") else (str(tr.get("doi")) if tr.get("doi") else None),
                                    score=0.96,
                                    source=f"lancedb://{getattr(self, 'table_name', settings.LANCEDB_TABLE)}",
                                    authority_score=round(norm_pr, 4) if norm_pr > 0 else None,
                                    authority_author=auth_author,
                                    rule_expansions=rule_expansions if rule_expansions else None,
                                )
                            )
                    except Exception as th_err:
                        logger.debug("[RETRIEVAL] Title candidate fetch error: %s", th_err)

            # Retrieve candidate pool for authority reranking and fusion (bounded to prevent R2 S3 throttling)
            candidate_limit = min(max(k * 2, 25), 40)

            # Execute search on LanceDB
            query_builder = None
            if mode in ("vector", "dense", "hybrid"):
                query_vector = embedder_service.embed_query(req.query)
                if query_vector is not None and self.vector_dim == len(query_vector):
                    query_builder = self.table.search(query_vector, vector_column_name="vector").metric("cosine")
                else:
                    query_builder = self.table.search(req.query)
            else:
                query_builder = self.table.search(req.query)

            if req.category and "primary_category" in self.table.schema.names:
                query_builder = query_builder.where(f"primary_category = '{req.category}'")

            rows = query_builder.limit(candidate_limit).to_pandas()

            candidates: List[ChunkDto] = list(title_chunks)
            for _, r in rows.iterrows():
                cid = str(r.get("chunk_id", ""))
                if cid in seen_chunk_ids:
                    continue
                seen_chunk_ids.add(cid)

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
                    raw_s = float(r["_score"])
                    base_score = round(1.0 / (1.0 + math.exp(-raw_s / 5.0)), 4) if raw_s > 0 else 0.5
                else:
                    base_score = 0.85

                norm_pr, auth_author = self._match_authority(authors_list)
                if norm_pr == 0.0 and "pagerank" in r and r["pagerank"] is not None:
                    try:
                        pr_val = float(r["pagerank"])
                        if pr_val > 0:
                            norm_pr = min(1.0, pr_val / max(1e-6, self.max_pagerank))
                    except Exception:
                        pass

                # Boost score by up to 25% based on normalized PageRank and clamp to 0.9999
                boosted_score = base_score * (1.0 + 0.25 * norm_pr) if norm_pr > 0 else base_score
                clamped_score = min(0.9999, round(boosted_score, 4))

                candidates.append(
                    ChunkDto(
                        chunk_id=cid,
                        paper_id=str(r.get("paper_id", "")),
                        title=str(r.get("title", "")),
                        text=str(r.get("text", "")),
                        abstract=str(r.get("abstract", "")) if r.get("abstract") else None,
                        authors=authors_list,
                        year=int(r.get("year", 2026)) if r.get("year") else 2026,
                        primary_category=str(r.get("primary_category", "")) if r.get("primary_category") else None,
                        section_title=str(r.get("section_title", "")) if r.get("section_title") else None,
                        score=clamped_score,
                        source=f"lancedb://{getattr(self, 'table_name', settings.LANCEDB_TABLE)}",
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

                    # Re-apply normalized PageRank boost and strictly clamp to <= 0.9999
                    norm_pr = c.authority_score or 0.0
                    fused_boosted = scaled_rrf * (1.0 + 0.25 * norm_pr) if norm_pr > 0 else scaled_rrf
                    c.score = min(0.9999, round(fused_boosted, 4))

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
            clean_pid = paper_id.replace("arXiv:", "").strip()
            rows = self.table.search().where(f"paper_id = '{clean_pid}'").limit(20).to_pandas()
            if rows.empty and clean_pid.startswith("W"):
                rows = self.table.search().where(f"paper_id = 'openalex:{clean_pid}'").limit(20).to_pandas()
            elif rows.empty and clean_pid.startswith("openalex:"):
                bare = clean_pid.replace("openalex:", "")
                rows = self.table.search().where(f"paper_id = '{bare}'").limit(20).to_pandas()

            # Lookup paper metadata from Silver Parquet catalogs
            paper_meta = self._lookup_paper_metadata(clean_pid)

            if rows.empty and paper_meta:
                authors_list = self._normalize_authors(paper_meta.get("authors"))
                abstract_text = paper_meta.get("abstract") or "No abstract text available."
                return [
                    ChunkDto(
                        chunk_id=f"{clean_pid}_c000",
                        paper_id=clean_pid,
                        title=str(paper_meta.get("title", "")),
                        text=abstract_text,
                        abstract=abstract_text,
                        authors=authors_list,
                        year=int(paper_meta.get("year", 2026)) if paper_meta.get("year") else 2026,
                        primary_category=str(paper_meta.get("primary_category", "")),
                        section_title="Abstract",
                        doi=str(paper_meta.get("doi")) if paper_meta.get("doi") else None,
                        score=0.8500,
                        source="silver://papers.parquet",
                    )
                ]
            elif rows.empty and not paper_meta:
                return [
                    ChunkDto(
                        chunk_id=f"{clean_pid}_c000",
                        paper_id=clean_pid,
                        title=f"Scientific Paper {clean_pid}",
                        text=f"Abstract and full text dossier for paper {clean_pid}.",
                        abstract=f"Abstract for paper {clean_pid}.",
                        authors=["Author et al."],
                        year=2026,
                        primary_category="cs.AI",
                        section_title="Abstract",
                        doi=None,
                        score=0.8500,
                        source="catalog://fallback",
                    )
                ]

            # Extract fallback abstract from chunks if not in parquet
            abstract_text = paper_meta.get("abstract") if paper_meta else None
            if not abstract_text and not rows.empty:
                if "chunk_type" in rows.columns:
                    abs_row = rows[rows["chunk_type"] == "abstract"]
                    if not abs_row.empty:
                        abstract_text = str(abs_row.iloc[0]["text"])
                if not abstract_text and "section_title" in rows.columns:
                    abs_sec = rows[rows["section_title"].str.lower() == "abstract"]
                    if not abs_sec.empty:
                        abstract_text = str(abs_sec.iloc[0]["text"])

            results = []
            for _, r in rows.iterrows():
                authors_list = self._normalize_authors(paper_meta.get("authors") if paper_meta else None, r.get("authors"))

                results.append(
                    ChunkDto(
                        chunk_id=str(r.get("chunk_id", "")),
                        paper_id=clean_pid,
                        title=str(paper_meta.get("title") or r.get("title", "")),
                        text=str(r.get("text", "")),
                        abstract=str(abstract_text) if abstract_text else None,
                        authors=authors_list,
                        year=int(paper_meta.get("year", r.get("year", 2026))) if (paper_meta.get("year") or r.get("year")) else 2026,
                        primary_category=str(paper_meta.get("primary_category") or r.get("primary_category", "")),
                        section_title=str(r.get("section_title", "")),
                        doi=str(paper_meta.get("doi")) if paper_meta.get("doi") else (str(r.get("doi")) if r.get("doi") else None),
                        score=0.8510,
                        source=f"{settings.LANCEDB_URI}/{settings.LANCEDB_TABLE}",
                    )
                )
            return results
        except Exception as e:
            logger.error("[RETRIEVAL] Error fetching paper %s: %s", paper_id, str(e))
            return []



retrieval_service = RetrievalService()
