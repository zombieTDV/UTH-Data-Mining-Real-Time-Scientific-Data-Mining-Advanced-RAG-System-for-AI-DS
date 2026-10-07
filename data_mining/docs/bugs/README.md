# OpenAlex Bronze Collector

Module hỗ trợ crawl dữ liệu từ **OpenAlex Works API** và lưu trữ dữ liệu phục vụ cho **Bronze Layer** trên Cloudflare R2.

Module hiện tập trung vào thu thập metadata theo từng năm, hỗ trợ resume bằng checkpoint, lưu đồng thời dữ liệu raw và dữ liệu metadata dạng Parquet, đồng thời duy trì khả năng dừng tiến trình an toàn bằng `KeyboardInterrupt`.

## 1. Mục tiêu

Pipeline dùng OpenAlex làm một nguồn dữ liệu đầu vào cho Bronze Layer, với hai dạng dữ liệu được lưu song song:

```text
OpenAlex API
    │
    ├── Full API response
    │       └── JSON.GZ
    │
    └── results[]
            └── clean_work()
                    └── Parquet
```

Cấu trúc lưu trữ trên R2:

```text
bronze/openalex/
├── raw/
│   └── {year}/
│       ├── page-00001.json.gz
│       ├── page-00002.json.gz
│       └── ...
│
├── raw_metadata/
│   └── {year}/
│       ├── part-00001.parquet
│       ├── part-00002.parquet
│       └── ...
│
└── manifests/
    └── openalex_dedup_keys.json
```

Trong đó:

- `raw/{year}/page-xxxxx.json.gz` giữ **toàn bộ response envelope** từ OpenAlex, gồm:
  - `meta`
  - `results`
  - `group_by`
- `raw_metadata/{year}/part-xxxxx.parquet` chứa các Work trong `results[]` sau bước loại bỏ những field không cần thiết theo policy hiện tại.
- Một `page-xxxxx.json.gz` và một `part-xxxxx.parquet` có cùng số thứ tự để có thể trace ngược giữa raw response và metadata đã xử lý.

## 2. Workflow crawl

Workflow hiện tại chạy theo từng năm.

```text
Chọn year
   │
   ▼
Build OpenAlex filter
   │
   ▼
GET /works
   │
   ├── per-page = 100
   └── cursor pagination
   │
   ▼
Nhận response
{
    meta,
    results,
    group_by
}
   │
   ├──────────────────────────────────┐
   │                                  │
   ▼                                  ▼
Lưu full response                Lấy results[]
JSON.GZ                               │
   │                                  ▼
   │                              clean_work()
   │                                  │
   │                                  ▼
   │                               Parquet
   │                                  │
   └──────────────┬───────────────────┘
                  ▼
             Upload lên R2
                  │
                  ▼
       Cả hai artifact thành công
                  │
                  ▼
          Lưu next_cursor vào
          checkpoint local
                  │
                  ▼
             Trang tiếp theo
```

### Thứ tự đảm bảo dữ liệu

Checkpoint chỉ được cập nhật sau khi các artifact cần thiết của page hiện tại đã được upload thành công.

Đối với page có dữ liệu:

```text
Raw JSON.GZ upload OK
        ↓
Parquet upload OK
        ↓
Persist checkpoint
        ↓
Next cursor
```

Đối với terminal page có `results=[]`:

```text
Raw JSON.GZ upload OK
        ↓
Không tạo Parquet rỗng
        ↓
Đánh dấu year complete
        ↓
Persist checkpoint
```

Điều này giúp tránh trường hợp checkpoint đã tiến sang cursor mới nhưng dữ liệu của page trước chưa được lưu đầy đủ.

## 3. Resume và checkpoint

Checkpoint được lưu ở local, trong thư mục được truyền qua `--checkpoint-dir`.

Checkpoint chứa trạng thái crawl của từng năm, bao gồm:

- cursor hiện tại;
- part number tiếp theo;
- trạng thái hoàn thành của year;
- hash của artifact đã upload gần nhất;
- thời điểm cập nhật gần nhất.

Khi chạy lại pipeline với cùng crawl scope, collector đọc checkpoint và tiếp tục từ cursor đã lưu thay vì crawl lại từ đầu.

Checkpoint được ghi theo cơ chế atomic write:

```text
temporary file
    ↓
os.replace()
    ↓
checkpoint chính
```

## 4. Retry và giới hạn request

Collector có cơ chế throttle và retry cho OpenAlex API.

Hiện tại:

- giới hạn client-side ở khoảng `5 requests/second`;
- timeout mỗi request: `30 seconds`;
- retry tối đa theo cấu hình của module;
- retry đối với:
  - timeout;
  - network error;
  - HTTP `5xx`;
  - HTTP `429` trong trường hợp có thể retry.

Nếu OpenAlex báo daily budget đã hết, collector dừng thay vì tiếp tục retry không cần thiết. Checkpoint durable gần nhất vẫn được giữ nguyên để tiếp tục ở lần chạy sau.

## 5. KeyboardInterrupt

Có thể dừng collector bằng:

```bash
Ctrl+C
```

Khi nhận `KeyboardInterrupt`:

- pipeline ghi log trạng thái interrupt;
- không ghi lại state đang xử lý dở;
- không advance cursor;
- giữ nguyên checkpoint durable gần nhất;
- không chạy deduplication;
- exception được re-raise để tiến trình kết thúc đúng trạng thái.

Ví dụ:

```text
OPENALEX | INTERRUPTED | Last durable checkpoint preserved
```

Nếu interrupt xảy ra sau khi một artifact đã upload nhưng checkpoint chưa được cập nhật, lần chạy sau có thể fetch lại cùng page và overwrite cùng object key. Cách này ưu tiên khả năng phục hồi và tránh mất dữ liệu.

## 6. Deduplication

Deduplication chỉ chạy sau khi toàn bộ các year được chọn đã hoàn thành.

Registry được tạo dựa trên OpenAlex Work ID và được lưu tại:

```text
bronze/openalex/manifests/openalex_dedup_keys.json
```

Registry hiện lưu tối thiểu:

```json
{
  "openalex_id": "...",
  "doi": "..."
}
```

Nếu crawl bị interrupt hoặc một year chưa hoàn thành, bước deduplication sẽ không chạy.

## 7. Cách sử dụng

Chạy collector bằng entry point hiện tại của module.

Ví dụ crawl mặc định từ 2017 đến 2026:

```bash
python <openalex_entrypoint>.py
```

Crawl một số năm cụ thể:

```bash
python <openalex_entrypoint>.py --years 2023,2024,2025
```

Crawl một năm:

```bash
python <openalex_entrypoint>.py --years 2024
```

Chỉ kiểm tra cấu hình và scope, không thực hiện network write:

```bash
python <openalex_entrypoint>.py --years 2024 --dry-run
```

Chỉ định thư mục checkpoint riêng:

```bash
python <openalex_entrypoint>.py \
  --years 2024 \
  --checkpoint-dir data/manifests
```

## 8. CLI arguments

### `--years`

```text
--years 2023,2024,2025
```

Danh sách year cần crawl, phân tách bằng dấu phẩy.

Mặc định:

```text
2017-2026
```

Tương ứng parser:

```python
parser.add_argument(
    "--years",
    type=_parse_years,
    default=tuple(range(2017, 2027)),
    help="Comma-separated years to crawl (default: 2017-2026).",
)
```

### `--checkpoint-dir`

```text
--checkpoint-dir <path>
```

Thư mục dùng để lưu:

- resumable checkpoint;
- local dedup registry.

Mặc định:

```python
settings.MANIFEST_DIR
```

Tương ứng parser:

```python
parser.add_argument(
    "--checkpoint-dir",
    type=Path,
    default=settings.MANIFEST_DIR,
    help="Directory for the resumable checkpoint and local dedup registry.",
)
```

### `--dry-run`

```text
--dry-run
```

Chỉ validate configuration và hiển thị crawl scope đã chọn, không thực hiện network write.

Tương ứng parser:

```python
parser.add_argument(
    "--dry-run",
    action="store_true",
    help="Validate configuration and print the selected scope without network writes.",
)
```

## 9. Logging

Pipeline sử dụng logging riêng cho OpenAlex collector:

```python
_, log_file = setup_pipeline_logging(
    pipeline_name="openalex_collector",
)
```

Log crawl được rút gọn theo dạng:

```text
OPENALEX | YEAR=2024 | PART=00124 | +100 | RAW=OK | PARQUET=OK | CURSOR=... | NEXT=...
```

Mục tiêu là theo dõi được:

- year đang crawl;
- page/part hiện tại;
- số lượng Work nhận được;
- trạng thái upload raw;
- trạng thái upload Parquet;
- cursor hiện tại;
- next cursor.

## 10. Hạn chế hiện tại

Các hạn chế dưới đây đã được xác định và dự kiến xử lý ở bước tiếp theo.

### 10.1. Crawl scope hiện chỉ hỗ trợ theo year

Hiện collector chỉ hỗ trợ crawl theo một hoặc nhiều **year cố định**, ví dụ:

```text
2023
2024
2025
```

Chưa hỗ trợ trực tiếp crawl theo arbitrary date range như:

```text
2024-03-01 -> 2024-03-31
```

hoặc chỉ một ngày:

```text
2024-03-15
```

Ở bước tiếp theo có thể parameterize `start_date` và `end_date`, đồng thời tách namespace R2 và checkpoint để custom date range không overwrite dữ liệu annual crawl.

### 10.2. Chưa xử lý trường hợp mất checkpoint local

Hiện tại khả năng resume phụ thuộc vào checkpoint local.

Nếu checkpoint bị mất nhưng dữ liệu raw và Parquet của year đó vẫn còn trên R2, collector chưa tự reconstruct được cursor từ các artifact đã tồn tại.

Hướng tối ưu ở bước sau:

- kiểm tra các cặp artifact đã tồn tại trên R2;
- xác định page lớn nhất có đầy đủ:
  - `raw/{year}/page-xxxxx.json.gz`;
  - `raw_metadata/{year}/part-xxxxx.parquet`;
- đọc `meta.next_cursor` từ raw response tương ứng;
- reconstruct checkpoint để tiếp tục crawl mà không cần bắt đầu lại toàn bộ year.

## 11. Trạng thái hiện tại

Module hiện phù hợp cho workflow:

```text
OpenAlex
    ↓
year-based crawl
    ↓
raw JSON.GZ
    +
cleaned Parquet
    ↓
Cloudflare R2 Bronze
    ↓
resumable checkpoint
    ↓
post-crawl dedup registry
```

Các bước tiếp theo tập trung vào mở rộng crawl scope theo date range và tăng khả năng recovery khi checkpoint local bị mất.
