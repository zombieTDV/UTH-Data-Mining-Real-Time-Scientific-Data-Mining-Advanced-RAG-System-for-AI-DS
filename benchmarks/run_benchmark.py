"""

benchmarks/run_benchmark.py

---------------------------

CLI tool for full RAG benchmark evaluations, hyperparameter sweeps,

and automated markdown/JSON report generation.



Usage:

    python -m benchmarks.run_benchmark --limit 2 --judge local

    python -m benchmarks.run_benchmark --top-k 5 --judge deepseek

    python -m benchmarks.run_benchmark --sweep

"""



import argparse

import json

import logging

import os

import sys

import time

from datetime import datetime

from pathlib import Path

from typing import Any, Dict, List, Optional



# Ensure project root is in sys.path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

if str(PROJECT_ROOT) not in sys.path:

    sys.path.insert(0, str(PROJECT_ROOT))



from deepeval import evaluate

from deepeval.evaluate.configs import AsyncConfig, ErrorConfig

from benchmarks.adapters.rag_adapter import build_test_cases_from_goldens

from benchmarks.datasets.dataset_loader import load_goldens

from benchmarks.metrics.rag_metrics import build_rag_benchmark_metrics



logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

logger = logging.getLogger("benchmark_runner")





def parse_args():

    parser = argparse.ArgumentParser(description="DeepEval RAG Benchmark Runner for UTH Scientific Corpus")

    parser.add_argument("--top-k", type=int, default=5, help="Number of retrieved chunks (default: 5)")

    parser.add_argument(

        "--judge",

        type=str,

        default=os.getenv("DEEPEVAL_JUDGE_MODEL", "local"),

        choices=["local", "deepseek", "groq", "openai"],

        help="LLM-as-a-Judge provider (default: local)",

    )

    parser.add_argument("--dataset", type=str, default="benchmarks/datasets/rag_goldens_100.json", help="Path to golden dataset")

    parser.add_argument("--category", type=str, default=None, help="Filter goldens by category (e.g. cs.AI, cs.LG)")

    parser.add_argument("--limit", type=int, default=None, help="Limit number of evaluation test cases")

    parser.add_argument("--temperature", type=float, default=0.2, help="Decoding temperature for RAG synthesis")

    parser.add_argument(

        "--scenario",

        type=str,

        default="pagerank",

        choices=["vector", "reranker", "pagerank", "all"],

        help="Retrieval evaluation scenario: 'vector' (Dense alone), 'reranker' (Cross-Encoder alone), 'pagerank' (Reranker + PageRank boost), or 'all' (compare all 3)",

    )

    parser.add_argument("--pagerank", action=argparse.BooleanOptionalAction, default=None, help="Explicitly enable/disable graph PageRank authority boost")

    parser.add_argument("--reranker", action=argparse.BooleanOptionalAction, default=None, help="Explicitly enable/disable cross-encoder reranker")

    parser.add_argument("--sweep", action="store_true", help="Run hyperparameter sweep over multiple top_k values (3, 5, 8)")

    parser.add_argument("--output-dir", type=str, default="logs/benchmarks", help="Output directory for reports")

    return parser.parse_args()





def format_markdown_report(

    run_metadata: Dict[str, Any],

    test_results: List[Any],

    goldens: List[Dict[str, Any]],

) -> str:

    """Generates a clean GitHub Markdown evaluation report."""

    md = []

    md.append(f"# DeepEval RAG Benchmark Report — {run_metadata['timestamp']}")

    md.append("")

    md.append("## 1. Benchmark Execution Parameters")

    md.append(f"- **Execution Date:** {run_metadata['timestamp']}")

    md.append(f"- **Judge Model:** `{run_metadata['judge_mode']}`")

    md.append(f"- **Top-K Retrieval:** `{run_metadata['top_k']}`")

    md.append(f"- **Total Test Cases Evaluated:** `{run_metadata['total_cases']}`")

    md.append(f"- **Total Duration:** `{run_metadata['duration_seconds']}s`")

    md.append("")



    # Aggregate metric scores

    metric_totals: Dict[str, List[float]] = {}

    metric_pass_counts: Dict[str, int] = {}



    for item in test_results:

        metrics_data = getattr(item, "metrics_data", []) or []

        for m in metrics_data:

            m_name = getattr(m, "name", str(m))

            score = getattr(m, "score", 0.0)

            passed = getattr(m, "success", False)



            if score is not None:

                if m_name not in metric_totals:

                    metric_totals[m_name] = []

                    metric_pass_counts[m_name] = 0

                metric_totals[m_name].append(score)

                if passed:

                    metric_pass_counts[m_name] += 1



    md.append("## 2. Aggregate Benchmark Summary")

    md.append("| Metric | Average Score | Pass Rate | Samples |")

    md.append("| :--- | :---: | :---: | :---: |")



    for m_name, scores in metric_totals.items():

        avg_score = sum(scores) / len(scores) if scores else 0.0

        pass_count = metric_pass_counts.get(m_name, 0)

        pass_rate = (pass_count / len(scores)) * 100 if scores else 0.0

        md.append(f"| **{m_name}** | `{avg_score:.3f}` | `{pass_rate:.1f}%` ({pass_count}/{len(scores)}) | {len(scores)} |")



    md.append("")

    md.append("## 3. Detailed Test Case Evaluations")



    golden_map = {g.get("query", "").strip(): g for g in goldens}



    for idx, tr in enumerate(test_results, start=1):

        tr_input = getattr(tr, "input", "") or ""

        golden = golden_map.get(tr_input.strip(), {})

        golden_id = golden.get("id", f"case-{idx}")

        golden_cat = golden.get("category", "general")

        md.append(f"### Test Case {idx}: `{golden_id}` ({golden_cat})")

        md.append(f"- **Query:** {tr_input or golden.get('query', 'N/A')}")

        actual_output = getattr(tr, "actual_output", "") or ""

        md.append(f"- **Actual Output:**\n> {actual_output.replace(chr(10), ' ')}")

        md.append("")

        md.append("| Metric | Score | Threshold | Status | Reason / Feedback |")

        md.append("| :--- | :---: | :---: | :---: | :--- |")



        for m in getattr(tr, "metrics_data", []) or []:

            m_name = getattr(m, "name", str(m))

            score = getattr(m, "score", 0.0)

            threshold = getattr(m, "threshold", 0.0) or 0.0

            passed = getattr(m, "success", False)

            status_badge = "✅ PASS" if passed else "❌ FAIL"

            score_str = f"{score:.3f}" if score is not None else "N/A"

            reason = getattr(m, "reason", "") or "N/A"

            clean_reason = reason.replace("\n", " ").replace("|", "\\|")[:200]

            md.append(f"| {m_name} | `{score_str}` | `{threshold:.2f}` | {status_badge} | {clean_reason} |")

        md.append("")



    return "\n".join(md)





def run_single_benchmark_suite(

    top_k: int,

    judge_mode: str,

    goldens: List[Dict[str, Any]],

    temperature: float = 0.2,

    scenario: str = "pagerank",

    use_pagerank: Optional[bool] = None,

    use_reranker: Optional[bool] = None,

    output_dir: str = "logs/benchmarks",

) -> Dict[str, Any]:

    """Executes benchmark on a dataset and persists JSON & Markdown reports."""

    t0 = time.time()

    timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")



    # Determine scenario parameters

    if scenario == "vector":

        effective_reranker = False if use_reranker is None else use_reranker

        effective_pagerank = False if use_pagerank is None else use_pagerank

        retrieval_mode = "vector"

    elif scenario == "reranker":

        effective_reranker = True if use_reranker is None else use_reranker

        effective_pagerank = False if use_pagerank is None else use_pagerank

        retrieval_mode = "hybrid"

    else:  # "pagerank" (default)

        effective_reranker = True if use_reranker is None else use_reranker

        effective_pagerank = True if use_pagerank is None else use_pagerank

        retrieval_mode = "hybrid"



    logger.info(

        "Executing benchmark for %d goldens (top_k=%d, judge=%s, scenario=%s [rerank=%s, pr=%s, mode=%s])...",

        len(goldens),

        top_k,

        judge_mode,

        scenario,

        effective_reranker,

        effective_pagerank,

        retrieval_mode,

    )



    os.environ["DEEPEVAL_PER_TASK_TIMEOUT_SECONDS_OVERRIDE"] = "600"

    out_dir = Path(output_dir)

    out_dir.mkdir(parents=True, exist_ok=True)



    # 1. Test cases cache keyed by query & scenario

    from deepeval.test_case import LLMTestCase

    from benchmarks.adapters.rag_adapter import run_rag_test_case



    master_cache_file = out_dir / f"cached_test_cases_k{top_k}_{scenario}.json"

    cached_map: Dict[str, Dict[str, Any]] = {}



    # Seed cache if it exists, or bootstrap pagerank scenario from legacy master cache

    if master_cache_file.exists():

        try:

            with open(master_cache_file, "r", encoding="utf-8") as f:

                for item in json.load(f):

                    cached_map[item["input"].strip()] = item

        except Exception as e:

            logger.warning("Could not read %s: %s", master_cache_file, str(e))

    elif scenario == "pagerank":

        legacy_cache = out_dir / f"cached_test_cases_k{top_k}_master.json"

        if legacy_cache.exists():

            try:

                with open(legacy_cache, "r", encoding="utf-8") as f:

                    for item in json.load(f):

                        cached_map[item["input"].strip()] = item

                logger.info("[CACHE BOOTSTRAP] Bootstrapped %d test cases from legacy master cache.", len(cached_map))

            except Exception:

                pass



    test_cases: List[LLMTestCase] = []

    newly_generated = 0



    for idx, g in enumerate(goldens, start=1):

        q = g["query"].strip()

        cached_ctx = cached_map.get(q, {}).get("retrieval_context") or []

        has_valid_ctx = sum(len((x or "").strip()) for x in cached_ctx) > 50

        if q in cached_map and has_valid_ctx:

            cached_item = cached_map[q]

            test_cases.append(

                LLMTestCase(

                    input=cached_item["input"],

                    actual_output=cached_item["actual_output"],

                    expected_output=cached_item.get("expected_output"),

                    retrieval_context=cached_item.get("retrieval_context", []),

                )

            )

            logger.info("[CACHE HIT] Golden %d/%d (ID: %s) loaded from cache.", idx, len(goldens), g.get("id"))

        else:

            logger.info("[CACHE MISS] Generating Golden %d/%d (ID: %s)...", idx, len(goldens), g.get("id"))

            tc = run_rag_test_case(

                golden_item=g,

                top_k=top_k,

                category=None,

                temperature=temperature,

                use_pagerank=effective_pagerank,

                use_reranker=effective_reranker,

                retrieval_mode=retrieval_mode,

            )

            test_cases.append(tc)

            cached_map[q] = {

                "input": tc.input,

                "actual_output": tc.actual_output,

                "expected_output": tc.expected_output,

                "retrieval_context": tc.retrieval_context,

            }

            newly_generated += 1

            # Save incrementally after every generation

            with open(master_cache_file, "w", encoding="utf-8") as f:

                json.dump(list(cached_map.values()), f, indent=2)



    logger.info("Total test cases ready: %d (Cached: %d, Newly generated: %d)", len(test_cases), len(test_cases) - newly_generated, newly_generated)



    # 2. Check persistent Evaluation Master Cache (skip re-evaluating completed queries)

    from types import SimpleNamespace



    eval_master_file = out_dir / f"cached_eval_master_k{top_k}_{scenario}_{judge_mode}.json"

    eval_master_map: Dict[str, Dict[str, Any]] = {}

    if eval_master_file.exists():

        try:

            with open(eval_master_file, "r", encoding="utf-8") as f:

                eval_master_map = json.load(f)

            logger.info("[EVAL CACHE] Loaded %d existing evaluation results from %s", len(eval_master_map), eval_master_file.name)

        except Exception as e:

            logger.warning("[EVAL CACHE] Failed to load %s: %s", eval_master_file, str(e))

    elif scenario == "pagerank":

        legacy_eval = out_dir / f"cached_eval_master_k{top_k}_{judge_mode}.json"

        if legacy_eval.exists():

            try:

                with open(legacy_eval, "r", encoding="utf-8") as f:

                    eval_master_map = json.load(f)

                logger.info("[EVAL CACHE BOOTSTRAP] Bootstrapped %d evaluation results from legacy %s", len(eval_master_map), legacy_eval.name)

            except Exception:

                pass



    class CachedTestResult:

        def __init__(self, data: Dict[str, Any]):

            self.input = data.get("input", "")

            self.actual_output = data.get("actual_output", "")

            self.expected_output = data.get("expected_output", "")

            self.retrieval_context = data.get("retrieval_context", [])

            self.success = data.get("success", False)

            self.metrics_data = [

                SimpleNamespace(

                    name=m.get("name", ""),

                    score=m.get("score"),

                    threshold=m.get("threshold"),

                    success=m.get("success", False),

                    reason=m.get("reason"),

                )

                for m in data.get("metrics", [])

            ]



    cached_eval_results: List[Any] = []

    pending_test_cases: List[LLMTestCase] = []



    for tc in test_cases:

        tc_key = tc.input.strip()

        if tc_key in eval_master_map:

            cached_eval_results.append(CachedTestResult(eval_master_map[tc_key]))

        else:

            pending_test_cases.append(tc)



    logger.info(

        "Evaluation partition: %d cached in master (SKIP), %d pending evaluation",

        len(cached_eval_results),

        len(pending_test_cases),

    )



    new_test_results: List[Any] = []

    if pending_test_cases:

        is_local = (judge_mode == "local")

        metrics = build_rag_benchmark_metrics(judge_mode=judge_mode, async_mode=(not is_local))

        async_config = AsyncConfig(run_async=(not is_local), max_concurrent=(2 if is_local else 10))

        error_config = ErrorConfig(ignore_errors=True)



        batch_size = 5 if is_local else len(pending_test_cases)
        total_batches = (len(pending_test_cases) + batch_size - 1) // batch_size
        logger.info(
            "Evaluating %d test cases with %s in %d micro-batches (batch_size=%d)...",
            len(pending_test_cases), judge_mode, total_batches, batch_size
        )
        for b_idx in range(0, len(pending_test_cases), batch_size):
            batch_cases = pending_test_cases[b_idx : b_idx + batch_size]
            b_num = (b_idx // batch_size) + 1
            logger.info("[EVAL BATCH %d/%d] Evaluating %d test cases...", b_num, total_batches, len(batch_cases))
            try:
                eval_result = evaluate(
                    test_cases=batch_cases,
                    metrics=metrics,
                    async_config=async_config,
                    error_config=error_config,
                )
                batch_results = getattr(eval_result, "test_results", []) or []
                new_test_results.extend(batch_results)
            except KeyboardInterrupt:
                print("\n[INTERRUPT] Benchmark interrupted by user. Recovering completed test cases...")
                from benchmarks.export_cached_report import export_cached_report
                return export_cached_report(output_dir=output_dir)

            # Incrementally persist each newly evaluated batch to eval_master_file
            for tr in batch_results:
                tr_key = getattr(tr, "input", "").strip()
                if tr_key:
                    eval_master_map[tr_key] = {
                        "input": getattr(tr, "input", ""),
                        "actual_output": getattr(tr, "actual_output", ""),
                        "expected_output": getattr(tr, "expected_output", ""),
                        "retrieval_context": getattr(tr, "retrieval_context", []),
                        "success": getattr(tr, "success", False),
                        "metrics": [
                            {
                                "name": getattr(m, "name", ""),
                                "score": getattr(m, "score", None),
                                "threshold": getattr(m, "threshold", None),
                                "success": getattr(m, "success", False),
                                "reason": getattr(m, "reason", None),
                            }
                            for m in (getattr(tr, "metrics_data", []) or [])
                        ],
                    }
            with open(eval_master_file, "w", encoding="utf-8") as f:
                json.dump(eval_master_map, f, indent=2, ensure_ascii=False)
            logger.info(
                "[EVAL CACHE] Batch %d/%d complete -> persisted %d total evaluated test cases to %s",
                b_num, total_batches, len(eval_master_map), eval_master_file.name
            )



    duration = round(time.time() - t0, 2)

    logger.info("Evaluation completed in %.2fs", duration)



    metadata = {

        "timestamp": timestamp_str,

        "judge_mode": judge_mode,

        "top_k": top_k,

        "total_cases": len(goldens),

        "duration_seconds": duration,

    }



    test_results = cached_eval_results + new_test_results



    # 5. Generate & Save Markdown Report

    out_dir = Path(output_dir)

    out_dir.mkdir(parents=True, exist_ok=True)



    md_report = format_markdown_report(

        run_metadata=metadata,

        test_results=test_results,

        goldens=goldens,

    )

    md_file = out_dir / f"benchmark_report_k{top_k}_{judge_mode}_{timestamp_str}.md"

    with open(md_file, "w", encoding="utf-8") as f:

        f.write(md_report)



    # 6. Save JSON Trace

    json_file = out_dir / f"benchmark_trace_k{top_k}_{judge_mode}_{timestamp_str}.json"

    trace_data = {

        "metadata": metadata,

        "results": [

            {

                "input": getattr(tr, "input", ""),

                "actual_output": getattr(tr, "actual_output", ""),

                "expected_output": getattr(tr, "expected_output", ""),

                "retrieval_context": getattr(tr, "retrieval_context", []),

                "success": getattr(tr, "success", False),

                "metrics": [

                    {

                        "name": getattr(m, "name", ""),

                        "score": getattr(m, "score", None),

                        "threshold": getattr(m, "threshold", None),

                        "success": getattr(m, "success", False),

                        "reason": getattr(m, "reason", None),

                    }

                    for m in (getattr(tr, "metrics_data", []) or [])

                ],

            }

            for tr in test_results

        ],

    }

    with open(json_file, "w", encoding="utf-8") as f:

        json.dump(trace_data, f, indent=2, default=str)



    print("\n" + "=" * 80)

    print(f"[BENCHMARK COMPLETE] Saved Markdown Report: {md_file}")

    print(f"[BENCHMARK COMPLETE] Saved JSON Trace:      {json_file}")

    print("=" * 80)



    return {"metadata": metadata, "md_file": str(md_file), "json_file": str(json_file)}





def main():

    args = parse_args()



    # Load benchmark goldens

    dataset_path = Path(args.dataset) if args.dataset else None

    goldens = load_goldens(category=args.category, limit=args.limit, filepath=dataset_path)

    if not goldens:

        print(f"[ERROR] No golden questions found from {dataset_path or 'default'}.")

        sys.exit(1)



    print(f"\n[INIT] Loaded {len(goldens)} benchmark goldens from {dataset_path or 'default'}.")



    scenarios = ["vector", "reranker", "pagerank"] if args.scenario == "all" else [args.scenario]



    for sc in scenarios:

        print(f"\n{'='*35} SCENARIO: {sc.upper()} {'='*35}")

        run_single_benchmark_suite(

            top_k=args.top_k,

            judge_mode=args.judge,

            goldens=goldens,

            temperature=args.temperature,

            scenario=sc,

            use_pagerank=args.pagerank,

            use_reranker=args.reranker,

            output_dir=args.output_dir,

        )





if __name__ == "__main__":

    main()

