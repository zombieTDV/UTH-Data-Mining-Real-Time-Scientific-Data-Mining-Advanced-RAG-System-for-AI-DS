"""
benchmarks/evaluate_120_ranking_5_scenarios.py
----------------------------------------------
Comprehensive 5-Scenario Ranking Benchmark on 120 Questions (rag_goldens_200.json[:120]),
contrasting Vector, Laya Cross-Encoder, RRF, PageRank, and Full Fused Architecture.
"""

import copy
import json
import logging
import math
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.schemas.search import SearchRequest
from backend.app.services.retrieval_service import retrieval_service
from backend.app.services.reranker_service import reranker_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("evaluate_120")

def compute_metrics(ranks: List[int], total: int) -> Tuple[float, float, float]:
    mrr = sum(1.0 / r for r in ranks if r > 0) / total
    hit1 = (sum(1 for r in ranks if r == 1) / total) * 100.0
    hit5 = (sum(1 for r in ranks if 0 < r <= 5) / total) * 100.0
    return round(mrr, 4), round(hit1, 2), round(hit5, 2)

def is_match(candidate_paper: str, cand_text: str, cand_title: str, gold_papers: List[str]) -> bool:
    cand_p = candidate_paper.lower().strip()
    cand_t = (cand_text or "").lower()
    cand_title_lower = (cand_title or "").lower()
    for gp in gold_papers:
        gp_clean = gp.lower().strip()
        if gp_clean in cand_p or cand_p in gp_clean:
            return True
        if gp_clean in cand_t or gp_clean in cand_title_lower:
            return True
    return False

def run_benchmark():
    goldens_path = PROJECT_ROOT / "benchmarks" / "datasets" / "rag_goldens_200.json"
    with open(goldens_path, "r", encoding="utf-8") as f:
        goldens = json.load(f)[:120]

    logger.info("Loaded %d goldens for 5-Scenario Ranking Benchmark", len(goldens))

    # Trigger initialization of retrieval service to load influencers & nomic embedder
    dummy_req = SearchRequest(query="test", top_k=1, mode="dense", use_pagerank=True)
    retrieval_service.search(dummy_req)

    logger.info("Loaded %d graph influencer PageRank weights (Max PageRank: %.6f)",
                len(retrieval_service.influencers), retrieval_service.max_pagerank)

    ranks_s1_vec = []
    ranks_s2_lay = []
    ranks_s3_rrf = []
    ranks_s4_pr = []
    ranks_s5_full = []

    out_details = []

    for idx, item in enumerate(goldens, start=1):
        q = item["query"]
        gold_papers = item.get("relevant_paper_ids", [])

        # Retrieve top 20 candidates via Dense Vector search
        req = SearchRequest(query=q, top_k=20, mode="dense", use_pagerank=False)
        raw_candidates = retrieval_service.search(req)

        # Truncate pool to top 10 for standard top-10 reranking benchmark
        pool = raw_candidates[:10]
        if not pool:
            ranks_s1_vec.append(0)
            ranks_s2_lay.append(0)
            ranks_s3_rrf.append(0)
            ranks_s4_pr.append(0)
            ranks_s5_full.append(0)
            continue

        # Preserve vector scores before any downstream scoring
        vector_scores = {c.chunk_id: (float(c.score) if c.score is not None else (1.0 - i * 0.02)) for i, c in enumerate(pool)}

        # PageRank author boost for each candidate using retrieval_service._match_authority
        pr_multipliers = []
        for c in pool:
            norm_pr, _ = retrieval_service._match_authority(c.authors)
            pr_multipliers.append(1.0 + 0.25 * norm_pr)

        # --- Scenario 1: Vector alone (initial order) ---
        r1 = 0
        for r, c in enumerate(pool, start=1):
            if is_match(c.paper_id, c.text, c.title, gold_papers):
                r1 = r
                break
        ranks_s1_vec.append(r1)

        # --- Scenario 2: Laya alone (reranked via Cross-Encoder) ---
        pool_copy = copy.deepcopy(pool)
        reranked_pool = reranker_service.rerank(q, pool_copy, top_k=len(pool_copy))
        r2 = 0
        for r, c in enumerate(reranked_pool, start=1):
            if is_match(c.paper_id, c.text, c.title, gold_papers):
                r2 = r
                break
        ranks_s2_lay.append(r2)

        # Map each original candidate chunk_id to its rank in reranked_pool
        id_to_laya_rank = {c.chunk_id: r for r, c in enumerate(reranked_pool, start=1)}

        # --- Scenario 3: Vector + Laya RRF (k=60) ---
        rrf_s3 = {}
        for r_vec, c in enumerate(pool, start=1):
            r_lay = id_to_laya_rank.get(c.chunk_id, r_vec)
            rrf_s3[c.chunk_id] = (1.0 / (60 + r_vec)) + (1.0 / (60 + r_lay))

        order_s3 = sorted(pool, key=lambda c: rrf_s3[c.chunk_id], reverse=True)
        r3 = 0
        for r, c in enumerate(order_s3, start=1):
            if is_match(c.paper_id, c.text, c.title, gold_papers):
                r3 = r
                break
        ranks_s3_rrf.append(r3)

        # --- Scenario 4: Vector + PageRank Boost ---
        scores_s4 = {c.chunk_id: vector_scores[c.chunk_id] * pr_multipliers[i] for i, c in enumerate(pool)}
        order_s4 = sorted(pool, key=lambda c: scores_s4[c.chunk_id], reverse=True)
        r4 = 0
        for r, c in enumerate(order_s4, start=1):
            if is_match(c.paper_id, c.text, c.title, gold_papers):
                r4 = r
                break
        ranks_s4_pr.append(r4)

        # --- Scenario 5: Vector + Laya (RRF) + PageRank (Full Fused Architecture) ---
        scores_s5 = {c.chunk_id: rrf_s3[c.chunk_id] * pr_multipliers[i] for i, c in enumerate(pool)}
        order_s5 = sorted(pool, key=lambda c: scores_s5[c.chunk_id], reverse=True)
        r5 = 0
        for r, c in enumerate(order_s5, start=1):
            if is_match(c.paper_id, c.text, c.title, gold_papers):
                r5 = r
                break
        ranks_s5_full.append(r5)

        out_details.append({
            "id": item.get("id", f"gold-{idx:03d}"),
            "query": q,
            "gold_papers": gold_papers,
            "ranks": {"vector": r1, "laya": r2, "rrf": r3, "vector_pr": r4, "full": r5}
        })

        if idx % 20 == 0 or idx == len(goldens):
            logger.info("Processed %d/%d queries...", idx, len(goldens))

    total = len(goldens)
    # Full 120 metrics
    mrr_s1, h1_s1, h5_s1 = compute_metrics(ranks_s1_vec, total)
    mrr_s2, h1_s2, h5_s2 = compute_metrics(ranks_s2_lay, total)
    mrr_s3, h1_s3, h5_s3 = compute_metrics(ranks_s3_rrf, total)
    mrr_s4, h1_s4, h5_s4 = compute_metrics(ranks_s4_pr, total)
    mrr_s5, h1_s5, h5_s5 = compute_metrics(ranks_s5_full, total)

    # Batch 101-120 metrics (last 20)
    batch_total = 20
    b_ranks_s1 = ranks_s1_vec[100:120]
    b_ranks_s2 = ranks_s2_lay[100:120]
    b_ranks_s3 = ranks_s3_rrf[100:120]
    b_ranks_s4 = ranks_s4_pr[100:120]
    b_ranks_s5 = ranks_s5_full[100:120]

    b_mrr_s1, b_h1_s1, b_h5_s1 = compute_metrics(b_ranks_s1, batch_total)
    b_mrr_s2, b_h1_s2, b_h5_s2 = compute_metrics(b_ranks_s2, batch_total)
    b_mrr_s3, b_h1_s3, b_h5_s3 = compute_metrics(b_ranks_s3, batch_total)
    b_mrr_s4, b_h1_s4, b_h5_s4 = compute_metrics(b_ranks_s4, batch_total)
    b_mrr_s5, b_h1_s5, b_h5_s5 = compute_metrics(b_ranks_s5, batch_total)

    summary_table_120 = [
        {"scenario": "1. Vector (Dense Vector thuần)", "mrr": mrr_s1, "hit1": h1_s1, "hit5": h5_s1},
        {"scenario": "2. Laya một mình (Cross-Attention)", "mrr": mrr_s2, "hit1": h1_s2, "hit5": h5_s2},
        {"scenario": "3. Vector + Laya (RRF)", "mrr": mrr_s3, "hit1": h1_s3, "hit5": h5_s3},
        {"scenario": "4. Vector + PageRank Authority Boost", "mrr": mrr_s4, "hit1": h1_s4, "hit5": h5_s4},
        {"scenario": "5. Vector + Laya (RRF) + PageRank (Full)", "mrr": mrr_s5, "hit1": h1_s5, "hit5": h5_s5},
    ]

    summary_table_batch = [
        {"scenario": "1. Vector (Dense Vector thuần)", "mrr": b_mrr_s1, "hit1": b_h1_s1, "hit5": b_h5_s1},
        {"scenario": "2. Laya một mình (Cross-Attention)", "mrr": b_mrr_s2, "hit1": b_h1_s2, "hit5": b_h5_s2},
        {"scenario": "3. Vector + Laya (RRF)", "mrr": b_mrr_s3, "hit1": b_h1_s3, "hit5": b_h5_s3},
        {"scenario": "4. Vector + PageRank Authority Boost", "mrr": b_mrr_s4, "hit1": b_h1_s4, "hit5": b_h5_s4},
        {"scenario": "5. Vector + Laya (RRF) + PageRank (Full)", "mrr": b_mrr_s5, "hit1": b_h1_s5, "hit5": b_h5_s5},
    ]

    out_file = PROJECT_ROOT / "logs" / "benchmarks" / "laya_5_scenarios_comparison_120q.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump({
            "summary_120": summary_table_120,
            "summary_batch_101_120": summary_table_batch,
            "details": out_details
        }, f, ensure_ascii=False, indent=2)

    logger.info("=== 5-SCENARIO RANKING BENCHMARK ON 120 QUESTIONS COMPLETE ===")
    print("\n--- BATCH 101-120 (20 NEW SAMPLES) ---")
    for row in summary_table_batch:
        print(f"{row['scenario']:<45} | MRR: {row['mrr']:.4f} | Hit@1: {row['hit1']:5.1f}% | Hit@5: {row['hit5']:5.1f}%")

    print("\n--- CUMULATIVE 120 QUESTIONS ---")
    for row in summary_table_120:
        print(f"{row['scenario']:<45} | MRR: {row['mrr']:.4f} | Hit@1: {row['hit1']:5.1f}% | Hit@5: {row['hit5']:5.1f}%")

if __name__ == "__main__":
    run_benchmark()
