"""
benchmarks/export_cached_report.py
----------------------------------
Recovers and formats completed evaluation test cases from DeepEval's
temp cache (.deepeval/.temp_test_run_data.json) into official Markdown & JSON reports.
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

from benchmarks.datasets.dataset_loader import load_goldens


def export_cached_report(
    cache_path: str = ".deepeval/.temp_test_run_data.json",
    output_dir: str = "logs/benchmarks",
) -> Dict[str, Any]:
    c_file = Path(cache_path)
    if not c_file.exists():
        raise FileNotFoundError(f"Cache file not found at {cache_path}")

    with open(c_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    test_cases = data.get("testCases", [])
    if not test_cases:
        print("[WARN] No completed test cases found in cache.")
        return {}

    goldens = load_goldens()
    golden_map = {g["query"].strip(): g for g in goldens}

    timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    total_cases = len(test_cases)
    duration = data.get("runDuration", 0.0)

    # 1. Aggregate statistics
    metric_totals: Dict[str, List[float]] = {}
    metric_pass_counts: Dict[str, int] = {}
    metric_thresholds: Dict[str, float] = {}

    for tc in test_cases:
        for m in tc.get("metricsData", []):
            m_name = m.get("name", "Unknown")
            score = m.get("score")
            success = m.get("success", False)
            threshold = m.get("threshold", 0.7)

            metric_thresholds[m_name] = threshold
            if score is not None:
                if m_name not in metric_totals:
                    metric_totals[m_name] = []
                    metric_pass_counts[m_name] = 0
                metric_totals[m_name].append(score)
                if success:
                    metric_pass_counts[m_name] += 1

    # 2. Build Markdown Report
    md = []
    md.append(f"# DeepEval RAG Benchmark Report — {total_cases} Completed Samples")
    md.append("")
    md.append("## 1. Execution Summary")
    md.append(f"- **Total Completed Test Cases:** `{total_cases}`")
    md.append(f"- **Execution Timestamp:** `{timestamp_str}`")
    md.append(f"- **Judge Model:** `LOCAL:qwen2.5-7b-instruct`")
    md.append(f"- **Vector Lakehouse:** LanceDB Gold (`scientific_papers_gold`, 143k+ chunks)")
    md.append(f"- **Embedding Model:** `nomic-ai/nomic-embed-text-v1.5` (768-dim dense cosine)")
    md.append(f"- **Recorded Duration:** `{duration:.1f}s` (~`{duration / 60:.1f}` minutes)")
    md.append("")

    md.append("## 2. Aggregate Benchmark Results")
    md.append("| Metric | Average Score | Pass Rate | Passing / Total | Benchmark Target |")
    md.append("| :--- | :---: | :---: | :---: | :---: |")

    for m_name, scores in metric_totals.items():
        avg_score = sum(scores) / len(scores) if scores else 0.0
        pass_count = metric_pass_counts.get(m_name, 0)
        pass_rate = (pass_count / len(scores)) * 100 if scores else 0.0
        target = metric_thresholds.get(m_name, 0.70)
        status_indicator = "✅" if avg_score >= target else "⚠️"
        md.append(
            f"| {status_indicator} **{m_name}** | `{avg_score:.3f}` | `{pass_rate:.1f}%` | {pass_count}/{len(scores)} | `{target:.2f}` |"
        )

    md.append("")
    md.append("## 3. Individual Test Case Evaluations")

    for idx, tc in enumerate(test_cases, start=1):
        query = tc.get("input", "").strip()
        matched_golden = golden_map.get(query, {})
        gid = matched_golden.get("id", f"case-{idx:03d}")
        category = matched_golden.get("category", "general")
        actual_output = tc.get("actualOutput", "") or ""

        md.append(f"### Sample {idx}: `{gid}` [{category}]")
        md.append(f"**Query:** {query}")
        md.append(f"> **Actual Generated Output:** {actual_output.replace(chr(10), ' ')}")
        md.append("")
        md.append("| Metric | Score | Threshold | Status | Verdict Reason |")
        md.append("| :--- | :---: | :---: | :---: | :--- |")

        for m in tc.get("metricsData", []):
            m_name = m.get("name", "Unknown")
            score = m.get("score")
            threshold = m.get("threshold", 0.7)
            success = m.get("success", False)
            reason = m.get("reason", "") or "No explanation provided"
            status_badge = "✅ PASS" if success else ("❌ FAIL" if score is not None else "⚠️ ERROR")
            score_str = f"{score:.3f}" if score is not None else "N/A"
            clean_reason = reason.replace("\n", " ").replace("|", "\\|")[:220]
            md.append(f"| {m_name} | `{score_str}` | `{threshold:.2f}` | {status_badge} | {clean_reason} |")
        md.append("")

    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    md_file = out_dir / f"benchmark_report_{total_cases}samples_local_{timestamp_str}.md"
    with open(md_file, "w", encoding="utf-8") as f:
        f.write("\n".join(md))

    json_file = out_dir / f"benchmark_trace_{total_cases}samples_local_{timestamp_str}.json"
    with open(json_file, "w", encoding="utf-8") as f:
        json.dump(
            {
                "metadata": {
                    "total_cases": total_cases,
                    "timestamp": timestamp_str,
                    "duration_seconds": duration,
                },
                "metrics_summary": {
                    m: {
                        "average_score": sum(metric_totals[m]) / len(metric_totals[m]),
                        "pass_rate": metric_pass_counts[m] / len(metric_totals[m]),
                        "total": len(metric_totals[m]),
                    }
                    for m in metric_totals
                },
                "test_cases": test_cases,
            },
            f,
            indent=2,
            default=str,
        )

    print("\n" + "=" * 80)
    print(f"[RECOVERY COMPLETE] Successfully exported {total_cases} completed test cases!")
    print(f"Markdown Report: {md_file}")
    print(f"JSON Full Trace: {json_file}")
    print("=" * 80)

    # Print summary table to console
    print("\n" + "\n".join(md[md.index("## 2. Aggregate Benchmark Results") : md.index("## 3. Individual Test Case Evaluations")]))

    return {"total_cases": total_cases, "md_file": str(md_file), "json_file": str(json_file)}


if __name__ == "__main__":
    export_cached_report()
