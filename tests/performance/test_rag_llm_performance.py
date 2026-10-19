"""End-to-End Scientific RAG & LLM Generation Performance Benchmark.

Evaluates multi-stage latency and throughput across the complete RAG lifecycle:
1. Remote Qdrant Vector Retrieval (Top-K semantic chunks over HTTPS)
2. Prompt Grounding & Context Construction
3. Local Qwen2.5-7B GGUF Inference on port 9001 (Time-to-First-Token & Token Generation)
4. End-to-End Total Latency (E2E)

Outputs comprehensive statistical distributions:
- Mean ± Standard Deviation (μ ± σ)
- Median (p50), 95th Percentile (p95), Min, Max
- Token throughput (tokens/second)

Usage:
    pytest -s -v -m performance tests/performance/test_rag_llm_performance.py
or directly:
    python tests/performance/test_rag_llm_performance.py
"""

import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pytest
import requests

# Ensure project root is on sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.indexing.embedder import NomicEmbedder
from src.indexing.qdrant_manager import QdrantManager
from src.rag.prompt_templates import build_rag_messages

LLM_SERVICE_URL = "http://localhost:9001/v1/chat/completions"
LLM_HEALTH_URL = "http://localhost:9001/health"

BENCHMARK_QUERIES = [
    {
        "query": "How does Low-Rank Adaptation (LoRA) reduce trainable parameters during LLM fine-tuning?",
        "category": "cs.LG",
    },
    {
        "query": "What are the structural advantages of Vision Transformers compared to Convolutional Neural Networks?",
        "category": "cs.CV",
    },
    {
        "query": "How does scaled dot-product attention compute representations across query, key, and value vectors?",
        "category": "cs.AI",
    },
    {
        "query": "What mechanisms enable parameter-efficient fine-tuning in diffusion and multimodal models?",
        "category": "cs.CV",
    },
    {
        "query": "Explain how contrastive representation learning aligns text and image feature spaces.",
        "category": "cs.CV",
    },
    {
        "query": "What are the key trade-offs between dense retrieval and sparse BM25 keyword matching?",
        "category": "cs.IR",
    },
    {
        "query": "How does FlashAttention optimize memory bandwidth and reduce quadratic attention complexity?",
        "category": "cs.LG",
    },
    {
        "query": "What techniques prevent catastrophic forgetting during continual learning in deep neural networks?",
        "category": "cs.AI",
    },
    {
        "query": "Explain the architectural differences between encoder-only, decoder-only, and encoder-decoder models.",
        "category": "cs.CL",
    },
    {
        "query": "How does Direct Preference Optimization (DPO) simplify alignment compared to traditional RLHF?",
        "category": "cs.LG",
    },
]


@dataclass
class StageMetric:
    """Statistical summary for a single benchmark stage."""

    name: str
    unit: str
    mean: float
    std: float
    p50: float
    p95: float
    min_val: float
    max_val: float

    @property
    def mean_with_std(self) -> str:
        return f"{self.mean:.2f} ± {self.std:.2f} {self.unit}"

    def to_row(self) -> str:
        return (
            f"| {self.name:<32} | {self.mean_with_std:<20} | "
            f"{self.p50:>8.2f} {self.unit:<2} | {self.p95:>8.2f} {self.unit:<2} | "
            f"{self.min_val:>8.2f} {self.unit:<2} | {self.max_val:>8.2f} {self.unit:<2} |"
        )


def compute_stage_metric(name: str, values: List[float], unit: str = "ms") -> StageMetric:
    """Computes mean, std, percentiles, min, and max for a given array of measurements."""
    arr = np.array(values, dtype=np.float64)
    return StageMetric(
        name=name,
        unit=unit,
        mean=float(np.mean(arr)),
        std=float(np.std(arr)),
        p50=float(np.percentile(arr, 50)),
        p95=float(np.percentile(arr, 95)),
        min_val=float(np.min(arr)),
        max_val=float(np.max(arr)),
    )


def print_rag_benchmark_table(metrics: List[StageMetric], iterations: int):
    """Prints a formatted ASCII report comparing all RAG pipeline stages."""
    banner = (
        f"\n{'='*115}\n"
        f"  END-TO-END SCIENTIFIC RAG + LLM GENERATION BENCHMARK REPORT ({iterations} ITERATIONS)\n"
        f"  Stack: Remote Qdrant (HTTPS) + Local Qwen2.5-7B GGUF (Port 9001)\n"
        f"{'='*115}\n"
        f"| {'Pipeline Stage':<32} | {'Mean ± Std (μ ± σ)':<20} | {'Median (p50)':>11} | {'p95':>11} | {'Min':>11} | {'Max':>11} |\n"
        f"|{'-'*34}|{'-'*22}|{'-'*13}|{'-'*13}|{'-'*13}|{'-'*13}|"
    )
    print(banner)
    for m in metrics:
        print(m.to_row())
    print(f"{'='*115}\n")


def check_llm_service_ready() -> bool:
    """Verifies that the local LLM service is active and responsive on port 9001."""
    try:
        resp = requests.get(LLM_HEALTH_URL, timeout=3.0)
        return resp.status_code == 200
    except Exception:
        return False


def execute_single_rag_query(
    embedder: NomicEmbedder,
    qdrant: QdrantManager,
    query: str,
    category: Optional[str] = None,
    top_k: int = 3,
    max_tokens: int = 120,
) -> Dict[str, Any]:
    """Executes a single RAG cycle measuring exact time per component."""
    t_start = time.perf_counter()

    # 1. Retrieval Stage
    t_ret_start = time.perf_counter()
    query_vector = embedder.embed_query(query)
    filter_expr = f"primary_category = '{category}'" if category else None
    chunks_df = qdrant.vector_search(
        query_vector=query_vector,
        limit=top_k,
        filter_expr=filter_expr,
        category_filter=category,
    )
    retrieval_ms = (time.perf_counter() - t_ret_start) * 1000.0

    chunks = chunks_df.to_dict(orient="records") if not chunks_df.empty else []
    for c in chunks:
        raw_text = c.get("text", "")
        if len(raw_text) > 400:
            c["text"] = raw_text[:400] + "..."

    # 2. Prompt Formatting Stage
    t_prompt_start = time.perf_counter()
    messages = build_rag_messages(query=query, retrieved_chunks=chunks)
    prompt_prep_ms = (time.perf_counter() - t_prompt_start) * 1000.0

    # 3. LLM Generation Stage (Streaming to capture TTFT & Tokens/sec)
    payload = {
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.2,
        "stream": True,
    }

    t_llm_req = time.perf_counter()
    resp = requests.post(
        LLM_SERVICE_URL,
        json=payload,
        stream=True,
        timeout=60.0,
    )
    resp.raise_for_status()

    t_first_token: Optional[float] = None
    tokens: List[str] = []

    for line in resp.iter_lines():
        if not line:
            continue
        decoded = line.decode("utf-8")
        if decoded.startswith("data: "):
            data_str = decoded[6:].strip()
            if data_str == "[DONE]":
                break
            try:
                chunk = json.loads(data_str)
                token_piece = chunk["choices"][0].get("delta", {}).get("content", "")
                if token_piece:
                    if t_first_token is None:
                        t_first_token = time.perf_counter()
                    tokens.append(token_piece)
            except Exception:
                continue

    t_end = time.perf_counter()

    ttft_ms = (t_first_token - t_llm_req) * 1000.0 if t_first_token else 0.0
    gen_time_sec = (t_end - t_first_token) if t_first_token else 0.0
    gen_time_ms = gen_time_sec * 1000.0
    total_e2e_ms = (t_end - t_start) * 1000.0

    token_count = len(tokens)
    tokens_per_sec = token_count / gen_time_sec if gen_time_sec > 0 else 0.0

    return {
        "query": query,
        "retrieval_ms": retrieval_ms,
        "prompt_prep_ms": prompt_prep_ms,
        "ttft_ms": ttft_ms,
        "gen_time_ms": gen_time_ms,
        "total_e2e_ms": total_e2e_ms,
        "token_count": token_count,
        "tokens_per_sec": tokens_per_sec,
        "chunks_retrieved": len(chunks),
        "generated_text": "".join(tokens),
    }


@pytest.fixture(scope="session")
def rag_components():
    """Initializes shared embedder and remote Qdrant manager, checking LLM availability."""
    if not check_llm_service_ready():
        pytest.skip("Local LLM service is not responding on http://localhost:9001. Skipping RAG LLM performance test.")

    embedder = NomicEmbedder()
    qdrant = QdrantManager()
    count = qdrant.count()
    if count == 0:
        pytest.skip(f"Remote Qdrant collection '{qdrant.collection_name}' is empty or unreachable.")

    # 1 Warmup query to stabilize model weights and network sockets
    print("\nWarming up RAG pipeline (1 cycle)...")
    execute_single_rag_query(
        embedder=embedder,
        qdrant=qdrant,
        query="What is transformer architecture?",
        max_tokens=30,
    )
    print("Warm-up complete.")

    return embedder, qdrant


@pytest.mark.performance
def test_rag_llm_end_to_end_performance(rag_components):
    """Executes 5-iteration RAG + LLM benchmark and verifies SLA bounds."""
    embedder, qdrant = rag_components
    queries = BENCHMARK_QUERIES[:5]

    retrieval_times: List[float] = []
    ttft_times: List[float] = []
    generation_times: List[float] = []
    total_times: List[float] = []
    tps_values: List[float] = []

    for idx, item in enumerate(queries, 1):
        q = item["query"]
        cat = item.get("category")
        res = execute_single_rag_query(
            embedder=embedder,
            qdrant=qdrant,
            query=q,
            category=cat,
            top_k=2,
            max_tokens=50,
        )

        assert res["chunks_retrieved"] > 0, f"Query #{idx} failed to retrieve chunks"
        assert res["token_count"] > 5, f"Query #{idx} generated fewer than 5 tokens"

        retrieval_times.append(res["retrieval_ms"])
        ttft_times.append(res["ttft_ms"])
        generation_times.append(res["gen_time_ms"])
        total_times.append(res["total_e2e_ms"])
        tps_values.append(res["tokens_per_sec"])

        print(
            f"[{idx:02d}/{len(queries)}] Retrieval: {res['retrieval_ms']:>6.1f}ms | "
            f"TTFT: {res['ttft_ms']:>7.1f}ms | "
            f"E2E: {res['total_e2e_ms']:>7.1f}ms | "
            f"Speed: {res['tokens_per_sec']:>4.1f} tok/s ({res['token_count']} tokens)"
        )

    metrics = [
        compute_stage_metric("1. Qdrant Retrieval Latency", retrieval_times, "ms"),
        compute_stage_metric("2. LLM Time to First Token (TTFT)", ttft_times, "ms"),
        compute_stage_metric("3. LLM Token Generation Latency", generation_times, "ms"),
        compute_stage_metric("4. End-to-End Total Latency (E2E)", total_times, "ms"),
        compute_stage_metric("5. Generation Speed / Throughput", tps_values, "tok/s"),
    ]

    print_rag_benchmark_table(metrics, len(queries))

    # Assert basic SLAs
    e2e_stat = next(m for m in metrics if "End-to-End" in m.name)
    assert e2e_stat.mean < 60000.0, f"Mean E2E latency {e2e_stat.mean:.2f}ms exceeded 60s sanity limit"


def run_standalone_rag_benchmarks(iterations: int = 5):
    """Executes full benchmark suite from CLI and outputs formatted results."""
    print("Verifying local LLM service at http://localhost:9001...")
    if not check_llm_service_ready():
        print("[ERROR] Local LLM service on port 9001 is NOT running.")
        print("Please ensure 'node dist/apps/llm-service/apps/llm-service/src/main.js' is running.")
        return

    print("Initializing Nomic Embedder and Qdrant Manager...")
    embedder = NomicEmbedder()
    qdrant = QdrantManager()
    total_points = qdrant.count()
    print(f"Connected to Qdrant: {qdrant.url} (Collection: {qdrant.collection_name}, Points: {total_points:,})")

    print("\nExecuting 1 warm-up query to stabilize GPU caches...")
    execute_single_rag_query(embedder, qdrant, "What is machine learning?", top_k=2, max_tokens=30)
    print("Warm-up complete. Commencing scientific RAG + LLM benchmark...\n")

    queries = BENCHMARK_QUERIES[:iterations]
    retrieval_times: List[float] = []
    ttft_times: List[float] = []
    generation_times: List[float] = []
    total_times: List[float] = []
    tps_values: List[float] = []

    for idx, item in enumerate(queries, 1):
        q = item["query"]
        cat = item.get("category")
        print(f"[{idx:02d}/{len(queries)}] Querying: '{q[:45]}...' ", end="", flush=True)
        res = execute_single_rag_query(embedder, qdrant, q, category=cat, top_k=2, max_tokens=50)
        print(
            f"Done! E2E: {res['total_e2e_ms']:.1f}ms (TTFT: {res['ttft_ms']:.1f}ms, Speed: {res['tokens_per_sec']:.1f} tok/s)"
        )

        retrieval_times.append(res["retrieval_ms"])
        ttft_times.append(res["ttft_ms"])
        generation_times.append(res["gen_time_ms"])
        total_times.append(res["total_e2e_ms"])
        tps_values.append(res["tokens_per_sec"])

    metrics = [
        compute_stage_metric("1. Qdrant Retrieval Latency", retrieval_times, "ms"),
        compute_stage_metric("2. LLM Time to First Token (TTFT)", ttft_times, "ms"),
        compute_stage_metric("3. LLM Token Generation Latency", generation_times, "ms"),
        compute_stage_metric("4. End-to-End Total Latency (E2E)", total_times, "ms"),
        compute_stage_metric("5. Generation Speed / Throughput", tps_values, "tok/s"),
    ]

    print_rag_benchmark_table(metrics, len(queries))


if __name__ == "__main__":
    run_standalone_rag_benchmarks(iterations=5)
