# Pipeline Execution Guide: Master Data Mining & Modeling Engine

- **Motivation/Background**: Executing comprehensive scientific data mining pipelines across 13,000 papers requires clear, reproducible CLI commands, resource requirements, and troubleshooting protocols.
- **Purpose**: Provide a step-by-step operational manual for configuring, triggering, inspecting, and serving the 4 Data Mining pillars and EDA engine.
- **Overview Pipeline**: Environment setup (`.venv`) -> Parquet and LanceDB path discovery -> Execution of `mining_engine.py` (Checkpoints 1 through 5) -> Generation of JSON artifacts in `data/gold/mining/` -> Serving through FastAPI REST API and live SSE telemetry.
- **Detailed Plan**: §1 Prerequisites & Environment Setup; §2 Quickstart Execution Commands; §3 CLI Arguments & Customization; §4 Checkpoint Breakdown & Expected Logs; §5 Telemetry & Health Monitoring; §6 Troubleshooting & FAQ.
- **References**: [`data_mining/src/mining/mining_engine.py`](../../data_mining/src/mining/mining_engine.py), [`docs/mining/FOUR_DATA_MINING_PILLARS.md`](FOUR_DATA_MINING_PILLARS.md), [`docs/agents/rules/LOGGING_CHECKPOINT_RULES.md`](../agents/rules/LOGGING_CHECKPOINT_RULES.md).
- **Created**: 2026-10-04T20:58:00+07:00
- **Last Updated**: 2026-10-04T20:58:00+07:00

---

## Table of Contents

- [1. Prerequisites &amp; Environment Setup](#1-prerequisites--environment-setup)
- [2. Quickstart Execution Commands](#2-quickstart-execution-commands)
  - [2.1 PowerShell (Windows)](#21-powershell-windows)
  - [2.2 Bash (Linux / macOS)](#22-bash-linux--macos)
- [3. CLI Arguments &amp; Configuration Options](#3-cli-arguments--configuration-options)
- [4. Pipeline Checkpoints Breakdown](#4-pipeline-checkpoints-breakdown)
- [5. Serving Artifacts &amp; Live Telemetry](#5-serving-artifacts--live-telemetry)
- [6. Troubleshooting &amp; FAQ](#6-troubleshooting--faq)

---

## 1. Prerequisites & Environment Setup

The pipeline requires **Python 3.10+** (tested on Python 3.12.10) with the virtual environment activated:

```bash
# Verify Python version
python --version
```

### Core Dependencies
Ensure all data mining packages are installed in your virtual environment:

```bash
pip install duckdb lancedb scikit-learn networkx mlxtend pandas boto3 pydantic
```

---

## 2. Quickstart Execution Commands

The master engine auto-detects available datasets in priority order:
1. `data/silver/year=2026/papers.parquet` (local cached silver metadata)
2. `data/silver/papers.parquet` (local OpenAlex silver dataset)
3. `s3://uth-scientific-lakehouse/silver/papers/year=2026/papers.parquet` (Cloudflare R2 remote lakehouse)

### 2.1 PowerShell (Windows)

```powershell
# Set PYTHONPATH to data_mining directory
$env:PYTHONPATH = "data_mining"

# Run master mining engine
.\.venv\Scripts\python.exe data_mining/src/mining/mining_engine.py
```

### 2.2 Bash (Linux / macOS)

```bash
# Set PYTHONPATH and execute
PYTHONPATH=data_mining .venv/bin/python data_mining/src/mining/mining_engine.py
```

---

## 3. CLI Arguments & Configuration Options

You can override paths, limits, and cloud synchronization flags:

```bash
python data_mining/src/mining/mining_engine.py [OPTIONS]
```

| Argument | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `--parquet` | `str` | `None` (auto-detect) | Path to Silver Parquet file (local path or `s3://...` URL) |
| `--lancedb` | `str` | `None` (auto-detect) | Path or S3 URI to Gold LanceDB vector table |
| `--output` | `str` | `data/gold/mining` | Output directory where JSON artifacts will be written |
| `--upload-r2` | `flag` | `False` | When passed, uploads generated JSON artifacts to Cloudflare R2 |

### Example Invocations

```powershell
# Run with explicit Parquet path and custom output folder
$env:PYTHONPATH="data_mining"
python data_mining/src/mining/mining_engine.py `
    --parquet "data/silver/papers.parquet" `
    --output "data/gold/mining_custom"

# Run and sync artifacts to Cloudflare R2
python data_mining/src/mining/mining_engine.py --upload-r2
```

---

## 4. Pipeline Checkpoints Breakdown

The engine executes in **5 sequential checkpoints**, adhering strictly to [`LOGGING_CHECKPOINT_RULES.md`](../agents/rules/LOGGING_CHECKPOINT_RULES.md) (strictly plain text, timestamped, zero emojis):

```text
2026-10-04 20:44:17 [INFO] ================================================================================
2026-10-04 20:44:17 [INFO] [MINING ENGINE] STARTING MASTER DATA MINING & MODELING EXECUTION
2026-10-04 20:44:17 [INFO] [MINING ENGINE] Parquet source: data/silver/year=2026/papers.parquet
2026-10-04 20:44:17 [INFO] [MINING ENGINE] LanceDB source: data/gold/lancedb
2026-10-04 20:44:17 [INFO] [MINING ENGINE] Target artifact directory: data/gold/mining
2026-10-04 20:44:17 [INFO] ================================================================================
2026-10-04 20:44:17 [INFO] [CHECKPOINT 1/5] Executing Real-Time Exploratory Data Analysis (EDA)...
2026-10-04 20:44:17 [INFO] [CHECKPOINT 1/5] [SUCCESS] EDA completed in 0.15s.
2026-10-04 20:44:17 [INFO] [CHECKPOINT 2/5] Executing Pillar 1: Association Rule Mining (FP-Growth)...
2026-10-04 20:44:35 [INFO] [CHECKPOINT 2/5] [SUCCESS] Pillar 1 completed in 18.64s.
2026-10-04 20:44:35 [INFO] [CHECKPOINT 3/5] Executing Pillar 2: Semantic Topic Clustering...
2026-10-04 20:44:40 [INFO] [CHECKPOINT 3/5] [SUCCESS] Pillar 2 completed in 4.90s.
2026-10-04 20:44:40 [INFO] [CHECKPOINT 4/5] Executing Pillar 3: Scientific Network & Citation Graph Mining...
2026-10-04 20:48:04 [INFO] [CHECKPOINT 4/5] [SUCCESS] Pillar 3 completed in 203.70s.
2026-10-04 20:48:04 [INFO] [CHECKPOINT 5/5] Executing Pillar 4: Trend Velocity & Structural Anomaly Mining...
2026-10-04 20:48:05 [INFO] [CHECKPOINT 5/5] [SUCCESS] Pillar 4 completed in 0.45s.
2026-10-04 20:48:05 [INFO] [MINING ENGINE] [SUMMARY] All 4 Pillars and EDA executed successfully in 227.85s.
```

### Generated Artifacts
All output files are saved in `data/gold/mining/`:

1. `eda_summary.json`: Global dataset volume, completeness, formula counts, and author rankings.
2. `association_rules.json`: Deduplicated association rules with lift $\ge 1.2$ and support metrics.
3. `clusters.json`: K-Means profiles, validation metrics (Silhouette, Davies-Bouldin), and 2D scatter coordinates.
4. `graph_coauthorship.json`: Directed citation graph topology, directed PageRank landmark papers, and modularity communities.
5. `trends_anomalies.json`: Multi-dimensional structural outliers and share-normalized velocity categories.
6. `mining_manifest.json`: Runtime metadata, status, execution duration, and checkpoint timestamps.

---

## 5. Serving Artifacts & Live Telemetry

Once the artifacts are generated, the FastAPI backend automatically serves them to the frontend:

### Start the FastAPI Backend
```bash
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Live Endpoints
- `GET http://localhost:8000/api/mining/eda`
- `GET http://localhost:8000/api/mining/pillars/association-rules`
- `GET http://localhost:8000/api/mining/pillars/clusters`
- `GET http://localhost:8000/api/mining/pillars/graph`
- `GET http://localhost:8000/api/mining/pillars/trends`
- `GET http://localhost:8000/api/mining/manifest`
- `GET http://localhost:8000/api/mining/telemetry/stream` (SSE live heartbeat stream)

### Automated Test Suite
To verify that all endpoints correctly validate against the generated artifacts:

```bash
pytest backend/tests/test_api.py -v
```
Expected output: **12 passed**.

---

## 6. Troubleshooting & FAQ

### Q1: `ModuleNotFoundError: No module named 'src'`
**Fix**: Ensure `PYTHONPATH` points to the `data_mining` root directory:
```powershell
$env:PYTHONPATH = "data_mining"
```

### Q2: `ValueError: Table 'scientific_papers_gold' was not found`
**Fix**: The local LanceDB table is named `academic_chunks`, while Cloudflare R2 hosts `scientific_papers_gold`. The updated engine automatically detects which table is available. If using an explicit path, pass `--lancedb data/gold/lancedb`.

### Q3: Why does Checkpoint 4 take around 3 minutes?
**Explanation**: Checkpoint 4 computes Newman-Girvan greedy modularity communities and directed PageRank over an **86,295-edge citation network**. In pure Python (NetworkX), modularity partitioning scales as $O(M \cdot D \log N)$. This is normal and finishes within 3–4 minutes.

### Q4: How do I test the backend deserialization without starting the server?
Run the validation script:
```powershell
$env:PYTHONPATH=".;data_mining"
python scratch/test_backend_mining.py
```
Expected result: `ALL 5 ENDPOINTS PASSED PYDANTIC VALIDATION 100%!`.
