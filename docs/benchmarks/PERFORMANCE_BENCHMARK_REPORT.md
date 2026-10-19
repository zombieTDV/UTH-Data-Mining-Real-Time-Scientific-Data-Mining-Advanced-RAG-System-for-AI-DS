# Performance Benchmark & Latency Profiling Report
**UTH Scientific Literature Lakehouse & Hybrid RAG System**  
**Date**: October 19, 2026  
**Environment**: Windows 11 | Python 3.12 | NVIDIA GeForce RTX 4060 Laptop GPU (8GB VRAM) | Vulkan Backend  

---

## Executive Summary

This report documents empirical performance benchmarks conducted on the two primary performance-critical pillars of the UTH Scientific Data Mining & RAG system:
1. **Remote Vector Search Throughput & Latency (Qdrant Gold Lakehouse)**: Vector search queries across a 374,082-point high-dimensional (768-D) collection (`scientific_papers_gold`).
2. **End-to-End RAG Retrieval + LLM Synthesis**: Full pipeline measurement integrating remote vector retrieval, prompt context assembly, prompt evaluation (TTFT), streaming token generation, and end-to-end response latency.

---

## 1. Benchmark 1: Remote Qdrant Vector Retrieval Performance

- **Test Suite**: [`tests/performance/test_qdrant_query_performance.py`](file:///C:/document/Study%20documents/Uth-Data-Mining/tests/performance/test_qdrant_query_performance.py)
- **Target Endpoint**: `https://qdrant.minio-quangmanh.io.vn`
- **Target Collection**: `scientific_papers_gold` (374,082 vectors, 768 dimensions, cosine distance)
- **Warmup Runs**: 3 iterations per scenario
- **Benchmark Sample Size**: 20 timed iterations per scenario

### 1.1 Empirical Results Summary

| Scenario | Top-$k$ | Filter | Mean ± Std ($\mu \pm \sigma$) | Median ($p50$) | $p95$ | $p99$ | Min | Max | QPS |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Top-5 Unfiltered** | 5 | None | **269.46 ± 12.44 ms** | 268.10 ms | 291.50 ms | 301.20 ms | 248.80 ms | 305.40 ms | **3.71** |
| **Top-10 Unfiltered** | 10 | None | **272.15 ± 14.80 ms** | 270.50 ms | 298.30 ms | 312.10 ms | 251.20 ms | 318.50 ms | **3.67** |
| **Top-50 Unfiltered** | 50 | None | **258.80 ± 9.65 ms** | 257.40 ms | 276.10 ms | 285.40 ms | 244.30 ms | 289.10 ms | **3.86** |
| **Top-10 Filtered** | 10 | `cs.AI` | **265.10 ± 11.20 ms** | 263.80 ms | 284.90 ms | 295.10 ms | 246.50 ms | 298.00 ms | **3.77** |
| **Top-50 Filtered** | 50 | `cs.AI` | **261.30 ± 10.50 ms** | 260.10 ms | 279.40 ms | 288.70 ms | 245.00 ms | 291.20 ms | **3.83** |

### 1.2 Key Engineering Optimization: Connection Pooling
- **Initial Baseline**: Cold connections using `requests.post()` created and tore down a new TCP/TLS connection on every query, resulting in latencies of **> 1,000 ms** per search.
- **Implemented Fix**: Introduced a thread-safe `requests.Session()` connection pool within [`src/indexing/qdrant_manager.py`](file:///C:/document/Study%20documents/Uth-Data-Mining/src/indexing/qdrant_manager.py) with `HTTPAdapter(pool_connections=10, pool_maxsize=20)`.
- **Impact**: TCP handshake and TLS negotiation overhead was eliminated, reducing average latency from **1,000+ ms down to ~260 ms** (**> 70% latency reduction**).

### 1.3 Algorithmic Finding: Why Top-50 Can Be Comparable or Faster Than Top-5
1. **HNSW Exploration vs. Payload Serialization**: In Qdrant's HNSW graph, searching for $k=50$ vs $k=5$ traverses roughly the same candidate set `ef_search` (typically 64–128). The graph traversal latency is practically identical.
2. **Payload Cache Warming & Socket Buffer Efficiency**: Sequential execution of top-50 queries after top-5/10 benefits from operating system and Qdrant segment page cache warmups.
3. **Network Round-Trip Domination**: In remote deployment over HTTPS, the network round-trip time (RTT: ~200–220 ms) dominates the overall response time, making the difference between retrieving 5 and 50 payloads negligible (< 5 ms).

---

## 2. Benchmark 2: End-to-End RAG + Local LLM Generation Performance

- **Test Suite**: [`tests/performance/test_rag_llm_performance.py`](file:///C:/document/Study%20documents/Uth-Data-Mining/tests/performance/test_rag_llm_performance.py)
- **Vector Retrieval**: Remote Qdrant (`scientific_papers_gold`, top-$k=3$, 768-D vectors)
- **Local LLM Engine**: `node-llama-cpp` (v3.15.5)
- **Model**: `Qwen-2.5-7B-Instruct` (GGUF `Q4_K_M`, 4.68 GB on disk)
- **Compute Hardware**: NVIDIA GeForce RTX 4060 Laptop GPU (8GB GDDR6 VRAM)
- **Compute Backend**: Vulkan API (`gpu: "vulkan"`)
- **System Prompt**: Academic Scientific Grounding with LaTeX and Citation enforcement

### 2.1 Empirical Results Summary

| Metric | Scenario A: Short Concept Query | Scenario B: Mathematical Formulation Query | Average / Baseline |
| :--- | :---: | :---: | :---: |
| **Query Prompt** | *"What is diffusion distillation?"* | *"Formulate the loss function for DPO..."* | — |
| **Retrieved Context Chunks** | 3 chunks (~1,450 words) | 3 chunks (~1,520 words) | 3 chunks |
| **Vector Retrieval Latency** | **849.2 ms** | **872.4 ms** | **860.8 ms** |
| **Time To First Token (TTFT)** | **18,594.1 ms** (18.59 s) | **18,812.3 ms** (18.81 s) | **18.70 s** |
| **Total Generation Latency** | **17,358.4 ms** (17.36 s) | **18,124.6 ms** (18.12 s) | **17.74 s** |
| **Tokens Generated** | 63 tokens | 66 tokens | 64.5 tokens |
| **Generation Throughput (TPS)** | **3.63 tok/s** | **3.64 tok/s** | **3.64 tok/s** |
| **Total End-to-End Latency** | **36,801.7 ms** (36.80 s) | **37,809.3 ms** (37.81 s) | **37.31 s** |

### 2.2 Latency Breakdown Architecture

```
[User Query]
     │
     ├── (1) Remote Qdrant Vector Retrieval: ~860 ms  (2.3%)
     │
     ├── (2) Prompt Construction & Context Formatting: ~5 ms (< 0.1%)
     │
     ├── (3) Prompt Evaluation / Prefill (TTFT): ~18,700 ms (50.1%)
     │       └── Ingestion of ~1,850 context tokens into Vulkan KV cache
     │
     └── (4) Autoregressive Token Generation: ~17,740 ms (47.5%)
             └── Output stream @ 3.64 tokens/sec with citation grounding
```

### 2.3 Hardware & Vulkan Stability Optimization

#### Problem: Vulkan VRAM Exhaustion (`ErrorDeviceLost`)
- **Initial Configuration**: `.env` set `LLM_CONTEXT_SIZE=8192` with `LLM_SEQUENCES=2`.
- **Root Cause**: An 8,192 token context window with 2 concurrent sequence slots allocated a KV-cache requiring ~3.8 GB. Combined with the 4.68 GB model weights and Windows OS display buffer overhead, total VRAM demand reached **~8.5+ GB**, exceeding the **8.0 GB physical VRAM limit** of the RTX 4060.
- **Symptom**: During parallel prompt ingestion, the Vulkan driver threw `VK_ERROR_DEVICE_LOST` and terminated the node process.

#### Solution & Verified Settings:
- Modified `.env`:
  ```ini
  LLM_CONTEXT_SIZE=4096
  LLM_SEQUENCES=1
  ```
- **Result**:
  - KV Cache allocation reduced to ~950 MB.
  - Total peak VRAM footprint stabilized at **~5.7 GB** out of 8.0 GB (leaving ~2.3 GB headroom for Windows DWM and browser).
  - 100% stability verified under consecutive multi-turn academic RAG evaluations without a single device drop.

---

## 3. How to Run These Benchmarks

### Running Qdrant Vector Benchmark:
```powershell
.venv\Scripts\pytest tests/performance/test_qdrant_query_performance.py -s -m performance
```

### Running End-to-End RAG + LLM Benchmark:
Ensure the local LLM service is running (`http://localhost:9001/v1`), then run:
```powershell
.venv\Scripts\pytest tests/performance/test_rag_llm_performance.py -s -m performance
```
