# Source Ingestion UI Count Discrepancy (Raw Works vs Full-Text) — Bug Report

- **Motivation/Background**: Runtime failures, environment incompatibilities, and logic bugs must be documented with actionable root-cause analysis and verification evidence.
- **Purpose**: Document the UI counter inflation where the Source Ingest card and Lakehouse counters displayed 23k–38k raw unparsed works instead of verified full-text papers.
- **Overview Pipeline**: `backend/app/services/storage_service.py` -> `frontend/src/store/streaming.store.ts` -> `frontend/src/App.tsx` -> `frontend/src/components/schematic/InteractiveWorkflowCanvas.component.tsx`.
- **Detailed Plan**: §1 Symptom & Traceback; §2 Root Cause Analysis; §3 Solution & Code Changes; §4 Verification Evidence; §5 Related Links.
- **References**: `agents/rules/MD_CONVENTION.md`, `agents/templates/BUG_TEMPLATE.md`.
- **Created**: 2026-10-13T09:30:00+07:00
- **Last Updated**: 2026-10-13T09:30:00+07:00

---

## Metadata

- **Bug ID**: `BUG-03`
- **Title**: Source Ingestion UI Displaying Total Raw/Unparsed Works (23k–38k) Instead of Deduplicated Full-Text Papers (12,641)
- **Status**: Open (Remediation Planned)
- **Severity**: Medium
- **Category**: Data / Frontend Architecture
- **Target Component**: [`frontend/src/App.tsx`](file:///C:/document/Study%20documents/Uth-Data-Mining/frontend/src/App.tsx), [`frontend/src/components/schematic/InteractiveWorkflowCanvas.component.tsx`](file:///C:/document/Study%20documents/Uth-Data-Mining/frontend/src/components/schematic/InteractiveWorkflowCanvas.component.tsx), [`backend/app/services/storage_service.py`](file:///C:/document/Study%20documents/Uth-Data-Mining/backend/app/services/storage_service.py)

---

## 1. Symptom & Error Traceback

In the Frontend Schematic Canvas and Header Bar, the "Source Ingest" card, "Total Corpus", and "Active Lakehouse Works" counters reported contradictory and inflated numbers:
- Source Ingest Card displayed: **23k–38k works** (or fell back to `100,000`).
- HeaderBar displayed: `38,414 works`, `164,702 vectors`, and `2,220,938 formulas`.
- RAG Welcome message greeted the user with: `36,414 harvested works` and `143,523 vectors`.

However, the verified physical reality of the Lakehouse is:
- **12,641 deduplicated full-text papers** (3,000 Tier 1 Landmark + 9,641 Tier 2 Near-Past).
- **635,901 vector chunks** indexed into LanceDB Gold (`scientific_papers_gold.lance`).
- **2,765,395 LaTeX formulas** extracted across full texts.
- **4.774 GB** total cloud bucket on Cloudflare R2 (well within the 10.00 GB free tier).

---

## 2. Root Cause Analysis

1. **Aggregation of Raw Conference Stubs**:
   In `storage_service.py`, `_bootstrap_from_local_files()` and `_get_source_breakdown()` historically aggregated all raw scraped HTML conference stubs (e.g., CVPR metadata, OpenAlex records) without distinguishing between full-text enriched papers and catalog-only entries.
2. **Hardcoded Fallbacks in Frontend State**:
   - In `frontend/src/App.tsx`:
     ```typescript
     const [totalPapers, setTotalPapers] = useState<number>(38414);
     const [totalFormulas, setTotalFormulas] = useState<number>(2220938);
     const [totalVectors, setTotalVectors] = useState<number>(164702);
     // Fallback to 100,000 when tier2 is not populated
     const works = data.sourceBreakdown?.tier2_near_past || 100000;
     ```
   - In `InteractiveWorkflowCanvas.component.tsx`:
     Hardcoded `TOOL_DETAILS_MAP` entries initialized with `164,750 Vectors`, `2,220,938 formulas`, and simulation stage complete resetting `vectorsIndexed(164750)`.
   - In `GroundedRagChat.component.tsx`:
     Static initial welcome message referencing `36,414 harvested works` and `143,523 LanceDB vector embeddings`.

---

## 3. Solution & Remediation

1. **Unify Truth Metric Across Backend**:
   - `storage_service.py` provides `sourceBreakdown.total_deduplicated` (12,641) representing genuine full-text papers.
   - `sourceBreakdown.active_rag_vectors` (635,901) strictly reflects `len(tbl)` from `scientific_papers_gold.lance`.
2. **Synchronize Frontend State with Live Endpoints**:
   - In `App.tsx`, read `data.sourceBreakdown.total_deduplicated` directly for paper count, and `data.activeLakehouse.activeLanceDbVectors` for vectors.
   - Update fallback states across `App.tsx`, `HeaderBar.component.tsx`, `InteractiveWorkflowCanvas.component.tsx`, and `GroundedRagChat.component.tsx` to match Lakehouse truth: **12,641 papers, 635,901 vectors, 2,765,395 formulas**.
3. **Fix R2 Explorer Overage Glitch**:
   - In `r2_explorer.py`, calculate `overage_gb = max(0.0, round(total_size_gb - free_tier_quota_gb, 2))` dynamically so 4.77 GB shows `0.00 GB` overage instead of stale `2.18 GB`.

---

## 4. Verification Evidence

Will be verified upon executing the unified frontend metric synchronization plan:
- HeaderBar displays: `12,641 Papers`, `635.9k Vectors`, `2.77M Formulas`.
- Source Ingest card displays: `12,641 Genuine Full-Text Papers`.
- R2 Storage HUD displays: `4.77 GB / 10.00 GB (47.74%)`, Overage `0.00 GB`.
- RAG Chat greeting displays: `12,641 full-text papers`, `635,901 vectors`.

---

## 5. Related Links

- Bug Directory Index: [`docs/bugs/README.md`](README.md)
- Related Modules: [`frontend/src/App.tsx`](file:///C:/document/Study%20documents/Uth-Data-Mining/frontend/src/App.tsx), [`backend/app/services/storage_service.py`](file:///C:/document/Study%20documents/Uth-Data-Mining/backend/app/services/storage_service.py)
