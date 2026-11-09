# OpenAlex V2 Crawler — Quy Trình Chi Tiết và Kiến Trúc

> **Version:** V2  
> **Trạng thái:** Hoàn thành refactor  
> **Reference:** `src/ingestion/openalex_v2/`

---

## Mục lục

1. [Tong quan](#1-tong-quan)
2. [Kien truc theo tang](#2-kien-truc-theo-tang)
3. [V1 vs V2 so sanh](#3-v1-vs-v2-so-sanh)
4. [Luong du lieu chi tiet](#4-luong-du-lieu-chi-tiet)
5. [Transaction Boundary va Commit Model](#5-transaction-boundary-va-commit-model)
6. [Recovery tu R2](#6-recovery-tu-r2)
7. [Cursor Invariant](#7-cursor-invariant)
8. [Schema va Data Governance](#8-schema-va-data-governance)
9. [R2 Storage Layout](#9-r2-storage-layout)
10. [Fault Tolerance va Testing](#10-fault-tolerance-va-testing)

---

## 1. Tong quan

OpenAlex V2 la mot API ingestion subsystem hoan chinh, thiet ke de thu thap metadata khoa hoc tu OpenAlex Works API mot cach an toan, co kha nang phuc hoi, va co the lap lai.

Quy trinh co ban:

```
OpenAlexScope (filter, date-range, subfields)
       |
       v
  Preflight (kiem tra API key, budget, du kien page count)
       |
       v
  Collect (vong lap theo page)
       |       |       |       |
       v       v       v       v
    HTTP    Cursor   Parquet  Commit
    Request Invariant Writer   Manifest
       |       |       |       |
       +-------+-------+-------+
                   |
                   v
             R2 (Bronze Storage)
                   |
                   v
           Local Checkpoint
```

---

## 2. Kien truc theo tang

### 2.1. Tang 1 — Data Model

| File | Chuc nang |
|------|----------|
| `scope.py` | `OpenAlexScope` dataclass — filter, date-range, subfield_ids, per_page |
| `scope_fingerprint.py` | SHA256 fingerprint tu scope params — dam bao idempotent |
| `schema.py` | Bronze projection 28 cot, explicit, khong infer tu page dau |

**Scope la gi?**

Scope la mot goi nhu cau muon thu thap. Vi du:

```python
scope = OpenAlexScope.from_years([2024], subfield_ids=["1203", "1702"])
```

Sinh ra filter string:

```
from_publication_date:2024-01-01,to_publication_date:2024-12-31,topics.subfield.id:1203|1702
```

**Fingerprint dam bao idempotent:**

Cung scope cung filter cung fingerprint. Chay lai se khong tao namespace moi.

### 2.2. Tang 2 — HTTP Layer

| File | Chuc nang |
|------|----------|
| `client.py` | Shared `httpx.Client` voi timeout 10/60/30/10s, pool 32 connections |
| `rate_limit.py` | Parse 4 header X-RateLimit-*, classify CONTINUE/THROTTLE/HARD_STOP |
| `retry.py` | Backoff exponential + jitter, Retry-After header, khong retry 401/403 |
| `request.py` | Compose: throttle + request + rate-limit-check + retry-loop |
| `preflight.py` | 1-request probe: kiem tra API key, budget, du kien page count |

**Chi tiet cac tang con:**

```
request.py (composer)
    |
    +-- client.py         (httpx.Client factory)
    +-- rate_limit.py     (header parsing + HARD_STOP raise)
    +-- retry.py          (backoff + jitter + decision)
```

**Rate limit policy:**

```
remaining > 200   -> CONTINUE (binh thuong)
remaining <= 200  -> THROTTLE (canh bao nhung cho phep tiep tuc)
remaining <= 0    -> HARD_STOP (raise OpenAlexBudgetExceeded)
```

**Retry policy (plan section 3.10):**

```
429 with Retry-After  -> sleep Retry-After
429 without Retry-After -> backoff: min(60s, 1s * 2^attempt + jitter)
5xx                    -> backoff: cung exponential
401/403                -> raise ngay, KHONG retry (auth error)
4xx khac              -> raise ngay, KHONG retry
network error          -> retry voi backoff
```

### 2.3. Tang 3 — Storage Layer

| File | Chuc nang |
|------|----------|
| `r2_client.py` | `safe_upload_bytes` — PUT + SHA256 + SHA256 conflict check |
| `writer.py` | `write_parquet_part` — atomic write, explicit schema |
| `paths.py` | R2 key builder — tinh toan key cho raw/parquet/commit/checkpoint |

**r2_client.py chi tiet:**

```python
safe_upload_bytes(r2, data=bytes, key=str, content_type=str, metadata=dict)
    -> {"key": str, "sha256": str, "size_bytes": int, "status": str}
```

Conflict check: neu remote SHA256 != local SHA256 thi `status = "CONFLICT"` va raise.

**writer.py chi tiet:**

```python
write_parquet_part(records: list[dict], *, part_path: Path)
    -> None  (ghi truc tiep ra file, dung pyarrow)
```

Dung schema tu `schema.py`, KHONG infer. Page 1 dinh nghia schema, page N (N>1) phai cung schema.

### 2.4. Tang 4 — Transaction & Recovery

| File | Chuc nang |
|------|----------|
| `commit_manifest.py` | `PageCommit` dataclass + `write_commit_manifest` |
| `checkpoint_v2.py` | `CheckpointV2` — fingerprint-bound, atomic save, R2 mirror |
| `recovery.py` | `reconstruct_state` tu R2 commit manifest |
| `collector.py` | Orchestrator — tap hop tat ca tang |

### 2.5. Tang phan quyen

```
collector.py       GOI  scope, preflight, checkpoint_v2, client, cursor_invariant,
                    writer, r2_client, commit_manifest, recovery

request.py         GOI  client, rate_limit, retry  (KHONG goi cursor/schema/writer)

preflight.py       GOI  client, rate_limit, request (KHONG goi cursor/writer/commit)

commit_manifest.py GOI  r2_client, paths             (KHONG goi cursor/schema)

checkpoint_v2.py   GOI  r2_client, paths             (KHONG goi cursor/http)

recovery.py        GOI  r2_client, paths, commit_manifest

writer.py          KHONG goi bat ky module nao trong openalex_v2
                   (chi dung pyarrow, pathlib)

schema.py          KHONG goi bat ky module nao trong openalex_v2
                   (chi la data definition thuan tuy)
```

---

## 3. V1 vs V2 so sanh

### 3.1. Tong quan

| Thuoc tinh | V1 | V2 |
|-----------|-----|-----|
| File count | 1 file | 17 files |
| Scope | Theo year | Bat ky date-range + subfield |
| Checkpoint | Dict JSON | Typed `CheckpointV2` |
| Checkpoint scope check | Chuoi filter so sanh | SHA256 fingerprint |
| Atomic checkpoint | Temp file + os.replace | Temp file + os.replace |
| Checkpoint R2 mirror | Khong co | Co |
| Commit manifest | Khong co | Co |
| Recovery tu R2 | Khong co | Co |
| Cursor invariant | Chi thu 4xx | 4 CASE (A,B,C,D) |
| Schema | Infer tu page 1 | Explicit 28 cot |
| Parquet field | Tat ca field goc | Chi 28 cot projection |
| SHA256 metadata | Khong | Co |
| R2 conflict detection | Khong | Co |
| HTTP retry | Giong nhau | Giong nhau |
| Rate limit headers | Chi 429 | Tat ca 4 header |
| Fault injection tests | Khong | Co |

### 3.2. V1 — Chi tiet van de

**Van de 1: Schema tu page 1**

```python
# V1: _upload_part
schema = _write_part(records, path, schema)  # schema=None -> infer
if schema is None:
    established_schema = table.schema
```

Neu page 1 bi thieu mot field (do API tra thiếu trong 1 record dau tien), schema se khong co field do. Cac page sau se fail.

**Van de 2: Checkpoint chi theo filter string**

```python
# V1: _load_checkpoint
if checkpoint.get("crawl_filter") != crawl_filter:
    raise RuntimeError("...")
```

Neu thay doi thu tu subfield hay format, filter string se khac va checkpoint bi reject. Nhung thay doi do co the khong thay doi du lieu.

**Van de 3: Khong co commit manifest**

Khong co cach xac dinh page nao da commit. Neu gap loi, phai quet toan bo R2 de tim page cuoi cung.

**Van de 4: Khong co cursor invariant**

```python
# V1: chi kiem tra empty
if not results:
    state["complete"] = True
# Van de: co the gap results nhung next_cursor bi loi
if not next_cursor or next_cursor == state["cursor"]:
    state["complete"] = True
```

Neu API tra `next_cursor == current` nhung co results, V1 se danh gia sai thanh COMPLETE. Day la **silent truncation**.

**Van de 5: Khong co SHA256 metadata**

Khong co cach xac minh tinh toan ven cua artifact.

**Van de 6: Khong co R2 conflict detection**

Neu cung key duoc upload 2 lan voi noi dung khac nhau (do bug), se khong co canh bao.

---

## 4. Luong du lieu chi tiet

### 4.1. Tu User den Collect

```
1. User tao OpenAlexScope
       |
       v
2. Optional: goi preflight() de kiem tra API key + budget + page count
       |
       v
3. Goi collect() voi scope, api_key, r2, config, checkpoint_path
       |
       v
4. collect() tu dong tao scope fingerprint + scope_id
       |
       v
5. Upload scope.json len R2 (manifest dau tien)
       |
       v
6. _resolve_resume() kiem tra checkpoint
```

### 4.2. _resolve_resume — Quyet dinh bat dau tu dau

```
_load_checkpoint(local_path)
       |
       v
 Co checkpoint? -----> Co --> fingerprint khop?
       |                           |
       |                      Khop? --> Khong --> raise mismatch
       |                           |
       |                      Co    --> terminal?
       |                           |         |
       |                      Co   --> return  |
       |                           |         v
       |                      Khong ---------> continue
       |
       Khong
       |
       v
reconstruct_state(r2, scope_id)  [tu R2 commits]
       |
       v
 Co commit trong R2? -----> Khong --> return initial checkpoint (page=1, cursor="*")
       |
       Co
       |
       v
 Tim contiguous prefix [1,2,3,4,5...]
       |
       v
 Gap detected? --> Co --> dung tai day, bao warning
       |
       Khong
       |
       v
 Terminal page? --> Co --> return COMPLETE checkpoint
       |
       Khong
       |
       v
 return RECOVERED checkpoint (page=N+1, cursor=last_next_cursor)
```

### 4.3. Page Loop — Buoc thu thap tung page

```
+-- MOI PAGE --+
|              |
v              |
request_openalex(url, params, headers)
    -> payload + RateLimitSnapshot
              |
              v
extract_results(payload)
extract_next_cursor(payload)
              |
              v
assert_cursor_invariant(results, current_cursor, next_cursor)
    -> CursorVerdict (CONTINUE / TERMINAL_OK / INVARIANT_ERROR / GAP_ERROR)
              |
              v
+-- CO YEU CAU PARQUET? --+
|                        |
|  verdict !=            |
|  TERMINAL_OK           |
|                        |
v                        v
project_records()      KHONG
    (chi lay 28 cot   lam gi ca
     theo schema)         |
              |           |
              v           |
       write_parquet_part()|
              |           |
              v           v
       safe_upload_bytes()
           (len R2)
              |
              v
       ArtifactRef(sha256)
              |           |
              v           v
+-- COMMIT MANIFEST --+  |
|                    |  |
|  PageCommit()      |  |
|  -> to_dict()      |  |
|  -> json.dumps()   |  |
|  -> safe_upload    |  |
|                    |  |
+--------------------+  |
              |        |
              v        v
       update checkpoint
       (page_number +1,
        next_cursor,
        terminal flag,
        sha256 refs)
              |
              v
       save_checkpoint_atomic()
       (temp file + os.replace)
              |
              v
       mirror_checkpoint_to_r2()
       (luu checkpoint len R2)
              |
              v
       LOG: OPENALEX-V2 | PAGE=... | RAW=OK | PARQUET=... | CURSOR=... | NEXT=...
              |
              v
       terminal? --> Co --> break loop
              |
              Khong --> tiep tuc next page
```

---

## 5. Transaction Boundary va Commit Model

### 5.1. Commit Boundary theo plan

Mot page duoc coi la **durable** khi va chi khi commit manifest ton tai trong R2.

```
Fetch response
       |
       v
Validate cursor invariant  <-- CHECKPOINT 1: neu fail, abort, khong upload gi
       |
       v
Upload raw JSON.GZ         <-- CHECKPOINT 2: neu fail, retry/raise, khong commit
       |
       v
Verify SHA256
       |
       v
Upload Parquet            <-- CHECKPOINT 3: neu fail, retry/raise, khong commit
       |
       v
Verify SHA256
       |
       v
Write commit manifest     <-- DURABILITY CHECKPOINT
   commits/page-NNN.commit.json
       |
       v
Persist local checkpoint
       |
       v
Mirror checkpoint to R2
```

**Neu crash bat ky buoc nao truoc buoc "Write commit manifest":**

- Checkpoint chua cap nhat page hien tai
- Restart se lay lai checkpoint cu (page cu)
- Page hien tai se duoc thu thap lai

**Neu crash sau buoc "Write commit manifest":**

- Checkpoint da cap nhat page tiep theo
- Restart se tiep tuc tu page tiep theo (co the bi skip page hien tai neu no chua commit)

**Giai phap:** Recovery tu R2 commit manifest se dam bao khong bo sot page nao.

### 5.2. Commit Manifest cau truc

```json
{
  "manifest_version": 1,
  "scope_id": "backfill-2024-01-01-2024-12-31-abc123",
  "run_id": "run-2024-03-15-001",
  "page_number": 1,
  "request_cursor": "*",
  "request_filter": "from_publication_date:2024-01-01,...",
  "request_per_page": 100,
  "request_requested_at": "2024-03-15T00:00:00Z",
  "record_count": 100,
  "next_cursor": "cursor-page-2",
  "terminal": false,
  "raw": {
    "key": "bronze/openalex/v2/scopes/s1/raw/page-000001.json.gz",
    "sha256": "a" * 64,
    "size_bytes": 12345
  },
  "parquet": {
    "key": "bronze/openalex/v2/scopes/s1/raw_metadata/part-000001.parquet",
    "sha256": "b" * 64,
    "size_bytes": 6789
  },
  "rate_limit": {
    "limit": 100000,
    "remaining": 99500,
    "credits_used": 500,
    "reset_seconds": 86400,
    "retry_after_seconds": null
  },
  "schema_version": "openalex-bronze-v1",
  "schema_fingerprint": "abc123def456...",
  "committed_at": "2024-03-15T00:00:00Z"
}
```

### 5.3. Terminal Page

Khi `results = []` va `next_cursor = None`:

- Upload raw JSON.GZ (trong, lai de coi lai)
- KHONG upload Parquet (khong co du lieu)
- Commit manifest co `terminal: true`
- Commit manifest co `parquet: null`

---

## 6. Recovery tu R2

### 6.1. Algorithm (plan section 7.2)

```
1. list tat ca commits/page-*.commit.json trong scope
2. Sort theo page_number tang dan
3. Tim contiguous prefix: [1,2,3,...] (khong co gap)
4. Gap = diem dau tien ma page N+1 khong ton tai
5. Neu gap, dung lai tai page N (bao warning)
6. Neu page cuoi cung co terminal=true -> COMPLETE
7. Nguoc lai, resume tu page N+1 voi cursor cua commit N
```

### 6.2. Gap Detection

```
Commits ton tai: [1, 2, 3, 5, 6]
    -> Contiguous: [1, 2, 3]
    -> Gap detected at page 4
    -> Stop at page 3
    -> Warning: "Gap detected after page 3"
```

### 6.3. Recovery Flow

```
Collector bat dau
       |
       v
Local checkpoint khong ton tai
       |
       v
Goi reconstruct_state(r2, scope_id)
       |
       v
Tim commit cuoi cung trong R2
       |
       v
Xac dinh next_page_to_crawl = last_committed_page + 1
       |
       v
Tiep tuc crawl tu page do
```

---

## 7. Cursor Invariant

### 7.1. 4 CASE theo plan

| Case | results | next_cursor | current_cursor | Hanh dong |
|------|---------|------------|----------------|----------|
| **A** CONTINUE | > 0 | valid != current | * hoac cu | Tiep tuc |
| **B** TERMINAL_OK | = 0 | None | bat ky | Ket thuc OK |
| **C** INVARIANT_ERROR | > 0 | == current | bat ky | Raise! |
| **D** GAP_ERROR | = 0 | != None | bat ky | Raise! |

### 7.2. Case C — Silent Truncation

**Xay ra khi nao?**

OpenAlex API gap loi tra ve `next_cursor == current_cursor` nhung van co results. Vi du:

```
Request:  cursor="abc123"
Response: results=[W1,W2,...], meta.next_cursor="abc123"
```

Day la loi nguoc cua OpenAlex. Neu tiep tuc, se lap vo han.

**V1 xu ly:**

```python
if not next_cursor or next_cursor == state["cursor"]:
    state["complete"] = True  # SAI! Dinh gia sai thanh COMPLETE
```

**V2 xu ly:**

```python
verdict = assert_cursor_invariant(results, current_cursor, next_cursor)
if verdict is CursorVerdict.INVARIANT_ERROR:
    raise OpenAlexCursorInvariantError("...")
```

### 7.3. Case D — Unexpected Empty Page

**Xay ra khi nao?**

API tra ve `results = []` nhung `next_cursor != None`. Day bat thuong.

**V2 xu ly:**

```python
if verdict is CursorVerdict.GAP_ERROR:
    raise OpenAlexCursorInvariantError("Gap page: empty results with valid next_cursor")
```

---

## 8. Schema va Data Governance

### 8.1. Bronze Schema v1 — 28 cot

```python
BRONZE_COLUMNS_V1 = {
    # Provenance
    "_scope_id": pa.string(),
    "_run_id": pa.string(),
    "_page_number": pa.int32(),
    "_schema_version": pa.string(),
    "_schema_fingerprint": pa.string(),

    # Identity
    "id": pa.string(),
    "doi": pa.string(),

    # Work metadata
    "display_name": pa.string(),
    "title": pa.string(),
    "publication_year": pa.int32(),
    "publication_date": pa.string(),
    "type": pa.string(),
    "openalex_type": pa.string(),
    "language": pa.string(),
    "cited_by_count": pa.int64(),
    "count": pa.int64(),
    "is_openalex": pa.bool_(),
    "primary_location": pa.string(),

    # Authorship
    "authorships": pa.string(),
    "authorships_count": pa.int32(),

    # Classification
    "topics": pa.string(),
    "topics_json": pa.string(),
    "concepts": pa.string(),
    "keywords": pa.string(),

    # Venue
    "primary_topic": pa.string(),
    "host_venue": pa.string(),
    "source": pa.string(),

    # Relations
    "related_works": pa.string(),
    "referenced_works": pa.string(),

    # Abstract
    "abstract_inverted_index": pa.string(),
}
```

**Luu y:**

- `topics_json` la JSON string cua topics array — cho phep lay chi tiet neu can.
- Cac field nhu `abstract_inverted_index` van duoc giu nhu string (khong parse).
- `_schema_fingerprint` cho phep truy van chinh xac schema nao da sinh ra file.

### 8.2. Schema Policy

```
1. Schema duoc dinh nghia TRUOC trong schema.py
2. Khong infer tu page 1
3. Neu page 1 khong co field X, cot X van ton tai trong schema (null)
4. Neu page N co them field Y, cot Y van ton tai nhung null
```

---

## 9. R2 Storage Layout

### 9.1. V2 Namespace

```
bronze/openalex/v2/
  scopes/
    {scope_id}/
      scope.json                        # Scope manifest (filter, params, versions)
      raw/
        page-000001.json.gz            # Full API response, gzip
        page-000002.json.gz
        ...
      raw_metadata/
        part-000001.parquet            # Parquet with 28-column projection
        part-000002.parquet
        ...
      commits/
        page-000001.commit.json        # Transaction boundary
        page-000002.commit.json
        ...
      checkpoints/
        checkpoint.json                 # Latest checkpoint (local + R2 mirror)
```

### 9.2. V1 Namespace (khong bi thay doi)

```
bronze/openalex/
  raw_metadata/
    {year}/
      part-00001.parquet
      ...
  raw/
    {year}/
      page-00001.json.gz
      ...
  manifests/
    openalex_checkpoint.json
    openalex_dedup_keys.json
```

**V1 va V2 hoan toan bi tach rieng.** Chay V2 khong anh huong V1.

### 9.3. Key Properties

- **Deterministic:** cung page cung key — idempotent uploads
- **Scope-isolated:** scope khac nhau khong chia se key
- **Versioned:** V2 trong namespace `v2/`, khong trung voi V1
- **Timestamps:** moi object co `last_modified` tu R2

---

## 10. Fault Tolerance va Testing

### 10.1. Test Scenarios

| Scenario | Mo ta | Expected |
|---------|-------|----------|
| Happy path | 2 page + 1 terminal | COMPLETE, 3 commits |
| 429 retry | API tra 429 roi 200 | Tu dong retry, tong hop |
| Auth error | 401 tra ve | Raise ngay, khong retry |
| Budget exhausted | remaining=0 | Raise HARD_STOP |
| Transient 5xx | API tra 503 | Retry 3 lan roi raise |
| 404 | Endpoint khong ton tai | Raise ngay, khong retry |
| Crash after commit | R2 commit nhung local checkpoint that lac | Resume tu R2 |
| Silent truncation | next_cursor == current_cursor | Raise INVARIANT_ERROR |
| Empty page with next | results=[] nhung next!=None | Raise GAP_ERROR |
| Idempotency | Thu lai cung scope | Khong tao duplicate |

### 10.2. Mock Strategy

```
HTTP:  httpx.MockTransport (thay thec httpx.Client)
R2:    FakeR2 (in-memory dict thay the S3)
```

### 10.3. Crash Simulation

```python
def crashing_save(*args, **kwargs):
    raise RuntimeError("SIMULATED CRASH")
```

Patch `save_checkpoint_atomic` de raise o buoc checkpoint nhung sau commit. Verify rang R2 van co commit nhung local checkpoint chua cap nhat.

### 10.4. Commit Order Verification

```
1. Fetch     -> payload
2. Validate  -> assert_cursor_invariant  [CRASH HERE -> restart tu checkpoint cu]
3. Upload RAW                   [CRASH HERE -> restart tu checkpoint cu]
4. Verify SHA256
5. Upload Parquet               [CRASH HERE -> raw da upload nhung commit chua]
6. Verify SHA256
7. Write commit manifest         [CRASH HERE -> commit da write, checkpoint chua update]
8. Update checkpoint (in-memory)
9. Save checkpoint (atomic)      [CRASH HERE -> checkpoint da write nhung page chua commit]
10. Mirror to R2
```

---

## Phu luc A — Cac Module Theo Thu Tu Phu Thuoc

```
schema.py                   (khong phu thuoc)
    |
scope.py                    (khong phu thuoc)
    |
scope_fingerprint.py        (phu thuoc scope.py)
    |
paths.py                   (khong phu thuoc)
    |
client.py                  (khong phu thuoc)
    |
rate_limit.py              (khong phu thuoc)
    |
retry.py                   (khong phu thuoc)
    |
r2_client.py               (khong phu thuoc)
    |
writer.py                  (khong phu thuoc)
    |
request.py                 (phu thuoc client, rate_limit, retry)
    |
cursor_invariant.py        (khong phu thuoc)
    |
preflight.py               (phu thuoc client, request)
    |
commit_manifest.py         (phu thuoc paths, r2_client, rate_limit)
    |
checkpoint_v2.py           (phu thuoc paths, r2_client)
    |
recovery.py                (phu thuoc paths, r2_client, commit_manifest)
    |
collector.py               (phu thuoc tat ca)
```

---

## Phu luc B — CheckpointV2 Schema

```python
@dataclass
class CheckpointV2:
    checkpoint_version: int      # = 2
    scope_fingerprint: str        # SHA256(scope params)
    scope_id: str                # human-readable ID
    layout_version: str           # = "v2"
    schema_version: str          # = "openalex-bronze-v1"
    field_policy_version: str    # = "v1"
    collector_version: str       # = "v2"
    run_id: str                  # UUID cua run nay

    state: str                   # PENDING | RUNNING | COMPLETE | RECOVERED
    page_number: int             # page tiep theo de thu thap
    next_cursor: Optional[str]    # cursor cho page tiep theo
    terminal: bool               # da gap terminal page chua

    last_uploaded_sha_raw: Optional[str]
    last_uploaded_sha_parquet: Optional[str]
    last_updated: str            # ISO timestamp

    @property
    def is_resumable(self) -> bool:
        return not self.terminal and self.next_cursor is not None
```

---

## Phu luc C — Cac Loi Co The Xay Ra

| Loi | Nguyen nhan | Hanh dong |
|-----|-----------|----------|
| `OpenAlexBudgetExceeded` | remaining=0 | HARD_STOP, khong retry |
| `OpenAlexAuthError` | 401/403 | Raise ngay, khong retry |
| `OpenAlexCursorInvariantError` | CASE C hoac D | Raise, page khong commit |
| `OpenAlexCheckpointMismatch` | Checkpoint fingerprint khac scope | Raise, can di chuyen checkpoint |
| `RuntimeError` (R2 conflict) | SHA256 khong khop | Raise, kiem tra tay |
| `RuntimeError` (transient) | 5xx hoac network | Retry voi backoff |

---

## Phu luc D — Logging Format

```
OPENALEX-V2 | SCOPE={scope_id} | PAGE={page_number:06d} | +{record_count} |
    RAW={OK/CONFLICT} | PARQUET={OK/SKIP/CONFLICT} | CURSOR={short} | NEXT={short}
```

Vi du:

```
OPENALEX-V2 | SCOPE=backfill-2024-01-01-2024-12-31-abc123 | PAGE=000001 | +100 |
    RAW=OK | PARQUET=OK | CURSOR=START | NEXT=abc...xyz
```

---

## Phu luc E — Recovery Checklist

Neu may chet giua chung:

```
1. [ ] Khoi dong lai collector
2. [ ] Chi ra checkpoint_path (hoac dung mac dinh)
3. [ ] collector tu dong:
    a. Load local checkpoint
    b. Kiem tra fingerprint
    c. Neu mismatch -> raise
    d. Neu local missing -> goi reconstruct_state()
    e. reconstruct_state() quet R2 commits
    f. Tim contiguous prefix
    g. Xac dinh next page
    h. Tiep tuc tu day
4. [ ] Verify: tat ca commit deu ton tai trong R2
5. [ ] Verify: checkpoint duoc update sau moi page
6. [ ] Verify: terminal page co commit manifest voi terminal=true
```
