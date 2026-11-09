# PLAN — Improve OpenAlex API Crawl Pipeline (API-only)

> **Project:** UTH Data Mining — Real-Time Scientific Data Mining & Advanced RAG for AI/DS  
> **Scope của plan:** chỉ tối ưu **luồng crawl OpenAlex bằng API** và các thành phần trực tiếp phục vụ API ingestion: scope, request, pagination, rate limit, retry, checkpoint, R2 Bronze, schema, integrity, dedup/source registry, recovery, logging, testing.  
> **Không nằm trong scope hiện tại:** HTML scraping, PDF crawling từ publisher, OpenReview/CORE/Springer/Wiley/IEEE, Silver/Gold/RAG refactor, embedding, retrieval, UI.

---

# 0. Mục tiêu của đợt improve

Collector hiện tại **đang chạy ổn** và đã có các đặc tính tốt: cursor pagination, raw JSON.GZ + Parquet song song, atomic local checkpoint, checkpoint chỉ advance sau upload, bounded retry, xử lý `429/5xx`, dừng an toàn bằng `KeyboardInterrupt`.

Mục tiêu của đợt tiếp theo **không phải viết lại từ đầu**, mà là biến collector hiện tại thành một API ingestion subsystem có các thuộc tính:

1. **Correctness-first** — không silent truncate, không silent overwrite sai scope, không bỏ sót page vì checkpoint.
2. **Recoverable** — mất checkpoint local vẫn phục hồi được từ R2.
3. **Idempotent** — chạy lại cùng page/scope không sinh dữ liệu sai hoặc duplicate logic.
4. **Scope-safe** — arbitrary date range, một ngày, một năm, nhiều năm đều không đè namespace của nhau.
5. **Versioned & reproducible** — biết chính xác query/filter/schema/code policy nào đã sinh ra artifact.
6. **Budget-aware** — theo dõi OpenAlex credits/rate-limit và dừng có kiểm soát trước khi tạo lỗi hàng loạt.
7. **Schema-safe** — schema Parquet không phụ thuộc ngẫu nhiên vào page đầu tiên.
8. **Observable** — có metrics, run manifest, page commit manifest, failure context.
9. **Testable** — có unit/contract/fault-injection tests cho các trạng thái lỗi quan trọng.
10. **Backward compatible** — không phá dữ liệu Bronze hiện tại và không bắt buộc re-crawl toàn bộ ngay lập tức.

---

# 1. Baseline hiện tại cần giữ nguyên về mặt ý tưởng

Luồng đang có:

```text
Chọn year
   ↓
Build OpenAlex filter
   ↓
GET /works
   ├── per-page = 100
   └── cursor pagination
   ↓
Response {meta, results, group_by}
   ├─────────────────────────────┐
   ↓                             ↓
Raw response                     results[]
JSON.GZ                          clean_work()
   │                             ↓
   │                           Parquet
   └──────────────┬──────────────┘
                  ↓
                R2
                  ↓
      Raw + Parquet thành công
                  ↓
          persist checkpoint
                  ↓
             next cursor
```

Các nguyên tắc **phải bảo toàn**:

- Full API response vẫn là **source-of-truth của Bronze**.
- `raw/page-N.json.gz` và representation metadata có khả năng trace ngược.
- Không advance cursor trước khi artifact của page hiện tại durable.
- `KeyboardInterrupt` không làm mất durable checkpoint.
- OpenAlex ID vẫn là source-level identity chính.
- API key không được log.
- R2 vẫn là Bronze storage chính.
- API collector vẫn dùng `cursor` chứ không chuyển sang page offset cho result set lớn.

---

# 2. Những hạn chế đã được README xác nhận

## 2.1. Scope hiện chỉ theo year

README đã xác định collector hiện chỉ nhận:

```text
2023
2024
2025
```

nhưng chưa nhận:

```text
2024-03-01 → 2024-03-31
```

hoặc:

```text
2024-03-15
```

Điểm quan trọng khi sửa: date-range mới **không được reuse namespace** của annual crawl nếu scope khác nhau.

---

## 2.2. Resume phụ thuộc checkpoint local

Nếu checkpoint local mất nhưng R2 còn:

```text
raw/{year}/page-N.json.gz
raw_metadata/{year}/part-N.parquet
```

collector chưa thể tự xác định durable page cuối và `next_cursor`.

Đây là hạn chế cần xử lý nhưng **không nên chỉ scan tên file rồi đoán**. Bản improve nên đưa vào một **page commit manifest** để R2 tự trở thành nguồn recovery đáng tin cậy.

---

# 3. Audit bổ sung từ source code hiện tại

> Các mục dưới đây chia thành:
>
> - **CONFIRMED**: đọc trực tiếp từ source hiện tại.
> - **RISK**: hành vi có thể gây lỗi trong điều kiện nhất định; cần test/fault injection trước khi kết luận là bug production.

---

## 3.1. P0 — End date đang hard-code và đã có nguy cơ stale

**CONFIRMED**

Source hiện có:

```python
OPENALEX_START_DATE = "2017-06-01"
OPENALEX_END_DATE = "2026-09-30"
```

CLI cũng giới hạn year trong `2017..2026`.

Hậu quả:

- paper từ sau `2026-09-30` không thể vào crawl mặc định;
- mỗi lần sang ngày/năm mới phải sửa source;
- không phù hợp mục tiêu near-real-time.

### Hướng sửa

Không hard-code `END_DATE` cho current/future crawl.

Thiết kế:

```text
--start-date YYYY-MM-DD
--end-date   YYYY-MM-DD
```

và shorthand:

```text
--years 2023,2024
```

Trong đó:

- `--years` chỉ là syntactic sugar tạo các date partition;
- `end_date` mặc định có thể là `today UTC`;
- historical lower bound (`2017-06-01`) có thể giữ như một business/config constraint, không phải hard-coded routing.

---

## 3.2. P0 — `next_cursor == current_cursor` đang bị xem là “complete”

**CONFIRMED**

Hiện tại logic:

```python
if not next_cursor or next_cursor == state["cursor"]:
    state["complete"] = True
```

Nếu API bất thường trả:

```text
results != []
next_cursor == current_cursor
```

collector sẽ kết luận scope đã hoàn tất.

Đây là **silent truncation risk**.

### Rule mới

Chỉ coi terminal hợp lệ khi invariant hợp lệ:

```text
CASE A
results == []
AND next_cursor is null
→ TERMINAL_OK
```

Các case khác:

```text
results != [] AND next_cursor is null
→ INVARIANT_ERROR

results != [] AND next_cursor == current_cursor
→ CURSOR_STALL_ERROR

results == [] AND next_cursor != null
→ INVARIANT_ERROR
```

Không được biến anomaly thành `complete=True`.

---

## 3.3. P0 — Schema Parquet đang phụ thuộc page đầu tiên

**CONFIRMED**

Hiện tại:

```python
table = pa.Table.from_pylist(records, schema=schema)
```

và `schema` được lấy từ page đầu tiên.

Rủi ro:

- field chỉ xuất hiện từ page sau có thể không được biểu diễn đúng;
- nested field/type thay đổi có thể gây Arrow incompatibility;
- null-only field ở page đầu có thể tạo type không phù hợp;
- schema evolution từ OpenAlex không được version hóa.

### Hướng sửa

Không để “page đầu tiên quyết định schema”.

Thiết kế **OpenAlex Bronze Projection Schema v1**:

```text
raw JSON.GZ
= full-fidelity source truth

raw_metadata Parquet
= versioned projection
```

Cần định nghĩa rõ:

- field nào được giữ;
- field nào serialize JSON;
- field nào nullable;
- kiểu Arrow của từng field;
- `field_policy_version`;
- `schema_version`;
- `schema_fingerprint`.

Nếu chưa muốn canonical hóa mạnh, nested/volatile fields có thể lưu:

```text
<field>_json: string
```

thay vì để Arrow tự inference cấu trúc thay đổi.

---

## 3.4. P0 — Dedup scan có giới hạn 1000 objects

**CONFIRMED**

`R2Client.list_objects()`:

```python
def list_objects(..., max_keys: int = 1000)
```

`deduplicate_after_crawl()` gọi mà không truyền limit.

Trong config đã có:

```python
OPENALEX_DEDUP_MAX_OBJECTS_PER_YEAR = 100_000
```

nhưng hiện chưa được dùng.

Khi một year có >1000 Parquet parts, registry cuối có thể không đọc toàn bộ parts.

### Fix tối thiểu

- bỏ implicit 1000 cap cho internal iterator;
- thêm `iter_objects(prefix)` yield toàn bộ paginator;
- nếu vẫn cần safety limit, limit phải explicit từ caller và log khi truncate.

### Thiết kế tốt hơn

Không rescan toàn bộ heavy Parquet chỉ để lấy:

```text
id
doi
```

Nên tạo source-ID index incremental hoặc đọc column projection.

---

## 3.5. P0/P1 — “Dedup registry” hiện không phải true dedup theo DOI

**CONFIRMED**

Registry hiện key theo:

```text
OpenAlex Work ID
```

DOI chỉ là metadata đi kèm.

Vì vậy tên đúng về semantics nên là:

```text
OpenAlex source ID registry
```

không phải global/cross-source dedup.

### Plan

Giai đoạn API-only hiện tại:

- giữ uniqueness theo OpenAlex `id`;
- rename concept/documentation cho đúng;
- DOI cross-source canonical dedup để phase multi-source sau.

---

## 3.6. P1 — Local checkpoint fingerprint chưa đủ mạnh

**CONFIRMED**

Checkpoint hiện check chủ yếu bằng `crawl_filter`.

Nhưng reproducibility còn phụ thuộc:

```text
per_page
subfield semantics
EXCLUDED_FIELDS / field policy
schema_version
collector_version
API base URL
scope dates
layout_version
```

Nếu đổi một trong các biến trên nhưng reuse checkpoint, artifact set có thể trở thành mixed-policy dataset.

### Thiết kế mới

Tạo canonical scope document:

```json
{
  "source": "openalex",
  "entity": "works",
  "start_date": "...",
  "end_date": "...",
  "subfield_ids": ["..."],
  "subfield_mode": "topics.subfield.id",
  "per_page": 100,
  "field_policy_version": "v1",
  "schema_version": "v1",
  "layout_version": "v2"
}
```

Tính:

```text
scope_fingerprint = SHA256(canonical_json)
scope_id = first 12-16 chars + human slug
```

Checkpoint phải bind vào fingerprint này.

---

## 3.7. P1 — Raw Bronze hiện có thể bị overwrite

**CONFIRMED về key design; RISK về mất history**

Keys hiện deterministic:

```text
raw/{year}/page-00001.json.gz
raw_metadata/{year}/part-00001.parquet
```

Nếu checkpoint mất hoặc rerun scope, object cùng key có thể bị overwrite.

Điều này tiện cho recovery, nhưng không đúng nghĩa “immutable Bronze” tuyệt đối nếu upstream response đã thay đổi.

### Policy cần chốt

**Không silent overwrite khi content khác.**

Algorithm:

```text
target key chưa tồn tại
→ upload

target key tồn tại + SHA256 giống
→ idempotent skip

target key tồn tại + SHA256 khác
→ CONFLICT
→ không overwrite
→ write conflict artifact/quarantine
→ stop scope để audit
```

Từ đó vừa giữ idempotency vừa bảo vệ Bronze.

---

## 3.8. P1 — SHA hiện mới là local integrity hash, chưa verify remote content

**CONFIRMED**

`upload_file()` upload trước, sau đó tính SHA-256 local và return.

Nhưng object metadata trên R2 chưa lưu SHA-256, và chưa `HEAD` verify:

```text
ContentLength
x-amz-meta-sha256
```

Không nên dùng ETag làm SHA-256 vì multipart upload có semantics khác.

### Improve

Khi upload:

```text
Metadata:
  sha256=<hash>
  schema_version=<...>
  source=openalex
```

Sau upload:

```text
HEAD object
→ size == local_size
→ metadata.sha256 == expected_sha
```

Chỉ sau remote verification mới page có thể COMMIT.

---

## 3.9. P1 — Mỗi API page đang có khả năng tạo một HTTP client mới

**CONFIRMED**

`request_openalex()` tạo:

```python
httpx.Client(...)
```

nếu caller không truyền `client`.

`collect_openalex()` hiện không tạo một shared client để pass xuống.

Hậu quả:

- không tận dụng connection pooling/keep-alive tối ưu;
- handshake/network overhead cao;
- khó centralize transport configuration.

### Improve

Một collector run:

```text
with httpx.Client(...) as http_client:
    crawl all scopes/pages using same client
```

Cấu hình:

```text
connect timeout
read timeout
pool limits
User-Agent
Authorization
```

Rate limiter vẫn độc lập.

---

## 3.10. P1 — Retry chưa có jitter và chưa adaptive theo budget/latency

**CONFIRMED**

Fallback hiện:

```text
1, 2, 4, 8, ...
```

Không jitter.

### Improve

Priority:

1. nếu có `Retry-After` → tôn trọng server;
2. nếu không → capped exponential backoff + jitter;
3. track consecutive 429/5xx;
4. giảm request rate khi error rate tăng;
5. phục hồi rate từ từ khi ổn định.

Ví dụ:

```text
delay = min(cap, base * 2^attempt)
sleep = random(0, delay)
```

Không tăng mặc định lên gần OpenAlex maximum. `5 req/s` hiện tại là conservative và có thể giữ làm default.

---

## 3.11. P1 — Daily budget handling còn brittle

**CONFIRMED**

Hiện code so sánh:

```python
remaining == "0"
```

Header parsing nên robust hơn.

### Improve

Parse rate-limit headers về numeric:

```text
X-RateLimit-Limit
X-RateLimit-Remaining
X-RateLimit-Credits-Used
X-RateLimit-Reset
```

Policy:

```text
remaining <= hard_stop_threshold
→ persist state
→ graceful stop

remaining <= soft_threshold
→ lower request rate
→ log budget warning
```

Không cần đợi 429 mới biết sắp hết budget.

---

## 3.12. P1 — Chưa có preflight estimate trước một crawl lớn

**RISK**

Trước khi chạy một range lớn, collector chưa trả lời:

```text
ước tính bao nhiêu records?
ước tính bao nhiêu pages?
daily budget hiện còn đủ không?
scope này có quá lớn cho API không?
```

### Add `--preflight`

Preflight có network nhưng **không write data**:

```text
validate API key
check /rate-limit
request scope with minimal page
read meta.count
estimate page count
estimate required list requests/credits
print R2 namespace + scope fingerprint
```

`--dry-run` hiện tại vẫn giữ semantics **không network write**, có thể giữ hoàn toàn offline.

---

## 3.13. P1 — API cursor không nên dùng mù cho dataset cực lớn

OpenAlex documentation cảnh báo cursor pagination phù hợp với result set lớn nhưng không nên dùng để tải “toàn bộ OpenAlex”; bulk snapshot phù hợp hơn cho full mirror.

Trong phase này user yêu cầu **API-only**, nên không đổi sang snapshot, nhưng phải thêm guardrail:

```text
if estimated_pages > configured_api_safety_threshold:
    warn strongly / require --force-large-api-crawl
```

Mục tiêu là tránh accidental API mirror.

---

## 3.14. P1 — Current pipeline là historical publication crawl, chưa phải true update sync

**CONFIRMED**

Filter hiện dùng:

```text
from_publication_date
to_publication_date
```

Cách này lấy work theo publication date.

Nó **không đảm bảo** phát hiện một Work cũ được OpenAlex cập nhật hôm nay.

### Hai mode phải tách rõ

#### Mode A — BACKFILL

```text
publication date range
```

Dùng cho historical corpus.

#### Mode B — SYNC

Nếu account/plan có premium sync filters:

```text
from_updated_date
```

→ poll changes và upsert by OpenAlex ID.

Nếu không có entitlement:

- không được quảng bá “full OpenAlex real-time sync”;
- chỉ có thể làm rolling publication window + periodic historical reconciliation;
- ghi rõ limitation: updates/deletions của record cũ có thể không được bắt đầy đủ bằng publication-date API crawl.

---

## 3.15. P1 — Deletion/merge semantics chưa được xử lý

OpenAlex record có thể:

```text
deleted
merged-away
```

API sync bằng `from_updated_date` chỉ trả các record còn tồn tại; deleted/merged-away record có thể chỉ biểu hiện bằng 404 nếu gọi ID cũ.

Trong API-only phase:

- không cố giải quyết deletion toàn dataset bằng một cơ chế giả;
- document limitation;
- giữ `last_seen_at` và source ID;
- nếu một known ID cần refresh mà trả 404 → mark `source_status=deleted_or_merged`;
- full deletion reconciliation để phase sync/snapshot riêng sau này.

---

## 3.16. P1 — `topics.subfield.id` semantics phải được explicit

Current filter:

```text
topics.subfield.id
```

nghĩa là Work match nếu **một assigned topic** thuộc subfield.

Nó khác:

```text
primary_topic.subfield.id
```

### Plan

Thêm config:

```text
OPENALEX_SUBFIELD_MODE=any_topic | primary_topic
```

Default ban đầu giữ:

```text
any_topic
```

để không thay đổi scope hiện tại.

Nhưng README/run manifest phải ghi rõ semantic này.

---

## 3.17. P2 — 100 records/Parquet part tạo small-file problem

**CONFIRMED**

Mỗi API page 100 results → một Parquet file.

Khi một year có hàng nghìn page sẽ có hàng nghìn small Parquet objects.

### Không sửa ở Phase P0

Vì current 1:1 mapping giúp debugging/recovery rất rõ.

### Phase sau

Giữ:

```text
Raw JSON.GZ = 1 API page / object
```

nhưng metadata Parquet có thể:

```text
buffer 20-100 pages
→ 2,000-10,000 records/file
```

và page commit manifest map:

```text
page range → parquet key
```

Hoặc giữ raw_metadata hiện tại và chỉ chạy post-crawl compaction.

Không optimize small files trước khi correctness/recovery hoàn tất.

---

## 3.18. P2 — Post-crawl registry hiện rất tốn I/O/memory khi scale

Current algorithm:

```text
list all parquet
→ download each full Parquet
→ to_pylist()
→ global dict
→ one giant JSON registry
```

Scale lớn sẽ:

- download nhiều nested fields không cần thiết;
- dùng RAM lớn;
- tạo một manifest JSON rất lớn;
- phải làm lại từ đầu nếu crawl mở rộng.

### Improve

Source registry nên incremental và columnar:

```text
id
doi
partition/scope
first_seen_at
last_seen_at
```

Lưu Parquet/DuckDB/SQLite local-state tùy phase.

Không build giant JSON array làm primary registry.

---

## 3.19. P2 — Temp directory cleanup có thể che lỗi gốc

**RISK**

Current:

```python
staging_root.rmdir()
```

Nếu còn file do lỗi bất ngờ, `rmdir()` có thể ném exception khác trong cleanup.

### Improve

Dùng:

```python
with tempfile.TemporaryDirectory(...) as tmp:
```

hoặc cleanup best-effort không mask original exception.

---

## 3.20. P0/P1 — Hiện chưa có automated tests cho OpenAlex collector

**CONFIRMED trong snapshot source đã audit**

Không thấy test file cho collector.

Đây là lý do các lỗi hidden như:

```text
cursor stall
missing checkpoint
R2 partial upload
429 budget
schema drift
```

rất khó phát hiện trước production.

Testing là một phần bắt buộc của plan.

---

# 4. Kiến trúc OpenAlex API Collector V2 đề xuất

```text
CLI / Scheduler
      │
      ▼
Scope Builder
      │
      ├── annual scope
      ├── arbitrary date range
      └── sync window
      │
      ▼
Scope Fingerprint / Scope ID
      │
      ▼
Preflight
      ├── auth
      ├── rate-limit budget
      ├── meta.count
      └── estimated pages
      │
      ▼
Checkpoint Resolver
      │
      ├── local checkpoint valid?
      │       └── YES → resume
      │
      └── NO
              ↓
        R2 commit manifests
              ↓
        reconstruct state
      │
      ▼
Long-lived HTTP Client
      │
      ▼
Rate Limiter
      │
      ▼
Request + Retry + Backoff + Jitter
      │
      ▼
Response Validation
      │
      ├── envelope/meta/results valid
      ├── cursor invariant valid
      └── budget headers captured
      │
      ▼
Raw Serialization
      │
      ▼
Compute SHA-256
      │
      ▼
Safe R2 Upload
      │
      ├── missing → upload
      ├── same hash → idempotent skip
      └── different hash → conflict/stop
      │
      ▼
Parquet Projection vN
      │
      ▼
Safe R2 Upload + Remote Verify
      │
      ▼
Page Commit Manifest
      │
      ▼
Atomic Local Checkpoint
      │
      ▼
R2 Checkpoint Mirror
      │
      ▼
Next Cursor
      ↺
```

---

# 5. R2 Layout V2

Không overwrite layout v1 ngay lập tức.

Đề xuất:

```text
bronze/openalex/v2/
└── scopes/
    └── {scope_id}/
        ├── scope.json
        ├── raw/
        │   └── page-000001.json.gz
        ├── raw_metadata/
        │   └── part-000001.parquet
        ├── commits/
        │   └── page-000001.commit.json
        ├── checkpoints/
        │   └── checkpoint.json
        ├── conflicts/
        └── manifests/
            ├── run-{run_id}.json
            └── source_registry.parquet
```

`scope.json` phải chứa:

```json
{
  "scope_id": "...",
  "scope_fingerprint": "...",
  "entity": "works",
  "mode": "backfill",
  "start_date": "2024-03-01",
  "end_date": "2024-03-31",
  "subfield_mode": "topics.subfield.id",
  "subfield_ids": ["..."],
  "per_page": 100,
  "schema_version": "openalex-bronze-v1",
  "field_policy_version": "v1",
  "collector_version": "v2"
}
```

---

# 6. Page Commit Manifest — thành phần quan trọng nhất cho recovery

Sau khi raw và Parquet được upload + remote verify, tạo:

```text
commits/page-000123.commit.json
```

Ví dụ:

```json
{
  "scope_id": "...",
  "run_id": "...",
  "page_number": 123,

  "request": {
    "cursor": "...",
    "filter": "...",
    "per_page": 100,
    "requested_at": "..."
  },

  "response": {
    "record_count": 100,
    "next_cursor": "...",
    "terminal": false
  },

  "raw": {
    "key": "...",
    "sha256": "...",
    "size_bytes": 123456
  },

  "parquet": {
    "key": "...",
    "sha256": "...",
    "size_bytes": 45678,
    "row_count": 100,
    "schema_fingerprint": "..."
  },

  "rate_limit": {
    "remaining": 0,
    "reset_seconds": 0,
    "credits_used": 0
  },

  "committed_at": "..."
}
```

### Commit order

```text
Fetch response
   ↓
Validate
   ↓
Upload RAW
   ↓
verify RAW
   ↓
Write/upload Parquet
   ↓
verify Parquet
   ↓
Write PAGE COMMIT manifest
   ↓
Persist local checkpoint
   ↓
Mirror checkpoint to R2
```

**Page chưa có commit manifest = page chưa durable về mặt logical transaction.**

---

# 7. Recovery V2

## 7.1. Normal resume

```text
local checkpoint
→ validate scope fingerprint
→ validate referenced commit manifest
→ resume next_cursor
```

---

## 7.2. Local checkpoint mất

```text
checkpoint local missing
        ↓
list commits/
        ↓
find highest contiguous committed page
        ↓
read its next_cursor
        ↓
rebuild checkpoint
        ↓
resume
```

Không chỉ lấy `max(page_number)`.

Phải tìm **contiguous chain**:

```text
1,2,3,4,5 = OK
1,2,3,5   = GAP → stop at 3
```

---

## 7.3. Legacy v1 recovery

Cho dữ liệu hiện có chưa có commit manifests:

```text
scan raw + raw_metadata
        ↓
find largest N where:
  raw/N exists
  parquet/N exists
        ↓
validate hashes/row count nếu có thể
        ↓
read raw/N.meta.next_cursor
        ↓
create v2 reconstructed checkpoint
```

Terminal page cần xử lý riêng:

```text
raw/N exists
results == []
next_cursor == null
parquet/N absent
→ valid terminal commit
```

Sau khi reconstruct, có thể sinh commit manifests retroactively cho v1 artifacts mà **không re-crawl**.

---

# 8. Scope Model V2

Tạo class/data structure:

```text
OpenAlexScope
```

Fields:

```text
mode
start_date
end_date
subfield_ids
subfield_mode
per_page
```

Validation:

```text
start_date <= end_date
end_date <= today UTC
subfield_ids not empty
len(OR values) <= OpenAlex limit
per_page == 100
```

CLI:

```bash
# Annual shorthand
python -m ... --years 2024

# Date range
python -m ... --start-date 2024-03-01 --end-date 2024-03-31

# One day
python -m ... --date 2024-03-15
```

Mutual exclusion:

```text
--years
vs
--date
vs
--start-date/--end-date
```

---

# 9. Request Layer V2

## 9.1. Long-lived client

Một run dùng một `httpx.Client`.

## 9.2. Explicit timeout model

Tách:

```text
connect timeout
read timeout
write timeout
pool timeout
```

thay vì chỉ một số tổng quát nếu cần debug.

## 9.3. Error taxonomy

Không quăng tất cả thành `RuntimeError`.

Tạo các exception:

```text
OpenAlexAuthError
OpenAlexBudgetExceeded
OpenAlexRateLimited
OpenAlexTransientError
OpenAlexProtocolError
OpenAlexCursorInvariantError
OpenAlexSchemaError
OpenAlexR2ConflictError
OpenAlexRecoveryError
```

Việc này giúp CLI/log quyết định:

```text
retry?
stop?
quarantine?
manual intervention?
```

---

# 10. Rate Limit & Budget Strategy

Default hiện tại:

```text
5 req/s
```

giữ nguyên trong Phase đầu.

Không có lý do tăng tốc trước khi đo.

### Mỗi response capture

```text
X-RateLimit-Limit
X-RateLimit-Remaining
X-RateLimit-Credits-Used
X-RateLimit-Reset
```

### Thresholds

```text
soft budget threshold
→ warning + optional throttle

hard budget threshold
→ graceful stop after durable page commit
```

### 429 handling

```text
429
  ↓
daily budget exhausted?
  ├── YES → graceful stop
  └── NO
        ↓
Retry-After?
  ├── YES → sleep exact/at least indicated duration
  └── NO  → exponential backoff + jitter
```

---

# 11. API Response Validation

Trước khi upload processed artifact:

```text
payload is dict?
meta is dict?
results is list?
```

Mỗi non-empty page:

```text
all accepted result items are dict?
OpenAlex id present?
```

Không nên drop silently record không phải dict mà không metric.

Metrics:

```text
received_count
valid_work_count
invalid_work_count
```

Nếu invalid ratio vượt threshold → stop page.

---

# 12. Cursor Invariant State Machine

```text
FETCHED_PAGE
    │
    ├── results > 0
    │      │
    │      ├── next_cursor valid & != current
    │      │       → CONTINUE
    │      │
    │      └── missing/same
    │              → ERROR, NOT COMPLETE
    │
    └── results == 0
           │
           ├── next_cursor is null
           │       → TERMINAL
           │
           └── next_cursor exists
                   → ERROR
```

Checkpoint state enum:

```text
PENDING
RUNNING
COMPLETE
PAUSED_BUDGET
FAILED
INTERRUPTED
RECOVERED
```

---

# 13. Parquet Schema V2

Không cần biến Bronze thành Silver.

Mục tiêu chỉ là **stable columnar projection**.

Ví dụ nhóm field:

```text
IDENTITY
id
doi
ids

BIBLIOGRAPHY
display_name
title
publication_year
publication_date
type
language

AUTHORSHIP
authorships

VENUE/LOCATION
primary_location
locations
best_oa_location
open_access

TOPIC
primary_topic
topics
keywords

CITATION
cited_by_count
referenced_works
related_works

PROVENANCE
created_date
updated_date
```

Các nested field dễ drift có thể serialize canonical JSON.

Thêm columns local:

```text
_ingested_at
_source="openalex"
_scope_id
_run_id
_page_number
_schema_version
```

### Abstract

`abstract_inverted_index` hiện bị exclude.

Không bắt buộc đổi ngay, nhưng cần quyết định rõ:

- raw JSON vẫn giữ abstract inverted index;
- Parquet projection:
  - hoặc giữ inverted index;
  - hoặc reconstruct abstract;
  - hoặc bỏ có chủ đích.

Policy phải versioned, không để implicit.

---

# 14. Safe R2 Upload / Idempotency

Pseudo-flow:

```text
serialize file
    ↓
sha256 local
    ↓
HEAD target
    │
    ├── 404
    │      → upload with sha metadata
    │
    └── exists
           │
           ├── remote sha == local sha
           │      → SKIP_OK
           │
           └── remote sha != local sha
                  → CONFLICT
                  → no overwrite
                  → preserve both evidence
                  → stop page
```

Nếu old v1 object không có `sha256` metadata:

```text
download/HEAD size + optional compute remote hash
```

chỉ dùng cho recovery/migration, không áp dụng mỗi normal page.

---

# 15. Source Registry / Dedup V2

Trong OpenAlex-only phase:

```text
identity = OpenAlex Work ID
```

Registry cần:

```text
openalex_id
doi
scope_id
first_seen_at
last_seen_at
latest_updated_date
last_page_commit
```

Không cần giant JSON.

Đề xuất:

```text
source_registry.parquet
```

hoặc local DuckDB/SQLite state store + periodic R2 checkpoint.

### DOI

DOI chỉ làm secondary lookup.

Không merge hai OpenAlex IDs chỉ vì DOI giống nhau trong Bronze crawler mà chưa audit merge semantics.

Cross-source dedup để phase multi-source.

---

# 16. Small-file Strategy

## V2.0 — giữ 1 page ↔ 1 Parquet để giảm migration risk

Ưu tiên correctness.

## V2.1 — sau khi tests ổn

Chọn một:

### Option A — Post-crawl compaction

```text
100-row parts
→ compact into 10k-100k row Parquet
```

Raw parts vẫn giữ.

### Option B — buffered metadata writer

```text
20-100 API pages
→ 1 Parquet
```

Page commit manifest map page → row range / parquet file.

Khuyên **Option A trước** vì ít thay đổi online ingestion hơn.

---

# 17. Incremental / Near-real-time API Mode

Không trộn backfill và sync vào cùng checkpoint.

## 17.1. Backfill scope

```text
mode=backfill
from_publication_date
to_publication_date
```

Namespace:

```text
scope/backfill_<dates>_<fingerprint>
```

## 17.2. Sync scope nếu API plan hỗ trợ

```text
mode=sync
from_updated_date=<last_sync - overlap>
```

Flow:

```text
last_successful_sync
      ↓
subtract overlap window
      ↓
from_updated_date
      ↓
cursor crawl changed Works
      ↓
upsert by id
      ↓
commit sync watermark
```

Overlap giúp tránh boundary/timing issue.

Nếu không có premium sync filter:

```text
system capability = publication-backfill + rolling-window ingestion
```

không claim full update synchronization.

---

# 18. Preflight Mode

Command:

```bash
python -m ... --start-date ... --end-date ... --preflight
```

Output:

```text
Scope ID
Filter
Subfield mode
Date range
Estimated records
Estimated pages
Current API budget
Estimated API request cost
R2 target prefix
Checkpoint status
Existing commit count
Resume page
Warnings
```

Guard:

```text
estimated pages > API safety threshold
→ require explicit --force-large-api-crawl
```

---

# 19. Logging V2

Giữ human-readable log hiện tại:

```text
OPENALEX | SCOPE=... | PAGE=... | +100 | RAW=OK | PARQUET=OK
```

Thêm structured context:

```text
run_id
scope_id
page_number
record_count
request_latency_ms
upload_latency_ms
remaining_budget
retry_count
current_rps
raw_sha
parquet_sha
```

Secrets/cursor đầy đủ không log; chỉ short cursor.

---

# 20. Metrics bắt buộc

## API

```text
requests_total
requests_success
requests_429
requests_5xx
retries_total
request_latency_p50/p95
credits_remaining
```

## Data

```text
records_received
records_valid
records_invalid
pages_committed
pages_skipped_idempotent
r2_conflicts
schema_errors
```

## Recovery

```text
checkpoint_resume_count
r2_reconstruction_count
recovered_pages
checkpoint_gap_count
```

## Throughput

```text
records/sec
pages/min
bytes_raw
bytes_parquet
```

---

# 21. Test Plan

Không merge V2 nếu thiếu các test dưới đây.

## 21.1. Unit tests

### Scope

- valid one-day scope
- valid arbitrary range
- start > end rejected
- year shorthand generates expected dates
- scope fingerprint deterministic
- different subfield list produces different fingerprint
- different field policy produces different fingerprint

### Filter

- `topics.subfield.id`
- `primary_topic.subfield.id`
- OR encoding stable

### Retry

- `Retry-After`
- no Retry-After → jittered backoff
- max retry reached
- auth fail no retry
- budget stop no useless retry

### Cursor invariant

- non-empty + valid next → continue
- empty + null → terminal
- non-empty + null → error
- non-empty + same → error
- empty + non-null → error

### Schema

- nullable field appears late
- nested field changes
- unknown field handled by policy
- excluded-field policy deterministic

---

## 21.2. Contract tests với `httpx.MockTransport`

Fixture pages:

```text
page1 → page2 → terminal
```

Verify:

```text
raw keys
parquet keys
commit manifests
checkpoint cursor
record counts
```

---

## 21.3. Fault injection tests

### Crash after raw upload, before Parquet

Expected:

```text
no commit
checkpoint unchanged
rerun safely reuses/validates raw
```

### Crash after Parquet, before commit

Expected:

```text
no checkpoint advance
recovery does not falsely consider page durable
```

### Crash after commit, before local checkpoint

Expected:

```text
R2 reconstruct detects commit
resume from next_cursor
```

### Local checkpoint deleted

Expected:

```text
reconstruct from contiguous R2 commits
```

### R2 object same key + different hash

Expected:

```text
conflict
no overwrite
collector stops safely
```

### 429 + budget remaining

Expected retry.

### 429 + budget exhausted

Expected graceful stop after current durable state.

---

## 21.4. Integration smoke test

Scope rất nhỏ:

```text
1 day
1-2 subfields
```

Check:

```text
API → raw → parquet → commit → checkpoint → resume → terminal
```

Run lần hai phải:

```text
0 destructive overwrite
0 duplicate logical page
```

---

# 22. Migration Strategy — bảo vệ crawl hiện đang chạy

Collector hiện đang chạy ổn, do đó **không thay source giữa một live crawl**.

## Step M0 — Freeze

Trước refactor:

```text
git commit/tag current collector
copy local checkpoint
record R2 prefix
record current part/cursor
record settings
```

## Step M1 — Không sửa namespace V1

Giữ:

```text
bronze/openalex/raw/
bronze/openalex/raw_metadata/
```

read-only sau khi V1 kết thúc.

## Step M2 — V2 dùng namespace mới

```text
bronze/openalex/v2/scopes/
```

Không đụng V1.

## Step M3 — Legacy recovery tool

Tool read-only:

```text
V1 raw + parquet + checkpoint
→ audit
→ generate recovery report
```

Không tự upload/mutate nếu chưa `--apply`.

## Step M4 — Optional migration

Sau khi test:

```text
generate V2 commit manifests pointing to V1 artifacts
```

để không cần re-crawl historical pages.

---

# 23. Thứ tự triển khai khuyến nghị

## Phase 0 — Baseline & safety

- freeze current branch;
- backup checkpoint;
- record current run state;
- add tests around current behavior trước refactor.

**DoD:** có thể chạy regression test không cần network/R2 thật.

---

## Phase 1 — Correctness P0

1. remove static end-date routing;
2. date-range scope;
3. cursor invariant;
4. fix R2 list object truncation;
5. explicit scope fingerprint;
6. explicit Parquet schema policy v1.

**DoD:** không có silent complete khi cursor anomaly; arbitrary date range chạy được.

---

## Phase 2 — HTTP reliability

1. shared `httpx.Client`;
2. RequestError taxonomy;
3. Retry-After;
4. exponential backoff + jitter;
5. rate-limit header parser;
6. budget-aware graceful stop;
7. preflight.

**DoD:** test 429/5xx/network/budget đều deterministic.

---

## Phase 3 — Durable transaction & recovery

1. safe upload;
2. remote SHA metadata;
3. page commit manifest;
4. R2 checkpoint mirror;
5. reconstruct from commits;
6. legacy v1 reconstruction.

**DoD:** xóa checkpoint local rồi vẫn resume đúng page.

---

## Phase 4 — Registry & data-quality hardening

1. source registry semantics;
2. incremental registry;
3. invalid record metrics;
4. schema fingerprint;
5. audit manifest.

**DoD:** không cần full re-scan all Parquet để biết source IDs.

---

## Phase 5 — Incremental freshness

1. backfill mode separate;
2. sync mode using `from_updated_date` nếu entitlement cho phép;
3. overlap window;
4. `last_seen_at`;
5. 404 known ID state;
6. document deletion/merge limitation.

**DoD:** one sync window can be rerun idempotently.

---

## Phase 6 — Performance

Chỉ thực hiện sau correctness:

- small-file compaction;
- concurrent CPU compression nếu cần;
- adaptive throttle;
- profiling R2 upload;
- optional batch/column projection optimizations.

**DoD:** throughput tăng nhưng artifact semantics không đổi.

---

# 24. File-level Change Plan

Không cần tạo hết class ngay từ đầu, nhưng target architecture có thể là:

```text
src/ingestion/openalex/
├── client.py
├── scope.py
├── pagination.py
├── checkpoint.py
├── recovery.py
├── schema.py
├── writer.py
├── registry.py
├── metrics.py
└── collector.py
```

Nếu chưa muốn tách module lớn, tối thiểu refactor current `openalex.py` thành các component logically testable.

### `src/config/settings.py`

Thêm:

```text
OPENALEX_BACKOFF_BASE
OPENALEX_BACKOFF_CAP
OPENALEX_BUDGET_SOFT_THRESHOLD
OPENALEX_BUDGET_HARD_THRESHOLD
OPENALEX_API_SAFETY_MAX_PAGES
OPENALEX_LAYOUT_VERSION
OPENALEX_SCHEMA_VERSION
OPENALEX_FIELD_POLICY_VERSION
OPENALEX_SUBFIELD_MODE
```

Không hard-code current end date.

### `src/storage/r2_client.py`

Thêm:

```text
head_object_metadata()
iter_objects()
safe_upload_file()
verify_object()
```

Giữ `list_objects()` để backward compatibility nhưng không dùng cho unbounded scan.

### `run_openalex_collector.py`

CLI mới:

```text
--years
--date
--start-date
--end-date
--mode backfill|sync
--preflight
--dry-run
--recover
--force-large-api-crawl
```

---

# 25. Backward Compatibility Rules

1. V1 artifacts **không rename, không move, không overwrite hàng loạt**.
2. V2 reader có thể đọc V1, nhưng V1 writer không cần hiểu V2.
3. Checkpoint version:
   ```text
   checkpoint_version=2
   ```
4. Nếu gặp checkpoint v1:
   - parse bằng migrator;
   - không silently convert in place;
   - write `*.v2.json` mới.
5. `--dry-run` tiếp tục không network write.
6. Current `--years` command vẫn dùng được.

---

# 26. Những thứ KHÔNG nên optimize lúc này

Không nên đồng thời:

- thêm async 50-100 concurrent requests;
- tăng RPS chỉ vì OpenAlex cho phép mức cao hơn;
- chuyển toàn bộ Bronze schema;
- merge OpenAlex với arXiv;
- tải PDF;
- làm cross-source dedup;
- rewrite master pipeline;
- thay R2;
- thêm Kafka.

Lý do: sẽ làm mất khả năng xác định regression đến từ đâu.

Thứ tự đúng:

```text
Correctness
→ Recovery
→ Observability
→ Incremental freshness
→ Performance
```

---

# 27. Verification với OpenAlex API hiện tại

Plan này được đối chiếu lại với OpenAlex API documentation hiện hành:

1. `per_page=100` là supported maximum chính thức.
2. Result >10,000 phải dùng cursor pagination.
3. API key có thể gửi bằng bearer token — code hiện tại phù hợp.
4. Response có rate-limit headers để budget-aware logic sử dụng.
5. OpenAlex khuyên exponential backoff cho `429`.
6. OpenAlex cảnh báo không dùng cursor API để mirror toàn dataset; snapshot phù hợp hơn cho full mirror.
7. `from_publication_date` / `to_publication_date` hỗ trợ arbitrary date range.
8. `from_updated_date` là sync mechanism cho changed records trên paid plans.
9. `topics.subfield.id` match any assigned topic; `primary_topic.subfield.id` có semantics khác.
10. API-only sync không tự báo đầy đủ deleted/merged-away records; cần document/reconciliation strategy riêng.

---

# 28. Acceptance Criteria cuối cùng

Collector V2 chỉ được xem là hoàn thành khi đạt tất cả:

### Correctness

- [ ] Date range bất kỳ chạy được.
- [ ] One-day scope chạy được.
- [ ] Không còn static `2026-09-30`.
- [ ] Cursor stall không bị đánh dấu complete.
- [ ] Empty page invariant được validate.
- [ ] Schema Parquet không phụ thuộc page đầu.

### Idempotency

- [ ] Rerun committed page không tạo dữ liệu khác.
- [ ] Existing same hash → skip.
- [ ] Existing different hash → conflict, không overwrite.

### Recovery

- [ ] Local checkpoint mất vẫn reconstruct từ R2.
- [ ] Crash tại mọi commit boundary đều resume được.
- [ ] Legacy V1 recovery được test.

### API reliability

- [ ] Shared HTTP client.
- [ ] Retry-After.
- [ ] Backoff + jitter.
- [ ] Budget header parsing.
- [ ] Graceful budget stop.
- [ ] Preflight count/pages/budget.

### Storage

- [ ] Raw JSON.GZ full envelope còn nguyên.
- [ ] Parquet projection versioned.
- [ ] Remote SHA metadata verified.
- [ ] Page commit manifest đầy đủ.
- [ ] Scope namespace không collision.

### Testing

- [ ] Unit tests.
- [ ] MockTransport contract tests.
- [ ] Fault-injection tests.
- [ ] Small live integration test.
- [ ] Resume test.
- [ ] Duplicate/idempotency test.

### Documentation

- [ ] README cập nhật V2 workflow.
- [ ] README phân biệt backfill vs sync.
- [ ] README giải thích subfield semantics.
- [ ] README ghi rõ API-only deletion limitation.
- [ ] README ghi rõ large-crawl guardrail.

---

# 29. Workflow mục tiêu sau improve

```text
DEFINE SCOPE
    ↓
BUILD SCOPE FINGERPRINT
    ↓
PREFLIGHT
    ├── Auth
    ├── Budget
    ├── Estimated count
    └── Estimated pages
    ↓
RESOLVE CHECKPOINT
    ├── Local
    └── Reconstruct from R2 commits
    ↓
OPEN LONG-LIVED HTTP CLIENT
    ↓
RATE LIMIT
    ↓
GET /works
    ↓
VALIDATE RESPONSE + CURSOR INVARIANTS
    ↓
SERIALIZE FULL RAW
    ↓
SAFE UPLOAD RAW + VERIFY HASH
    ↓
BUILD VERSIONED PARQUET PROJECTION
    ↓
SAFE UPLOAD PARQUET + VERIFY HASH
    ↓
WRITE PAGE COMMIT MANIFEST
    ↓
PERSIST LOCAL CHECKPOINT
    ↓
MIRROR CHECKPOINT TO R2
    ↓
NEXT CURSOR
    ↺
TERMINAL PAGE
    ↓
FINAL RUN MANIFEST
    ↓
SOURCE REGISTRY UPDATE
    ↓
COMPLETE
```

---

# 30. Quyết định kỹ thuật tôi khuyên chốt

Nếu mục tiêu là **improve mà không phá luồng đang hoạt động**, thứ tự ưu tiên cụ thể là:

```text
P0.1  Date-range + bỏ static end date
P0.2  Cursor invariant
P0.3  Fix object-list truncation
P0.4  Explicit schema

P1.1  Scope fingerprint
P1.2  Page commit manifest
P1.3  R2 checkpoint recovery
P1.4  Safe upload + remote SHA
P1.5  Shared HTTP client
P1.6  Budget-aware retry/backoff

P2.1  Source registry redesign
P2.2  Sync mode
P2.3  Structured metrics
P2.4  Legacy migration

P3.1  Small-file compaction
P3.2  Adaptive throughput
```

Không nên bắt đầu bằng performance.

**Collector hiện tại đã có nền tốt. Việc quan trọng nhất của V2 là biến các assumption đang ngầm tồn tại thành invariant có test, manifest và recovery path rõ ràng.**

---

# 31. Go / No-Go trước khi sửa code

## GO nếu

- current crawl đã dừng ở durable checkpoint hoặc hoàn thành current partition;
- checkpoint được backup;
- branch/tag baseline đã tạo;
- R2 prefix hiện tại được coi read-only;
- có test fixtures.

## NO-GO nếu

- collector đang giữa một page và chưa xác định durable state;
- chưa backup checkpoint;
- sẽ sửa trực tiếp branch đang crawl;
- dự định đổi namespace/schema/checkpoint cùng lúc mà không có migration test.

---

# 32. Kết luận

V1 hiện đã đúng ở phần quan trọng nhất:

```text
API cursor
→ raw + Parquet
→ durable checkpoint
→ resume
```

V2 không cần phá kiến trúc đó.

Nâng cấp đúng hướng là:

```text
V1
+
date-range scope
+
scope identity
+
cursor invariants
+
stable schema
+
safe immutable upload
+
page commit manifest
+
R2-based recovery
+
budget-aware HTTP client
+
automated fault-injection tests
+
optional update-sync mode
```

Sau các phase trên, OpenAlex API crawler sẽ đạt mức phù hợp để làm **production-grade research ingestion** cho Bronze Layer: có thể resume, audit, reproduce, kiểm soát API budget, phát hiện hidden failure thay vì silent complete, và làm nền an toàn cho các bước Data Mining/RAG phía sau.
