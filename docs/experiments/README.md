# UTH Scientific Lakehouse & RAG — Experiment Specifications & Reports Index

- **Motivation/Background**: Systematic engineering and ML/data mining experimentation across ingestion scaling, domain-aware chunking, corpus-wide mining, multi-stage ranking, and cross-encoder calibration requires isolated single-variable hypotheses, verifiable baselines, and full 5W1H provenance so architectural gains are never conflated or misattributed.
- **Purpose**: Provide the authoritative master index, Single-Variable Isolation Matrix, lifecycle governance, and 5W1H reporting entry point for formal experiment specifications `EXP-01` through `EXP-05`.
- **Overview Pipeline**: Define controlled hypothesis in [`EXPERIMENT_TEMPLATE.md`](../../agents/templates/EXPERIMENT_TEMPLATE.md) -> Isolate one independent variable against a frozen baseline -> Execute reproducible scripts/benchmarks -> Record 5W1H empirical tables per [`RESULTS_REPORTING.md`](../../agents/rules/RESULTS_REPORTING.md) -> Adjudicate `ADOPTED` / `REJECTED` decisions.
- **Detailed Plan**: §1 Experiment Portfolio & Master Index; §2 Single-Variable Isolation Matrix; §3 Lifecycle & 5W1H Reporting Standards; §4 Cross-Cutting Evaluation Boundaries; §5 Associated Benchmark Reports & Sources.
- **References**: [`EXPERIMENT_TEMPLATE.md`](../../agents/templates/EXPERIMENT_TEMPLATE.md), [`MD_CONVENTION.md`](../../agents/rules/MD_CONVENTION.md), [`RESULTS_REPORTING.md`](../../agents/rules/RESULTS_REPORTING.md), [`laya_pagerank_benchmark_report.md`](../benchmarks/laya_pagerank_benchmark_report.md), [`PERFORMANCE_BENCHMARK_REPORT.md`](../benchmarks/PERFORMANCE_BENCHMARK_REPORT.md), [`06_evaluation.tex`](../../data-mining-latek/sections/06_evaluation.tex).
- **Created**: 2026-11-25T12:55:00+07:00
- **Last Updated**: 2026-11-25T12:55:00+07:00

[STATUS: ACTIVE]

---

## Table of Contents

- [1. Experiment Portfolio & Master Index](#1-experiment-portfolio--master-index)
- [2. Single-Variable Isolation Matrix](#2-single-variable-isolation-matrix)
- [3. Lifecycle & 5W1H Reporting Standards](#3-lifecycle--5w1h-reporting-standards)
- [4. Cross-Cutting Evaluation Boundaries](#4-cross-cutting-evaluation-boundaries)
- [5. Associated Benchmark Reports & Sources](#5-associated-benchmark-reports--sources)

---

## 1. Experiment Portfolio & Master Index

This directory tracks the five core systems and algorithmic experiments conducted across the UTH Scientific Data Mining & Real-Time RAG Lakehouse (`HEAD` reference `254e6a1` / `f421707` cycle, October–November 2026). Each specification follows [`EXPERIMENT_TEMPLATE.md`](../../agents/templates/EXPERIMENT_TEMPLATE.md) and satisfies the 7-field header and cross-reference rules in [`MD_CONVENTION.md`](../../agents/rules/MD_CONVENTION.md).

| Experiment ID | Title | Status | Variable Changed | Headline Empirical Outcome | Report |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **`EXP-01`** | Lakehouse Scaling, Two-Stage Ingestion & `ChunkStore` Hydration | `COMPLETED` | Two-stage RabbitMQ (`fetch`/`embed`) + `QDRANT_PAYLOAD_FIELDS` strip + Silver `ChunkStore` hydration + `D-006` pre-warm/LRU | Scaled to `71,927` papers / `1,043,594` Qdrant vectors; restored `D-058` Precision/Recall from `0.009` to `0.852` / `0.900`; E2E `101.92 s -> 3.39 s` | [`EXP_01_LAKEHOUSE_SCALING_AND_CHUNKSTORE_HYDRATION.md`](EXP_01_LAKEHOUSE_SCALING_AND_CHUNKSTORE_HYDRATION.md) |
| **`EXP-02`** | Domain-Aware Scientific Chunking A/B Ablation | `COMPLETED` | Balanced sentence-snapped 15% overlap (`B_new_pct15`) & 0% overlap (`C_new_pct0`) vs legacy fixed-50 (`A_old_fixed50`) | Eliminated short-tail fragments (`p10`: `103 -> 166` words); `B` wins `Recall@5` (`0.7143 -> 0.7679`); `C` peaks `Recall@10` (`0.9286`) & `nDCG@10` (`0.6844`) | [`EXP_02_DOMAIN_AWARE_CHUNKING_AB.md`](EXP_02_DOMAIN_AWARE_CHUNKING_AB.md) |
| **`EXP-03`** | Four Pillars Data Mining at 72k Lakehouse Scale | `COMPLETED` | Live MinIO DuckDB (`httpfs`) + Qdrant full-corpus `MiningEngine` + PCA 2D GMM ($K=6$) + Share-Normalized Momentum | Total runtime cut `467.49 s -> 234.57 s` (`1.99x` faster) over `71,927` papers / `70,539` abstract vectors; `45` FP-Growth rules (top lift `34.940`); `1,000` outliers | [`EXP_03_FOUR_PILLARS_MINING_72K_SCALE.md`](EXP_03_FOUR_PILLARS_MINING_72K_SCALE.md) |
| **`EXP-04`** | Hydrated 5-Scenario Laya Reranking & Graph PageRank Authority | `COMPLETED` | 5-scenario ranking ablation (`Vector`, `Laya`, `RRF k=60`, `Vector+PR`, `Full`) + 29.5k-author PageRank + CUDA `bfloat16` batching | `MRR 0.5725 -> 0.6076 (+6.1%)`, `Hit@1 49.2% -> 55.0%`, `Recall@1 45.0% -> 49.6%` (`N=120`); Laya CUDA batch `+316.16 ms` (`13.5x` vs CPU) | [`EXP_04_HYDRATED_5_SCENARIO_LAYA_PAGERANK.md`](EXP_04_HYDRATED_5_SCENARIO_LAYA_PAGERANK.md) |
| **`EXP-05`** | Laya `soft-ce` Fine-Tuning, Hybrid BM25+Vector & Evidence Gate | `COMPLETED` | `convaiinnovations/laya` (`0.4.27`) `soft-ce` fine-tuning (`max_len=512`, `seed=0`) + BM25 RRF + Evidence Gate (`threshold=0.6`) | `laya_ft1_hybrid` reaches `MRR@10 0.824`, `Hit@5 0.940`, `nDCG@10 0.850`, Evidence Gate **`AUROC 0.986`** (`50/50` unanswerable blocked) | [`EXP_05_LAYA_SOFT_CE_FINETUNING_AND_EVIDENCE_GATE.md`](EXP_05_LAYA_SOFT_CE_FINETUNING_AND_EVIDENCE_GATE.md) |

---

## 2. Single-Variable Isolation Matrix

Per [`MD_CONVENTION.md`](../../agents/rules/MD_CONVENTION.md) §5, each experiment isolates one primary modification against an explicit reference baseline while holding orthogonal stack components constant.

| ID | Baseline Reference | Single Variable Changed | Held Constant | Key Metric Delta | Decision |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`EXP-01`** | Single-stage `queue_consumer --stage all`; unstripped Qdrant payload; unhydrated `D-058`; cold model loads | Two-stage RabbitMQ (`fetch`/`embed`, `EMBED_QUEUE_MAX=500`) + Silver `ChunkStore` hydration + `D-006` pre-warm & LRU cache | `AcademicChunker(450)`, `NomicEmbedder` (768-D, `MAX_TOKENS=2048`), Qdrant HNSW Cosine | `0.009 -> 0.852` Ctx Precision; `0.009 -> 0.900` Ctx Recall; `101.92 s -> 3.39 s` E2E | `ADOPTED` |
| **`EXP-02`** | `A_old_fixed50` (`c50a651`, 450w fixed sliding window, 50w overlap) | Window balancing, 15% (`B`) vs 0% (`C`) proportional overlap, sentence snapping & short-tail merge | 49 GT papers of [`scientific_eval_v2.jsonl`](../../benchmarks/datasets/scientific_eval_v2.jsonl) + hard negatives + fill (`n_total=1000`), `MAX_WORDS=450`, `Nomic v1.5`, exact numpy cosine | `B`: `Recall@5 +0.0536` (`0.7679`), `p10 +63w` (`166`); `C`: `Recall@10 +0.0715` (`0.9286`) | `ADOPTED` (`B_new_pct15` in prod) |
| **`EXP-03`** | Local Parquet + LanceDB 10k–29.9k run ([`mining_manifest.json`](../../data/gold/mining/mining_manifest.json), `467.49 s`) | MinIO S3 DuckDB (`httpfs`) + Qdrant full-corpus streaming (`71,927` papers / `70,539` vectors) + PCA 2D GMM ($K=6$) + $\Delta\text{Share}$ | 5-module sequence (EDA + 4 Pillars), `min_support=0.02`, `min_lift=1.20`, `n_clusters=6`, `contamination=0.02` | Total runtime `-49.8%` (`467.49 s -> 234.57 s`); `45` rules (top lift `34.940`); `BIC 246,306.5` | `ADOPTED` |
| **`EXP-04`** | Dense `Vector` baseline (`MRR=0.5725`, `Hit@1=49.2%`) & CPU `onnxruntime-node` (`+4,260 ms`) | Hydrated `Laya` cross-attention + RRF ($k=60$) + `29,523`-author PageRank + CUDA `bfloat16` batched Laya | `N=120` hydrated queries ([`rag_goldens_200.json`](../../benchmarks/datasets/rag_goldens_200.json)), Top-10 pool, `Nomic v1.5`, Local `Qwen 2.5-7B` judge | `MRR +6.1%` (`0.6076`), `Hit@1 +5.8 pp` (`55.0%`), `13.5x` Laya speedup (`+316.16 ms`) | `ADOPTED` |
| **`EXP-05`** | Pretrained `convaiinnovations/laya` (`0.4.27`) & `Pure Vector` (`MRR@10 0.553` / `MRR 0.8623`) | `soft-ce` fine-tuning (`max_len=512`, `seed=0`) + BM25 Hybrid RRF + Evidence Gate (`threshold=0.6`) | Locked `test_set_v1.jsonl` (`100` pos + `50` neg), `RAG_TS` + BM25 SQLite + Local `Qwen 2.5-7B` judge | `MRR@10 0.553 -> 0.824`; `Hit@5 0.720 -> 0.940`; Evidence Gate **`AUROC 0.986`** | `ADOPTED` (`laya_onnx_20261108-2053_seed0`) |

---

## 3. Lifecycle & 5W1H Reporting Standards

### Document Lifecycle Badges
Every specification under `docs/experiments/` carries an explicit status badge immediately below its 7-field metadata header per [`MD_CONVENTION.md`](../../agents/rules/MD_CONVENTION.md) §3:
- `[STATUS: DRAFT]` — Hypothesis and controlled setup specified prior to run completion.
- `[STATUS: ACTIVE]` — Authoritative living index or ongoing benchmark suite.
- `[STATUS: COMPLETED]` — All controlled runs executed, artifacts logged, and findings adjudicated.
- `[STATUS: SUPERSEDED by <relative_link>]` — Preserved for historical provenance when replaced by a newer design.

### Mandatory 5W1H Evidence Blocks
Per [`RESULTS_REPORTING.md`](../../agents/rules/RESULTS_REPORTING.md) §1–§3, no metric in `EXP-01` through `EXP-05` is reported as a bare number. Every empirical table is preceded by a structured `5W1H` blockquote detailing:
- **What**: Exact metrics, splits, and model/pipeline variants measured.
- **Why**: The specific architectural or scientific question answered.
- **When**: Recording date, commit/run ID, epoch, and seed.
- **Where**: Exact artifact path (linked if checked into the repo, inline code if stored in MinIO S3 or excluded `.gitignore` logs) and execution device (`RTX 4060 Laptop GPU`, `Tesla T4`, `CPU`).
- **Who**: Responsible engineering/research group and intended technical audience.
- **How**: Evaluation protocol, pooling/hydration mechanics, judge model, and data-leakage controls.

Every results section also provides a companion **Metric Description Glossary** defining computation formulas and interpretation boundaries.

---

## 4. Cross-Cutting Evaluation Boundaries

To prevent invalid cross-experiment comparisons across October–November 2026 milestones:
1. **Python FastAPI Stack vs. `RAG_TS` Evaluation Stack**: `EXP-01` and `EXP-04` evaluate the Python FastAPI backend ([`retrieval_service.py`](../../backend/app/services/retrieval_service.py), [`reranker_service.py`](../../backend/app/services/reranker_service.py), [`ChunkStore`](../../src/storage/chunk_store.py)) over Qdrant (`scientific_papers_gold`) and Silver Parquet, whereas `EXP-05` evaluates the `RAG_TS` NodeJS/TypeScript + BM25 SQLite + Laya ONNX stack on the locked `test_set_v1.jsonl` benchmark ([`README.md`](../../benchmarks/rag_eval/README.md)). Their MRR and DeepEval absolute numbers reflect distinct corpora, candidate pools, and judges and must not be conflated.
2. **Legacy LanceDB/R2 Snapshots vs. Live MinIO/Qdrant**: Historical reports ([`RAG_EVALUATION_REPORT_21_SAMPLES.md`](../benchmarks/RAG_EVALUATION_REPORT_21_SAMPLES.md), [`RAG_EVALUATION_REPORT_768D_COMPARISON.md`](../benchmarks/RAG_EVALUATION_REPORT_768D_COMPARISON.md), [`mining_manifest.json`](../../data/gold/mining/mining_manifest.json)) reflect the earlier 10k–29.9k LanceDB/R2 architecture and serve strictly as historical baselines for `EXP-01` and `EXP-03`.
3. **Artifact Storage Locations**: Artifacts stored in MinIO S3 (`s3://uth-scientific-lakehouse/...`) or untracked run directories (`logs/run/backend.log`, `logs/benchmarks/chunking_ab/summary.json`, `logs/benchmarks/rag_eval/report_retrieval.json`, `clusters_api.json`, `benchmarks/rag_eval/data/test_set_v1.jsonl`) are referenced as inline code with their provenance timestamps and corresponding LaTeX synthesis tables under [`data-mining-latek/tables/`](../../data-mining-latek/tables/table_kpi.tex).

---

## 5. Associated Benchmark Reports & Sources

- **Experiment Specifications**:
  - [`EXP_01_LAKEHOUSE_SCALING_AND_CHUNKSTORE_HYDRATION.md`](EXP_01_LAKEHOUSE_SCALING_AND_CHUNKSTORE_HYDRATION.md)
  - [`EXP_02_DOMAIN_AWARE_CHUNKING_AB.md`](EXP_02_DOMAIN_AWARE_CHUNKING_AB.md)
  - [`EXP_03_FOUR_PILLARS_MINING_72K_SCALE.md`](EXP_03_FOUR_PILLARS_MINING_72K_SCALE.md)
  - [`EXP_04_HYDRATED_5_SCENARIO_LAYA_PAGERANK.md`](EXP_04_HYDRATED_5_SCENARIO_LAYA_PAGERANK.md)
  - [`EXP_05_LAYA_SOFT_CE_FINETUNING_AND_EVIDENCE_GATE.md`](EXP_05_LAYA_SOFT_CE_FINETUNING_AND_EVIDENCE_GATE.md)
- **Benchmark Reports & Decision Logs**:
  - [`laya_pagerank_benchmark_report.md`](../benchmarks/laya_pagerank_benchmark_report.md) — 120-sample 5-scenario ranking & DeepEval `N=105`/`N=169` hydration report.
  - [`PERFORMANCE_BENCHMARK_REPORT.md`](../benchmarks/PERFORMANCE_BENCHMARK_REPORT.md) — Qdrant connection pooling & RTX 4060 CUDA LLM profiling.
  - [`RAG_EVALUATION_REPORT_21_SAMPLES.md`](../benchmarks/RAG_EVALUATION_REPORT_21_SAMPLES.md) — Historical 21-sample LanceDB DeepEval baseline.
  - [`RAG_EVALUATION_REPORT_768D_COMPARISON.md`](../benchmarks/RAG_EVALUATION_REPORT_768D_COMPARISON.md) — 384-D to 768-D Nomic migration evaluation.
  - [`Vuong_DECISION_LOG.md`](../agent_logs/Vuong_DECISION_LOG.md) — Engineering decisions (`D-001` to `D-008`, including `D-006` latency mitigation and `D-008` GPU safeguards).
  - [`06_evaluation.tex`](../../data-mining-latek/sections/06_evaluation.tex) — Thesis evaluation chapter consolidating 71,927-paper mining and retrieval benchmarks.
