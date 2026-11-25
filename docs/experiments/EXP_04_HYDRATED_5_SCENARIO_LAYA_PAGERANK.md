# EXP-04: Hydrated 5-Scenario Laya Reranking & Graph PageRank Authority

- **Motivation/Background**: Following the `D-058` Qdrant payload strip, unhydrated retrieval candidates passed empty strings `""` to cross-encoder and authority scorers, collapsing `Laya` and `PageRank` gains to `0.0%` delta (`0.534` flat MRR on 100q). Furthermore, CPU `onnxruntime-node` reranking took `+4,260 ms` per 10 chunks, breaking interactive latency SLAs.
- **Purpose**: Quantify the isolated and combined ranking gains of (1) `ChunkStore` full-text/author hydration, (2) Cross-Attention reranking (`Laya`), (3) Reciprocal Rank Fusion (`RRF k=60`), and (4) `29,523`-author + `10,000`-paper Graph PageRank boost across `N=120` queries, alongside CUDA `bfloat16` latency profiling and `N=105`/`N=169` DeepEval verification.
- **Overview Pipeline**: Query (`rag_goldens_200.json[:120]`) -> `Nomic v1.5` Vector Search (Top-10 pool) -> `ChunkStore` Text/Title/Author Hydration -> 5 Ranking Ablations (`Vector`, `Laya`, `Vector+Laya RRF`, `Vector+PageRank`, `Full System`) -> Top-5 Context Slicing -> Local `Qwen 2.5-7B-Instruct (CUDA)` Generation & DeepEval 6-Metric Judge (`$0.00`).
- **Detailed Plan**: Metadata; §1 Objective & Hypothesis; §2 Controlled Variables; §3 Setup & Hyperparameters; §4 Empirical Results (5W1H); §5 Key Findings & Regressions; §6 Reproduction Protocol; §7 Associated Links.
- **References**: [`EXPERIMENT_TEMPLATE.md`](../../agents/templates/EXPERIMENT_TEMPLATE.md), [`MD_CONVENTION.md`](../../agents/rules/MD_CONVENTION.md), [`RESULTS_REPORTING.md`](../../agents/rules/RESULTS_REPORTING.md), [`evaluate_120_ranking_5_scenarios.py`](../../benchmarks/evaluate_120_ranking_5_scenarios.py), [`rag_goldens_200.json`](../../benchmarks/datasets/rag_goldens_200.json), [`citation_metrics.parquet`](../../data/gold/graphs/citation_metrics.parquet), [`laya_5_scenarios_comparison_120q.json`](../../logs/benchmarks/laya_5_scenarios_comparison_120q.json), [`cached_eval_master_k5_pagerank_local.json`](../../logs/benchmarks/cached_eval_master_k5_pagerank_local.json), [`laya_pagerank_benchmark_report.md`](../benchmarks/laya_pagerank_benchmark_report.md), [`retrieval_service.py`](../../backend/app/services/retrieval_service.py), [`reranker_service.py`](../../backend/app/services/reranker_service.py).
- **Created**: 2026-11-25T12:55:00+07:00
- **Last Updated**: 2026-11-25T12:55:00+07:00

[STATUS: COMPLETED]

---

## Table of Contents

- [Metadata](#metadata)
- [1. Objective & Hypothesis](#1-objective--hypothesis)
- [2. Controlled Variables (Single-Variable Principle)](#2-controlled-variables-single-variable-principle)
- [3. Setup & Hyperparameters](#3-setup--hyperparameters)
- [4. Empirical Results (5W1H)](#4-empirical-results-5w1h)
- [5. Key Findings & Regressions](#5-key-findings--regressions)
- [6. Reproduction Protocol](#6-reproduction-protocol)
- [7. Associated Links](#7-associated-links)

---

## Metadata

- **Experiment ID**: `EXP-04`
- **Title**: Hydrated 5-Scenario Laya Reranking, RRF & 29.5k-Author PageRank Authority Benchmark
- **Status**: `COMPLETED`
- **Target Script**: [`benchmarks/evaluate_120_ranking_5_scenarios.py`](../../benchmarks/evaluate_120_ranking_5_scenarios.py)
- **Output Artifacts**: [`logs/benchmarks/laya_5_scenarios_comparison_120q.json`](../../logs/benchmarks/laya_5_scenarios_comparison_120q.json), [`logs/benchmarks/cached_eval_master_k5_pagerank_local.json`](../../logs/benchmarks/cached_eval_master_k5_pagerank_local.json), [`docs/benchmarks/laya_pagerank_benchmark_report.md`](../benchmarks/laya_pagerank_benchmark_report.md)

---

## 1. Objective & Hypothesis

- **Hypothesis**: Over a 100% `ChunkStore`-hydrated Top-10 candidate pool, fusing Cross-Attention reranking (`Laya`) with dense vector ranks via RRF ($k=60$) and multiplying by log-normalized `29,523`-author / `10,000`-paper Graph PageRank authority will resolve tie-breaking on multi-paper/survey queries and lift `MRR` and `Hit@1` by $\ge +5\%$ relative over dense `Vector` alone; further, executing `Laya-421M` in one batched `torch.bfloat16` CUDA pass will reduce reranking overhead by $>10\times$ versus CPU ONNX.
- **Success Criteria**:
  1. Scenario 5 (`Full System`) outperforms all four single/partial ablations (`Vector`, `Laya`, `RRF`, `Vector+PR`) on `MRR`, `Hit@1`, `Recall@1`, `Hit@5`, and `Recall@5` across `N=120`.
  2. Batched GPU `Laya-421M` latency $< 350\text{ ms}$ per 10-chunk pool (`>10x` speedup over `4,260 ms` CPU ONNX); PageRank lookup $< 1\text{ ms}$.
  3. Hydrated DeepEval `N=105` achieves Contextual Recall $\ge 0.85$ and Contextual Precision $\ge 0.80$.

---

## 2. Controlled Variables (Single-Variable Principle)

- **Variable Changed**: Ranking stage over the identical hydrated Top-10 candidate pool per query:
  1. **`Vector` (Baseline)**: Initial dense cosine order (`Nomic v1.5` + `ChunkStore` hydration).
  2. **`Laya Alone`**: Cross-Attention reranker order (`reranker_service.rerank()`, hydrated title + section + text).
  3. **`Vector + Laya (RRF k=60)`**: Reciprocal Rank Fusion `(0.65 / (60.0 + r_vec)) + (1.35 / (60.0 + r_lay)) + (0.0001 * l_score)`.
  4. **`Vector + PageRank`**: Dense score modulated by log-scaled PageRank `vector_score * (1.0 + 0.032 * norm_pr)`.
  5. **`Full System` (`Vector + Laya RRF + PageRank`)**: RRF score modulated by log-scaled PageRank `rrf_s3 * (1.0 + 0.025 * norm_pr)`.
- **Held Constant**: Same `N=120` queries (`rag_goldens_200.json[:120]`), same Top-10 candidate pool per query (`Hit@10 = 75.0%`), same `ChunkStore` hydration (OpenReview `clean_full_text`/`consensus_score`, CVPR 2024, on-demand 2025 arXiv, Markdown H1 `extract_true_title()`), same `29,523`-author / `10,000`-paper PageRank maps ([`citation_metrics.parquet`](../../data/gold/graphs/citation_metrics.parquet) + `graph_coauthorship.json`), and identical `Qwen 2.5-7B-Instruct (CUDA)` DeepEval judge (`$0.00`).

---

## 3. Setup & Hyperparameters

- **Evaluation Splits**:
  - **5-Scenario Ranking (`N=120`)**: First 120 queries of [`rag_goldens_200.json`](../../benchmarks/datasets/rag_goldens_200.json) (`92` single-paper targets $|G_q|=1$; `28` two-paper targets $|G_q|=2$).
  - **DeepEval Generation Subsets**: `Gold 20` (`gold-001..020`), **Hydrated `gold-001..100` (`N=105`)**, and **All Valid Full-Text (`N=169`)** after purging post-`D-058` empty-context entries.
- **PageRank & Normalization Formula** ([`evaluate_120_ranking_5_scenarios.py`](../../benchmarks/evaluate_120_ranking_5_scenarios.py)):
  - Combined raw PageRank: `combined_pr = pr_f + 0.0002 * math.log1p(cites_f)` indexed over `10,000` papers (`citation_metrics.parquet`) and `29,523` author keys (`pr_by_author` + `retrieval_service.influencers`).
  - Log-scale normalization: `norm_pr = min(1.0, math.log1p(raw_pr * 10000.0) / math.log1p(max_pr * 10000.0))`.
- **Hardware & Inference Modes**:
  - `Laya-421M`: `model.safetensors` (`421M` params, `torch.bfloat16` CUDA batched vs. 1-by-1 sequential vs. legacy `onnxruntime-node` CPU).
  - `DeepEval Judge`: Local `Qwen 2.5-7B-Instruct` (CUDA, Top-5 context slicing, 6 metrics, `$0.00`).

---

## 4. Empirical Results (5W1H)

> **5W1H — Hydrated 5-Scenario Ranking & DeepEval Generation Verification**
> - **What**: (a) 5-scenario ranking metrics (`MRR`, `Hit@1`, `Recall@1`, `Hit@5`, `Recall@5`, `Hit@10`) on `N=120` hydrated queries, (b) stage-level latency breakdown (`Laya-421M` CUDA batched vs. sequential vs. CPU ONNX), and (c) 6-metric DeepEval scores on `Gold 20`, `N=105`, and `N=169`.
> - **Why**: Prove synergistic ranking lift from fusing dense vectors, cross-attention, and PageRank once `D-058` text/author hydration is active, and verify CUDA batching achieves sub-second total retrieval.
> - **When**: Executed & reported `2026-11-06`–`2026-11-07` (commits `738a9ef`, `a66b13c`, `c5c5b23`, `d698f83`, `1f3a7d0`, `b96846f`, `254e6a1`).
> - **Where**: [`laya_5_scenarios_comparison_120q.json`](../../logs/benchmarks/laya_5_scenarios_comparison_120q.json), [`cached_eval_master_k5_pagerank_local.json`](../../logs/benchmarks/cached_eval_master_k5_pagerank_local.json), [`laya_pagerank_benchmark_report.md`](../benchmarks/laya_pagerank_benchmark_report.md); GPU latency benchmarked on CUDA (`bfloat16`).
> - **Who**: UTH RAG & Data Mining Team — for production retrieval fusion and latency budgeting.
> - **How**: Identical hydrated Top-10 candidate pools evaluated deterministically across 5 scoring formulas; DeepEval 2.x with Local `Qwen 2.5-7B` judge at `$0.00` cost.

### Table 4.1: 5-Scenario Ranking Ablation (`N=120` Hydrated Queries, `Hit@10 = 75.0%`)

| # | Retrieval Scenario | MRR (`N=120`) | Hit@1 (%) | Recall@1 (%) | Hit@5 (%) | Recall@5 (%) | Latency (Batch / Seq) | Delta vs. Vector Baseline |
| :-: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **1** | **Vector** (Dense baseline) | `0.5725` | 49.2% (`59/120`) | `45.0%` | 67.5% (`81/120`) | `60.8%` | **`325.0 ms`** | Baseline (`Nomic v1.5` + Hydrate) |
| **2** | **Laya Alone** (Cross-Attention) | `0.5822` | 51.7% (`62/120`) | `46.2%` | 66.7% (`80/120`) | `60.0%` | `641.2 ms` (`+316.2` / `1,661` ms) | `+1.7%` MRR / `+2.5 pp` Hit@1 / `+1.2 pp` Recall@1 |
| **3** | **Vector + Laya (RRF `k=60`)** | `0.5810` | 50.8% (`61/120`) | `46.2%` | 67.5% (`81/120`) | `60.4%` | `641.2 ms` (`+316.2` / `1,661` ms) | `+1.5%` MRR / `+1.6 pp` Hit@1 / `+1.2 pp` Recall@1 |
| **4** | **Vector + PageRank Authority** | `0.5741` | 49.2% (`59/120`) | `45.0%` | 68.3% (`82/120`) | `61.7%` | `325.2 ms` (`+0.21 ms`) | `+0.8 pp` Hit@5 / `+0.9 pp` Recall@5 |
| **5** | **Full System** (`Vector+Laya RRF+PR`) | **`0.6076`** | **`55.0%`** (`66/120`) | **`49.6%`** | **`69.2%`** (`83/120`) | **`62.1%`** | **`641.4 ms`** (`+316.4` / `1,661` ms) | **`+6.1%` MRR / `+5.8 pp` Hit@1 / `+4.6 pp` Recall@1** |

### Table 4.2: Per-Stage Retrieval & Reranking Latency Breakdown (`10-Chunk Pool`)

| Pipeline Stage | 10-Chunk Latency | Per-Chunk Latency | Execution Mode | Ranking / Latency Impact |
| :--- | :---: | :---: | :--- | :--- |
| **1. Vector Search + `ChunkStore` Hydrate** | `325.01 ms` | — | CUDA `Nomic v1.5` + 913k ANN + `ChunkStore` | Supplies Top-10 pool (`75.0%` Hit@10) |
| **2a. `Laya-421M` CUDA (Batched 10)** | **`+316.16 ms`** | **`31.62 ms/chunk`** | `model.safetensors` (`421M`, `bfloat16`) 1 pass | **`13.5x` faster than CPU (`4,260 ms`)** |
| **2b. `Laya-421M` CUDA (Sequential 1x10)** | `+1,335.92 ms` | `133.59 ms/chunk` | 10 sequential GPU `system_one()` calls (`bfloat16`) | `3.2x` faster than CPU (`4,260 ms`) |
| **2c. `Laya-421M` CPU (`onnxruntime-node`)** | `+4,260.00 ms` | `426.00 ms/chunk` | 10 sequential CPU ONNX calls | Legacy bottleneck (`~4.3 s`) |
| **3. RRF Fusion (`k=60`)** | `+0.02 ms` (`18.6 µs`) | `1.9 µs/chunk` | In-RAM reciprocal-rank sum | Combines dense + Laya ranks |
| **4. Graph PageRank Lookup (`O(1)`)** | **`+0.21 ms`** (`205.7 µs`) | **`20.6 µs/chunk`** | In-RAM hash (`20k` papers / `29,523` authors) | **Lifts `Hit@1` `+4.2 pp` (`50.8% -> 55.0%`) over RRF** |

### Table 4.3: DeepEval Generation Evaluation (`Full System`, Top-5 Contexts, Local `Qwen 2.5-7B`)

| DeepEval Metric | Gold 20 (`gold-001..020`) | Hydrated `gold-001..100` (`N=105`) | All Valid Full-Text (`N=169`) | Target Threshold |
| :--- | :---: | :---: | :---: | :---: |
| **Contextual Recall (Statement Recall@5)** | **`0.947`** (`94.7%`) | **`0.900`** (`89.3%` pass, `92/103`) | `0.637` (`63.3%` pass, `105/166`) | $\ge 0.70$ |
| **Contextual Precision (`Precision@5`)** | **`0.860`** (`86.0%`) | **`0.852`** (`83.5%` pass, `86/103`) | `0.618` (`60.8%` pass, `101/166`) | $\ge 0.70$ |
| **Academic Citation Grounding `[GEval]`** | **`0.747`** (`74.7%`) | **`0.762`** (`90.4%` pass, `94/104`) | **`0.719`** (`86.2%` pass, `144/167`) | $\ge 0.70$ |
| **Faithfulness** | `0.660` (`66.0%`) | `0.667` (`57.3%` pass, `55/96`) | `0.592` (`46.8%` pass, `73/156`) | $\ge 0.70$ |
| **Answer Relevancy** | **`0.769`** (`76.9%`) | `0.667` (`51.0%` pass, `50/98`) | `0.594` (`40.6%` pass, `65/160`) | $\ge 0.75$ |
| **Contextual Relevancy** | `0.534` (`53.4%`) | `0.520` (`45.2%` pass, `42/93`) | `0.444` (`36.6%` pass, `45/123`) | $\ge 0.60$ |

### Companion Metric Glossary
- **`Hit@K`**: $\frac{1}{N}\sum_{q=1}^{N} \mathbb{I}(\text{Top}_K(q) \cap G_q \neq \emptyset)$ — Binary fraction of queries having $\ge 1$ gold `paper_id` inside Top-$K$ (`55.0%` at $K=1$, `69.2%` at $K=5$, `75.0%` at $K=10$).
- **`Recall@K` (Multi-Paper Strict)**: $\frac{1}{N}\sum_{q=1}^{N} \frac{|\text{Top}_K(q) \cap G_q|}{|G_q|}$ — Strict multi-paper recall where each hit on a 2-paper query (`28/120` queries) contributes `0.5` (`49.6%` at $K=1$, `62.1%` at $K=5$).
- **DeepEval Contextual Recall / Precision**: LLM-judged statement-level coverage of `expected_output` claims in Top-5 hydrated contexts (`0.900`) and rank-weighted relevance (`0.852`).

---

## 5. Key Findings & Regressions

- **Primary Finding**: Neither `Laya` (`MRR 0.5822`, `Hit@5 66.7%`) nor `PageRank` (`MRR 0.5741`, `Hit@1 49.2%`) alone delivers the full gain; combining **`Vector + Laya (RRF) + PageRank` (`Full System`)** creates a genuine synergy that pushes **`MRR` to `0.6076` (`+6.1%`)**, **`Hit@1` to `55.0%` (`+5.8 pp`)**, **`Recall@1` to `49.6%` (`+4.6 pp`)**, and **`Hit@5` to `69.2%` (`+1.7 pp`)** at only **`+0.21 ms`** PageRank lookup cost. Batched `bfloat16` CUDA inference cuts `Laya-421M` latency to **`316.16 ms`** (`13.5x` faster than CPU ONNX), keeping full retrieval + rerank under **`642 ms`**.
- **Regressions / Caveats**:
  - **Extended Subset Dilution (`N=169`)**: Extending DeepEval from `N=105` (`gold-001..100`) to `N=169` lowered Contextual Recall (`0.900 -> 0.637`) and Precision (`0.852 -> 0.618`) due to unindexed/sparse coverage on later `101..200` queries and stricter 2-paper coverage.
  - **Generation Threshold Gaps**: Faithfulness (`0.667` vs `0.70`) and Answer Relevancy (`0.667` vs `0.75`) on `N=105` reflect `Qwen 2.5-7B` synthesis strictness and Top-5 window breadth (Contextual Relevancy `0.520`).
  - **Prior Qdrant Rank Anchor**: [`evaluate_120_ranking_5_scenarios.py`](../../benchmarks/evaluate_120_ranking_5_scenarios.py) aligns initial dense ranks using `load_prior_qdrant_vector_ranks()` ([`laya_5_scenarios_comparison_100q.json`](../../logs/benchmarks/laya_5_scenarios_comparison_100q.json) + [`batch_101_120_5_scenarios.json`](../../logs/benchmarks/batch_101_120_5_scenarios.json)) when offline from remote Qdrant.
- **Decision**: `ADOPTED` — Full `Vector + Cross-Attention RRF + PageRank` fusion with mandatory `ChunkStore` hydration and CUDA batched reranking is the standard multi-stage ranking architecture.

---

## 6. Reproduction Protocol

```bash
# 1. Execute the 120-query 5-scenario hydrated ranking ablation
python -m benchmarks.evaluate_120_ranking_5_scenarios

# 2. Aggregate 3-way cached DeepEval comparison (requires cached_eval_master_*_local.json logs)
python -m benchmarks.generate_scenario_comparison

# 3. Inspect full report and JSON traces
cat docs/benchmarks/laya_pagerank_benchmark_report.md
```

---

## 7. Associated Links

- Master Experiment Index: [`docs/experiments/README.md`](README.md)
- Benchmark Scripts & Datasets: [`evaluate_120_ranking_5_scenarios.py`](../../benchmarks/evaluate_120_ranking_5_scenarios.py), [`evaluate_100_ranking_5_scenarios.py`](../../benchmarks/evaluate_100_ranking_5_scenarios.py), [`rag_goldens_200.json`](../../benchmarks/datasets/rag_goldens_200.json), [`citation_metrics.parquet`](../../data/gold/graphs/citation_metrics.parquet)
- Benchmark Report & JSON Logs: [`laya_pagerank_benchmark_report.md`](../benchmarks/laya_pagerank_benchmark_report.md), [`laya_5_scenarios_comparison_120q.json`](../../logs/benchmarks/laya_5_scenarios_comparison_120q.json), [`cached_eval_master_k5_pagerank_local.json`](../../logs/benchmarks/cached_eval_master_k5_pagerank_local.json)
- Production Services: [`retrieval_service.py`](../../backend/app/services/retrieval_service.py), [`reranker_service.py`](../../backend/app/services/reranker_service.py), [`chunk_store.py`](../../src/storage/chunk_store.py)
