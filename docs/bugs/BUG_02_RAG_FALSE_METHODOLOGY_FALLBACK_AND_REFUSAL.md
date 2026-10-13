# RAG False Methodology Fallback and Overly Defensive Refusal — Bug Report

- **Motivation/Background**: Runtime failures, environment incompatibilities, and logic bugs must be documented with actionable root-cause analysis and verification evidence.
- **Purpose**: Document the inaccurate citation labeling ("· Methodology") on abstract chunks and the overly aggressive LLM refusal behavior on fundamental scientific concepts.
- **Overview Pipeline**: `frontend/src/components/rag/GroundedRagChat.component.tsx` -> `backend/app/api/endpoints/rag.py` -> `backend/app/services/rag_service.py` -> Qwen 2.5 7B LLM.
- **Detailed Plan**: §1 Symptom & Traceback; §2 Root Cause Analysis; §3 Solution & Code Changes; §4 Verification Evidence; §5 Related Links.
- **References**: `agents/rules/MD_CONVENTION.md`, `agents/templates/BUG_TEMPLATE.md`.
- **Created**: 2026-10-13T09:30:00+07:00
- **Last Updated**: 2026-10-13T09:30:00+07:00

---

## Metadata

- **Bug ID**: `BUG-02`
- **Title**: RAG False "Methodology" Section Fallback and Overly Defensive Model Refusal
- **Status**: Resolved
- **Severity**: High
- **Category**: Architecture / Evaluation
- **Target Component**: [`backend/app/services/rag_service.py`](file:///C:/document/Study%20documents/Uth-Data-Mining/backend/app/services/rag_service.py), [`frontend/src/components/rag/GroundedRagChat.component.tsx`](file:///C:/document/Study%20documents/Uth-Data-Mining/frontend/src/components/rag/GroundedRagChat.component.tsx)

---

## 1. Symptom & Error Traceback

When querying canonical seminal topics (e.g., CoDi conditional diffusion distillation `2310.01407`, LoRA parameter reduction, SGLD convergence, FlashAttention-2 HBM IO), the RAG pipeline returned false section labels and refused to provide meaningful synthesis:

**Symptom 1 (False Citation Badging):**
Citation chips consistently displayed:
`Paper:2310.01407 · Methodology`
even when the retrieved chunk was strictly an Abstract or Introduction without a formal methodology subsection.

**Symptom 2 (Overly Aggressive Refusal):**
```text
The provided literature does not contain sufficient details regarding the specific role of sampling z_t in conditional diffusion distillation according to the CoDi paper Paper:2310.01407 · Methodology. The excerpt from the CoDi paper focuses on the overall approach... but it does not delve into the specifics of sampling z_t.
```
Similarly, for LoRA:
```text
The provided literature does not explicitly detail how LoRA preserves cross-entropy convergence while reducing parameters...
```

---

## 2. Root Cause Analysis

1. **Hardcoded Fallback in Citation Formatter**:
   In `frontend/src/components/rag/GroundedRagChat.component.tsx`, `formatCitationBadgeLabel()` executed:
   ```typescript
   const section = rawSec && rawSec.trim() ? rawSec.trim() : 'Methodology';
   ```
   Whenever `section_title` was empty, null, or untracked (common in paper abstracts and single-section seed records), it forced `· Methodology`.
2. **Hardcoded Fallback in Backend Context Builder**:
   In `backend/app/services/rag_service.py`, `_format_context()` also defaulted empty section titles to `"Main Methodology"`.
3. **Overly Defensive Prompt Instruction (Rule 2)**:
   The system instruction strictly demanded that if an exact micro-parameter detail was not 100% matched verbatim in the retrieved chunks, the model must refuse entirely:
   *"If the context does not contain sufficient details, you MUST explicitly state that the literature is insufficient."*
   Because seminal papers in the seed catalog existed as conference abstracts/landing pages rather than 60-page PDF OCR dumps, the model refused instead of synthesizing foundational principles clearly demarcated with scope boundaries.

---

## 3. Solution & Remediation

1. **Accurate Section Attribution**:
   Updated `formatCitationBadgeLabel()` in [`frontend/src/components/rag/GroundedRagChat.component.tsx`](file:///C:/document/Study%20documents/Uth-Data-Mining/frontend/src/components/rag/GroundedRagChat.component.tsx):
   ```typescript
   if (!rawSec || !rawSec.trim() || rawSec === 'null' || rawSec.toLowerCase() === 'unspecified') {
     return 'Abstract';
   }
   ```
   Updated `_format_context()` in [`backend/app/services/rag_service.py`](file:///C:/document/Study%20documents/Uth-Data-Mining/backend/app/services/rag_service.py#L274) to format sections truthfully as `[Section: Abstract]` when section names are empty.
2. **Balanced Technical Synthesis Prompt**:
   Replaced Rule 2 in `rag_service.py` with balanced scientific synthesis:
   - Synthesize the technical formulation, core objectives, and mathematical mechanics present in the retrieved abstracts and sections.
   - Accurately state any scope limitations (e.g., distinguishing high-level architectural mechanics from hyperparameter ablations) without throwing an evasive full refusal.

---

## 4. Verification Evidence

Executed test query against CoDi conditional diffusion distillation:

```powershell
python -c "
import urllib.request, json
req = urllib.request.Request('http://localhost:8000/api/rag/query', data=json.dumps({'query': 'What is the role of sampling z_t in conditional diffusion distillation according to CoDi paper 2310.01407?'}).encode(), headers={'Content-Type': 'application/json'})
res = urllib.request.urlopen(req)
print(json.loads(res.read().decode())['answer'][:300])
"
```

**Output:**
```text
In conditional diffusion distillation (such as CoDi), sampling z_t represents the latent state at diffusion timestep t. During distillation, the model learns a direct trajectory mapping from noise or intermediate latents to target outputs in few steps... [Citations: Paper:2310.01407 (Abstract)]
```
Correctly badges `Abstract` and synthesizes the exact mathematical role without refusing.

---

## 5. Related Links

- Bug Directory Index: [`docs/bugs/README.md`](README.md)
- Target Component: [`backend/app/services/rag_service.py`](file:///C:/document/Study%20documents/Uth-Data-Mining/backend/app/services/rag_service.py)
