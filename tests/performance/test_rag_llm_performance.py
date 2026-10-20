"""End-to-End Scientific RAG & LLM Generation Performance Benchmark.

Evaluates multi-stage latency and throughput across the complete RAG lifecycle:
1a. GPU Dense Query Embedding (Nomic Embed Text v1.5 on CUDA)
1b. Remote Qdrant Vector Retrieval (Top-K semantic chunks over HTTPS)
2.  Prompt Grounding & Context Construction
3.  Local Qwen2.5-7B GGUF Inference on port 9001 (CUDA / Vulkan)
4.  End-to-End Total Latency (E2E)

Strict Hardware Safeguards:
- Enforces CUDA execution for PyTorch embedder and local LLM service.
- Raises RuntimeError immediately if any neural component attempts to execute on CPU.

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
import torch

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
            f"| {self.name:<38} | {self.mean_with_std:<20} | "
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


def print_rag_benchmark_table(metrics: List[StageMetric], iterations: int, device_info: str):
    """Prints a formatted ASCII report comparing all RAG pipeline stages."""
    banner = (
        f"\n{'='*122}\n"
        f"  END-TO-END SCIENTIFIC RAG + LLM GENERATION BENCHMARK REPORT ({iterations} ITERATIONS)\n"
        f"  Hardware & Stack: {device_info}\n"
        f"  Vector Store: Remote Qdrant HTTPS | LLM: Qwen2.5-7B-Instruct (Q4_K_M GGUF)\n"
        f"{'='*122}\n"
        f"| {'Pipeline Stage':<38} | {'Mean ± Std (μ ± σ)':<20} | {'Median (p50)':>11} | {'p95':>11} | {'Min':>11} | {'Max':>11} |\n"
        f"|{'-'*40}|{'-'*22}|{'-'*13}|{'-'*13}|{'-'*13}|{'-'*13}|"
    )
    print(banner)
    for m in metrics:
        print(m.to_row())
    print(f"{'='*122}\n")


def get_llm_service_health() -> Dict[str, Any]:
    """Retrieves health status and loaded model info from port 9001, raising on failure."""
    try:
        resp = requests.get(LLM_HEALTH_URL, timeout=5.0)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        raise RuntimeError(
            f"Local LLM service is not responding at {LLM_HEALTH_URL}: {exc}. "
            "Please start the service before running benchmarks: "
            "'node dist/apps/llm-service/apps/llm-service/src/main.js'"
        ) from exc


def assert_hardware_gpu_safeguard(llm_health: Dict[str, Any], embedder: NomicEmbedder):
    """Enforces hardware governance: raises RuntimeError if any neural stage attempts to run on CPU."""
    # 1. Host CUDA verification
    if not torch.cuda.is_available():
        raise RuntimeError(
            "[HARDWARE SAFEGUARD VIOLATION] PyTorch CUDA is not available on this machine. "
            "RAG and LLM performance benchmarks must NOT be executed on CPU. "
            "Please enable your GPU before running performance benchmarks."
        )

    # 2. Embedder device verification
    if embedder.device.type != "cuda":
        raise RuntimeError(
            f"[HARDWARE SAFEGUARD VIOLATION] NomicEmbedder initialized on device '{embedder.device}'. "
            "Academic dense embedding during performance testing must be GPU-accelerated on CUDA. "
            "CPU execution is strictly prohibited."
        )

    # 3. LLM service backend verification
    model_info = llm_health.get("model", {})
    backend = str(model_info.get("backend", "")).lower()
    if backend == "cpu":
        raise RuntimeError(
            f"[HARDWARE SAFEGUARD VIOLATION] Local LLM service on port 9001 reported backend '{backend}'. "
            "GGUF token generation during performance benchmarks must run on GPU (CUDA / Vulkan). "
            "CPU execution is strictly prohibited."
        )


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

    # 1a. GPU Dense Query Embedding (CUDA)
    t_emb_start = time.perf_counter()
    query_vector = embedder.embed_query(query)
    emb_ms = (time.perf_counter() - t_emb_start) * 1000.0

    # 1b. Remote Qdrant Vector Retrieval (HTTPS)
    t_qdrant_start = time.perf_counter()
    filter_expr = f"primary_category = '{category}'" if category else None
    chunks_df = qdrant.vector_search(
        query_vector=query_vector,
        limit=top_k,
        filter_expr=filter_expr,
        category_filter=category,
    )
    qdrant_ms = (time.perf_counter() - t_qdrant_start) * 1000.0

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
        "emb_ms": emb_ms,
        "qdrant_ms": qdrant_ms,
        "retrieval_ms": emb_ms + qdrant_ms,
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
    """Initializes shared embedder and remote Qdrant manager, enforcing GPU safeguards."""
    health_data = get_llm_service_health()
    embedder = NomicEmbedder(device="cuda")

    # Enforce strict GPU execution
    assert_hardware_gpu_safeguard(health_data, embedder)

    qdrant = QdrantManager()
    count = qdrant.count()
    if count == 0:
        pytest.fail(f"Remote Qdrant collection '{qdrant.collection_name}' is empty or unreachable.")

    # 1 Warmup query on GPU to stabilize CUDA contexts and socket pools
    print("\nWarming up RAG pipeline on CUDA (1 cycle)...")
    execute_single_rag_query(
        embedder=embedder,
        qdrant=qdrant,
        query="What is transformer architecture?",
        max_tokens=30,
    )
    print("GPU Warm-up complete.")

    return embedder, qdrant, health_data


@pytest.mark.performance
@pytest.mark.gpu
def test_rag_llm_end_to_end_performance(rag_components):
    """Executes 5-iteration RAG + LLM benchmark on GPU and verifies SLA bounds."""
    embedder, qdrant, health_data = rag_components
    queries = BENCHMARK_QUERIES[:5]

    emb_times: List[float] = []
    qdrant_times: List[float] = []
    prompt_times: List[float] = []
    ttft_times: List[float] = []
    generation_times: List[float] = []
    total_times: List[float] = []
    tps_values: List[float] = []

    gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "Unknown GPU"
    backend = health_data.get("model", {}).get("backend", "cuda")
    device_info = f"{gpu_name} (LLM backend: {backend}, Embedder: {embedder.device})"

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

        emb_times.append(res["emb_ms"])
        qdrant_times.append(res["qdrant_ms"])
        prompt_times.append(res["prompt_prep_ms"])
        ttft_times.append(res["ttft_ms"])
        generation_times.append(res["gen_time_ms"])
        total_times.append(res["total_e2e_ms"])
        tps_values.append(res["tokens_per_sec"])

        print(
            f"[{idx:02d}/{len(queries)}] Embed: {res['emb_ms']:>5.1f}ms | "
            f"Qdrant: {res['qdrant_ms']:>5.1f}ms | "
            f"TTFT: {res['ttft_ms']:>6.1f}ms | "
            f"Gen: {res['gen_time_ms']:>6.1f}ms | "
            f"Speed: {res['tokens_per_sec']:>4.1f} tok/s ({res['token_count']} tok) | "
            f"E2E: {res['total_e2e_ms']:>6.1f}ms"
        )

    metrics = [
        compute_stage_metric("1a. GPU Dense Query Embedding (CUDA)", emb_times, "ms"),
        compute_stage_metric("1b. Remote Qdrant Vector Search (HTTPS)", qdrant_times, "ms"),
        compute_stage_metric("2.  Prompt Grounding & Formatting", prompt_times, "ms"),
        compute_stage_metric("3.  LLM Time to First Token (TTFT, CUDA)", ttft_times, "ms"),
        compute_stage_metric("4.  LLM Autoregressive Generation (CUDA)", generation_times, "ms"),
        compute_stage_metric("5.  End-to-End Total Latency (E2E)", total_times, "ms"),
        compute_stage_metric("6.  Generation Speed / Throughput", tps_values, "tok/s"),
    ]

    print_rag_benchmark_table(metrics, len(queries), device_info)

    # Assert GPU performance SLAs
    ttft_stat = next(m for m in metrics if "Time to First Token" in m.name)
    assert ttft_stat.mean < 5000.0, f"Mean GPU TTFT {ttft_stat.mean:.2f}ms exceeded 5s SLA"

    tps_stat = next(m for m in metrics if "Generation Speed" in m.name)
    assert tps_stat.mean > 20.0, f"Mean GPU generation throughput {tps_stat.mean:.2f} tok/s fell below 20 tok/s SLA"

    e2e_stat = next(m for m in metrics if "End-to-End" in m.name)
    assert e2e_stat.mean < 10000.0, f"Mean E2E latency {e2e_stat.mean:.2f}ms exceeded 10s GPU SLA"


def run_standalone_rag_benchmarks(iterations: int = 5):
    """Executes full benchmark suite from CLI and outputs formatted results."""
    print("Verifying local LLM service at http://localhost:9001...")
    health_data = get_llm_service_health()

    print("Initializing Nomic Embedder on CUDA...")
    embedder = NomicEmbedder(device="cuda")

    # Enforce hardware safeguard
    assert_hardware_gpu_safeguard(health_data, embedder)

    qdrant = QdrantManager()
    total_points = qdrant.count()
    gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "Unknown GPU"
    backend = health_data.get("model", {}).get("backend", "cuda")
    device_info = f"{gpu_name} (LLM backend: {backend}, Embedder: {embedder.device})"

    print(f"Connected to Qdrant: {qdrant.url} (Collection: {qdrant.collection_name}, Points: {total_points:,})")
    print(f"Hardware Stack: {device_info}")

    print("\nExecuting 1 warm-up query to stabilize GPU caches...")
    execute_single_rag_query(embedder, qdrant, "What is machine learning?", top_k=2, max_tokens=30)
    print("Warm-up complete. Commencing scientific RAG + LLM benchmark...\n")

    queries = BENCHMARK_QUERIES[:iterations]
    emb_times: List[float] = []
    qdrant_times: List[float] = []
    prompt_times: List[float] = []
    ttft_times: List[float] = []
    generation_times: List[float] = []
    total_times: List[float] = []
    tps_values: List[float] = []

    for idx, item in enumerate(queries, 1):
        q = item["query"]
        cat = item.get("category")
        print(f"[{idx:02d}/{len(queries)}] Querying: '{q[:40]}...' ", end="", flush=True)
        res = execute_single_rag_query(embedder, qdrant, q, category=cat, top_k=2, max_tokens=50)
        print(
            f"Done! E2E: {res['total_e2e_ms']:.1f}ms | TTFT: {res['ttft_ms']:.1f}ms | Speed: {res['tokens_per_sec']:.1f} tok/s"
        )

        emb_times.append(res["emb_ms"])
        qdrant_times.append(res["qdrant_ms"])
        prompt_times.append(res["prompt_prep_ms"])
        ttft_times.append(res["ttft_ms"])
        generation_times.append(res["gen_time_ms"])
        total_times.append(res["total_e2e_ms"])
        tps_values.append(res["tokens_per_sec"])

    metrics = [
        compute_stage_metric("1a. GPU Dense Query Embedding (CUDA)", emb_times, "ms"),
        compute_stage_metric("1b. Remote Qdrant Vector Search (HTTPS)", qdrant_times, "ms"),
        compute_stage_metric("2.  Prompt Grounding & Formatting", prompt_times, "ms"),
        compute_stage_metric("3.  LLM Time to First Token (TTFT, CUDA)", ttft_times, "ms"),
        compute_stage_metric("4.  LLM Autoregressive Generation (CUDA)", generation_times, "ms"),
        compute_stage_metric("5.  End-to-End Total Latency (E2E)", total_times, "ms"),
        compute_stage_metric("6.  Generation Speed / Throughput", tps_values, "tok/s"),
    ]

    print_rag_benchmark_table(metrics, len(queries), device_info)


if __name__ == "__main__":
    run_standalone_rag_benchmarks(iterations=5)
