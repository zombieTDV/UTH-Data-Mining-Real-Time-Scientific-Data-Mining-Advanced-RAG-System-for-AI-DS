# R2_STORAGE_OPTIMIZATION_AND_DEDUP_SHIELD.md — Cloudflare R2 Optimization, Lossless Raw Data Archiving & Deduplication Shield

- **Motivation/Background**: Cloudflare R2 storage for `uth-scientific-lakehouse` reached 12.33 Decimal GB (11.48 Binary GiB across 37,455 objects), exceeding the 10.00 GB Free Tier quota. Analysis revealed that the bloat was driven by: (1) 3.79 GB of unreferenced zombie `.lance` files and Windows backslash duplicate keys, (2) storing OpenAlex records twice (as loose `.json.gz` and `.parquet`), and (3) 11,767 loose uncompressed arXiv HTML files. However, deleting raw Bronze data would break downstream LLM fine-tuning, domain pretraining, and document intelligence workflows.
- **Purpose**: Execute a zero-data-loss optimization reducing R2 storage to 3.04 GB (69.6% free headroom under the 10 GB quota). Losslessly preserve 100% of raw OpenAlex metadata (all 44 fields) in Parquet, compress all 11,767 arXiv full-text HTML files into 4 multi-part archives, purge 3.79 GB of dead zombie vector dumps, harden the S3 client against Windows backslash bugs, and deploy a permanent Deduplication Hash Shield (52,106 unique papers).
- **Overview Pipeline**:
  1. `src/storage/dedup_hash_shield.py`: Builds and uploads `manifests/openalex_dedup_hashes.parquet` indexing 52,106 papers, 51,477 title SHA-256 hashes, and 11,596 DOIs.
  2. `src/storage/r2_client.py`: Universal `.as_posix()` sanitization on upload; exact raw key batch deletion supporting up to 1,000 keys per call.
  3. `src/storage/r2_prune_manager.py`: Prunes 85 dead LanceDB files and 245 backslash duplicate keys; uploads live 40,399 vector table (257 MB); batch-prunes 15,135 redundant OpenAlex `.json.gz` duplicates and commit logs; concurrently streams and archives 11,767 arXiv HTML files into 4 multi-part tarballs.
  4. `src/storage/calibrate_storage_cache.py`: Calibrates `r2_manifest.json`, `r2_manifest_cache.json`, and `r2_inventory.json` from live bucket measurements.
  5. Verification: Live LanceDB vector retrieval test confirms sub-second latency and 100% semantic grounding.
- **Detailed Plan**: §1 Storage Audit & Decimal vs. Binary Reconciliation; §2 Zero Data Loss Archiving Strategy; §3 Deduplication Hash Shield; §4 Zombie Vector Purging & S3 Hardening; §5 Final Live Metrics & Verification.
- **References**: `agents/rules/COMMIT_CONVENTION.md`, `agents/rules/MD_CONVENTION.md`, `docs/r2/CLOUDFLARE_R2_LAKEHOUSE_EXPLORER_AND_VIEWER.md`, `src/storage/dedup_hash_shield.py`, `src/storage/r2_prune_manager.py`.
- **Created**: 2026-10-12T12:15:00+07:00
- **Last Updated**: 2026-10-12T12:15:00+07:00

---

## 1. Storage Audit & Metric Reconciliation

Cloudflare R2 Console reports metrics in **Decimal Gigabytes (SI, $10^9$ bytes)**, whereas OS tools report in **Binary Gibibytes (IEC, $2^{30}$ bytes)**:

| Metric | Pre-Optimization (R2 Console) | Post-Optimization (R2 Console) | Net Delta | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Total Bucket Size** | **12.33 GB** (11.48 GiB) | **3.04 GB** (2.83 GiB) | **-9.29 GB (-75.3%)** | Exceeded quota $\to$ **69.6% Free Headroom** |
| **Total Objects** | **37,455** | **10,574** | **-26,881 objects** | Reduced API surface and request overhead |
| **Free Tier Quota** | 10.00 GB | 10.00 GB | - | Cloudflare standard free tier |
| **Quota Delta** | +2.33 GB over quota | **-6.96 GB under quota** | **Fixed** | 0 overage warnings, $0.00 cost |

---

## 2. Zero Data Loss Archiving Strategy

### 2.1 Preserving Raw Bronze for LLM Workflows
In modern AI lakehouses, Bronze raw data is the single source of truth. Destroying it would preclude downstream LLM pretraining, instruction tuning (SFT for paper summarization, peer review critique), and equation reasoning.
- **OpenAlex Raw Metadata**: Audit confirmed that `bronze/openalex/raw_metadata/*.parquet` already contains **all 44 raw fields** (authorships, affiliations, linear abstracts, concepts, citation counts, DOIs). Removing the redundant `.json.gz` duplicates reclaimed 2.37 GB while preserving 100% of raw metadata in 9,621 Parquet files (1.897 GB).
- **arXiv Full-Text HTML**: 11,767 loose HTML files (3.96 GB) were concurrently streamed into 4 multi-part archives (`arxiv_html_part_01_of_04.tar.gz` to `part_04_of_04.tar.gz`), reducing storage to 0.678 GB while losslessly preserving all LaTeX math, HTML DOM, and tables.

---

## 3. Deduplication Hash Shield

Deployed at `manifests/openalex_dedup_hashes.parquet` (4.09 MB) on R2:
- Indexes **52,106 unique papers**.
- Stores **51,477 Title SHA-256 hashes** and **11,596 DOIs**.
- Guarantees future crawling runs never download or embed papers previously collected.

---

## 4. Zombie Vector Purging & S3 Client Hardening

1. **Purged Dead Vectors**: Removed 85 unreferenced `.lance` files (including two 1.26 GB zombie dumps left over from abandoned table builds) and 245 Windows backslash duplicate keys (`academic_chunks.lance\...`).
2. **Synced Live Gold**: Uploaded the clean active `scientific_papers_gold.lance` (346 files, 257.34 MB, 40,399 vectors, IVF-PQ index).
3. **Hardened S3 Client**: Universal `sanitize_key()` in `r2_client.py` prevents future backslash key creation. Fixed `delete_objects_batch()` to use exact raw keys for deleting legacy keys with literal backslashes.

---

## 5. Final Verified Live State

```
Prefix                              | Objects |     Dec GB |    Bin GiB
----------------------------------------------------------------------
bronze/openalex                     |   9,621 |     1.8974 |     1.7671
bronze/arxiv                        |      42 |     0.6777 |     0.6311
gold/lancedb                        |     346 |     0.2698 |     0.2513
silver                              |      22 |     0.1088 |     0.1014
bronze/conferences                  |     184 |     0.0330 |     0.0308
bronze/openreview                   |       5 |     0.0262 |     0.0244
bronze/tier1                        |     335 |     0.0185 |     0.0173
bronze/cvf                          |       9 |     0.0049 |     0.0046
manifests                           |       1 |     0.0042 |     0.0039
gold/openreview                     |       1 |     0.0004 |     0.0004
gold/mining                         |       6 |     0.0003 |     0.0003
gold/cvf                            |       1 |     0.0002 |     0.0001
gold/openalex                       |       1 |     0.0001 |     0.0001
----------------------------------------------------------------------
TOTAL                               |  10,574 |     3.0415 |     2.8327
```
