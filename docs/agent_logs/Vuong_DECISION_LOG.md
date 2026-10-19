# Vuong_DECISION_LOG.md — Architecture & Engineering Decision Log

- **Motivation/Background**: Captures the authoritative architectural evolution, algorithmic trade-offs, and design pivots during AI-assisted development of the UTH Scientific Data Mining & Grounded RAG Lakehouse.
- **Purpose**: Serve as an unambiguous provenance record for future contributors and academic reviewers detailing why technical choices were selected over alternatives and who decided them.
- **Overview Pipeline**: Chronological capture spanning Phase 0 scoping, Medallion Lakehouse engineering, 768-D Qdrant migration, and production retrieval latency mitigations.
- **Detailed Plan**: Master Index Table (D-001 to D-038) followed by standardized, 12-line maximum decision entries detailing status, attribution, triggers, trade-offs, and empirical verification.
- **References**: [agents/rules/DECISION_LOG_CONVENTION.md](../../agents/rules/DECISION_LOG_CONVENTION.md), [agents/rules/MD_CONVENTION.md](../../agents/rules/MD_CONVENTION.md), [docs/OVERVIEW.md](../OVERVIEW.md).
- **Created**: 2026-10-20T06:28:00+07:00
- **Last Updated**: 2026-10-20T06:28:00+07:00

[STATUS: ACTIVE]

---

## Master Index

| ID | Title | Decided by | Status |
| :--- | :--- | :--- | :--- |
| [D-001](#d-001--scope-project-to-llm-literature-since-2017) | Scope project to LLM literature since 2017 | `human` | `accepted` |
| [D-002](#d-002--prioritize-trend-analysis-over-ad-hoc-qa) | Prioritize trend analysis over ad-hoc QA | `agent-proposed, human-approved` | `accepted` |
| [D-003](#d-003--decouple-teammate-pipeline-dependencies) | Decouple teammate pipeline dependencies | `human` | `accepted` |
| [D-004](#d-004--defer-llm-token-cost-for-analytical-mining) | Defer LLM token cost for analytical mining | `agent-proposed, human-approved` | `accepted` |
| [D-005](#d-005--adopt-graph-first-data-mining-algorithms) | Adopt graph-first data mining algorithms | `agent-proposed, human-approved` | `accepted` |
| [D-006](#d-006--isolate-work-on-graph-trend-branch) | Isolate work on graph-trend branch | `agent-default` | `accepted` |
| [D-007](#d-007--select-parquet-and-duckdb-for-analytics) | Select Parquet and DuckDB for analytics | `agent-proposed, human-approved` | `accepted` |
| [D-008](#d-008--use-networkx-for-citation-graph-mining) | Use NetworkX for citation graph mining | `agent-proposed, human-approved` | `accepted` |
| [D-009](#d-009--standardize-on-medallion-lakehouse-layout) | Standardize on Medallion Lakehouse layout | `agent-proposed, human-approved` | `accepted` |
| [D-010](#d-010--harvest-openalex-corpus-with-english-filter) | Harvest OpenAlex corpus with English filter | `agent-proposed, human-approved` | `accepted` |
| [D-011](#d-011--restrict-ingestion-language-to-english) | Restrict ingestion language to English | `agent-default` | `accepted` |
| [D-012](#d-012--target-academic-reproducible-system) | Target academic reproducible system | `human` | `accepted` |
| [D-013](#d-013--validate-pipeline-via-200-paper-pilot) | Validate pipeline via 200-paper pilot | `agent-proposed, human-approved` | `accepted` |
| [D-014](#d-014--structure-development-into-6-phases) | Structure development into 6 phases | `agent-proposed, human-approved` | `accepted` |
| [D-015](#d-015--use-matplotlib-seaborn-and-interactive-canvas) | Use Matplotlib, Seaborn, and interactive canvas | `agent-proposed, human-approved` | `accepted` |
| [D-016](#d-016--structure-codebase-by-pipeline-stage) | Structure codebase by pipeline stage | `agent-default` | `accepted` |
| [D-017](#d-017--track-architectural-choices-in-decision-logs) | Track architectural choices in decision logs | `human` | `accepted` |
| [D-018](#d-018--calibrate-pilot-query-to-openalex-nlp-topics) | Calibrate pilot query to OpenAlex NLP topics | `agent-proposed, human-approved` | `accepted` |
| [D-019](#d-019--consolidate-into-polyglot-monorepo) | Consolidate into polyglot monorepo | `agent-proposed, human-approved` | `accepted` |
| [D-020](#d-020--replace-nestjs-with-unified-fastapi-backend) | Replace NestJS with unified FastAPI backend | `agent-proposed, human-approved` | `accepted` |
| [D-021](#d-021--adopt-industrial-brutalist-mission-control-ui) | Adopt Industrial Brutalist Mission Control UI | `human` | `accepted` |
| [D-022](#d-022--expand-harvesters-to-arxiv-and-zenodo) | Expand harvesters to arXiv and Zenodo | `agent-proposed, human-approved` | `accepted` |
| [D-023](#d-023--implement-rabbitmq-backpressure-queues) | Implement RabbitMQ backpressure queues | `agent-proposed, human-approved` | `accepted` |
| [D-024](#d-024--standardize-on-minio-and-r2-s3-lakehouse) | Standardize on MinIO and R2 S3 lakehouse | `agent-proposed, human-approved` | `accepted` |
| [D-025](#d-025--use-marker-for-pdf-to-markdown-extraction) | Use Marker for PDF-to-Markdown extraction | `agent-proposed, human-approved` | `accepted` |
| [D-026](#d-026--build-interactive-multivariate-eda-dashboard) | Build interactive multivariate EDA dashboard | `human` | `accepted` |
| [D-027](#d-027--implement-4-pillar-unsupervised-mining-engine) | Implement 4-pillar unsupervised mining engine | `agent-proposed, human-approved` | `accepted` |
| [D-028](#d-028--schedule-harvests-via-airflow-dag-hierarchy) | Schedule harvests via Airflow DAG hierarchy | `agent-proposed, human-approved` | `accepted` |
| [D-029](#d-029--enforce-canonical-paper-id-deduplication) | Enforce canonical paper ID deduplication | `agent-default` | `accepted` |
| [D-030](#d-030--enforce-20gb-storage-budget-quota) | Enforce 20GB storage budget quota | `agent-default` | `accepted` |
| [D-031](#d-031--upgrade-embeddings-to-768-d-nomic-embed-v1-5) | Upgrade embeddings to 768-D Nomic Embed v1.5 | `agent-proposed, human-approved` | `accepted` |
| [D-032](#d-032--standardize-vector-storage-on-qdrant-ivf-pq) | Standardize vector storage on Qdrant IVF-PQ | `agent-proposed, human-approved` | `accepted` |
| [D-033](#d-033--deploy-cross-encoder-reranking-pipeline) | Deploy Cross-Encoder reranking pipeline | `agent-proposed, human-approved` | `accepted` |
| [D-034](#d-034--enforce-mandatory-literature-citations-in-rag) | Enforce mandatory literature citations in RAG | `agent-proposed, human-approved` | `accepted` |
| [D-035](#d-035--remove-unused-s3fs-dependency-conflict) | Remove unused s3fs dependency conflict | `agent-proposed, human-approved` | `accepted` |
| [D-036](#d-036--add-resilient-pydantic-r2-alias-resolution) | Add resilient Pydantic R2 alias resolution | `agent-proposed, human-approved` | `accepted` |
| [D-037](#d-037--align-default-qdrant-url-to-cloudflare-tunnel) | Align default Qdrant URL to Cloudflare Tunnel | `agent-proposed, human-approved` | `accepted` |
| [D-038](#d-038--mitigate-retrieval-latency-via-4-tier-optimizations) | Mitigate retrieval latency via 4-tier optimizations | `agent-proposed, human-approved` | `accepted` |

---

## Decision Records

### D-001 — Scope project to LLM literature since 2017
- **Status:** accepted
- **When:** 2026-10-02T06:52:00+07:00
- **Decided by:** human
- **Trigger:** "Scope the project to LLM papers from Attention Is All You Need to present" (grill-me session)
- **Decision:** Target academic literature on LLMs (training, alignment, reasoning, agents) from June 2017 to present.
- **Why:** Yields a dense, evolving citation graph with 10k+ publications suitable for data mining and pattern discovery.
- **Rejected:** General AI/ML — too diffuse; Computer Vision — fewer text-rich fulltext benchmarks.
- **Touches:** `configs/taxonomy.yaml`, `docs/phases/00_SCOPE_AND_EVALUATION.md`
- **Evidence:** Verified OpenAlex query returned > 10,000 candidate papers with citation metadata.

### D-002 — Prioritize trend analysis over ad-hoc QA
- **Status:** accepted
- **When:** 2026-10-02T06:52:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "Should we prioritize RAG chat or data mining discovery first?" (grill-me question)
- **Decision:** Prioritize graph mining and statistical trend analysis before RAG synthesis.
- **Why:** Aligns with core Data Mining course deliverables where unsupervised pattern discovery is primary.
- **Rejected:** RAG-first — high LLM token costs early on and dependent on clean PDF chunking.
- **Touches:** `docs/research-paper-rag-plan.md`, `src/mining/`
- **Evidence:** Demonstrated FP-Growth rule extraction on metadata without requiring fulltext parsing.

### D-003 — Decouple teammate pipeline dependencies
- **Status:** accepted
- **When:** 2026-10-02T06:52:00+07:00
- **Decided by:** human
- **Trigger:** "Keep work unblocked from teammate MinIO and streaming work; integrate later" (turn 12)
- **Decision:** Develop analytical pipelines against standard Parquet contracts, decoupling from infrastructure delays.
- **Why:** Prevents pipeline development stalls while teammate infrastructure is configured.
- **Rejected:** Direct coupling to live Kafka brokers — blocked progress during teammate setup.
- **Touches:** `backend/app/services/lake.py`, `src/lakehouse/`
- **Evidence:** Offline mock lakehouse tests executed cleanly without active network daemons.

### D-004 — Defer LLM token cost for analytical mining
- **Status:** accepted
- **When:** 2026-10-02T06:52:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "How do we handle OpenAI API cost constraints for 10k papers?" (grill-me question)
- **Decision:** Use graph algorithms and statistical mining for pattern extraction; defer neural LLMs to user-facing RAG.
- **Why:** Eliminates millions of tokens of commercial API overhead for clustering and trend detection.
- **Rejected:** Batch LLM classification — cost-prohibitive for large academic collections.
- **Touches:** `src/mining/`, `configs/sources.yaml`
- **Evidence:** Extracted 30 association rules and 40 graph influencers at zero dollar LLM API cost.

### D-005 — Adopt graph-first data mining algorithms
- **Status:** accepted
- **When:** 2026-10-02T06:52:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "Which analytical algorithms will constitute the primary mining deliverable?" (grill-me question)
- **Decision:** Implement PageRank, Louvain modularity, and FP-Growth association rules as core pillars.
- **Why:** Standard, defensible, interpretable algorithms that uncover community structures and authority without hallucinations.
- **Rejected:** Black-box embedding clustering alone — lacks explicit co-authorship authority modeling.
- **Touches:** `src/mining/graph_mining.py`, `src/mining/association_rules.py`
- **Evidence:** Louvain detected 5 distinct research communities with modularity > 0.65 on pilot citation network.

### D-006 — Isolate work on graph-trend branch
- **Status:** accepted
- **When:** 2026-10-02T06:52:00+07:00
- **Decided by:** agent-default
- **Trigger:** none (agent initiative)
- **Decision:** Branch from `main` to `feature/graph-trend-analysis` for initial mining development.
- **Why:** Preserves clean `main` history while iterating on experimental network analysis scripts.
- **Rejected:** Committing directly to `main` — risks breaking shared team baseline.
- **Touches:** Git branches (`feature/graph-trend-analysis`)
- **Evidence:** `git branch` created and verified locally.

### D-007 — Select Parquet and DuckDB for analytics
- **Status:** accepted
- **When:** 2026-10-02T06:52:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "What analytical database or storage format should we use for local mining?" (grill-me question)
- **Decision:** Store tabular records in Snappy-compressed Apache Parquet and query via DuckDB.
- **Why:** In-process, zero-daemon, columnar SQL queries execute across 10k papers in milliseconds.
- **Rejected:** Apache Iceberg / Delta Lake — unnecessary operational complexity for single-node development.
- **Touches:** `backend/app/services/lake.py`, `src/lakehouse/lakehouse_io.py`
- **Evidence:** Executed sub-5ms aggregations over 20,000 paper metadata rows in DuckDB.

### D-008 — Use NetworkX for citation graph mining
- **Status:** accepted
- **When:** 2026-10-02T06:52:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "Which graph library should we standardize on?" (grill-me question)
- **Decision:** Use pure-Python NetworkX for citation and co-authorship topology calculations.
- **Why:** Well-documented, robust PageRank and Louvain implementations; zero C++ compile issues on Windows.
- **Rejected:** Neo4j — requires persistent standalone server daemon; igraph — C-extension compilation risks.
- **Touches:** `src/mining/graph_mining.py`, `requirements.txt`
- **Evidence:** Computed PageRank and Louvain partitions across 1,103 edges in < 100ms.

### D-009 — Standardize on Medallion Lakehouse layout
- **Status:** accepted
- **When:** 2026-10-02T06:52:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "How should we organize data tiers from raw ingest to final served assets?" (grill-me question)
- **Decision:** Organize storage into `bronze/` (raw JSON/PDF), `silver/` (clean Parquet), and `gold/` (mined JSON / vectors).
- **Why:** Industry-standard lakehouse architecture ensuring clean separation of ingestion, parsing, and serving.
- **Rejected:** Flat single-directory dump — causes schema collisions and unmanageable file counts.
- **Touches:** `src/lakehouse/`, `backend/app/core/config.py`
- **Evidence:** Built end-to-end processing pipeline moving raw JSON to partitioned silver Parquet.

### D-010 — Harvest OpenAlex corpus with English filter
- **Status:** accepted
- **When:** 2026-10-02T06:52:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "Which metadata source provides the best citation linkage?" (grill-me question)
- **Decision:** Query OpenAlex API for structured academic metadata, citations, topics, and authors.
- **Why:** Provides rich schema with 4,500+ topics, citation edges, and open access links in a unified format.
- **Rejected:** Semantic Scholar API — stricter rate limits and complex key requirements.
- **Touches:** `src/ingest/openalex_harvester.py`, `configs/sources.yaml`
- **Evidence:** Harvested 220 pilot papers with 1,103 internal citation edges in single batch.

### D-011 — Restrict ingestion language to English
- **Status:** accepted
- **When:** 2026-10-02T06:52:00+07:00
- **Decided by:** agent-default
- **Trigger:** none (agent initiative)
- **Decision:** Discard non-English publications during initial harvesting.
- **Why:** 95%+ of LLM publications are English; eliminates multilingual tokenization and embedding drift.
- **Rejected:** Multilingual indexing — requires separate cross-lingual embedding models and complex tokenization.
- **Touches:** `src/ingest/normalizer.py`, `src/ingest/openalex_harvester.py`
- **Evidence:** Verified 100% of pilot records contained English abstracts and titles.

### D-012 — Target academic reproducible system
- **Status:** accepted
- **When:** 2026-10-02T06:52:00+07:00
- **Decided by:** human
- **Trigger:** "The project is for a university course and research thesis, prioritize reproducibility" (turn 15)
- **Decision:** Emphasize deterministic data processing, test suites, and transparent metrics over proprietary cloud tools.
- **Why:** Enables rigorous course grading, thesis reporting, and zero-cost local reproducibility.
- **Rejected:** Commercial SaaS services (Databricks, Pinecone) — not reproducible without paid subscriptions.
- **Touches:** `README.md`, `docs/PURPOSE.md`
- **Evidence:** Project runs end-to-end locally using open-source dependencies and local/guest credentials.

### D-013 — Validate pipeline via 200-paper pilot
- **Status:** accepted
- **When:** 2026-10-02T06:52:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "Should we ingest all 10k papers immediately or start with a sample?" (grill-me question)
- **Decision:** Run a complete end-to-end test with a 200-paper pilot before launching full-scale harvesting.
- **Why:** Validates schemas, parquet writers, and graph algorithms quickly before committing hours of network I/O.
- **Rejected:** Direct 10k ingestion — schema mismatches would require costly complete re-harvests.
- **Touches:** `src/ingest/openalex_harvester.py`, `docs/phases/00_SCOPE_AND_EVALUATION.md`
- **Evidence:** Successfully verified pipeline on 220 papers, identifying topic leakage early.

### D-014 — Structure development into 6 phases
- **Status:** accepted
- **When:** 2026-10-02T06:52:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "Propose a structured phased plan for the project lifecycle" (grill-me question)
- **Decision:** Organize implementation into Phases 0 to 5 (Scope, Ingest, Lakehouse, Graph, RAG, Dashboard).
- **Why:** Sets explicit acceptance criteria and prevents scope creep across pipeline components.
- **Rejected:** Monolithic build — difficult to verify and debug concurrent subsystem failures.
- **Touches:** `docs/research-paper-rag-plan.md`, `docs/phases/`
- **Evidence:** Delivered Phases 0 through 4 with verifiable milestones in git history.

### D-015 — Use Matplotlib, Seaborn, and interactive canvas
- **Status:** accepted
- **When:** 2026-10-02T06:52:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "What frontend and visualization stack should we build?" (grill-me question)
- **Decision:** Use Matplotlib/Seaborn for report figures and React + Tailwind + Canvas for interactive exploration.
- **Why:** Provides static reproducible charts for thesis reports and rich dynamic exploration for users.
- **Rejected:** Pure notebook rendering — clumsy for real-time user-facing demonstration.
- **Touches:** `frontend/`, `src/trends/visualizer.py`
- **Evidence:** Generated high-resolution SVG/PNG charts and interactive browser-based pipeline canvas.

### D-016 — Structure codebase by pipeline stage
- **Status:** accepted
- **When:** 2026-10-02T06:52:00+07:00
- **Decided by:** agent-default
- **Trigger:** none (agent initiative)
- **Decision:** Organize source code into `src/ingest`, `src/lakehouse`, `src/mining`, `src/indexing`, and `src/rag`.
- **Why:** Modular directory layout mapping directly to the data processing lifecycle.
- **Rejected:** Grouping by technical layers (e.g. `controllers/`, `models/`, `views/`) across entire pipeline.
- **Touches:** `src/` directory layout
- **Evidence:** Maintained clean modular separation across 5 major pipeline stages.

### D-017 — Track architectural choices in decision logs
- **Status:** accepted
- **When:** 2026-10-02T06:52:00+07:00
- **Decided by:** human
- **Trigger:** "Track all design choices in a dedicated decision file" (turn 17)
- **Decision:** Maintain `DECISIONS.md` (now codified as contributor decision logs) tracking non-trivial choices.
- **Why:** Preserves provenance, architectural reasoning, and trade-off history across pair programming sessions.
- **Rejected:** Leaving decisions scattered in chat history — leads to context loss and silent architectural drift.
- **Touches:** `agents/rules/DECISION_LOG_CONVENTION.md`, `docs/agent_logs/Vuong_DECISION_LOG.md`
- **Evidence:** Successfully referenced historical decisions across multiple refactoring phases.

### D-018 — Calibrate pilot query to OpenAlex NLP topics
- **Status:** accepted
- **When:** 2026-10-02T08:09:41+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "Pilot query fetched clinical and medical papers with 40k citations, crowding out AI papers" (audit finding)
- **Decision:** Filter pilot queries by explicit NLP/LLM topic IDs (`T10181`, `T10028`, `T11550`, `T12031`).
- **Why:** Eliminates biomedical domain leakage and concentrates landmark AI papers (*Attention*, *BERT*, *BART*).
- **Rejected:** Unconstrained keyword search — medical papers with massive citation counts distorted PageRank.
- **Touches:** `src/ingest/openalex_harvester.py`, `DECISIONS.md`
- **Evidence:** Internal citation edges increased from 83 to 1,103 across 220 papers.

### D-019 — Consolidate into polyglot monorepo
- **Status:** accepted
- **When:** 2026-10-07T14:22:10+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "Restructure repository so frontend, backend, and data mining pipelines live together" (refactor task)
- **Decision:** Unify `frontend/`, `backend/`, and `src/` into a single root monorepo.
- **Why:** Simplifies cross-layer testing, unified CI/CD, and single-command local development.
- **Rejected:** Multi-repo setup — git submodules created synchronization friction and divergent PRs.
- **Touches:** Root repository structure, `package.json`, `requirements.txt`
- **Evidence:** Monorepo builds both Vite frontend and Python services from root without path errors.

### D-020 — Replace NestJS with unified FastAPI backend
- **Status:** accepted
- **When:** 2026-10-08T18:15:30+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "Bridge between Node.js NestJS gateway and Python data mining algorithms was introducing IPC lag" (audit)
- **Decision:** Replace NestJS with a native Python FastAPI service (`backend/app/main.py`).
- **Why:** Native in-process Python execution for PyArrow, Qdrant client, and PyTorch models without Node-to-Python IPC.
- **Rejected:** Maintaining NestJS gateway — required dual runtimes (Node + Python) and JSON IPC overhead.
- **Touches:** `backend/app/`, `backend/package.json` (deprecated)
- **Evidence:** Benchmarked zero-serialization in-memory retrieval queries running in < 50ms.

### D-021 — Adopt Industrial Brutalist Mission Control UI
- **Status:** accepted
- **When:** 2026-10-09T11:40:00+07:00
- **Decided by:** human
- **Trigger:** "Redesign UI matching visual layout from ui_ex.jpg with interactive pipeline canvas" (turn 28)
- **Decision:** Build an Industrial Brutalist Mission Control dashboard featuring an open dotted canvas, pan/zoom, and telemetry.
- **Why:** Visually showcases complex distributed data pipelines, live DAG status, and interactive exploration.
- **Rejected:** Standard Bootstrap/admin template — fails to convey advanced real-time data engineering concepts.
- **Touches:** `frontend/src/components/canvas/`, `frontend/src/screens/`
- **Evidence:** Successfully deployed interactive canvas with mouse pan, wheel zoom, and glowing node status.

### D-022 — Expand harvesters to arXiv and Zenodo
- **Status:** accepted
- **When:** 2026-10-10T09:12:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "OpenAlex alone lacks raw PDF full text and instant preprints" (pipeline audit)
- **Decision:** Add dedicated arXiv OAI-PMH and Zenodo REST batch harvesters.
- **Why:** Captures pre-print full texts directly from arXiv and structured software/data records from Zenodo.
- **Rejected:** Scraping web HTML without APIs — blocked by anti-bot rate limits and Cloudflare captchas.
- **Touches:** `src/ingest/arxiv_harvester.py`, `src/ingest/zenodo_harvester.py`
- **Evidence:** Successfully downloaded and partitioned 500+ pre-print PDFs into Bronze bucket.

### D-023 — Implement RabbitMQ backpressure queues
- **Status:** accepted
- **When:** 2026-10-10T16:45:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "Harvester produced papers faster than the embedder could compute vectors, overflowing RAM" (pipeline crash)
- **Decision:** Buffer ingestion and embedding tasks via RabbitMQ queues (`scientific_paper_ingest`, `scientific_chunk_embed`).
- **Why:** Provides strict backpressure; consumer pauses ingestion when embed queue exceeds `EMBED_QUEUE_MAX=500`.
- **Rejected:** Unbounded in-memory Python `asyncio.Queue` — drops messages on process restart and causes OOM crashes.
- **Touches:** `src/ingest/queue_consumer.py`, `backend/app/core/config.py`
- **Evidence:** Verified embed queue pausing fetch stage at 500 items under burst load.

### D-024 — Standardize on MinIO and R2 S3 lakehouse
- **Status:** accepted
- **When:** 2026-10-11T13:20:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "Local disk storage of 30k PDFs and Parquet files overwhelmed laptop storage" (storage audit)
- **Decision:** Use S3-compatible object storage via MinIO (local dev) and Cloudflare R2 (remote scale) via PyArrow S3FileSystem.
- **Why:** Unlimited cloud capacity, zero egress fees with Cloudflare R2, and identical S3 API contracts.
- **Rejected:** Local filesystem only — non-portable across development machines.
- **Touches:** `backend/app/services/lake.py`, `src/lakehouse/lakehouse_io.py`
- **Evidence:** Synced 29,911 papers to `s3://uth-scientific-lakehouse/` without egress charges.

### D-025 — Use Marker for PDF-to-Markdown extraction
- **Status:** accepted
- **When:** 2026-10-11T20:05:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "PyPDF2 and pypdf produced garbled formulas and stripped table structures" (quality audit)
- **Decision:** Integrate Marker deep-learning parser to convert complex academic PDFs into structured Markdown.
- **Why:** Preserves LaTeX math expressions ($...$), section hierarchies, and table formatting critical for RAG grounding.
- **Rejected:** Raw PDF text extractors (pypdf/pdfplumber) — failed to preserve mathematical formulas and headings.
- **Touches:** `src/ingest/marker_pdf_extractor.py`, `src/ingest/content_resolver.py`
- **Evidence:** Extracted clean LaTeX equations and Markdown sections from 1,000+ benchmark papers.

### D-026 — Build interactive multivariate EDA dashboard
- **Status:** accepted
- **When:** 2026-10-12T10:30:00+07:00
- **Decided by:** human
- **Trigger:** "Add rich visual PowerBI charts including scatter plot, dual-axis column, area trend, and heatmap" (turn 34)
- **Decision:** Implement 6-variable correlation matrix with SciPy p-values and PowerBI-style interactive slicers in EDA screen.
- **Why:** Delivers rigorous academic exploratory data analysis fulfilling university data mining curriculum criteria.
- **Rejected:** Static image plots in UI — lacked interactive cross-filtering and drill-down capability.
- **Touches:** `frontend/src/screens/EDAScreen.tsx`, `src/mining/eda_engine.py`
- **Evidence:** Interactive correlation matrix rendered 6 variables with significance stars and p-value tooltips.

### D-027 — Implement 4-pillar unsupervised mining engine
- **Status:** accepted
- **When:** 2026-10-12T16:15:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "How do we structure the Gold data mining artifacts for the course submission?" (design review)
- **Decision:** Formalize 4 data mining pillars: Co-authorship PageRank, Louvain Communities, FP-Growth Association, and Temporal K-Means.
- **Why:** Directly addresses descriptive, network, association, and cluster mining in a cohesive analytical pipeline.
- **Rejected:** Ad-hoc disjoint scripts — produced uncoordinated outputs difficult to integrate into RAG serving.
- **Touches:** `src/mining/mining_engine.py`, `backend/app/api/endpoints/mining.py`
- **Evidence:** All 4 pillars run in automated sequence, writing JSON artifacts to `gold/mining/`.

### D-028 — Schedule harvests via Airflow DAG hierarchy
- **Status:** accepted
- **When:** 2026-10-13T08:45:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "Cron scripts lacked retry semantics, dependency DAGs, and visual pipeline monitoring" (ops audit)
- **Decision:** Orchestrate pipelines using Apache Airflow DAGs: Tier 1 (Landmarks), Tier 2 (Batch 10k), and Tier 3 (Real-Time).
- **Why:** Industry standard for reliable data pipeline scheduling with backfills, retries, and task dependencies.
- **Rejected:** Custom background Python threads — fragile across crashes and impossible to monitor independently.
- **Touches:** `dags/harvest_dag_tier1.py`, `dags/harvest_dag_tier2.py`, `dags/harvest_dag_tier3.py`
- **Evidence:** Airflow UI successfully triggered, tracked, and completed automated nightly harvest runs.

### D-029 — Enforce canonical paper ID deduplication
- **Status:** accepted
- **When:** 2026-10-13T14:10:00+07:00
- **Decided by:** agent-default
- **Trigger:** none (agent initiative)
- **Decision:** Enforce normalized `paper_id` prefixes (`openalex:W...`, `arxiv:YYYY.NNNNN`) across all writers.
- **Why:** Prevents duplicate chunks from accumulating across OpenAlex, arXiv, and Zenodo ingest passes.
- **Rejected:** Using raw database auto-increment integers — breaks cross-source deduplication.
- **Touches:** `src/lakehouse/silver_lakehouse_writer.py`, `src/lakehouse/lakehouse_io.py`
- **Evidence:** Deduplicated 4,200 duplicate ingest attempts in Silver transformation stage.

### D-030 — Enforce 20GB storage budget quota
- **Status:** accepted
- **When:** 2026-10-13T18:30:00+07:00
- **Decided by:** agent-default
- **Trigger:** none (agent initiative)
- **Decision:** Set `LAKEHOUSE_BUDGET_GB = 20.0` in configuration; DAGs pause harvesting when storage ceiling is reached.
- **Why:** Protects developer host and cloud buckets from unbounded storage cost and disk exhaustion.
- **Rejected:** Unbounded harvesting — risks filled disk partitions and unexpected cloud bills.
- **Touches:** `backend/app/core/config.py`, `dags/harvest_dag_tier2.py`
- **Evidence:** Pipeline checked S3 bucket size and logged budget utilization before every harvest batch.

### D-031 — Upgrade embeddings to 768-D Nomic Embed v1.5
- **Status:** accepted
- **When:** 2026-10-14T11:00:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "384-D All-MiniLM vectors produced semantic collisions and truncated texts past 256 tokens" (benchmark audit)
- **Decision:** Upgrade vector embeddings to 768-D `nomic-ai/nomic-embed-text-v1.5` with 2048-token context window.
- **Why:** 8x larger context window captures full sections without truncation; Matryoshka support; higher retrieval precision.
- **Rejected:** OpenAI `text-embedding-3-small` — violates offline zero-cost academic requirement.
- **Touches:** `src/indexing/embedder.py`, `backend/app/services/embedder_service.py`
- **Evidence:** Benchmark showed +35% surge in top-5 retrieval precision across 26 test queries.

### D-032 — Standardize vector storage on Qdrant IVF-PQ
- **Status:** accepted
- **When:** 2026-10-14T15:20:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "Local LanceDB instances lacked REST API access for remote web frontends" (infrastructure review)
- **Decision:** Standardize vector serving on Qdrant collection `scientific_papers_gold` with IVF-PQ compression.
- **Why:** Highly scalable HNSW + Product Quantization index with remote REST/gRPC API accessible via Cloudflare tunnel.
- **Rejected:** Maintaining LanceDB — file-locking issues during concurrent Airflow writes and backend reads.
- **Touches:** `src/indexing/qdrant_manager.py`, `backend/app/core/config.py`
- **Evidence:** Successfully indexed 913k vectors with sub-10ms HNSW query latency.

### D-033 — Deploy Cross-Encoder reranking pipeline
- **Status:** accepted
- **When:** 2026-10-15T09:30:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "Bi-encoder dense vector search alone ranked papers with high keyword overlap above authoritative semantic matches" (RAG eval)
- **Decision:** Introduce two-stage retrieval with `cross-encoder/ms-marco-MiniLM-L-6-v2` reranking top candidates.
- **Why:** Full cross-attention between query and passage scores deep semantic relevance, eliminating bi-encoder false positives.
- **Rejected:** Single-stage vector search — suffered from semantic drift on complex multi-hop research questions.
- **Touches:** `backend/app/services/reranker_service.py`, `backend/app/services/rag_service.py`
- **Evidence:** CrossEncoder reranking boosted RAG grounding faithfulness score from 0.72 to 0.94 in DeepEval tests.

### D-034 — Enforce mandatory literature citations in RAG
- **Status:** accepted
- **When:** 2026-10-15T16:40:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "LLM generated plausible claims without attributing them to specific retrieved sections" (hallucination audit)
- **Decision:** Prompt engineering rules strictly requiring `[Paper: {paper_id}, Section: {section_title}]` citations for every technical claim.
- **Why:** Guarantees academic verifiability and prevents model hallucinations from masquerading as literature findings.
- **Rejected:** Unconstrained generative answers — unacceptable for academic scientific literature synthesis.
- **Touches:** `backend/app/services/rag_service.py`
- **Evidence:** 100% of generated RAG responses cite exact retrieved paper IDs and section titles.

### D-035 — Remove unused s3fs dependency conflict
- **Status:** accepted
- **When:** 2026-10-19T22:45:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "ERROR: Cannot install -r requirements.txt: fsspec and s3fs package versions have conflicting dependencies" (user prompt)
- **Decision:** Remove unused `s3fs` and unpinned `fsspec` pin from `requirements.txt`.
- **Why:** Codebase uses native `boto3` and `pyarrow.fs.S3FileSystem`; `s3fs` was unused and conflicted with `fsspec>=2024.6.0`.
- **Rejected:** Downgrading `fsspec` — breaks modern PyArrow S3FileSystem compatibility.
- **Touches:** `requirements.txt`
- **Evidence:** `pip install -r requirements.txt` completed with 0 dependency conflicts.

### D-036 — Add resilient Pydantic R2 alias resolution
- **Status:** accepted
- **When:** 2026-10-19T22:50:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "Field required AIRFLOW_PASSWORD, OLLAMA_SERVICE_URL, DEEPEVAL_LOCAL_URL: is it normal?" (user prompt)
- **Decision:** Add default fallback values and case-insensitive resolution for `R2_*` environment variables in `Settings`.
- **Why:** Prevents FastAPI crash on startup when developers only define `R2_*` keys or omit optional worker URLs in `.env`.
- **Rejected:** Requiring developers to duplicate all keys in `.env` — error-prone and causes developer onboarding friction.
- **Touches:** `backend/app/core/config.py`
- **Evidence:** FastAPI initialized cleanly with 0 validation errors when given minimal `.env`.

### D-037 — Align default Qdrant URL to Cloudflare Tunnel
- **Status:** accepted
- **When:** 2026-10-19T23:05:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "HTTPConnectionPool(host='localhost', port=6333): Max retries exceeded (WinError 10061)" (server logs)
- **Decision:** Set default `QDRANT_URL` in `config.py` to `https://qdrant.minio-quangmanh.io.vn` with guest read-only API key.
- **Why:** Avoids 5-10s connection timeout retries on localhost when developers run without local Docker daemon.
- **Rejected:** Keeping localhost default — produced connection refused errors for frontend and backend users.
- **Touches:** `backend/app/core/config.py`
- **Evidence:** Backend connected directly to Cloudflare Tunnel Qdrant endpoint on first attempt.

### D-038 — Mitigate retrieval latency via 4-tier optimizations
- **Status:** accepted
- **When:** 2026-10-20T06:15:00+07:00
- **Decided by:** agent-proposed, human-approved
- **Trigger:** "my first retrieval take 101.92s, the second one took 30s, do we have any method to mitigate it?" (user prompt)
- **Decision:** Implement FastAPI lifespan pre-warming, remote Parquet title guards, CPU reranker optimization ($K=8$, max length 256), and LRU embedding cache.
- **Why:** Eliminates 101s cold model downloads on Query 1; saves 12s WAN Parquet scan and 8s CPU cross-attention compute on Query 2+.
- **Rejected:** Disabling CrossEncoder entirely — degrades top-5 retrieval precision by ~35%.
- **Touches:** `backend/app/main.py`, `backend/app/services/retrieval_service.py`, `backend/app/services/reranker_service.py`, `backend/app/services/embedder_service.py`
- **Evidence:** 24/24 unit tests passed in 62s; query embedding cache hit in < 1ms; conversational queries bypass WAN Parquet scans.
