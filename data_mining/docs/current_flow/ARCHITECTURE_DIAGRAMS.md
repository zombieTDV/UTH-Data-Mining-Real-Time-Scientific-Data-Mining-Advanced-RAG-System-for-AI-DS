# OpenAlex V2 — Architecture Diagrams

---

## Diagram 1: Overall System Architecture

```
                        ┌─────────────────────────────────────────────┐
                        │              USER LAYER                    │
                        │                                              │
                        │   OpenAlexScope.from_years([2024],         │
                        │       subfield_ids=["1203", "1702"])        │
                        └──────────────────┬──────────────────────────┘
                                           │
                                           │ scope + api_key + r2
                                           ▼
                        ┌─────────────────────────────────────────────┐
                        │          COLLECTOR (orchestrator)           │
                        │          src/ingestion/openalex_v2/        │
                        │               collector.py                    │
                        │                                              │
                        │   scope_id = scope_identity(scope)          │
                        │   checkpoint = _resolve_resume()            │
                        │   while True:                              │
                        │       payload = request_openalex()          │
                        │       assert_cursor_invariant()             │
                        │       upload raw JSON.GZ                    │
                        │       upload Parquet                        │
                        │       write commit manifest                 │
                        │       save checkpoint                      │
                        │       mirror to R2                         │
                        └──────┬──────────────┬──────────────┬───────┘
                               │              │              │
            ┌──────────────────┘              │              └──────────────────┐
            ▼                                 ▼                                 ▼
┌───────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────────┐
│  HTTP LAYER           │    │  STORAGE LAYER         │    │  MODEL LAYER           │
│                       │    │                         │    │                         │
│  request.py           │    │  r2_client.py          │    │  scope.py               │
│    └─ client.py       │    │    └─ safe_upload_bytes│    │    └─ OpenAlexScope    │
│    └─ rate_limit.py   │    │                         │    │                         │
│    └─ retry.py        │    │  writer.py              │    │  scope_fingerprint.py  │
│                       │    │    └─ write_parquet_part│    │    └─ scope_identity() │
│  preflight.py         │    │                         │    │                         │
│    └─ request.py     │    │  paths.py               │    │  schema.py              │
│                       │    │    └─ R2 key builder   │    │    └─ 28 columns       │
└───────────────────────┘    └─────────────────────────┘    └─────────────────────────┘
                                                                          │
                                              ┌─────────────────────────────┘
                                              ▼
                        ┌─────────────────────────────────────────────┐
                        │          TRANSACTION LAYER                   │
                        │                                              │
                        │  commit_manifest.py                          │
                        │    └─ PageCommit dataclass                  │
                        │    └─ write_commit_manifest()               │
                        │                                              │
                        │  checkpoint_v2.py                            │
                        │    └─ CheckpointV2 dataclass               │
                        │    └─ save_checkpoint_atomic()              │
                        │    └─ mirror_checkpoint_to_r2()             │
                        │                                              │
                        │  recovery.py                                 │
                        │    └─ reconstruct_state()                    │
                        │    └─ list_commit_objects()                 │
                        │                                              │
                        │  cursor_invariant.py                        │
                        │    └─ assert_cursor_invariant()              │
                        │    └─ 4 CASEs (A,B,C,D)                    │
                        └──────────────────────┬──────────────────────┘
                                               │
                                               ▼
                        ┌─────────────────────────────────────────────┐
                        │          R2 BRONZE STORAGE                   │
                        │                                              │
                        │  bronze/openalex/v2/                       │
                        │    scopes/                                  │
                        │      {scope_id}/                           │
                        │        scope.json                           │
                        │        raw/                                 │
                        │          page-000001.json.gz                │
                        │          page-000002.json.gz                │
                        │        raw_metadata/                        │
                        │          part-000001.parquet                │
                        │          part-000002.parquet                │
                        │        commits/                              │
                        │          page-000001.commit.json             │
                        │          page-000002.commit.json             │
                        │        checkpoints/                         │
                        │          checkpoint.json                     │
                        └─────────────────────────────────────────────┘
```

---

## Diagram 2: Page Transaction Loop

```
                          ┌──────────────────┐
                          │  Start New Page  │
                          │  page_number = N │
                          └────────┬─────────┘
                                   │
                                   ▼
                    ┌────────────────────────────┐
                    │  request_openalex()          │
                    │  cursor = checkpoint.next    │
                    │  url = /works               │
                    └────────────┬─────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────────┐
                    │  HTTP Response             │
                    │  payload = {meta, results} │
                    │  snapshot = RateLimit      │
                    └────────────┬─────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────────┐
                    │  assert_cursor_invariant()  │
                    │  4 CASEs:                 │
                    │  A: CONTINUE               │
                    │  B: TERMINAL_OK            │
                    │  C: INVARIANT_ERROR  ──────► RAISE EXCEPTION
                    │  D: GAP_ERROR        ──────► RAISE EXCEPTION
                    └────────────┬─────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────────┐
                    │  verdict = TERMINAL_OK?     │
                    │  (results empty + next=None)│
                    └────────────┬─────────────────┘
                      Yes         No
                      /             \
                     ▼               ▼
        ┌──────────────────┐  ┌────────────────────────┐
        │ SKIP Parquet      │  │ project_records()      │
        │ (no data)        │  │ Filter to 28 columns  │
        └────────┬─────────┘  └────────────┬───────────┘
                 │                          │
                 └─────────┬────────────────┘
                           │
                           ▼
              ┌────────────────────────────┐
              │  Upload RAW JSON.GZ        │
              │  safe_upload_bytes()       │
              │  SHA256 + metadata         │
              └────────────┬───────────────┘
                           │
                           ▼
              ┌────────────────────────────┐
              │  Upload Parquet           │
              │  write_parquet_part()     │
              │  safe_upload_bytes()       │
              │  SHA256 + metadata         │
              └────────────┬───────────────┘
                           │
                           ▼
              ┌────────────────────────────┐
              │  PageCommit dataclass      │
              │  + write_commit_manifest() │
              │  commits/page-NNN.json      │
              │  ★ DURABILITY CHECKPOINT ★  │
              └────────────┬───────────────┘
                           │
                           ▼
              ┌────────────────────────────┐
              │  Update CheckpointV2      │
              │  page_number = N+1        │
              │  next_cursor = meta.next  │
              │  terminal = verdict       │
              │  sha256 refs updated      │
              └────────────┬───────────────┘
                           │
                           ▼
              ┌────────────────────────────┐
              │  save_checkpoint_atomic() │
              │  temp file + os.replace   │
              │  (atomic on local disk)   │
              └────────────┬───────────────┘
                           │
                           ▼
              ┌────────────────────────────┐
              │  mirror_checkpoint_to_r2() │
              │  checkpoints/checkpoint.json│
              └────────────┬───────────────┘
                           │
                           ▼
              ┌────────────────────────────┐
              │  LOG: PAGE committed       │
              │  VERDICT = TERMINAL_OK?    │
              └────────────┬───────────────┘
                      Yes    No
                      /        \
                     ▼          ▼
              ┌─────────┐  ┌────────────┐
              │ RETURN  │  │ NEXT PAGE  │
              │ COMPLETE│  │ loop again │
              └─────────┘  └────────────┘
```

---

## Diagram 3: Recovery from R2

```
 CASE A: Local checkpoint exists
 ─────────────────────────────
 ┌──────────────────┐
 │ Load checkpoint   │
 │ from disk         │
 └────────┬─────────┘
          │
          ▼
 ┌──────────────────────────┐
 │ scope_fingerprint match? │
 └────────┬─────────────────┘
    Yes         No
    /             \
   ▼               ▼
┌──────────┐  ┌────────────────────────┐
│terminal? │  │ OpenAlexCheckpointMismatch │
└────┬─────┘  │ RAISE — move checkpoint  │
     │        └────────────────────────┘
  Yes   No
   \     /
    \   /
     \ /
      ▼
┌──────────────┐
│ RETURN cp    │
│ (resume)     │
└──────────────┘

 CASE B: Local checkpoint missing
 ─────────────────────────────────
 ┌──────────────────┐
 │ Checkpoint       │
 │ does not exist   │
 └────────┬─────────┘
          │
          ▼
 ┌──────────────────────────────────┐
 │  reconstruct_state(r2, scope_id)  │
 └──────────────┬───────────────────┘
                │
                ▼
 ┌──────────────────────────────────┐
 │  list R2 commits/                 │
 │  scope_id/commits/page-*.json    │
 └──────────────┬───────────────────┘
                │
                ▼
 ┌──────────────────────────────────┐
 │  Parse page numbers, sort        │
 │  pairs = [(1,"k1"),(2,"k2"),   │
 │           (3,"k3"),(5,"k5")]    │
 └──────────────┬───────────────────┘
                │
                ▼
 ┌──────────────────────────────────┐
 │  Find contiguous prefix          │
 │  [1, 2, 3] ←─ gap at 4         │
 │  page_set = {1,2,3,5}           │
 │  expected = 1; loop while        │
 │  expected in page_set            │
 └──────────────┬───────────────────┘
                │
                ▼
 ┌──────────────────────────────────┐
 │  last_page = 3                   │
 │  next_page = 4                  │
 │  gap_detected = True            │
 │  fetch last commit (page 3)     │
 └──────────────┬───────────────────┘
                │
                ▼
 ┌──────────────────────────────────┐
 │  terminal = last_commit.terminal │
 │  last_next = last_commit.next    │
 └──────────────┬───────────────────┘
                │
    ┌───────────┴───────────┐
    ▼                       ▼
 terminal=True?       terminal=False?
    │                       │
    ▼                       ▼
 ┌──────────┐      ┌──────────────────────────┐
 │COMPLETE  │      │ RECOVERED checkpoint     │
 │checkpoint│      │ page = next_page (=4)    │
 └──────────┘      │ cursor = last_next       │
                   │ state = "RECOVERED"      │
                   └──────────────────────────┘
```

---

## Diagram 4: HTTP Retry State Machine

```
┌─────────────────────┐
│  HTTP Request        │
│  attempt = 0          │
└──────────┬──────────┘
           │
           ▼
   ┌──────────────┐
   │ attempt < max? │────── No ──► raise TransientError
   └──────┬─────────┘
          │ Yes
          ▼
┌────────────────────────┐
│  GET /works           │
│  (with throttle sleep) │
└────────┬───────────────┘
         │
    ┌────┴────────────┐
    │                  │
    ▼                  ▼
 200 OK            Status?
    │           ┌─────┼─────┐
    │        401│  403│  429│ 5xx│ 4xx│
    │        │  │    │     │    │    │
    ▼        ▼  ▼    ▼     ▼    ▼    ▼
┌────────┐ ┌────────────────────────────┐
│return  │ │  raise OpenAlexAuthError   │  <- 401/403
│payload │ │  (NO RETRY)               │
└────────┘ └────────────────────────────┘
            │
            │ 429
            ▼
     ┌──────────────────┐
     │ Retry-After      │
     │ header present?  │
     └────┬─────────────┘
       Yes │      No
           │      │
           │      ▼
           │  ┌──────────────────────┐
           │  │ backoff =            │
           │  │ min(60, 1*2^attempt │
           │  │ + jitter)            │
           │  └──────────┬───────────┘
           │             │
           ▼             ▼
      ┌────────────────────────┐
      │ sleep(delay)           │
      │ attempt += 1           │
      └──────────┬─────────────┘
                 │
                 ▼
         ┌──────────────┐
         │attempt < max?│─── No ──► raise TransientError
         └──────────────┘
                 │ Yes
                 ▼
           (loop again)

            │ 5xx
            ▼
     ┌──────────────────┐
     │ attempt += 1     │
     │ backoff + jitter │
     │ sleep(delay)     │
     └────────┬─────────┘
              │
              ▼
        ┌──────────────┐
        │attempt < max?│─── No ──► raise TransientError
        └──────────────┘
              │ Yes
              ▼
        (loop again)
```

---

## Diagram 5: R2 Object Lifecycle

```
Timeline of one page:
═══════════════════════════════════════════════════════════════

  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐
  │ Fetch  │→ │ Validate│→ │ Upload │→ │ Upload │→ │ Commit │
  │  HTTP  │  │ Cursor  │  │  RAW   │  │ Parquet│  │Manifest│
  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘
                                                           │
                                                           ▼
                                              ┌─────────────────────┐
                                              │ ★ DURABLE ★         │
                                              │ Only now is the     │
                                              │ page guaranteed     │
                                              │ to survive crash    │
                                              └─────────────────────┘
                                                           │
                                                           ▼
                                              ┌─────────────────────┐
                                              │ Save Checkpoint     │
                                              │ (atomic)            │
                                              └─────────────────────┘
                                                           │
                                                           ▼
                                              ┌─────────────────────┐
                                              │ Mirror to R2        │
                                              │ (checkpoint backup) │
                                              └─────────────────────┘

CRASH SCENARIOS:
═══════════════════════════════════════════════════════════════

Crash Point A (before Validate):
  → No artifact uploaded → restart → same page → safe

Crash Point B (after Validate, before RAW upload):
  → No artifact → restart → same page → safe

Crash Point C (after RAW upload, before Parquet):
  → RAW in R2, no commit → restart → same page (RAW re-uploaded, no conflict)
  → Safe but idempotent

Crash Point D (after Parquet, before Commit):
  → RAW + Parquet in R2, no commit → restart → same page → safe

Crash Point E (after Commit, before Checkpoint save):
  → All in R2, local checkpoint unchanged
  → Restart → R2 commits detected → resume from R2 → safe

Crash Point F (after Checkpoint save, before Mirror):
  → All in R2 + local checkpoint updated
  → Mirror is just backup → not critical

Crash Point G (after Mirror):
  → Everything durable → restart → terminal checkpoint → return COMPLETE
```

---

## Diagram 6: Layer Dependency Graph

```
Legend: A ──► B  means  "A imports B"

                    schema.py
                       │
                       ▼
                    scope.py
                       │
                       ▼
              scope_fingerprint.py
                       │
                       ▼
                     paths.py
                       │
       ┌──────────────┼──────────────┐
       ▼              ▼              ▼
   client.py     r2_client.py    writer.py
       │              │              │
       │              │              │
       ▼              ▼              ▼
  rate_limit.py   (nothing)     (nothing)
       │
       ▼
    retry.py
       │
       ▼
   request.py ◄────────────┐
       │                   │
       │              preflight.py
       │                   │
       │                   ▼
       │            cursor_invariant.py
       │                   │
       └───────────────────┼─────────────────────┐
                         │                       │
                         ▼                       ▼
              commit_manifest.py         checkpoint_v2.py
                         │                       │
                         │                       │
                         └───────────┬───────────┘
                                     │
                                     ▼
                                  recovery.py
                                     │
                                     ▼
                                collector.py
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
                    ▼                ▼                ▼
              scope.py      cursor_invariant   checkpoint_v2
              preflight.py       │                │
              request.py         │                │
              client.py          │                │
              writer.py          │                │
              r2_client.py       │                │
              paths.py           │                │
              commit_manifest    │                │
                    │            │                │
                    └────────────┴────────────────┘
```

---

## Diagram 7: Preflight Check Flow

```
┌──────────────────────────────────┐
│  run_preflight(scope, api_key)  │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│  Build filter string             │
│  e.g. from_publication_date:... │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│  HTTP GET /works                │
│  per-page=1                     │
│  RetryConfig(max_attempts=3)     │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│  Parse rate-limit headers        │
│  X-RateLimit-Limit              │
│  X-RateLimit-Remaining          │
│  X-RateLimit-Reset              │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│  Read meta.count                │
│  e.g. count = 50000            │
│  estimated_pages = ceil(count/100)│
│  e.g. pages = 500              │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│  estimated_pages > safety_max?   │
│  (default: 50,000)              │
└──────────────┬───────────────────┘
      Yes          No
       │             │
       ▼             ▼
  ┌─────────────┐  ┌──────────────┐
  │ force_large │  │ warnings=[]  │
  │ passed?     │  │ errors=[]     │
  └──────┬──────┘  └──────┬───────┘
    Yes  No          ┌────┴────┐
     │   │            │         │
     ▼   ▼            ▼         ▼
  ┌────┐┌─────────┐ ┌──────────────────┐
  │warn││  error  │ │ PreflightResult  │
  │    ││ added   │ │ {healthy,count,  │
  └────┘└─────────┘ │  pages, budget,  │
                    │  warnings, errors}│
                    └──────────────────┘
```

---

## Diagram 8: V1 vs V2 Architecture Comparison

```
V1 — MONOLITHIC
═══════════════════════════════════════════════════════════════

┌────────────────────────────────────────────────────────────┐
│                    openalex.py (1 file)                     │
│                                                            │
│  + build_headers()     + build_work_filter()              │
│  + clean_work()        + _retry_delay()                   │
│  + request_openalex()  + _year_bounds()                   │
│  + _checkpoint_path()  + _load_checkpoint()               │
│  + _save_checkpoint() + _write_part()                    │
│  + _upload_part()      + _upload_raw_page()               │
│  + collect_year()       + _read_r2_parquet()               │
│  + deduplicate_after_crawl() + collect_openalex()         │
│                                                            │
│  ❌ Schema inferred from page 1                            │
│  ❌ Checkpoint by filter string (not fingerprint)         │
│  ❌ No commit manifest                                     │
│  ❌ No cursor invariant                                    │
│  ❌ No SHA256 metadata                                     │
│  ❌ No R2 conflict detection                               │
│  ❌ No recovery from R2                                   │
└────────────────────────────────────────────────────────────┘


V2 — LAYERED (17 files)
═══════════════════════════════════════════════════════════════

┌────────────────────────────────────────────────────────────┐
│                    collector.py (orchestrator)              │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ MODEL        │ HTTP        │ STORAGE    │ TRANSACTION │ │
│  │ ──────────  │ ──────────  │ ─────────  │ ──────────  │ │
│  │ scope.py     │ client.py   │ r2_client  │ commit_    │ │
│  │ scope_       │ rate_limit  │ _py        │ manifest   │ │
│  │ fingerprint  │ .py        │ writer.py  │ .py        │ │
│  │ .py         │ retry.py    │ paths.py   │ checkpoint  │ │
│  │ schema.py    │ request.py  │            │ _v2.py     │ │
│  │              │ preflight   │            │ recovery.py │ │
│  │              │ .py        │            │ cursor_    │ │
│  │              │             │            │ invariant   │ │
│  │              │             │            │ .py        │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ✅ Explicit schema (28 columns)                           │
│  ✅ Checkpoint by SHA256 fingerprint                       │
│  ✅ Commit manifest per page                               │
│  ✅ 4-case cursor invariant                               │
│  ✅ SHA256 in R2 metadata                                 │
│  ✅ R2 conflict detection                                 │
│  ✅ Recovery from R2 commits                               │
└────────────────────────────────────────────────────────────┘
```
