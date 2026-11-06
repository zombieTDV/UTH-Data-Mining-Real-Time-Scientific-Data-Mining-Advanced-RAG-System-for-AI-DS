"""
benchmarks/generate_scenario_comparison.py
-----------------------------------------
Aggregates and compares evaluation metrics across the 3 scientific RAG scenarios:
1. Scenario 1: Dense Vector Alone
2. Scenario 2: Cross-Encoder Reranker Alone (No PageRank)
3. Scenario 3: Reranker + Graph PageRank Authority Boost
Generates clean side-by-side comparative Markdown tables and calculates PageRank delta.
"""

import json
from pathlib import Path
import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
LOGS_DIR = PROJECT_ROOT / "logs" / "benchmarks"

def load_master_eval(filepath: Path) -> dict:
    if filepath.exists():
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def generate_report():
    vec_path = LOGS_DIR / "cached_eval_master_k5_vector_local.json"
    rerank_path = LOGS_DIR / "cached_eval_master_k5_reranker_local.json"
    pr_path = LOGS_DIR / "cached_eval_master_k5_local.json"
    if not pr_path.exists():
        pr_path = LOGS_DIR / "cached_eval_master_k5_pagerank_local.json"

    vec_data = load_master_eval(vec_path)
    rerank_data = load_master_eval(rerank_path)
    pr_data = load_master_eval(pr_path)

    print(f"Loaded {len(vec_data)} Vector, {len(rerank_data)} Reranker, {len(pr_data)} PageRank cases.")

    metrics_list = [
        "Answer Relevancy",
        "Contextual Relevancy",
        "Contextual Precision",
        "Contextual Recall",
        "Academic Citation Grounding [GEval]",
        "Faithfulness",
    ]

    # Find common queries across available scenarios
    available_queries = list(pr_data.keys())
    if vec_data:
        available_queries = [q for q in available_queries if q in vec_data]
    if rerank_data:
        available_queries = [q for q in available_queries if q in rerank_data]

    print(f"Common evaluated queries across all 3 scenarios: {len(available_queries)}")

    summary = {m: {"vector": [], "reranker": [], "pagerank": []} for m in metrics_list}

    for q in available_queries:
        v_m = {m["name"]: m["score"] for m in vec_data.get(q, {}).get("metrics", [])}
        r_m = {m["name"]: m["score"] for m in rerank_data.get(q, {}).get("metrics", [])}
        p_m = {m["name"]: m["score"] for m in pr_data.get(q, {}).get("metrics", [])}

        for m in metrics_list:
            if v_m.get(m) is not None:
                summary[m]["vector"].append(v_m[m])
            if r_m.get(m) is not None:
                summary[m]["reranker"].append(r_m[m])
            if p_m.get(m) is not None:
                summary[m]["pagerank"].append(p_m[m])

    lines = []
    lines.append("# Comparative RAG Architecture Benchmark: Vector vs Reranker vs PageRank Boost")
    lines.append("")
    lines.append(f"- **Evaluated Common Goldens:** {len(available_queries)}")
    lines.append("- **Judge Model:** `Local Qwen 2.5-7B Instruct (CUDA)` ($0.00 API Cost)")
    lines.append("")
    lines.append("## 1. Metric Summary Table")
    lines.append("")
    lines.append("| Metric | Scenario 1: Dense Vector | Scenario 2: Reranker Alone | Scenario 3: Reranker + PageRank | $\\Delta$ (PageRank vs Reranker) | $\\Delta$ (Total System Gain) |")
    lines.append("| :--- | :---: | :---: | :---: | :---: | :---: |")

    for m in metrics_list:
        v_avg = np.mean(summary[m]["vector"]) if summary[m]["vector"] else 0.0
        r_avg = np.mean(summary[m]["reranker"]) if summary[m]["reranker"] else 0.0
        p_avg = np.mean(summary[m]["pagerank"]) if summary[m]["pagerank"] else 0.0

        delta_pr = p_avg - r_avg
        delta_total = p_avg - v_avg

        d_pr_str = f"`{delta_pr:+.3f}`" if delta_pr != 0 else "`0.000`"
        d_tot_str = f"`{delta_total:+.3f}`" if delta_total != 0 else "`0.000`"

        lines.append(f"| **{m}** | `{v_avg:.3f}` | `{r_avg:.3f}` | `{p_avg:.3f}` | {d_pr_str} | {d_tot_str} |")

    report_text = "\n".join(lines)
    print("\n" + report_text)
    return report_text

if __name__ == "__main__":
    generate_report()
