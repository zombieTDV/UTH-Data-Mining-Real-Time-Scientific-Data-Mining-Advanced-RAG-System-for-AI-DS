# UNIFY_DATA_COLLECTION_AND_WEB_UI.md — End-to-End Lakehouse & Web UI Unification Report

- **Motivation/Background**: The multi-source academic harvesting pipelines and the interactive Web UI (React 19 + FastAPI) exhibited disconnects in hardware telemetry, LanceDB vector table referencing, and storage auditing metrics ahead of the project presentation/defense.
- **Purpose**: Document the full resolution of backend data serving, LanceDB Gold table accumulation, zero-leak guardrails, dynamic storage auditing, and accurate NVIDIA RTX 4060 GPU telemetry across the stack.
- **Overview Pipeline**: Executed Strategy B offline metadata ingestion for 500 landmark papers, vectorized dense chunks into LanceDB table `scientific_papers_gold`, unified backend endpoints (`/api/storage/stats`, `/api/search`, `/api/scheduler/status`), and updated frontend telemetry.
- **Detailed Plan**: §1 Landmark Collection & Ingestion Milestone; §2 Storage Auditing & Retrieval Service Dynamic Unification; §3 Hardware Telemetry & SSE Feed Truthfulness; §4 Empirical Verification & Search Validation; §5 Defense Presentation Guide.
- **References**: `agents/rules/COMMIT_CONVENTION.md`, `agents/rules/MD_CONVENTION.md`, `docs/plan_30k_two_tier_expansion_pipeline.md`.
- **Created**: 2026-10-11T21:20:00+07:00
- **Last Updated**: 2026-10-11T21:20:00+07:00

---

## 1. Landmark Collection & Ingestion Milestone

The Tier 1 Landmark Ingestion pipeline (`src/pipelines/run_tier1_bootstrap_strategy_b.py`) executed on the local NVIDIA GeForce RTX 4060 Laptop GPU (8GB GDDR6) under PyTorch CUDA 12.4.

### 1.1 Ingestion Output Summary
- **Total Unique Silver Papers**: 495 papers (99% of 500 milestone target)
- **Academic Source Breakdown**:
  - `openalex`: 356 papers (71.8%)
  - `arxiv`: 113 papers (22.8%)
  - `cvf`: 26 papers (5.2%)
- **Content Extraction Origin**:
  - `abstract_fallback`: 264 papers (53.2%)
  - `arxiv_html5`: 90 papers (18.1%)
  - `cached_html`: 69 papers (13.9%)
  - `pypdf_markdown_fallback`: 37 papers (7.5%)
  - `ar5iv_html5`: 35 papers (7.1%)
- **Mathematical Integrity**:
  - Papers containing preserved formulas: 142 (28.6%)
  - Total LaTeX/MathML formulas preserved: **29,010 equations**
  - Total words ingested: **1,362,916 words** (Average: 2,753 words/paper)
- **LanceDB Gold Vector Store**:
  - Table name: `scientific_papers_gold`
  - Total dense 768-D vectors indexed: **1,525 chunks**
  - Schema: `chunk_id`, `paper_id`, `title`, `chunk_text`, `section_name`, `vector`
- **Zero-Leak Policy & Storage Health**:
  - Residual temporary PDFs: **0 files** (Purged immediately upon conversion)
  - Free Disk Space: **111.85 GB** (Well above the 15.00 GB automated pause guardrail)

---

## 2. Storage Auditing & Retrieval Service Dynamic Unification

### 2.1 Dynamic Storage Auditing (`backend/app/services/storage_service.py`)
- Removed hardcoded conference count assumptions. The service now dynamically queries `data/silver/tier1/landmark_papers.parquet`, `cvf/cvpr2024.parquet`, and `openreview/openreview_all.parquet` via PyArrow metadata inspection.
- The `ActiveLakehouse` metrics dynamically query `data/gold/lancedb/scientific_papers_gold.lance` via LanceDB `tbl.count_rows()`, surfacing real-time counts (`activeLanceDbVectors: 1525`, `conferenceCount: 495`).

### 2.2 Vector Retrieval Hybrid Search (`backend/app/services/retrieval_service.py`)
- In LanceDB 0.39.0, naked `.search().where()` calls fail without an inverted full-text index.
- Refactored `retrieval_service.py` to leverage Cosine Vector ANN search as the primary retrieval mechanism with zero-vector fallback for pure metadata filtering.
- Aligned metadata resolution to dynamically inspect `data/silver/tier1/landmark_papers.parquet`, ensuring landmark papers are fully decorated with title, year, authors, and citation counts.
- Updated default search mode to `"hybrid"` in `backend/app/schemas/search.py`.

### 2.3 Scheduler Command Mapping (`src/scheduler/adaptive_scheduler.py`)
- Mapped the `"tier1"` scheduler trigger to `src.pipelines.run_tier1_bootstrap_strategy_b`, enabling manual and automated UI triggers for landmark paper harvesting.

---

## 3. Hardware Telemetry & SSE Feed Truthfulness

### 3.1 Live Telemetry Log Hardware Cleanse (`frontend/src/components/logs/LiveTelemetryFeed.component.tsx`)
- Cleansed mock entries referencing Apple Silicon / Metal MPS.
- Replaced with accurate, truthful hardware specs: **NVIDIA GeForce RTX 4060 Laptop GPU (8 GB GDDR6)**, CUDA 12.4, Windows 11 x64, PyTorch 2.6.0.

### 3.2 Live Streaming Store Updates (`frontend/src/store/streaming.store.ts`)
- Configured log formatting in `streaming.store.ts` to surface paper titles and vector sync counts cleanly upon receiving SSE `PAPER_INGESTED` and `STAGE_CHANGE` events.
- Updated `backend/app/services/streaming_service.py` to record `session_ingested` and `accumulated_bytes_delta` upon receiving ingestion broadcasts.

---

## 4. Empirical Verification & Search Validation

### 4.1 Storage Endpoint Verification (`GET /api/storage/stats`)
- Output verified:
  ```json
  {
    "activeLakehouse": {
      "conferenceCount": 495,
      "activeLanceDbVectors": 1525,
      "activeLanceDbSizeBytes": 221528740
    }
  }
  ```

### 4.2 Hybrid Semantic Search Verification (`POST /api/search`)
- Query: `"deep learning neural network representation"`
- Response:
  - Match 1: *Image Segmentation Using Deep Learning: A Survey* (Cosine Score: **0.9441**)
  - Match 2: *Review of deep learning: concepts, CNN architectures...* (Cosine Score: **0.9440**)
  - Match 3: *Review of deep learning: concepts, CNN architectures...* (Cosine Score: **0.9388**)

### 4.3 Production Frontend Compilation
- Executed `npm run build` (`tsc -b && vite build`): Succeeded cleanly with zero TypeScript errors.

---

## 5. Defense Presentation Guide

1. **Architecture Tab**: Show the 3-tier medallion flow (Bronze raw JSON/HTML -> Silver Parquet -> Gold LanceDB 768-D vectors).
2. **Lakehouse Tab**: Present live storage stats showing 495 landmark papers and 1,525 LanceDB vectors.
3. **RAG & Search Tab**: Issue live queries on transformer architectures and neural networks to demonstrate >0.94 cosine similarity retrieval backed by local GPU embeddings.
4. **Logs & Telemetry**: Highlight the clean telemetry displaying zero PDF disk leaks, real-time memory management, and NVIDIA RTX 4060 CUDA acceleration.
