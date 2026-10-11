# Fix Marker Locking, LanceDB Merge Insert, and Tier 2 Scaling

- **Motivation/Background**: Scaling Tier 2 near-past trending collection and running concurrent batch pipelines exposed three critical failure points: LanceDB merge-insert collision due to cross-category duplicate chunks, Windows file access locking and contention on shared temporary PDF directories, and unbounded neural page conversion freezing on 300+ page dissertations.
- **Purpose**: Document the root causes and hardening fixes for LanceDB deduplication, isolated temporary buffer management, Windows file handle safety, and bounded Marker neural conversion.
- **Overview Pipeline**: Analyzed error stack traces from live execution, hardened `lancedb_manager.py`, `marker_extractor.py`, `unified_content_resolver.py`, and `run_tier2_near_past_harvest.py`, and verified end-to-end execution with 0 leaks.
- **Detailed Plan**: §1 Root Cause Analysis (LanceDB Ambiguous Merge, Windows File Locking, 331-Page Thesis Freeze); §2 LanceDB Merge Deduplication; §3 Windows File Handle & Temp Directory Isolation; §4 Bounded Marker Page-Range Optimization; §5 Verification & Telemetry Results.
- **References**: `agents/rules/COMMIT_CONVENTION.md`, `agents/rules/MD_CONVENTION.md`, `src/indexing/lancedb_manager.py`, `src/transformation/marker_extractor.py`, `src/transformation/unified_content_resolver.py`, `src/pipelines/run_tier2_near_past_harvest.py`.
- **Created**: 2026-10-11T22:30:00+07:00
- **Last Updated**: 2026-10-11T22:30:00+07:00

---

## Table of Contents

- [1. Root Cause Analysis](#1-root-cause-analysis)
- [2. LanceDB Merge Deduplication](#2-lancedb-merge-deduplication)
- [3. Windows File Handle & Temp Directory Isolation](#3-windows-file-handle--temp-directory-isolation)
- [4. Bounded Marker Page-Range Optimization](#4-bounded-marker-page-range-optimization)
- [5. Verification & Telemetry Results](#5-verification--telemetry-results)

---

## 1. Root Cause Analysis

During execution of `run_tier2_near_past_harvest --days 30 --per-day 50 --batch-size 25`:

1. **LanceDB Merge Collision (`ValueError: Invalid input, Ambiguous merge inserts are prohibited`)**:
   - In OpenAlex daily harvesting, cross-listed papers spanning multiple queried categories (`cs.AI`, `cs.CV`, `cs.LG`, `cs.CL`, `cs.RO`) returned identical works within the same harvesting day.
   - Because candidate lists did not deduplicate cross-category results in memory before batch chunking, multiple chunk records sharing the identical `chunk_id` (`{paper_id}_abs`) entered `table.merge_insert("chunk_id").execute(df)`. LanceDB strictly forbids multiple source rows mapping to the same target merge key.

2. **Windows File Locking & Temp Collision (`[WinError 32]`, `Permission denied: [Errno 13]`, `[Errno 2] No such file`)**:
   - Both Tier 1 and Tier 2 pipelines previously wrote temporary buffer PDFs to a single shared directory `data/raw/temp_pdfs/` with deterministic file paths `f"{safe_id}.pdf"`.
   - When batch purge operations executed in one thread or pipeline, global glob unlinking (`glob("*.pdf").unlink()`) attempted to delete files actively opened by other concurrent worker threads.
   - Furthermore, `pypdf.PdfReader(str(path))` held open unclosed file descriptors on Windows until garbage collection, causing file access denials.

3. **Marker Thesis/Dissertation Hanging (331 Pages)**:
   - Several OpenAlex records linked to full doctoral dissertations or monographs (e.g. `doi_10.82444_warw.33485413` containing 331 pages).
   - Marker's `PdfConverter` default converts all document pages when `page_range` is not configured. Neural layout analysis of 331 pages on GPU required hundreds of seconds, creating perceived process hangs.

---

## 2. LanceDB Merge Deduplication

1. **Manager Hardening (`src/indexing/lancedb_manager.py`)**:
   - Added in-batch deduplication before executing merge:
     ```python
     if "chunk_id" in df.columns:
         df = df.drop_duplicates(subset=["chunk_id"], keep="last")
         table.merge_insert("chunk_id").when_matched_update_all().when_not_matched_insert_all().execute(df)
     ```
2. **Chunk Deduplication (`build_chunks`)**:
   - Both `run_tier1_bootstrap_strategy_b.py` and `run_tier2_near_past_harvest.py` now track `seen_chunk_ids` to guarantee unique `chunk_id` outputs across abstract and section chunks.
3. **In-Memory Candidate Deduplication (`harvest_near_past_candidates`)**:
   - Maintained `seen_paper_ids` and `seen_hashes` sets during multi-category day loops to eliminate cross-category duplicates before batching.

---

## 3. Windows File Handle & Temp Directory Isolation

1. **Pipeline Directory Isolation**:
   - Tier 1 buffers to `data/raw/tier1/temp_pdfs/`.
   - Tier 2 buffers to `data/raw/tier2/temp_pdfs/`.
   - Pipelines never share temporary PDF directories.
2. **Globally Unique File Tokens**:
   - Temporary PDFs are generated with random UUID tokens: `f"{safe_id}_{uuid.uuid4().hex[:8]}.pdf"`.
3. **Guaranteed Try-Finally Cleanup**:
   - Wrapped Marker conversion in `try...finally` with safe unlinking (`path.unlink(missing_ok=True)`), suppressing transient Windows lock errors.
4. **Context Manager Handle Closure**:
   - In `MarkerPdfExtractor._fallback_extract_markdown`:
     ```python
     with open(pdf_path, "rb") as pf:
         reader = PdfReader(pf)
         ...
     ```

---

## 4. Bounded Marker Page-Range Optimization

1. **Pre-Flight Page Inspection**:
   - Inspected total page count using `PdfReader` before passing to neural converter.
2. **Dynamic `page_range` Bounding**:
   - If `doc_len > max_pages` (e.g. a 331-page dissertation), Marker's `converter.config["page_range"]` is dynamically set to `list(range(max_pages))` (pages 0–14).
   - If `doc_len <= max_pages` (standard 4–12 page conference papers), `page_range` is set to `None`, allowing Marker's provider to safely default to `range(len(doc))` without triggering assertion errors (`max(page_range) < len(doc)`).

---

## 5. Verification & Telemetry Results

1. **Tier 2 Test Harvest Run**:
   - Harvested and ingested papers across multiple days with 0 residual temporary PDFs.
   - LanceDB gold vector store successfully grew to **2,521 chunks** with 0 merge conflicts.
   - Parquet table `data/silver/tier2/near_past_papers.parquet` reached **78 papers** with 23 standard columns.
2. **Telemetry Status**:
   - Free disk space: **109.87 GB** (Threshold: > 15.00 GB).
   - Zero leak policy: **PASSED** across all tier directories.
