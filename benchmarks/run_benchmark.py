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
from typing import Any, Dict, List

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
    parser.add_argument("--category", type=str, default=None, help="Filter goldens by category (e.g. cs.AI, cs.LG)")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of evaluation test cases")
    parser.add_argument("--temperature", type=float, default=0.2, help="Decoding temperature for RAG synthesis")
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

    for idx, (tr, golden) in enumerate(zip(test_results, goldens), start=1):
        md.append(f"### Test Case {idx}: `{golden.get('id', f'case-{idx}')}` ({golden.get('category', 'general')})")
        md.append(f"- **Query:** {golden['query']}")
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
    output_dir: str = "logs/benchmarks",
) -> Dict[str, Any]:
    """Executes benchmark on a dataset and persists JSON & Markdown reports."""
    t0 = time.time()
    timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    logger.info("Executing benchmark for %d goldens (top_k=%d, judge=%s)...", len(goldens), top_k, judge_mode)

    # 1. Run live queries through RAG pipeline to generate test cases
    test_cases = build_test_cases_from_goldens(
        goldens=goldens,
        top_k=top_k,
        temperature=temperature,
    )

    # 2. Build DeepEval metrics with the configured judge
    is_local = (judge_mode == "local")
    metrics = build_rag_benchmark_metrics(judge_mode=judge_mode, async_mode=(not is_local))

    # 3. Configure evaluation runners
    async_config = AsyncConfig(run_async=(not is_local), max_concurrent=(2 if is_local else 10))
    error_config = ErrorConfig(ignore_errors=True)

    # 4. Execute DeepEval evaluation
    logger.info("Running DeepEval metrics evaluation (run_async=%s)...", not is_local)
    try:
        eval_result = evaluate(
            test_cases=test_cases,
            metrics=metrics,
            async_config=async_config,
            error_config=error_config,
        )
    except KeyboardInterrupt:
        print("\n[INTERRUPT] Benchmark interrupted by user. Recovering completed test cases...")
        from benchmarks.export_cached_report import export_cached_report
        return export_cached_report(output_dir=output_dir)

    duration = round(time.time() - t0, 2)
    logger.info("Evaluation completed in %.2fs", duration)

    metadata = {
        "timestamp": timestamp_str,
        "judge_mode": judge_mode,
        "top_k": top_k,
        "total_cases": len(goldens),
        "duration_seconds": duration,
    }

    test_results = getattr(eval_result, "test_results", []) or []

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
    goldens = load_goldens(category=args.category, limit=args.limit)
    if not goldens:
        print("[ERROR] No golden questions found with the specified filters.")
        sys.exit(1)

    print(f"\n[INIT] Loaded {len(goldens)} benchmark goldens.")

    if args.sweep:
        print("[SWEEP] Starting hyperparameter sweep across top_k in (3, 5, 8)...")
        sweep_results = []
        for k in [3, 5, 8]:
            res = run_single_benchmark_suite(
                top_k=k,
                judge_mode=args.judge,
                goldens=goldens,
                temperature=args.temperature,
                output_dir=args.output_dir,
            )
            sweep_results.append(res)
        print(f"\n[SWEEP COMPLETED] Finished {len(sweep_results)} configurations.")
    else:
        run_single_benchmark_suite(
            top_k=args.top_k,
            judge_mode=args.judge,
            goldens=goldens,
            temperature=args.temperature,
            output_dir=args.output_dir,
        )


if __name__ == "__main__":
    main()
