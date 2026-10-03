# Source Architecture

- **Motivation/Background**: Đồng bộ tài liệu với scientific lakehouse hiện có.
- **Purpose**: Ghi nhận kiến trúc và giới hạn implementation.
- **Overview Pipeline**: Ingestion → Bronze → Silver → SQL/chunking → optional Gold.
- **Detailed Plan**: Trạng thái, trách nhiệm module và kiểm chứng.
- **References**: [README](../README.md), [setup](../SETUP.md).
- **Created**: 2026-10-02T22:15:00+07:00
- **Last Updated**: 2026-10-03T20:30:00+07:00

---

| Package | Implementation |
| --- | --- |
| [config](config/settings.py) | Settings `.env` + environment, paths và delay validation, conference venues |
| [storage](storage/) | R2 boto3, filesystem store với Bronze immutable, DuckDB lazy httpfs, conference checkpoint mirror |
| [ingestion](ingestion/) | RSS/HTML harvester, OAI bulk harvester, **conference pipeline** (KDD/ICML/ICLR/NeurIPS) với 21-rule foundation layer |
| [transformation](transformation/) | HTML sections/math, metadata normalization, atomic Parquet upsert |
| [indexing](indexing/) | Bounded section chunks, optional local Nomic, LanceDB upsert/cosine search |
| [pipelines](pipelines/) | run_ingest, run_batch_ingest, run_transform, run_indexing, run_conference_ingest, doctor, run_demo |
| [utils](utils/) | SHA-256 và pipeline log tee |
| [quality](quality/), [mining](mining/), [rag](rag/) | Package khung, chưa có algorithm implementation |

Module CLI chạy bằng `python -m`. Giữ `src` là namespace hiện có. Core chạy CPU; indexing là dependency tùy chọn. Không sửa dữ liệu trong `data/raw/`; local ingestion dùng `LOCAL_STORE_DIR`.

## Conference Ingestion (Phase 2)

The conference pipeline harvests paper metadata for four Data Science venues —
**KDD, ICML, ICLR, NeurIPS** — from 2020 onward, following the engineering
rules documented in `agents/rules/` and `docs/progress/REFACTOR_STATUS.md`.

```
src/ingestion/
├── common/                  # 11-module foundation (Rules 1-20)
│   ├── user_agent.py        # Rule 11: transparent UA
│   ├── jitter.py            # Rule 4:  jittered delay
│   ├── rate_limiter.py      # Rule 3:  per-domain token bucket
│   ├── backoff.py           # Rule 5+6: exponential backoff + Retry-After
│   ├── http_client.py       # Rule 9+16: ETag/Last-Modified + timeouts
│   ├── circuit_breaker.py   # Rule 17: OPEN / HALF_OPEN / CLOSED
│   ├── checkpoint.py        # Rule 7:  atomic incremental checkpoint
│   ├── dead_letter.py       # Rule 18: DLQ for failed records
│   ├── adaptive_throttle.py # Rule 15: back off on latency / errors
│   ├── robots_checker.py    # Rule 2:  robots.txt policy
│   └── content_hash.py      # Rule 19: SHA-256 dedup
├── sources/                 # 1 adapter per access strategy
│   ├── base.py              # Abstract BaseSourceAdapter
│   ├── openalex_adapter.py  # OpenAlex API (primary for all 4 venues)
│   ├── openreview_adapter.py# OpenReview API (primary for ICLR)
│   ├── html_base.py         # HTML scrape base class
│   ├── kdd_adapter.py       # KDD HTML fallback (www.kdd.org)
│   ├── icml_adapter.py      # ICML HTML fallback (PMLR)
│   └── neurips_adapter.py   # NeurIPS HTML fallback (papers.nips.cc)
└── conference_pipeline.py   # 14-step orchestrator + dedup + Bronze -> Silver
```

### Run

```bash
# 1. KDD only (OpenAlex -> kdd_html fallback)
python -m src.pipelines.run_conference_ingest --venue KDD --year-from 2020

# 2. ICML
python -m src.pipelines.run_conference_ingest --venue ICML --year-from 2020

# 3. ICLR (OpenReview -> OpenAlex)
python -m src.pipelines.run_conference_ingest --venue ICLR --year-from 2020

# 4. NeurIPS
python -m src.pipelines.run_conference_ingest --venue NeurIPS --year-from 2020

# All 4 in one shot (sequential by design)
python -m src.pipelines.run_conference_ingest --all --year-from 2020

# Local mode (no R2)
python -m src.pipelines.run_conference_ingest --venue KDD --year-from 2024 --local

# Dry-run (no R2, no network)
python -m src.pipelines.run_conference_ingest --venue KDD --year-from 2024 --dry-run
```

Configuration is centralized in `.env`:

```ini
CONFERENCE_SOURCES=KDD,ICML,ICLR,NeurIPS
CONFERENCE_YEAR_FROM=2020
CONFERENCE_YEAR_TO=2026
OPENALEX_RATE_LIMIT_RPS=10
OPENALEX_EMAIL=research-datamining@uth.edu.vn
```

See `.env_example` for the full set of `*_RATE_LIMIT_RPS`,
`CRAWLER_TIMEOUT_*`, `CRAWLER_CIRCUIT_BREAKER_*`, `CRAWLER_OFFPEAK_*`
parameters. Tests live under `tests/test_conference_common.py` and
`tests/test_conference_pipeline.py` and run fully offline.
