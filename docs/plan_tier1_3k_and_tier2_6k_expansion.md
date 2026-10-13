# PLAN_TIER1_3K_AND_TIER2_6K_EXPANSION.md — Tier 1 (3k Landmarks) & Tier 2 (+6k Near-Past) Collection Report

- **Motivation/Background**: To eliminate single-source reliance and expand academic coverage, the user requested an overhaul of Tier 1 to 3,000 landmark papers distributed equally across the three premier academic sources (arXiv, OpenReview, CVF) and an additional +6,000 papers for Tier 2, strictly focusing on high-speed ingestion and deduplication without immediate embedding computation.
- **Purpose**: Document the pipeline implementation, deduplication protocol, source distributions, storage metrics, and remote Cloudflare R2 synchronization for Tier 1 (3,000 papers) and Tier 2 (20,095 papers).
- **Overview Pipeline**: Executed `src/pipelines/run_tier1_3k_and_tier2_6k_collection.py` which harvested OpenReview historical & near-past streams via DuckDB, CVF accepted listings with HTML DOM parsing, and arXiv OAI-PMH backward day-by-day batches, followed by strict `(paper_id, norm_title)` deduplication and direct Parquet vaulting.
- **Detailed Plan**: §1 Pipeline Architecture & Scope; §2 Tier 1 Landmark Reconstruction (3,000 Papers); §3 Tier 2 Near-Past Expansion (+6,000 Papers); §4 Strict Deduplication Protocol; §5 Lakehouse Storage & Cloudflare R2 Synchronization Metrics.
- **References**: `agents/rules/COMMIT_CONVENTION.md`, `agents/rules/MD_CONVENTION.md`, `src/pipelines/run_tier1_3k_and_tier2_6k_collection.py`, `src/ingestion/arxiv_batch_harvester.py`, `src/ingestion/openreview_harvester.py`, `src/ingestion/cvf_harvester.py`.
- **Created**: 2026-10-12T09:39:00+07:00
- **Last Updated**: 2026-10-12T09:39:00+07:00

---

## Table of Contents

- [1. Pipeline Architecture & Scope](#1-pipeline-architecture--scope)
- [2. Tier 1 Landmark Reconstruction (3,000 Papers)](#2-tier-1-landmark-reconstruction-3000-papers)
- [3. Tier 2 Near-Past Expansion (+6,000 Papers)](#3-tier-2-near-past-expansion-6000-papers)
- [4. Strict Deduplication Protocol](#4-strict-deduplication-protocol)
- [5. Lakehouse Storage & Cloudflare R2 Synchronization Metrics](#5-lakehouse-storage--cloudflare-r2-synchronization-metrics)

---

## 1. Pipeline Architecture & Scope

The ingestion pipeline `src/pipelines/run_tier1_3k_and_tier2_6k_collection.py` enforces pure academic provenance across three primary venues:
1. **arXiv**: Official OAI-PMH stream with exact day-by-day backward slicing and historical time windows.
2. **OpenReview**: High-throughput DuckDB direct streaming over the peer-review parquet mirror (`AlgorithmicResearchGroup/openreview-papers-with-reviews`).
3. **CVF Open Access**: Direct HTML DOM scraper with listing cache for CVPR and ICCV accepted proceedings.

In compliance with user constraints, **vector embedding computation was explicitly bypassed** during this phase, dedicating 100% of pipeline throughput to ingestion, normalization, and deduplication.

---

## 2. Tier 1 Landmark Reconstruction (3,000 Papers)

All legacy single-source metadata in Tier 1 was replaced with an evenly distributed, pure academic landmark corpus:

| Source | Venue / Filter | Target Quota | Harvested & Deduplicated | Content Origin |
| :--- | :--- | :---: | :---: | :--- |
| **CVF Open Access** | CVPR 2023 Accepted Proceedings | 1,020 | **1,020** | `cvf_html_dom` |
| **OpenReview** | ICLR / NeurIPS (2018–2022) | 1,020 | **1,003** | `openreview_peer_review` |
| **arXiv** | Foundational AI/ML Preprints (2018) | 1,020 | **977** | `arxiv_oai_pmh` |
| **Total Tier 1** | **Balanced 3-Source Landmarks** | **3,000** | **3,000** | `data/silver/tier1/landmark_papers.parquet` |

---

## 3. Tier 2 Near-Past Expansion (+6,000 Papers)

Tier 2 was expanded by **+6,090 candidate papers**, continuing backward day-by-day from October 2026 and leveraging offset partitions of peer-reviewed proceedings:

| Source | Target Addition | Method / Date Window | Resulting Source Total in Tier 2 |
| :--- | :---: | :--- | :---: |
| **arXiv** | +3,050 | Day-by-day backward (Oct 02, Oct 01, Sep 30, Sep 29...) | **11,039** (54.9%) |
| **OpenReview** | +2,020 | DuckDB streaming 2023–2024 (Offset 3,500+) | **5,136** (25.6%) |
| **CVF Open Access** | +1,020 | CVPR 2023 Accepted Proceedings (Part 2) | **3,468** (17.3%) |
| *OpenAlex (Legacy)* | *0* | *Preserved historical partition* | *355* (1.8%) |
| *Zenodo (Legacy)* | *0* | *Preserved historical partition* | *97* (0.5%) |
| **Total Tier 2** | **+6,090** | **Consolidated Near-Past Lakehouse** | **20,095 papers** |

---

## 4. Strict Deduplication Protocol

Deduplication was executed in two successive stages using PyArrow and Pandas:
1. **Primary Key Deduplication**: `paper_id` uniqueness check (`df.drop_duplicates(subset=["paper_id"])`).
2. **Normalized Title Deduplication**: Case-folded, alphanumeric-only title matching (`norm_title = re.sub(r"[^\w\s]", "", title.lower())`) ensuring zero semantic collision across different ingestion channels.

**Verification Results**:
- Tier 1: 3,000 rows $\to$ **3,000 distinct paper_ids** $\to$ **3,000 distinct titles** (0 collisions).
- Tier 2: 20,095 rows $\to$ **20,095 distinct paper_ids** $\to$ **20,095 distinct titles** (0 collisions).

---

## 5. Lakehouse Storage & Cloudflare R2 Synchronization Metrics

Both output tables were vaulted to Silver Zstandard-compressed Parquet and synchronized with Cloudflare R2:
- `data/silver/tier1/landmark_papers.parquet` (3,000 rows) $\to$ `s3://uth-scientific-lakehouse/silver/tier1/landmark_papers.parquet`.
- `data/silver/tier2/near_past_papers.parquet` (20,095 rows) $\to$ `s3://uth-scientific-lakehouse/silver/tier2/near_past_papers.parquet`.

Pipeline execution duration: **126.96 seconds** total.
