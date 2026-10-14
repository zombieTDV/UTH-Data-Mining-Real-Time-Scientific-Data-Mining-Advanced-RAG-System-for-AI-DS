# UTH Lakehouse & Mining — Bug Directory Index

This directory documents system bugs, race conditions, tokenizer crashes, and data/UI discrepancies encountered during development and scaling, formatted per [`agents/templates/BUG_TEMPLATE.md`](../../agents/templates/BUG_TEMPLATE.md).

| Bug ID | Title | Severity | Status | Affected Components | Date |
| :--- | :--- | :--- | :--- | :--- | :--- |
| [`BUG-01`](BUG_01_TOKENIZER_SURROGATE_CRASH.md) | HuggingFace Tokenizer PyO3 PanicException on Lone Surrogates | Critical | Resolved | `src/indexing/embedder.py`, `run_embed_all_existing_fulltext.py` | 2026-10-13 |
| [`BUG-02`](BUG_02_RAG_FALSE_METHODOLOGY_FALLBACK_AND_REFUSAL.md) | RAG False "Methodology" Section Fallback and Model Refusal | High | Resolved | `rag_service.py`, `GroundedRagChat.component.tsx` | 2026-10-13 |
| [`BUG-03`](BUG_03_UI_SOURCE_INGEST_DISCREPANCY.md) | Source Ingestion UI Discrepancy (Raw Works vs Verified Full-Text) | Medium | In Progress | `App.tsx`, `InteractiveWorkflowCanvas.component.tsx`, `storage_service.py` | 2026-10-13 |
