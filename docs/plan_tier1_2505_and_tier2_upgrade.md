# TIER1_2505_AND_TIER2_UPGRADE.md — Tier 1 2,505 Scaling & Tier 2 Pipeline Hardening Report

- **Motivation/Background**: Ingestion of the remaining 2,505 landmark milestone samples from Strategy B required resolving Marker PDF errors (Docker vLLM spawn failures and paywalled HTML-as-PDF format errors), while Tier 2 near-past trending required hardening before scaling to 10k papers.
- **Purpose**: Document the full decoupling of Docker from Marker 2.0 / Surya 2, strict binary PDF magic-byte validation, the upgrade and successful smoke-testing of Tier 2 near-past harvesting, and the execution of the 2,505 Tier 1 batch bootstrap.
- **Overview Pipeline**: Disabled Surya Docker autostart -> Added PDF header validation -> Upgraded Tier 2 with UnifiedContentResolver, zero-leak purging, and 23-column schema -> Verified Tier 2 via smoke test -> Scaled Tier 1 bootstrap across 100 batches on RTX 4060 GPU.
- **Detailed Plan**: §1 Marker PDF Engine Hardening & Docker Decoupling; §2 Tier 2 Near-Past Harvester Upgrade & Verification; §3 Tier 1 2,505 Milestone Bootstrap Execution; §4 Lakehouse Storage & LanceDB Synchronization.
- **References**: `agents/rules/COMMIT_CONVENTION.md`, `agents/rules/MD_CONVENTION.md`, `docs/plan_unify_data_collection_and_web_ui.md`.
- **Created**: 2026-10-11T21:49:00+07:00
- **Last Updated**: 2026-10-11T21:49:00+07:00

---

## 1. Marker PDF Engine Hardening & Docker Decoupling

### 1.1 Root Cause & Solution
- **Docker Error Resolution**: Marker 2.0's underlying engine (Surya 2) detected `docker.exe` on the Windows host and attempted to spawn a `vllm-openai` container for OCR on complex tables. We set `SURYA_INFERENCE_AUTOSTART=false` and configured `PdfConverter(config={"mode": "fast", "disable_ocr": True})`, restricting Marker to pure local PyTorch CUDA neural layout analysis and `pdftext` heuristics.
- **PDFium Data Format Error Resolution**: Publisher landing pages returning HTML responses (`<!DOCTYPE html>`) were previously saved as `.pdf`. We implemented a strict binary guard in `MarkerPdfExtractor`, `UnifiedContentResolver`, and `run_tier1_bootstrap_strategy_b.py`: validating that files start with `b"%PDF"` and do not contain `<!DOCTYPE` or `<html` before invoking PDFium.
- **VRAM Stability**: Configured `PYTORCH_CUDA_ALLOC_CONF="max_split_size_mb:128"` and explicit `torch.cuda.empty_cache()` between batches, holding VRAM usage at ~533 MB on the RTX 4060 GPU.

---

## 2. Tier 2 Near-Past Harvester Upgrade & Verification

### 2.1 Upgrades Implemented (`src/pipelines/run_tier2_near_past_harvest.py`)
- **HTML-First Waterfall**: Integrated `UnifiedContentResolver` prioritizing arXiv HTML5 and ar5iv HTML5 before falling back to PDF and abstract extraction.
- **Zero-Leak Guardrails**: Added immediate temporary PDF unlinking (`local_pdf.unlink()`) and batch cleanup (`purge_temp_pdfs()`), backed by a 15 GB disk space guardrail check per batch.
- **Standardized Lakehouse Schema**: Aligned outputs to the 23-column Silver schema (`data/silver/tier2/near_past_papers.parquet`), capturing `source`, `tier`, `content_origin`, `total_math_count`, and `clean_full_text`.
- **LanceDB Vector Accumulation**: Batch-upserted contextual chunks into `scientific_papers_gold` using 768-D dense Nomic embeddings.
- **Dynamic Serving Integration**: Added Tier 2 Silver path to `backend/app/services/storage_service.py` and `backend/app/services/retrieval_service.py`.

### 2.2 Smoke Test Results
- **Command**: `python -m src.pipelines.run_tier2_near_past_harvest --days 1 --per-day 5 --batch-size 5`
- **Ingested**: 4 trending papers in 18.42s
- **Residual PDFs**: 0 files (Zero-leak policy PASSED)
- **LanceDB Accumulation**: Verified increase to 1,537 chunks

---

## 3. Tier 1 2,505 Milestone Bootstrap Execution

### 3.1 Execution Parameters
- **Dataset**: `C:\Users\TDV\Downloads\Telegram Desktop\strategy_b\strategy_b\raw_metadata` (30 JSON files, 3,000 papers).
- **Deduplication**: 514 papers recognized as existing in the Lakehouse and skipped; 2,486 unique candidate landmark papers queued.
- **Batch Configuration**: 100 batches (25 papers/batch) with live CUDA acceleration.
- **Live Output**: Confirmed `marker-pdf-cuda` processing papers with zero Docker errors, indexing into LanceDB `scientific_papers_gold`, and streaming real-time telemetry to the React 19 UI.
