"""Performance benchmark tests for Qdrant Gold Lakehouse vector retrieval.

Measures latency distribution across diverse query scenarios:
- Unfiltered Top-K queries (k=5, 10, 50)
- Metadata-filtered queries (primary_category='cs.CV', 'cs.AI')

Calculates key statistical metrics:
- Mean with ± standard deviation (μ ± σ ms)
- Percentiles: p50 (median), p95, p99
- Extremes: Min, Max
- Throughput: Queries Per Second (QPS)

Can be executed via:
    pytest -s -v -m performance tests/performance/test_qdrant_query_performance.py
or directly:
    python tests/performance/test_qdrant_query_performance.py
"""

import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pytest

# Ensure project root is on sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.indexing.qdrant_manager import QdrantManager


@dataclass
class BenchmarkResult:
    """Holds latency distribution statistics for a benchmark scenario."""

    scenario: str
    iterations: int
    mean_ms: float
    std_ms: float
    min_ms: float
    max_ms: float
    p50_ms: float
    p95_ms: float
    p99_ms: float
    qps: float

    @property
    def mean_with_std(self) -> str:
        """Formatted mean ± standard deviation string."""
        return f"{self.mean_ms:.2f} ± {self.std_ms:.2f} ms"

    def to_row(self) -> str:
        return (
            f"| {self.scenario:<32} | {self.mean_with_std:<18} | "
            f"{self.p50_ms:>7.2f} ms | {self.p95_ms:>7.2f} ms | "
            f"{self.p99_ms:>7.2f} ms | {self.min_ms:>7.2f} ms | "
            f"{self.max_ms:>7.2f} ms | {self.qps:>7.1f} |"
        )


def compute_benchmark_stats(scenario: str, latencies_ms: List[float]) -> BenchmarkResult:
    """Computes comprehensive statistical metrics from a list of query latencies in milliseconds."""
    arr = np.array(latencies_ms, dtype=np.float64)
    total_sec = np.sum(arr) / 1000.0
    qps = len(arr) / total_sec if total_sec > 0 else 0.0

    return BenchmarkResult(
        scenario=scenario,
        iterations=len(arr),
        mean_ms=float(np.mean(arr)),
        std_ms=float(np.std(arr)),
        min_ms=float(np.min(arr)),
        max_ms=float(np.max(arr)),
        p50_ms=float(np.percentile(arr, 50)),
        p95_ms=float(np.percentile(arr, 95)),
        p99_ms=float(np.percentile(arr, 99)),
        qps=float(qps),
    )


def print_benchmark_table(results: List[BenchmarkResult]):
    """Pretty prints the benchmark report table to stdout."""
    header = (
        f"\n{'='*115}\n"
        f"  QDRANT VECTOR QUERY PERFORMANCE BENCHMARK REPORT\n"
        f"{'='*115}\n"
        f"| {'Scenario':<32} | {'Mean ± Std (μ ± σ)':<18} | {'p50':>10} | {'p95':>10} | {'p99':>10} | {'Min':>10} | {'Max':>10} | {'QPS':>7} |\n"
        f"|{'-'*34}|{'-'*20}|{'-'*12}|{'-'*12}|{'-'*12}|{'-'*12}|{'-'*12}|{'-'*9}|"
    )
    print(header)
    for res in results:
        print(res.to_row())
    print(f"{'='*115}\n")


def generate_normalized_vector(dim: int = 768, seed: Optional[int] = None) -> List[float]:
    """Generates a random L2-normalized dense vector matching Nomic v1.5 embedding space."""
    rng = np.random.RandomState(seed)
    vec = rng.randn(dim).astype(np.float32)
    norm = np.linalg.norm(vec)
    if norm > 0:
        vec /= norm
    return vec.tolist()


def warmup_qdrant(manager: QdrantManager, n_warmup: int = 5):
    """Executes initial warm-up queries to pre-warm HTTP keep-alive sockets and TLS sessions."""
    dummy_vec = generate_normalized_vector(768, seed=999)
    for _ in range(n_warmup):
        manager.vector_search(query_vector=dummy_vec, limit=5)


@pytest.fixture(scope="session")
def qdrant_benchmark_manager():
    """Initializes and verifies connection to the Qdrant instance for benchmarking."""
    manager = QdrantManager()
    count = manager.count()
    if count == 0:
        pytest.skip(f"Qdrant collection '{manager.collection_name}' at {manager.url} is empty or unreachable.")
    # Run warmup
    warmup_qdrant(manager, n_warmup=5)
    return manager


@pytest.mark.performance
def test_qdrant_unfiltered_query_k5(qdrant_benchmark_manager):
    """Measures latency of top-5 unfiltered vector queries (50 iterations)."""
    iterations = 50
    latencies: List[float] = []

    for i in range(iterations):
        vec = generate_normalized_vector(768, seed=1000 + i)
        t0 = time.perf_counter()
        results = qdrant_benchmark_manager.vector_search(query_vector=vec, limit=5)
        dt_ms = (time.perf_counter() - t0) * 1000.0
        latencies.append(dt_ms)

        assert len(results) > 0, f"Query iteration {i} returned no results"

    stats = compute_benchmark_stats("Unfiltered Top-5 (k=5)", latencies)
    print(f"\n[Bench] {stats.scenario}: {stats.mean_with_std} (p50={stats.p50_ms:.2f}ms, p95={stats.p95_ms:.2f}ms)")

    # Network sanity SLA: mean latency should remain < 750ms
    assert stats.mean_ms < 750.0, f"Mean latency {stats.mean_ms:.2f}ms exceeded 750ms sanity SLA"


@pytest.mark.performance
def test_qdrant_unfiltered_query_k10(qdrant_benchmark_manager):
    """Measures latency of top-10 unfiltered vector queries (50 iterations)."""
    iterations = 50
    latencies: List[float] = []

    for i in range(iterations):
        vec = generate_normalized_vector(768, seed=2000 + i)
        t0 = time.perf_counter()
        results = qdrant_benchmark_manager.vector_search(query_vector=vec, limit=10)
        dt_ms = (time.perf_counter() - t0) * 1000.0
        latencies.append(dt_ms)

        assert len(results) > 0

    stats = compute_benchmark_stats("Unfiltered Top-10 (k=10)", latencies)
    print(f"\n[Bench] {stats.scenario}: {stats.mean_with_std} (p50={stats.p50_ms:.2f}ms, p95={stats.p95_ms:.2f}ms)")
    assert stats.mean_ms < 750.0


@pytest.mark.performance
def test_qdrant_unfiltered_query_k50(qdrant_benchmark_manager):
    """Measures latency of top-50 unfiltered vector queries (50 iterations)."""
    iterations = 50
    latencies: List[float] = []

    for i in range(iterations):
        vec = generate_normalized_vector(768, seed=3000 + i)
        t0 = time.perf_counter()
        results = qdrant_benchmark_manager.vector_search(query_vector=vec, limit=50)
        dt_ms = (time.perf_counter() - t0) * 1000.0
        latencies.append(dt_ms)

        assert len(results) > 0

    stats = compute_benchmark_stats("Unfiltered Top-50 (k=50)", latencies)
    print(f"\n[Bench] {stats.scenario}: {stats.mean_with_std} (p50={stats.p50_ms:.2f}ms, p95={stats.p95_ms:.2f}ms)")
    assert stats.mean_ms < 750.0


@pytest.mark.performance
def test_qdrant_filtered_query_category_cs_cv(qdrant_benchmark_manager):
    """Measures latency of category-filtered ('cs.CV') top-10 vector queries (50 iterations)."""
    iterations = 50
    latencies: List[float] = []

    for i in range(iterations):
        vec = generate_normalized_vector(768, seed=4000 + i)
        t0 = time.perf_counter()
        results = qdrant_benchmark_manager.vector_search(
            query_vector=vec,
            limit=10,
            category_filter="cs.CV",
        )
        dt_ms = (time.perf_counter() - t0) * 1000.0
        latencies.append(dt_ms)

        assert len(results) > 0
        if "primary_category" in results.columns:
            assert all(cat == "cs.CV" for cat in results["primary_category"].dropna())

    stats = compute_benchmark_stats("Filtered (cs.CV, k=10)", latencies)
    print(f"\n[Bench] {stats.scenario}: {stats.mean_with_std} (p50={stats.p50_ms:.2f}ms, p95={stats.p95_ms:.2f}ms)")
    assert stats.mean_ms < 750.0


@pytest.mark.performance
def test_qdrant_filtered_query_category_cs_ai(qdrant_benchmark_manager):
    """Measures latency of category-filtered ('cs.AI') top-10 vector queries (50 iterations)."""
    iterations = 50
    latencies: List[float] = []

    for i in range(iterations):
        vec = generate_normalized_vector(768, seed=5000 + i)
        t0 = time.perf_counter()
        results = qdrant_benchmark_manager.vector_search(
            query_vector=vec,
            limit=10,
            category_filter="cs.AI",
        )
        dt_ms = (time.perf_counter() - t0) * 1000.0
        latencies.append(dt_ms)

        assert len(results) > 0
        if "primary_category" in results.columns:
            assert all(cat == "cs.AI" for cat in results["primary_category"].dropna())

    stats = compute_benchmark_stats("Filtered (cs.AI, k=10)", latencies)
    print(f"\n[Bench] {stats.scenario}: {stats.mean_with_std} (p50={stats.p50_ms:.2f}ms, p95={stats.p95_ms:.2f}ms)")
    assert stats.mean_ms < 750.0


def run_standalone_benchmarks(iterations: int = 50, n_warmup: int = 5) -> List[BenchmarkResult]:
    """Runs all benchmark scenarios sequentially and prints a formatted summary table."""
    manager = QdrantManager()
    total_points = manager.count()
    print(f"\nConnecting to Qdrant at: {manager.url}")
    print(f"Collection: '{manager.collection_name}' (Total Indexed Points: {total_points:,})")

    if total_points == 0:
        print("[ERROR] Collection is empty or unreachable. Please check connection.")
        return []

    print(f"Executing {n_warmup} warm-up queries...")
    warmup_qdrant(manager, n_warmup=n_warmup)
    print("Warm-up complete. Commencing performance benchmark suite...\n")

    scenarios = [
        ("Unfiltered Top-5 (k=5)", 5, None),
        ("Unfiltered Top-10 (k=10)", 10, None),
        ("Unfiltered Top-50 (k=50)", 50, None),
        ("Filtered (primary_category='cs.CV', k=10)", 10, "cs.CV"),
        ("Filtered (primary_category='cs.AI', k=10)", 10, "cs.AI"),
    ]

    all_results: List[BenchmarkResult] = []

    for name, k, cat in scenarios:
        print(f"Running '{name}' ({iterations} iterations)...", end="", flush=True)
        latencies: List[float] = []
        for i in range(iterations):
            vec = generate_normalized_vector(768, seed=1000 * k + i)
            t0 = time.perf_counter()
            manager.vector_search(query_vector=vec, limit=k, category_filter=cat)
            dt_ms = (time.perf_counter() - t0) * 1000.0
            latencies.append(dt_ms)

        res = compute_benchmark_stats(name, latencies)
        all_results.append(res)
        print(f" Done! Mean: {res.mean_with_std}")

    print_benchmark_table(all_results)
    return all_results


if __name__ == "__main__":
    run_standalone_benchmarks(iterations=50, n_warmup=5)
