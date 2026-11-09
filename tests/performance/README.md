# Performance Testing & Benchmarks

This directory contains empirical performance tests for the UTH Scientific Data Mining & RAG pipeline.

## Benchmark Test Suites

1. [`test_qdrant_query_performance.py`](file:///C:/document/Study%20documents/Uth-Data-Mining/tests/performance/test_qdrant_query_performance.py)
   - Evaluates remote Qdrant vector retrieval across 374,082 vectors in `scientific_papers_gold`.
   - Measures Mean ± Std ($\mu \pm \sigma$), Median ($p50$), $p95$, $p99$, Min, Max, and QPS.
   - Run command:
     ```powershell
     .venv\Scripts\pytest tests/performance/test_qdrant_query_performance.py -s -m performance
     ```

2. [`test_rag_llm_performance.py`](file:///C:/document/Study%20documents/Uth-Data-Mining/tests/performance/test_rag_llm_performance.py)
   - Evaluates end-to-end RAG latency: vector retrieval, Time to First Token (TTFT), token generation throughput (tokens/sec), and end-to-end response time using local Qwen-2.5-7B on RTX 4060 GPU (Vulkan).
   - Run command:
     ```powershell
     .venv\Scripts\pytest tests/performance/test_rag_llm_performance.py -s -m performance
     ```

## Comprehensive Documentation
For detailed metrics, tables, latency breakdowns, and hardware tuning explanations, see:
- [**`docs/benchmarks/PERFORMANCE_BENCHMARK_REPORT.md`**](file:///C:/document/Study%20documents/Uth-Data-Mining/docs/benchmarks/PERFORMANCE_BENCHMARK_REPORT.md)
