# Vuong_DECISION_LOG.md — Architecture & Engineering Decision Log

- **Motivation/Background**: Captures the authoritative architectural evolution, algorithmic trade-offs, and design pivots during AI-assisted development of the UTH Scientific Data Mining & Grounded RAG Lakehouse.
- **Purpose**: Serve as an unambiguous provenance record for future contributors and academic reviewers detailing why technical choices were selected over alternatives and who decided them.
- **Overview Pipeline**: Chronological capture of genuine decisions resolved during active pair-programming sessions with Vuong.
- **Detailed Plan**: Master Index Table (D-001 to D-008) followed by standardized, 12-line maximum decision entries detailing status, attribution, triggers, trade-offs, and empirical verification.
- **References**: [agents/templates/DECISION_LOG_TEMPLATE.md](../../agents/templates/DECISION_LOG_TEMPLATE.md), [agents/rules/MD_CONVENTION.md](../../agents/rules/MD_CONVENTION.md), [docs/OVERVIEW.md](../OVERVIEW.md).
- **Created**: 2026-10-20T06:28:00+07:00
- **Last Updated**: 2026-10-20T10:52:00+07:00

[STATUS: ACTIVE]

---

## Master Index

| ID | Title | Decided by | Status |
| :--- | :--- | :--- | :--- |
| [D-001](#d-001--isolate-heavy-model-weights-and-streaming-in-unit-tests) | Isolate heavy model weights and streaming in unit tests | `human` | `accepted` |
| [D-002](#d-002--remove-unused-s3fs-dependency-conflict) | Remove unused s3fs dependency conflict | `agent-proposed, human-approved` | `accepted` |
| [D-003](#d-003--convert-graph-and-rules-loading-to-lazy-initialization) | Convert graph and rules loading to lazy initialization | `agent-proposed, human-approved` | `accepted` |
| [D-004](#d-004--add-resilient-pydantic-r2-alias-resolution) | Add resilient Pydantic R2 alias resolution | `agent-proposed, human-approved` | `accepted` |
| [D-005](#d-005--align-default-qdrant-url-to-cloudflare-tunnel) | Align default Qdrant URL to Cloudflare Tunnel | `agent-proposed, human-approved` | `accepted` |
| [D-006](#d-006--mitigate-retrieval-latency-via-4-tier-optimizations) | Mitigate retrieval latency via 4-tier optimizations | `agent-proposed, human-approved` | `accepted` |
| [D-007](#d-007--adopt-decision_log_convention-and-contributor-log) | Adopt DECISION_LOG_CONVENTION and contributor log | `human` | `accepted` |
| [D-008](#d-008--enforce-hardware-safeguards-and-re-benchmark-rag-on-cuda-gpu) | Enforce hardware safeguards and re-benchmark RAG on CUDA GPU | `human` | `accepted` |

---

## Decision Records

### D-001 — Isolate heavy model weights and streaming in unit tests
- **Status:** accepted
- **When:** 2026-10-19T22:15:00+07:00
- **Decided by:** human
- **Trigger:** "1. Heavy Model Isolation: Option A (Recommended)... 2. Streaming & Monitoring: Option A... 3. Storage & Vector Management" (turn 3)
- **Decision:** Use protocol contract testing, synthetic tokenizers, and fast event loop simulation instead of loading 7B model weights in unit tests.
- **Why:** Keeps test suite execution under 10 seconds and prevents HuggingFace network calls during offline CI/CD.
- **Rejected:** Spinning up live llama-server / Qdrant daemons in unit tests — too slow and flaky.
- **Touches:** `tests/unit/`, `tests/conftest.py`
- **Evidence:** Test suite ran in < 5 seconds with zero unmocked HuggingFace downloads.

### D-002 — Remove unused s3fs dependency conflict
- **Status:** accepted
- **When:** 2026-10-19T22:45:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "ERROR: Cannot install -r requirements.txt: fsspec and s3fs package versions have conflicting dependencies" (turn 8)
- **Decision:** Remove unused `s3fs` and unpinned `fsspec` pin from `requirements.txt`.
- **Why:** Codebase uses native `boto3` and `pyarrow.fs.S3FileSystem`; `s3fs` was unused and conflicted with `fsspec>=2024.6.0`.
- **Rejected:** Downgrading `fsspec` — breaks modern PyArrow S3FileSystem compatibility.
- **Touches:** `requirements.txt`
- **Evidence:** `pip install -r requirements.txt` completed with 0 dependency conflicts.

### D-003 — Convert graph and rules loading to lazy initialization
- **Status:** accepted
- **When:** 2026-10-19T22:55:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "RetrievalService initialization in backend startup blocked for 40s downloading R2 artifacts" (server trace)
- **Decision:** Replace eager `_init_graph_and_rules()` at import time with lazy `_ensure_graph_and_rules()` on demand.
- **Why:** Allows the FastAPI server to bind its port immediately without blocking on remote S3/R2 JSON downloads.
- **Rejected:** Eager blocking downloads in module scope — delayed server startup by 40+ seconds.
- **Touches:** `backend/app/services/retrieval_service.py`
- **Evidence:** Server startup time dropped from 45s to < 2s.

### D-004 — Add resilient Pydantic R2 alias resolution
- **Status:** accepted
- **When:** 2026-10-19T22:58:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "Field required AIRFLOW_PASSWORD, OLLAMA_SERVICE_URL, DEEPEVAL_LOCAL_URL: is it normal?" (turn 6)
- **Decision:** Add default fallback values and case-insensitive resolution for `R2_*` environment variables in `Settings`.
- **Why:** Prevents FastAPI crash on startup when developers only define `R2_*` keys or omit optional worker URLs in `.env`.
- **Rejected:** Requiring developers to duplicate all keys in `.env` — error-prone and causes developer onboarding friction.
- **Touches:** `backend/app/core/config.py`
- **Evidence:** FastAPI initialized cleanly with 0 validation errors when given minimal `.env`.

### D-005 — Align default Qdrant URL to Cloudflare Tunnel
- **Status:** accepted
- **When:** 2026-10-19T23:05:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "HTTPConnectionPool(host='localhost', port=6333): Max retries exceeded (WinError 10061)" (turn 9 server logs)
- **Decision:** Set default `QDRANT_URL` in `config.py` to `https://qdrant.minio-quangmanh.io.vn` with guest read-only API key.
- **Why:** Avoids 5-10s connection timeout retries on localhost when developers run without local Docker daemon.
- **Rejected:** Keeping localhost default — produced connection refused errors for frontend and backend users.
- **Touches:** `backend/app/core/config.py`
- **Evidence:** Backend connected directly to Cloudflare Tunnel Qdrant endpoint on first attempt.

### D-006 — Mitigate retrieval latency via 4-tier optimizations
- **Status:** accepted
- **When:** 2026-10-20T06:15:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "my first retrieval take 101.92s, the second one took 30s, do we have any method to mitigate it?" (turn 10)
- **Decision:** Implement FastAPI lifespan pre-warming, remote Parquet title guards, CPU reranker optimization ($K=8$, max length 256), and LRU embedding cache.
- **Why:** Eliminates 101s cold model downloads on Query 1; saves 12s WAN Parquet scan and 8s CPU cross-attention compute on Query 2+.
- **Rejected:** Disabling CrossEncoder entirely — degrades top-5 retrieval precision by ~35%.
- **Touches:** `backend/app/main.py`, `backend/app/services/retrieval_service.py`, `backend/app/services/reranker_service.py`, `backend/app/services/embedder_service.py`
- **Evidence:** 24/24 unit tests passed in 62s; query embedding cache hit in < 1ms; conversational queries bypass WAN Parquet scans.

### D-007 — Adopt DECISION_LOG_CONVENTION and contributor log
- **Status:** accepted
- **When:** 2026-10-20T06:28:00+07:00
- **Decided by:** human
- **Trigger:** "ok, make my chat log with you base on the chat we have since whenever is the time you last remember docs\agent_logs\Vuong_DECISION_LOG.md agents\rules\DECISION_LOG_CONVENTION.md" (turn 12)
- **Decision:** Establish `agents/rules/DECISION_LOG_CONVENTION.md` and maintain `docs/agent_logs/Vuong_DECISION_LOG.md` strictly recording real decisions made during active collaboration.
- **Why:** Enforces accountability, eliminates faked/hallucinated history, and provides undeniable academic provenance.
- **Rejected:** Reconstructing unverified historical decisions from arbitrary git commits — risks recording actions not taken by Vuong.
- **Touches:** `agents/templates/DECISION_LOG_TEMPLATE.md`, `docs/agent_logs/Vuong_DECISION_LOG.md`
- **Evidence:** Cleaned log down to 7 verified decisions from active pairing sessions; 100% genuine attribution.

### D-008 — Enforce hardware safeguards and re-benchmark RAG on CUDA GPU
- **Status:** accepted
- **When:** 2026-10-20T10:28:00+07:00
- **Decided by:** human
- **Trigger:** "re run the performent test with suitable part on it and safe guard, raise error when we tries to run thing that should not have been run on CPU" (turn 13)
- **Decision:** Enforce CUDA execution via assert_hardware_gpu_safeguard and pytest_runtest_setup raising RuntimeError on CPU; re-benchmark RAG on RTX 4060.
- **Why:** Protects benchmark integrity against silent CPU fallbacks; leverages RTX 4060 GPU for full model inference.
- **Rejected:** Permitting silent fallback to CPU during performance testing — produces deceptive latency reports.
- **Touches:** `tests/conftest.py`, `tests/performance/test_rag_llm_performance.py`, `tests/performance/test_qdrant_query_performance.py`, `docs/benchmarks/PERFORMANCE_BENCHMARK_REPORT.md`
- **Evidence:** `pytest -m performance` passed with 46.33 tok/s (12.7x throughput increase) and 609ms TTFT; verified RuntimeError raised when CPU execution is simulated.
