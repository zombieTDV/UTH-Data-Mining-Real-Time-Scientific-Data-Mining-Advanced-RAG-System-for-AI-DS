# EXP-05: Laya `soft-ce` Fine-Tuning, Hybrid BM25+Vector & Evidence Gate

- **Motivation/Background**: Pretrained `convaiinnovations/laya` (`0.4.27`) suffered severe miscalibration on scientific retrieval (`dev AUC = 0.6848`, accepting `58.8%` of fabricated questions at threshold `0.6`), while pure dense vector retrieval missed exact method/acronym queries (`MRR@10 = 0.553` on `test_set_v1`), risking both retrieval misses and ungrounded hallucination on unanswerable prompts.
- **Purpose**: Isolate the retrieval, calibration, and abstention gains from fine-tuning `Laya` with `soft-ce` loss (`1`-epoch round-2 ONNX vs. `4`-epoch round-1), adding BM25 lexical fusion, and enforcing an Evidence Gate (`LAYA_EVIDENCE_THRESHOLD = 0.6`) across the frozen `150`-query `rag_eval` suite and `3`-way ONNX DeepEval benchmark.
- **Overview Pipeline**: Stratified chunks (`sample_chunks.cjs`) -> DeepSeek V4.1 Flash QA + retrieved hard pairs (`build_data_v2.sh`) -> `soft-ce` fine-tuning (`finetune.ipynb` on Tesla T4) -> `opset=18` ONNX export (`laya_onnx_20261108-2053_seed0`) -> 9-mode retrieval & Evidence Gate scoring (`score_retrieval.py`) + 3-way 150-sample DeepEval (`run_deepeval_judge.py`, `run_deepeval_vector_judge.py`).
- **Detailed Plan**: Metadata; §1 Objective & Hypothesis; §2 Controlled Variables; §3 Setup & Hyperparameters; §4 Empirical Results (5W1H); §5 Key Findings & Regressions; §6 Reproduction Protocol; §7 Associated Links.
- **References**: [`EXPERIMENT_TEMPLATE.md`](../../agents/templates/EXPERIMENT_TEMPLATE.md), [`MD_CONVENTION.md`](../../agents/rules/MD_CONVENTION.md), [`RESULTS_REPORTING.md`](../../agents/rules/RESULTS_REPORTING.md), [`finetune.ipynb`](../../notebooks/finetune.ipynb), [`RUN_INFO.json`](../../notebooks/laya_onnx_20261108-2053_seed0/RUN_INFO.json), [`laya_config.json`](../../notebooks/laya_onnx_20261108-2053_seed0/laya_config.json), [`report_seed0.json`](../../notebooks/laya_finetune/report_seed0.json), [`score_retrieval.py`](../../benchmarks/rag_eval/score_retrieval.py), [`README.md`](../../benchmarks/rag_eval/README.md), [`table_retrieval_v1.tex`](../../data-mining-latek/tables/table_retrieval_v1.tex), [`laya_ab_final_benchmark.json`](../../logs/benchmarks/laya_ab_final_benchmark.json), [`vector_final_benchmark.json`](../../logs/benchmarks/vector_final_benchmark.json), [`run_deepeval_judge.py`](../../benchmarks/run_deepeval_judge.py), [`run_deepeval_vector_judge.py`](../../benchmarks/run_deepeval_vector_judge.py).
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

- **Experiment ID**: `EXP-05`
- **Title**: Laya (`0.4.27`) `soft-ce` Fine-Tuning, Hybrid BM25+Vector & Evidence Gate (`AUROC 0.986`)
- **Status**: `COMPLETED`
- **Training & Scoring Scripts**: [`notebooks/finetune.ipynb`](../../notebooks/finetune.ipynb), [`benchmarks/laya_finetune/build_data_v2.sh`](../../benchmarks/laya_finetune/build_data_v2.sh), [`benchmarks/rag_eval/score_retrieval.py`](../../benchmarks/rag_eval/score_retrieval.py), [`benchmarks/run_deepeval_judge.py`](../../benchmarks/run_deepeval_judge.py), [`benchmarks/run_deepeval_vector_judge.py`](../../benchmarks/run_deepeval_vector_judge.py)
- **Checkpoints & Output Artifacts**: [`notebooks/laya_onnx_20261108-2053_seed0/RUN_INFO.json`](../../notebooks/laya_onnx_20261108-2053_seed0/RUN_INFO.json), [`notebooks/laya_finetune/report_seed0.json`](../../notebooks/laya_finetune/report_seed0.json), `` `logs/benchmarks/rag_eval/report_retrieval.json` ``, [`laya_ab_final_benchmark.json`](../../logs/benchmarks/laya_ab_final_benchmark.json), [`vector_final_benchmark.json`](../../logs/benchmarks/vector_final_benchmark.json), [`table_retrieval_v1.tex`](../../data-mining-latek/tables/table_retrieval_v1.tex)

---

## 1. Objective & Hypothesis

- **Hypothesis**: Full fine-tuning of `convaiinnovations/laya` (`0.4.27`, 421.3M params) using `soft-ce` loss on positive, `missing_detail`, `fabricated`, and hard retrieved scientific pairs—combined with BM25 lexical hybrid candidate generation and an Evidence Gate threshold (`0.6`)—will raise dev AUC from `~0.68` to $\ge 0.89$, cut `fabricated` false acceptance at `0.6` below `5%`, lift `rag_eval` `MRR@10` above `0.80`, and achieve Evidence Gate `AUROC >= 0.95` without tuning on the frozen test set.
- **Success Criteria**:
  1. Held-out dev AUC $> 0.85$, MRR $> 0.90$, and `fabricated` acceptance @`0.6` $< 0.05$ with ONNX-vs-PyTorch logit gap $< 10^{-2}$.
  2. `laya_ft1_hybrid` (`1`-epoch round-2 ONNX + BM25) reaches `Hit@5 >= 0.90`, `MRR@10 >= 0.80`, and Evidence Gate `AUROC >= 0.95` on locked `` `test_set_v1.jsonl` ``.
  3. 3-way 150-sample DeepEval benchmark demonstrates superior `MRR`, `Hit@1`, and `100%` negative rejection vs. `Pure Vector` and `Pretrained Laya`.

---

## 2. Controlled Variables (Single-Variable Principle)

- **Variable Changed**:
  1. **Reranker Weights**: Pretrained `convaiinnovations/laya` (`0.4.27`) $\rightarrow$ `soft-ce` fine-tuned 4-epoch round-1 (`laya_ft`, `3,432` train items) vs. 1-epoch round-2 (`laya_ft1` / `20261108-2053_seed0`, `6,161` train items with ranks 4–5 + extra disjoint papers).
  2. **Candidate Retrieval Branch**: Dense Qdrant `vector` vs. `hybrid` (`Vector + BM25` SQLite) vs. `prod` (`authority=1`).
  3. **Evidence Gate**: Unfiltered vs. `max(top-5 Laya score) >= 0.6` abstention check.
- **Held Constant**: Frozen `` `benchmarks/rag_eval/data/test_set_v1.jsonl` `` (`100` answerable [`42` fact, `29` explain, `15` topical, `14` paraphrase] + `50` unanswerable [`10` off_topic, `12` fabricated, `12` absent_fact, `16` missing_detail], paper-disjoint from `laya-eval-set-200.json` and training chunks), `RELEVANCE_QUESTION` prompt (`noul:2`), `max_len=512`, `head_max_len=192`, `TOP_K=5`, `LAYA_EVIDENCE_THRESHOLD=0.6` (never tuned on `test_set_v1`), and `RAG_TS` runtime + `Qwen 2.5-7B-Instruct (CUDA)` DeepEval judge (`$0.00`).

---

## 3. Setup & Hyperparameters

- **Training Splits & Anti-Leakage**:
  - **1-Epoch Round-2 (`20261108-2053_seed0`)**: `6,161` train items, `400` calibration items, `1,410` dev items (`175` MRR groups); `0` overlapping train/calib items and `0` shared source papers with `test_set_v1` ([`build_data_v2.sh`](../../benchmarks/laya_finetune/build_data_v2.sh), [`finetune.ipynb`](../../notebooks/finetune.ipynb)).
  - **4-Epoch Round-1 ([`report_seed0.json`](../../notebooks/laya_finetune/report_seed0.json))**: `3,432` train items, `381` calibration items, `820` held-out eval items (`130` MRR groups).
- **Training & Calibration Hyperparameters**:
  - `laya_version`: `0.4.27` (`421.3M` params, `100%` full fine-tune on Tesla T4 15.6 GB, `27.3 min` for 1-epoch run)
  - `loss`: `"soft-ce"`, `rl_samples=4`, `sigma_start=0.4`, `sigma_end=0.1`, `w_sph=0.75`, `w_rps=1.0`, `label_smoothing=0.0`
  - `optimizer`: `micro_batch=8`, `grad_accum=8` (effective batch `64`), `encoder_lr=2.5e-5`, `head_lr=1e-4`, `min_lr=1e-6`, `weight_decay=0.01`, `grad_clip=1.0`, `seed=0`
  - `ONNX Export`: `opset_version=18`, `max_len=512`, `head_max_len=192`, calibrated `noul:2` temperature = `0.8930` (1-ep [`laya_config.json`](../../notebooks/laya_onnx_20261108-2053_seed0/laya_config.json); `logit_gap = 1.4067e-5`) vs. `3.0627` (4-ep `report_seed0.json`; `logit_gap = 5.1409e-6`).

---

## 4. Empirical Results (5W1H)

> **5W1H — Laya `soft-ce` Dev Calibration, 9-Mode Retrieval v1 & 3-Way DeepEval Benchmark**
> - **What**: (a) Before/after dev AUC, MRR, and threshold-`0.6` acceptance rates; (b) 9-mode `rag_eval` retrieval (`Hit@K`, `Recall@5`, `MRR@10`, `nDCG@10`, `Gold@5`) and Evidence Gate `AUROC` (`0.986`); and (c) 150-sample 3-way ONNX DeepEval comparison (`Pure Vector` vs. `Pretrained Laya` vs. `Fine-Tuned Laya`).
> - **Why**: Prove that `soft-ce` fine-tuning turns Laya into both a stronger ranker and a near-perfect Evidence Gate against fabricated/missing-detail hallucinations, while measuring exact ONNX latency vs. accuracy trade-offs.
> - **When**: Fine-tuning & ONNX export completed `2026-11-08` (`20261108-2053_seed0`, commit `82014e8`); 3-way DeepEval finalized `2026-11-09` (`11:34` & `15:18` UTC).
> - **Where**: Training reports in [`RUN_INFO.json`](../../notebooks/laya_onnx_20261108-2053_seed0/RUN_INFO.json) and [`report_seed0.json`](../../notebooks/laya_finetune/report_seed0.json); 9-mode table in `` `logs/benchmarks/rag_eval/report_retrieval.json` `` / [`table_retrieval_v1.tex`](../../data-mining-latek/tables/table_retrieval_v1.tex); 3-way DeepEval in [`laya_ab_final_benchmark.json`](../../logs/benchmarks/laya_ab_final_benchmark.json) & [`vector_final_benchmark.json`](../../logs/benchmarks/vector_final_benchmark.json).
> - **Who**: UTH RAG Engineering Team — for production `RAG_TS` reranker deployment (`LAYA_EVIDENCE_THRESHOLD=0.6`).
> - **How**: `score_retrieval.py` over TREC-pooled DeepSeek Flash `qrels.jsonl` (with `95%` bootstrap CI & paired permutation tests) on `RAG_TS` + BM25 SQLite; 3-way DeepEval using Local `Qwen 2.5-7B-Instruct (CUDA)` (`$0.00`).

### Table 4.1: Held-Out Dev Split Calibration & Hallucination Suppression (`threshold = 0.6`)

| Checkpoint & Split | AUC (`Before -> After`) | MRR (`Before -> After`) | `answerable` @0.6 | `fabricated` @0.6 | `missing_detail` @0.6 | `retrieved_irrelevant` @0.6 | ONNX Logit Gap |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1-Epoch Round-2** ([`RUN_INFO.json`](../../notebooks/laya_onnx_20261108-2053_seed0/RUN_INFO.json), 175 groups) | `0.6848 -> 0.8928` | `0.7070 -> 0.9546` | `0.730 -> 0.730` | `0.588 -> 0.023` | `0.497 -> 0.051` | `0.424 -> 0.030` | `1.407e-5` |
| **4-Epoch Round-1** ([`report_seed0.json`](../../notebooks/laya_finetune/report_seed0.json), 130 groups) | `0.6685 -> 0.9085` | `0.7615 -> 0.9590` | `0.730 -> 0.774` | `0.574 -> 0.015` | `0.515 -> 0.051` | `0.424 -> 0.055` | `5.141e-6` |

### Table 4.2: 9-Mode Retrieval v1 & Evidence Gate (`100` Pos + `50` Neg, `` `test_set_v1.jsonl` ``)

| Retrieval Mode | Hit@1 | Hit@5 | Recall@5 | MRR@10 | nDCG@10 | Gold@5 | Evidence Gate AUROC | Notes / Latency |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **`vector`** | 0.440 | 0.720 | 0.515 | 0.553 | 0.698 | 0.620 | `--` | `566 ms` avg |
| **`hybrid`** (`Vector + BM25`) | 0.530 | 0.910 | 0.691 | 0.690 | 0.810 | 0.780 | `--` | `577 ms` avg (`+0.190 Hit@5`) |
| **`laya`** (Pretrained) | 0.480 | 0.730 | 0.530 | 0.593 | 0.705 | 0.620 | 0.823 | Cross-attention alone |
| **`laya_hybrid`** | 0.620 | 0.900 | 0.690 | 0.743 | 0.822 | 0.760 | 0.870 | Pretrained Laya + BM25 |
| **`prod`** (`Laya + authority`) | 0.440 | 0.690 | 0.485 | 0.561 | 0.652 | 0.560 | 0.838 | Uniform chunk sample disfavors authority |
| **`laya_ft`** (4-ep r1) | 0.570 | 0.740 | 0.550 | 0.649 | 0.725 | 0.630 | 0.952 | Fine-tuned dense only |
| **`laya_ft_hybrid`** | **0.740** | **0.940** | 0.744 | **0.827** | **0.852** | **0.830** | 0.978 | 4-ep r1 + BM25 |
| **`laya_ft1`** (1-ep r2) | 0.590 | 0.740 | 0.559 | 0.659 | 0.728 | 0.650 | 0.960 | 1-ep r2 dense only |
| **`laya_ft1_hybrid`** (Prod ONNX + BM25) | 0.730 | **0.940** | **0.754** | **0.824** | **0.850** | **0.830** | **`0.986`** | **`50/50` neg blocked; `86/100` pos kept** (`5,391 ms`) |

### Table 4.3: 150-Sample 3-Way ONNX & DeepEval Benchmark (`RAG_TS` + Local `Qwen 2.5-7B` Judge)

| Dimension | 1. Pure Vector (`Nomic v1.5`) | 2. Pretrained Laya (`Baseline`) | 3. Fine-Tuned Laya (`20261108-seed0`) | Delta (`FT Laya` vs. `Vector`) |
| :--- | :---: | :---: | :---: | :--- |
| **Tier 1: `MRR` (`100` Pos)** | `0.8623` | `0.8853` | **`0.8939`** | **`+0.0316` (`+3.66%` rel)** |
| **Tier 1: `Hit@1` / `Hit@3` / `Hit@5`** | `79.0%` / `92.0%` / `96.0%` | `81.0%` / `97.0%` / `97.0%` | **`82.0%`** / `96.0%` / **`98.0%`** | **`+3.0 pp Hit@1` / `+2.0 pp Hit@5`** |
| **Tier 1: Reject@0.5 (`50` Neg)** | `92.0%` (`100%` @0.6) | `100.0%` (`0%` false accept) | **`100.0%`** (`0%` false accept) | **`+8.0 pp` @0.5** |
| **Tier 2: Faithfulness (DeepEval)** | `0.7956` | `0.7970` | **`0.7977`** | `+0.0021` |
| **Tier 2: Answer Relevancy (DeepEval)** | `0.6159` | `0.6291` | **`0.6341`** | **`+0.0182`** |
| **Tier 2: Contextual Relevancy (DeepEval)** | **`0.3350`** | `0.3100` | `0.3100` | `-0.0250` |
| **Average Latency (`ms/query`)** | `4,686.8 ms` | **`2,312.2 ms`** | `2,643.5 ms` | **`-2,043.3 ms` (`1.77x` faster than Vector)** |

### Companion Metric Glossary
- **TREC-Pooled `qrels` & `Gold@5`**: Ground-truth relevance labels (`grade=2` authoritative or DeepSeek Flash judged) across pooled Top-10 candidates; `Gold@5` (`0.830`) strictly verifies whether the verbatim source chunk enters Top-5 independent of judge leniency.
- **Evidence Gate `AUROC`**: Probability that `max(top-5 Laya scores)` on an answerable query exceeds that on an unanswerable query (`0.986` for `laya_ft1_hybrid`, stopping `50/50` negative queries and keeping `86/100` positives at production threshold `0.6`).
- **Reject@0.5 / False Acceptance**: Fraction of `50` unanswerable queries blocked vs. accepted at score `0.5` in the 150-sample 3-way ONNX benchmark ([`laya_ab_final_benchmark.json`](../../logs/benchmarks/laya_ab_final_benchmark.json), [`vector_final_benchmark.json`](../../logs/benchmarks/vector_final_benchmark.json)).

---

## 5. Key Findings & Regressions

- **Primary Finding**: Combining **`BM25` hybrid retrieval** with **`soft-ce` fine-tuned `Laya`** transforms both ranking and abstention: on the rigorous 9-mode `rag_eval` suite, `laya_ft1_hybrid` improves `Hit@1` from `0.440 -> 0.730` (`+29.0 pp`), `Hit@5` from `0.720 -> 0.940` (`+22.0 pp`), `MRR@10` from `0.553 -> 0.824` (`+49.0%` rel), `nDCG@10` from `0.698 -> 0.850`, and drives **Evidence Gate `AUROC` to `0.986`** (blocking `50/50` unanswerable queries while retaining `86/100` answerables at `0.6`). Across the 150-sample 3-way ONNX DeepEval suite, Fine-Tuned Laya (`20261108-seed0`) leads on `MRR` (`0.8939`), `Hit@1` (`82.0%`), `Hit@5` (`98.0%`), `Faithfulness` (`0.7977`), and `Answer Relevancy` (`0.6341`).
- **Scope Boundary & Regressions**:
  - **Evaluation Stack Scope**: Both the 9-mode `rag_eval` (`report_retrieval.json`) and the 3-way 150-sample ONNX benchmarks (`laya_ab_final_benchmark.json`, `vector_final_benchmark.json`) ran on **`RAG_TS`** (NodeJS/TypeScript + BM25 SQLite + Laya ONNX) with Local `Qwen 2.5-7B` (`$0.00`); they do not directly benchmark the Python FastAPI backend's `ms-marco-MiniLM-L-6-v2` / `bge-reranker-base` generation stack.
  - **ONNX Reranker Latency**: In `rag_eval` (`run_modes.sh`), adding Laya ONNX increases mean retrieval latency from `577 ms` (`hybrid`) to `5,391 ms` (`laya_ft1_hybrid`) on CPU ONNX (consistent with `+4,260 ms` CPU ONNX in `EXP-04`, mitigated by CUDA `bfloat16` batching in Python).
  - **1-Epoch vs. 4-Epoch Generalization**: 4-epoch round-1 training (`report_seed0.json`) reached marginally higher `MRR@10` (`0.827` vs `0.824`) but exhibited overfitting in epochs 2–4; 1-epoch round-2 (`20261108-2053_seed0`) achieved higher `Recall@5` (`0.754`) and superior Evidence Gate `AUROC` (`0.986` vs `0.978`).
  - **Entity Bias & Pos-Keep Trade-off**: `85/100` positive test queries contain proper nouns (favoring BM25), and `threshold=0.6` conservatively filters `14/100` answerable queries alongside `50/50` unanswerables.
- **Decision**: `ADOPTED` — `laya_onnx_20261108-2053_seed0` (`1`-epoch round-2 ONNX) + BM25 Hybrid + `LAYA_EVIDENCE_THRESHOLD=0.6` is deployed in `RAG_TS`.

---

## 6. Reproduction Protocol

```bash
# 1. Verify rank/AUROC statistical functions (bootstrap CI & paired permutation tests)
.venv/Scripts/pytest.exe benchmarks/rag_eval/test_metrics.py -v

# 2. Score Retrieval v1 across all 9 modes (after running benchmarks/rag_eval/run_modes.sh on RAG_TS)
python benchmarks/rag_eval/score_retrieval.py

# 3. Re-run 3-way 150-sample DeepEval Local Qwen 2.5-7B Judge (requires port 9001 local LLM)
python benchmarks/run_deepeval_judge.py
python benchmarks/run_deepeval_vector_judge.py
```

---

## 7. Associated Links

- Master Experiment Index: [`docs/experiments/README.md`](README.md)
- Fine-Tuning Notebook & Reports: [`finetune.ipynb`](../../notebooks/finetune.ipynb), [`RUN_INFO.json`](../../notebooks/laya_onnx_20261108-2053_seed0/RUN_INFO.json), [`laya_config.json`](../../notebooks/laya_onnx_20261108-2053_seed0/laya_config.json), [`report_seed0.json`](../../notebooks/laya_finetune/report_seed0.json)
- Data Prep & ONNX Parity Scripts: [`build_data_v2.sh`](../../benchmarks/laya_finetune/build_data_v2.sh), [`generate_questions.py`](../../benchmarks/laya_finetune/generate_questions.py), [`prepare_pairs.py`](../../benchmarks/laya_finetune/prepare_pairs.py), [`assemble.py`](../../benchmarks/laya_finetune/assemble.py), [`score_dev_onnx.cjs`](../../benchmarks/laya_finetune/score_dev_onnx.cjs)
- `rag_eval` Benchmark Suite: [`README.md`](../../benchmarks/rag_eval/README.md), [`run_modes.sh`](../../benchmarks/rag_eval/run_modes.sh), [`run_retrieval.cjs`](../../benchmarks/rag_eval/run_retrieval.cjs), [`score_retrieval.py`](../../benchmarks/rag_eval/score_retrieval.py), [`score_answers.py`](../../benchmarks/rag_eval/score_answers.py), [`metrics.py`](../../benchmarks/rag_eval/metrics.py)
- DeepEval 3-Way Logs & Thesis Table: [`run_deepeval_judge.py`](../../benchmarks/run_deepeval_judge.py), [`run_deepeval_vector_judge.py`](../../benchmarks/run_deepeval_vector_judge.py), [`laya_ab_final_benchmark.json`](../../logs/benchmarks/laya_ab_final_benchmark.json), [`vector_final_benchmark.json`](../../logs/benchmarks/vector_final_benchmark.json), [`table_retrieval_v1.tex`](../../data-mining-latek/tables/table_retrieval_v1.tex), [`06_evaluation.tex`](../../data-mining-latek/sections/06_evaluation.tex)
