"""
benchmarks/test_rag_pipeline.py
-------------------------------
Pytest & DeepEval Test Suite for Scientific RAG.
Run via:
    deepeval test run benchmarks/test_rag_pipeline.py
or
    pytest benchmarks/test_rag_pipeline.py -v
"""

import os
import pytest
from deepeval import assert_test
from benchmarks.adapters.rag_adapter import run_rag_test_case
from benchmarks.datasets.dataset_loader import load_goldens
from benchmarks.metrics.rag_metrics import build_rag_benchmark_metrics

# Load dataset (all goldens or limit via env)
LIMIT = int(os.getenv("BENCHMARK_LIMIT", "0")) or None
goldens = load_goldens(limit=LIMIT)

# Judge mode can be set via DEEPEVAL_JUDGE_MODEL env var (defaults to "local")
JUDGE_MODE = os.getenv("DEEPEVAL_JUDGE_MODEL", "local")
metrics = build_rag_benchmark_metrics(judge_mode=JUDGE_MODE)


@pytest.mark.parametrize("golden", goldens, ids=[g["id"] for g in goldens])
def test_rag_pipeline_golden(golden):
    """Evaluates a single golden benchmark question against DeepEval metrics."""
    # Execute query through RAG pipeline to capture answer and retrieved chunks
    test_case = run_rag_test_case(golden, top_k=5)

    # Assert all metrics pass their configured thresholds
    assert_test(test_case, metrics)
