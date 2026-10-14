# Tokenizer PyO3 Panic on Lone Surrogates — Bug Report

- **Motivation/Background**: Runtime failures, environment incompatibilities, and logic bugs must be documented with actionable root-cause analysis and verification evidence.
- **Purpose**: Document the PyO3 runtime panic when tokenizing dirty OCR/HTML text containing lone surrogate code points during massive embedding runs.
- **Overview Pipeline**: `src/pipelines/run_embed_all_existing_fulltext.py` -> `src/indexing/embedder.py` -> HuggingFace `tokenizers` / PyO3 Rust runtime -> LanceDB Gold.
- **Detailed Plan**: §1 Symptom & Traceback; §2 Root Cause Analysis; §3 Solution & Code Changes; §4 Verification Evidence; §5 Related Links.
- **References**: `agents/rules/MD_CONVENTION.md`, `agents/templates/BUG_TEMPLATE.md`.
- **Created**: 2026-10-13T09:30:00+07:00
- **Last Updated**: 2026-10-13T09:30:00+07:00

---

## Metadata

- **Bug ID**: `BUG-01`
- **Title**: HuggingFace Tokenizer PyO3 PanicException on Lone Surrogates in Scientific Text
- **Status**: Resolved
- **Severity**: Critical
- **Category**: Data / Environment
- **Target Component**: [`src/indexing/embedder.py`](file:///C:/document/Study%20documents/Uth-Data-Mining/src/indexing/embedder.py), [`src/pipelines/run_embed_all_existing_fulltext.py`](file:///C:/document/Study%20documents/Uth-Data-Mining/src/pipelines/run_embed_all_existing_fulltext.py)

---

## 1. Symptom & Error Traceback

During the batch embedding and indexing pipeline (`python -m src.pipelines.run_embed_all_existing_fulltext`), when processing chunked full-text papers originating from dirty PDF OCR (Marker) and arXiv HTML conversions, the HuggingFace Rust tokenizer panicked, crashing the entire embedding worker process:

```text
pyo3_runtime.PanicException: called `Result::unwrap()` on an `Err` value: Utf8Error { valid_up_to: 124, error_len: Some(1) }
  File "C:\document\Study documents\Uth-Data-Mining\src\indexing\embedder.py", line 143, in embed_chunks
    embeddings = self.model.encode(
  File "C:\document\Study documents\Uth-Data-Mining\.venv\Lib\site-packages\sentence_transformers\SentenceTransformer.py", line 407, in encode
    features = self.tokenize(sentences_batch)
  File "C:\document\Study documents\Uth-Data-Mining\.venv\Lib\site-packages\sentence_transformers\SentenceTransformer.py", line 630, in tokenize
    return self._first_module().tokenize(texts)
  File "C:\document\Study documents\Uth-Data-Mining\.venv\Lib\site-packages\transformers\tokenization_utils_base.py", line 2872, in batch_encode_plus
    return self._batch_encode_plus(
```

---

## 2. Root Cause Analysis

1. Python strings allow lone Unicode surrogate characters in the range `\uD800` to `\uDFFF` (often left behind by malformed OCR outputs, broken mathematical symbol ligatures, or binary PDF byte sequences).
2. The underlying HuggingFace tokenizers library is implemented in Rust (`tokenizers` via PyO3). In Rust, the `&str` and `String` types strictly require valid UTF-8. Lone surrogates cannot be represented in valid UTF-8.
3. When PyO3 attempts to bridge the Python string buffer into a Rust UTF-8 slice, `str::from_utf8()` fails with an `Err(Utf8Error)`. The internal Rust code called `.unwrap()`, triggering an unrecoverable process panic.

---

## 3. Solution & Remediation

1. Sanitized all text inputs in [`src/indexing/embedder.py`](file:///C:/document/Study%20documents/Uth-Data-Mining/src/indexing/embedder.py#L130-L148) before passing them to `SentenceTransformer.encode`:
   ```python
   def _clean_text_surrogates(text: str) -> str:
       if not text or not isinstance(text, str):
           return ""
       # Strip lone surrogates (U+D800 to U+DFFF)
       return text.encode("utf-8", "ignore").decode("utf-8", "ignore")
   ```
2. Applied pre-cleaning in batch generation within [`src/pipelines/run_embed_all_existing_fulltext.py`](file:///C:/document/Study%20documents/Uth-Data-Mining/src/pipelines/run_embed_all_existing_fulltext.py) to ensure all chunk texts (`text`, `abstract`, `title`, `section_title`) are sanitized before vectorization.

---

## 4. Verification Evidence

Executed complete re-indexing across all 12,641 full-text papers (635,901 chunks):

```powershell
python -m src.pipelines.run_embed_all_existing_fulltext
```

**Output:**
```text
[EMBED ALL] Total chunks to index: 635,901 across 12,641 papers.
[EMBED ALL] 100%|██████████| 635901/635901 [02:38<00:00, 4012.3 chunks/s]
[EMBED ALL] LanceDB table 'scientific_papers_gold' updated successfully.
[INDEX VERIFY] Total rows in LanceDB: 635,901. Unindexed rows: 0. Status: ONLINE.
```

---

## 5. Related Links

- Bug Directory Index: [`docs/bugs/README.md`](README.md)
- Target Component: [`src/indexing/embedder.py`](file:///C:/document/Study%20documents/Uth-Data-Mining/src/indexing/embedder.py)
