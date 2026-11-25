# Chương 6: Triển Khai Hạ Tầng, Bảo Mật & Vận Hành

- **Motivation/Background**: Một hệ thống khai phá tri thức và hỏi đáp khoa học quy mô hơn `71,927` bài báo không thể chỉ dừng ở kịch bản chạy thử rời rạc trên sổ tay Jupyter mà phải được đóng gói thành kiến trúc vi dịch vụ ổn định, có khả năng thu hoạch dữ liệu tự động hàng ngày không trùng lặp, chịu lỗi khi mạng S3/RabbitMQ chập chờn, bảo vệ an toàn phần cứng GPU và cung cấp telemetry trực quan theo thời gian thực.
- **Purpose**: Trình bày kiến trúc triển khai sản xuất toàn hệ thống, bao gồm: dịch vụ Backend FastAPI + Frontend React 19/KaTeX với kênh SSE hai nhịp độ, bộ 6 DAG điều phối Apache Airflow kết hợp hàng đợi RabbitMQ hai tầng có áp suất ngược (*backpressure*), các nguyên tắc bảo mật cấu hình / bất biến SHA-256 / rào chắn phần cứng pytest, và quy trình giám sát ngân sách lưu trữ MinIO `20 GB` cùng bộ công cụ vận hành phục hồi.
- **Overview Pipeline**: Airflow Scheduler (ICT `19:00`/`19:10`/Chủ nhật `00:00`) $\rightarrow$ `RabbitMQ` Stage 1 (`scientific_paper_ingest`) & Stage 2 (`scientific_chunk_embed`, `EMBED_QUEUE_MAX = 500`) $\rightarrow$ `MinIO S3` Silver/ChunkStore + `Qdrant Cloud` + `MiningEngine` $\rightarrow$ `FastAPI :8000` (`Lifespan` warmup, REST API, SSE `/api/ingestion/stream`) $\rightarrow$ `React 19 + Vite + KaTeX` UI (6 màn hình).
- **Detailed Plan**: (6.1) Kiến trúc Backend FastAPI, hợp đồng REST/SSE và Frontend 6 màn hình; (6.2) Điều phối thu hoạch phân tầng qua Airflow và RabbitMQ 2 tầng; (6.3) Quản trị bảo mật, tính bất biến SHA-256 và rào chắn an toàn `pytest`; (6.4) Giám sát ngân sách `20 GB`, hợp nhất Silver khóa mutex và bộ công cụ vận hành `scripts/`.
- **References**: [main.py](../../backend/app/main.py), [router.py](../../backend/app/api/router.py), [health.py](../../backend/app/api/endpoints/health.py), [ingestion.py](../../backend/app/api/endpoints/ingestion.py), [mining.py](../../backend/app/api/endpoints/mining.py), [config.py](../../backend/app/core/config.py), [storage_service.py](../../backend/app/services/storage_service.py), [streaming_service.py](../../backend/app/services/streaming_service.py), [package.json](../../frontend/package.json), [dag_tier1_realtime_stream.py](../../dags/dag_tier1_realtime_stream.py), [dag_tier2_near_past_harvest.py](../../dags/dag_tier2_near_past_harvest.py), [dag_compact_silver.py](../../dags/dag_compact_silver.py), [dag_recompute_mining.py](../../dags/dag_recompute_mining.py), [dag_tier3_landmark_harvest.py](../../dags/dag_tier3_landmark_harvest.py), [dag_tier3_pdf_backfill.py](../../dags/dag_tier3_pdf_backfill.py), [dag_daily_arxiv_harvest.py](../../dags/dag_daily_arxiv_harvest.py), [queue_consumer.py](../../src/ingestion/queue_consumer.py), [hasher.py](../../src/utils/hasher.py), [conftest.py](../../tests/conftest.py), [start_app.sh](../../scripts/start_app.sh).
- **Created**: 2026-11-25T12:55:00+07:00
- **Last Updated**: 2026-11-25T12:55:00+07:00

[STATUS: ACTIVE]

---

## Mục lục

- [6.1. Kiến trúc Dịch vụ FastAPI, Kênh SSE Thời gian thực & Giao diện React 19](#61-kiến-trúc-dịch-vụ-fastapi-kênh-sse-thời-gian-thực--giao-diện-react-19)
  - [6.1.1. Vòng đời khởi động `lifespan` và bề mặt API hợp nhất](#611-vòng-đời-khởi-động-lifespan-và-bề-mặt-api-hợp-nhất)
  - [6.1.2. Cơ chế đồng bộ `StreamingService` hai nhịp độ (`3s` / `30s`) và lưu vết MinIO](#612-cơ-chế-đồng-bộ-streamingservice-hai-nhịp-độ-3s--30s-và-lưu-vết-minio)
  - [6.1.3. Giao diện người dùng 6 màn hình chuyên biệt (`React 19 + KaTeX`)](#613-giao-diện-người-dùng-6-màn-hình-chuyên-biệt-react-19--katex)
- [6.2. Điều phối Thu thập Bền vững: RabbitMQ Hai Tầng & 6 DAG Apache Airflow](#62-điều-phối-thu-thập-bền-vững-rabbitmq-hai-tầng--6-dag-apache-airflow)
  - [6.2.1. Hàng đợi AMQP tách tầng `fetch` / `embed` và kiểm soát áp suất ngược](#621-hàng-đợi-amqp-tách-tầng-fetch--embed-và-kiểm-soát-áp-suất-ngược)
  - [6.2.2. Lịch trình 6 DAG Airflow chuẩn múi giờ ICT (`UTC+7`)](#622-lịch-trình-6-dag-airflow-chuẩn-múi-giờ-ict-utc7)
- [6.3. Bảo mật Dữ liệu, Tính Bất biến Raw & Rào chắn An toàn Phần cứng](#63-bảo-mật-dữ-liệu-tính-bất-biến-raw--rào-chắn-an-toàn-phần-cứng)
  - [6.3.1. Quản lý bí mật `.env` fail-fast và phân tách quyền đọc/ghi Qdrant](#631-quản-lý-bí-mật-env-fail-fast-và-phân-tách-quyền-đọcghi-qdrant)
  - [6.3.2. Bất biến dữ liệu thô qua băm mật mã SHA-256 (`hasher.py`)](#632-bất-biến-dữ-liệu-thô-qua-băm-mật-mã-sha-256-hasherpy)
  - [6.3.3. Rào chắn bảo vệ GPU và môi trường kiểm thử phân tầng (`tests/conftest.py`)](#633-rào-chắn-bảo-vệ-gpu-và-môi-trường-kiểm-thử-phân-tầng-testsconftestpy)
- [6.4. Giám sát Ngân sách Lưu trữ (`20 GB`) & Công cụ Vận hành Thực tế](#64-giám-sát-ngân-sách-lưu-trữ-20-gb--công-cụ-vận-hành-thực-tế)

---

## 6.1. Kiến trúc Dịch vụ FastAPI, Kênh SSE Thời gian thực & Giao diện React 19

### 6.1.1. Vòng đời khởi động `lifespan` và bề mặt API hợp nhất

Lõi ứng dụng Backend chạy trên nền **FastAPI** tại cổng `:8000` ([main.py](../../backend/app/main.py)). Khi khởi động qua hàm bất đồng bộ `lifespan`, máy chủ thực hiện làm nóng (*pre-warm*) tuần tự các thành phần nặng nhằm loại bỏ độ trễ nguội (*cold-start penalty*) ở truy vấn đầu tiên:
1. Nạp trước mô hình ngôn ngữ cục bộ (`llm_client.preload()`) nếu `LLM_PRELOAD = True`.
2. Nạp trước trọng số Bi-Encoder `nomic-embed-text-v1.5` (`embedder_service.warmup()`) và Cross-Encoder `reranker_service.warmup()`.
3. Tải từ điển uy tín PageRank và luật kết hợp FP-Growth từ MinIO S3 vào RAM qua `retrieval_service._ensure_graph_and_rules()`.
4. Kích hoạt luồng nền `streaming_service.start_monitor()`.

Tất cả điểm cuối nghiệp vụ được gắn dưới tiền tố `/api` thông qua [router.py](../../backend/app/api/router.py), kết hợp kiểm tra sức khỏe độc lập ở mức hệ thống (`/health` trong [health.py](../../backend/app/api/endpoints/health.py)) trả về trạng thái tổng hợp `"ok"` hoặc `"degraded"` cùng ba cờ kiểm chứng vật lý: `qdrant_ready`, `vector_store_ready` và `parquet_ready`.

> **5W1H — Bảng tổng hợp bề mặt API vận hành của hệ thống FastAPI**
> - **What**: Phân loại các nhóm điểm cuối REST và SSE phục vụ hỏi đáp RAG, khai phá dữ liệu, điều phối thu hoạch và kiểm tra sức khỏe.
> - **Why**: Cung cấp hợp đồng giao tiếp rõ ràng giữa Frontend React, các DAG Airflow (trigger compaction/mining) và hệ thống giám sát.
> - **When**: Phiên bản sản xuất hiện hành trong nhánh `backend/app/api/`.
> - **Where**: [router.py](../../backend/app/api/router.py), [health.py](../../backend/app/api/endpoints/health.py), [ingestion.py](../../backend/app/api/endpoints/ingestion.py), [mining.py](../../backend/app/api/endpoints/mining.py).
> - **Who**: Nhóm phát triển API Backend UTH Data Mining.
> - **How**: Định tuyến FastAPI chuẩn Pydantic schema với cơ chế khóa mutex `_compact_lock` và luồng `StreamingResponse`.

| Nhóm Điểm cuối (Endpoints) | Giao thức / Phương thức | Trách nhiệm & Cơ chế an toàn | Tệp định nghĩa |
| :--- | :--- | :--- | :--- |
| `/health` | `GET` | Trả `"ok"`/`"degraded"`, `qdrant_ready`, `vector_store_ready`, `parquet_ready` | [health.py](../../backend/app/api/endpoints/health.py) |
| `/api/chat`, `/api/search` | `POST` (REST + SSE) | Truy hồi Hybrid/Vector/Graph + Reranking + SSE stream câu trả lời & trích dẫn | `chat.py`, `search.py` |
| `/api/mining/eda`, `/pillars/*`, `/manifest` | `GET` | Phục vụ JSON Gold cho Dashboard EDA và 4 Trụ cột khai phá | [mining.py](../../backend/app/api/endpoints/mining.py) |
| `/api/mining/trigger`, `/status`, `/telemetry/stream` | `POST` / `GET` (SSE) | Kích hoạt chạy lại `MiningEngine` và đẩy nhật ký tiến độ thời gian thực | [mining.py](../../backend/app/api/endpoints/mining.py) |
| `/api/ingestion/{status,start,stop,reset}` | `GET` / `POST` | Điều khiển luồng thu hoạch tương tác và đặt lại bộ đếm phiên | [ingestion.py](../../backend/app/api/endpoints/ingestion.py) |
| `/api/ingestion/compact-silver` | `POST` | Gọi hợp nhất các phân mảnh Parquet Silver; bảo vệ bằng `_compact_lock` trả **`409 Conflict`** nếu đang chạy | [ingestion.py](../../backend/app/api/endpoints/ingestion.py) |
| `/api/ingestion/{stream,broadcast,pipeline-logs}` | `GET` / `POST` (SSE) | Kênh phát sự kiện `SNAPSHOT`, `LOG`, `PAPER_INGESTED` tới mọi trình duyệt | [ingestion.py](../../backend/app/api/endpoints/ingestion.py) |

### 6.1.2. Cơ chế đồng bộ `StreamingService` hai nhịp độ (`3s` / `30s`) và lưu vết MinIO

Để giao diện người dùng phản hồi tức thời mà không làm nghẽn cụm MinIO S3 và Qdrant Cloud bằng các lệnh quét đếm nặng liên tục, `StreamingService` ([streaming_service.py](../../backend/app/services/streaming_service.py)) tách chu kỳ đồng bộ thành **hai nhịp độ độc lập**:
- **Nhịp nhanh mỗi `3` giây (Fast Poll)**: Kiểm tra trạng thái hàng đợi RabbitMQ (`scientific_paper_ingest`, `scientific_chunk_embed`), chỉ số tiến trình thu hoạch tức thời và đẩy log mới từ bộ đệm vòng **`LOG_BUFFER_SIZE = 1,000`** dòng qua sự kiện SSE (`SNAPSHOT`, `LOG`, `PAPER_INGESTED`).
- **Nhịp chậm mỗi `30` giây (Slow Poll)**: Tính lại dung lượng toàn bộ tiền tố MinIO (`raw/`, `silver/`, `gold/`) và số vector trên Qdrant (`storage_service.py`). Trạng thái phiên thu hoạch được lưu vết bền vững lên MinIO tại đường dẫn `state/session_state.json` để có thể khôi phục chính xác ngay cả khi container Backend khởi động lại.

### 6.1.3. Giao diện người dùng 6 màn hình chuyên biệt (`React 19 + KaTeX`)

Tầng giao diện Web ([package.json](../../frontend/package.json)) được xây dựng trên ngăn xếp công nghệ hiện đại gồm **`react ^19.2.8`**, **`vite ^8.3.0`**, **`typescript ~6.0.2`**, **`katex ^0.19.0`** (hiển thị tức thời công thức toán học LaTeX trong câu trả lời RAG và mô tả cụm chủ đề), và trình kiểm chuẩn mã nguồn **`oxlint ^1.81.0`**. Ứng dụng tổ chức thành **6 màn hình chuyên trách** dưới thư mục `frontend/src/screens/`:
1. `schematic.screen.tsx`: Sơ đồ kiến trúc tổng quan dòng chảy dữ liệu Lakehouse (Bronze $\rightarrow$ Silver $\rightarrow$ Gold) gắn trạng thái sống.
2. `eda.screen.tsx`: Trình diễn trực quan phân bố chuyên ngành, khung chẩn đoán 3 Lăng kính (Histogram/KDE/Q-Q, tương quan Pearson vs Spearman và đồ thị Mutual Information).
3. `pillars.screen.tsx`: Giao diện tương tác cho 4 Trụ cột khai phá (mạng luật kết hợp FP-Growth, elip $2\sigma$ GMM trên mặt phẳng PCA 2D, đồ thị cộng đồng Louvain & PageRank, biểu đồ động lượng thị phần & danh sách ngoại lai Isolation Forest).
4. `explorer.screen.tsx`: Trình khám phá trực tiếp kho bài báo, lọc theo danh mục, năm xuất bản và tra cứu metadata.
5. `rag.screen.tsx`: Giao diện hỏi đáp Hybrid RAG thời gian thực qua SSE stream, hỗ trợ chọn chế độ (`hybrid` / `vector` / `graph`), bật/tắt gia cố PageRank, kết xuất LaTeX KaTeX và mở thẻ trích dẫn chi tiết nguồn gốc `[Paper, Section]`.
6. `logs.screen.tsx`: Bảng điều khiển giám sát vận hành thu hoạch, hàng đợi RabbitMQ, ngân sách lưu trữ `20 GB` và dòng log trực tiếp.

---

## 6.2. Điều phối Thu thập Bền vững: RabbitMQ Hai Tầng & 6 DAG Apache Airflow

### 6.2.1. Hàng đợi AMQP tách tầng `fetch` / `embed` và kiểm soát áp suất ngược

Ở giai đoạn thu thập và xử lý toàn văn quy mô lớn, bước **tải HTML/PDF từ mạng arXiv/OpenAlex (`fetch` I/O-bound)** và bước **nhúng vector bằng GPU (`embed` GPU-bound)** có tốc độ và đặc tính tài nguyên hoàn toàn khác biệt. Việc gộp chung hai bước vào một tiến trình đơn dễ gây lãng phí GPU khi chờ mạng hoặc làm sập kết nối AMQP vì timeout lúc mô hình Transformer xử lý lô bài báo dài.

Kiến trúc [queue_consumer.py](../../src/ingestion/queue_consumer.py) khắc phục triệt để bằng mô hình **RabbitMQ Hai Tầng có Áp suất ngược (Backpressure Control)**:
- **Tầng 1 (`scientific_paper_ingest` + `.dead`)**: Worker `fetch` lấy yêu cầu bài báo, tải toàn văn HTML-first (LaTeXML), băm kiểm tra bất biến, tách cấu trúc mục và ghi bản ghi vào vùng đệm chuẩn Silver.
- **Tầng 2 (`scientific_chunk_embed` + `.dead`)**: Chỉ nhận thông điệp sau khi hồ sơ Silver đã an toàn. Trước khi worker `fetch` đẩy thêm việc sang hàng đợi nhúng, hệ thống kiểm tra độ sâu hàng đợi qua RabbitMQ Management API: nếu số lượng tin đang chờ chạm ngưỡng **`EMBED_QUEUE_MAX = 500`**, worker `fetch` tự động **tạm nghỉ điều tiết lưu lượng** (*backpressure pause*) thay vì làm tràn RAM RabbitMQ.
- **Bảo vệ thứ tự ghi & Heartbeat dài**: Phiên bản tiêu thụ sử dụng **`HEARTBEAT_SECONDS = 600`** (`10` phút) để các lô nhúng nặng không bị ngắt kết nối AMQP giữa chừng. Đặc biệt, thứ tự ghi luôn tuân thủ bất biến **`chunk_store.append_part()` trước `qdrant.insert_chunks()`**: vector chỉ được công bố vào Qdrant khi nội dung văn bản tương ứng đã nằm chắc chắn trên MinIO S3, ngăn chặn hiện tượng "vector ma" (*dangling vector* không có đoạn văn để hydrate). Nếu tác vụ lỗi quá `RABBITMQ_MAX_RETRIES = 3` lần, thông điệp tự động chuyển sang hàng đợi chết (`.dead` DLQ) để kiểm tra hậu kiểm.

### 6.2.2. Lịch trình 6 DAG Airflow chuẩn múi giờ ICT (`UTC+7`)

Hệ thống thu hoạch và bảo trì tự động được điều phối bởi Apache Airflow trong thư mục `dags/` với cấu hình vùng giờ chuẩn Việt Nam (`ICT` / `Asia/Ho_Chi_Minh`, kết nối qua `_common.py`):

> **5W1H — Bảng tổng hợp các DAG Apache Airflow vận hành Lakehouse**
> - **What**: Liệt kê toàn bộ 7 tệp DAG hiện có (gồm 6 DAG kiến trúc phân tầng hiện đại + 1 DAG thu hoạch ngày kế thừa) cùng lịch trình chạy (`cron`), mục tiêu dữ liệu và cơ chế tối ưu.
> - **Why**: Tự động hóa hoàn toàn vòng đời nạp mới bài báo, chống tràn phân mảnh Parquet Silver và tái tính tri thức khai phá định kỳ hàng tuần.
> - **When**: Lịch vận hành tự động theo múi giờ ICT (`UTC+7`).
> - **Where**: Các tệp trong `dags/` ([dag_tier1_realtime_stream.py](../../dags/dag_tier1_realtime_stream.py), [dag_tier2_near_past_harvest.py](../../dags/dag_tier2_near_past_harvest.py), [dag_compact_silver.py](../../dags/dag_compact_silver.py), [dag_recompute_mining.py](../../dags/dag_recompute_mining.py), [dag_tier3_landmark_harvest.py](../../dags/dag_tier3_landmark_harvest.py), [dag_tier3_pdf_backfill.py](../../dags/dag_tier3_pdf_backfill.py), [dag_daily_arxiv_harvest.py](../../dags/dag_daily_arxiv_harvest.py)).
> - **Who**: Bộ điều phối Airflow Scheduler kích hoạt tác vụ qua Docker/HTTP API hoặc CLI.
> - **How**: Quản lý hạn mức thông lượng qua thuật toán *water-filling* (`HARVEST_BATCH = 1000`, `HARVEST_LOW_WATER = 200`) và tôn trọng header `retry_after` của OAI-PMH.

| Tên DAG | Tệp nguồn | Lịch chạy (`ICT`) | Chức năng & Cơ chế vận hành |
| :--- | :--- | :--- | :--- |
| **Tier 1: Realtime Stream** | [dag_tier1_realtime_stream.py](../../dags/dag_tier1_realtime_stream.py) | `0 19 * * *` (`19:00` hàng ngày) | Thu hoạch tiền ấn phẩm arXiv OAI-PMH mới công bố trong ngày + phân phối ngân sách *water-filling* (`HARVEST_BATCH=1000`, `LOW_WATER=200`) |
| **Tier 2: Near-Past Harvest** | [dag_tier2_near_past_harvest.py](../../dags/dag_tier2_near_past_harvest.py) | `10 19 * * *` (`19:10` hàng ngày) | Thu hoạch bổ sung giai đoạn cận hiện tại (HTML-first + OpenReview/CVF), chạy lệch `10` phút sau Tier 1 để tránh nghẽn băng thông |
| **Silver Compaction** | [dag_compact_silver.py](../../dags/dag_compact_silver.py) | `0 */3 * * *` (Mỗi `3` giờ) | Gửi lệnh `POST /api/ingestion/compact-silver` để gom các tệp Parquet nhỏ thành khối nén ZSTD tối ưu cho DuckDB |
| **Recompute Mining** | [dag_recompute_mining.py](../../dags/dag_recompute_mining.py) | `0 0 * * 0` (`00:00` Chủ nhật) | Tái thực thi toàn bộ `MiningEngine` (`EDA` + 4 trụ cột) hàng tuần, cập nhật tập luật và từ điển PageRank cho RAG |
| **Tier 3: Landmark Harvest** | [dag_tier3_landmark_harvest.py](../../dags/dag_tier3_landmark_harvest.py) | Thủ công (`schedule=None`) | Thu thập các công trình kinh điển nền tảng có lượt trích dẫn cao qua OpenAlex |
| **Tier 3: PDF Backfill** | [dag_tier3_pdf_backfill.py](../../dags/dag_tier3_pdf_backfill.py) | Thủ công (`schedule=None`) | Bổ sung trích xuất PDF cho các bài cũ không có bản HTML trên arXiv |
| *(Kế thừa)* Daily arXiv | [dag_daily_arxiv_harvest.py](../../dags/dag_daily_arxiv_harvest.py) | `0 1 * * *` (`01:00` hàng ngày) | Pipeline thu hoạch arXiv thế hệ đầu được giữ lại cho khả năng tương thích ngược |

---

## 6.3. Bảo mật Dữ liệu, Tính Bất biến Raw & Rào chắn An toàn Phần cứng

### 6.3.1. Quản lý bí mật `.env` fail-fast và phân tách quyền đọc/ghi Qdrant

Lớp cấu hình tập trung tại [settings.py](../../src/config/settings.py) và [config.py](../../backend/app/core/config.py) áp dụng nguyên tắc **Fail-Fast Validation**: toàn bộ thông tin nhạy cảm (`MINIO_ENDPOINT_URL`, `MINIO_ACCESS_KEY_ID`, `MINIO_SECRET_ACCESS_KEY`, `RABBITMQ_USER`, `RABBITMQ_PASSWORD`) đều được nạp từ biến môi trường `.env` và kiểm tra qua hàm `_require(name)`. Nếu thiếu bất kỳ khóa xác thực bắt buộc nào, ứng dụng từ chối khởi động ngay lập tức với thông báo lỗi tường minh thay vì âm thầm chạy với mật khẩu mặc định nguy hiểm. Ngoài ra, bộ validator hỗ trợ bí danh tương thích giữa MinIO tự chủ và Cloudflare R2 (`MINIO_*` / `R2_*`).

*Lưu ý tư thế bảo mật về khóa Qdrant*: Trong [config.py](../../backend/app/core/config.py) và [settings.py](../../src/config/settings.py), giá trị fallback mặc định `QDRANT_API_KEY = "uth_guest_readonly_key_4b71a8e9d2c"` là **khóa chỉ đọc công khai (guest read-only key)** phục vụ chế độ trình diễn và kiểm thử truy vấn từ xa; khi triển khai ở môi trường sản xuất có tác vụ nạp/xóa vector (`qdrant_manager.py`), quản trị viên bắt buộc ghi đè biến `QDRANT_API_KEY` trong `.env` bằng khóa có phân quyền riêng (RBAC tách biệt hoàn toàn vai trò Read-Only của API hỏi đáp và Read-Write của Worker lập chỉ mục).

### 6.3.2. Bất biến dữ liệu thô qua băm mật mã SHA-256 (`hasher.py`)

Nhằm thực thi nguyên tắc **Immutable Raw Invariant** và khử trùng lặp nhất quán giữa các nguồn arXiv, OpenAlex, CVF và OpenReview, mô-đun [hasher.py](../../src/utils/hasher.py) áp dụng hai hàm băm mật mã SHA-256 chuẩn hóa:
1. **`compute_sha256(data)`**: Đọc luồng tệp theo khối `64 KB` (`65536` bytes) hoặc chuỗi UTF-8 để gắn chữ ký toàn vẹn SHA-256 vào siêu dữ liệu mọi đối tượng tải lên MinIO thông qua `MinIOClient` ([minio_client.py](../../src/storage/minio_client.py)).
2. **`compute_abstract_hash(abstract)`**: Chuẩn hóa phần tóm tắt qua `normalize_abstract_text()` theo 5 bước tất định (**NFKC Unicode normalization** $\rightarrow$ chuyển chữ thường $\rightarrow$ loại bỏ thẻ HTML `<[^>]+>` $\rightarrow$ loại bỏ dấu câu $\rightarrow$ gộp khoảng trắng thừa) rồi sinh chuỗi hex 64 ký tự SHA-256. Nhờ đó, cùng một bài báo nếu xuất hiện đồng thời trên arXiv và OpenReview với sai khác nhỏ về dấu câu hoặc khoảng trắng vẫn bị nhận diện trùng lặp chính xác mà không làm phình kích thước bảng Silver.

### 6.3.3. Rào chắn bảo vệ GPU và môi trường kiểm thử phân tầng (`tests/conftest.py`)

Hệ thống kiểm thử tự động trong [conftest.py](../../tests/conftest.py) phân tách 4 cấp độ (`unit`, `integration`, `system`, `e2e`) kèm hai lớp rào chắn bảo vệ tài nguyên quan trọng:

```python
# Hardware & cost safeguards in tests/conftest.py (ASCII comments only)
def pytest_collection_modifyitems(config, items):
    # Skip expensive S3 live storage and heavy neural weight tests unless opted in
    run_live_storage = config.getoption("--run-live-storage", default=False)
    run_heavy_models = config.getoption("--run-heavy-models", default=False)
    for item in items:
        if ("live_r2" in item.keywords or "live_storage" in item.keywords) and not run_live_storage:
            item.add_marker(skip_live_storage)
        if "heavy_model" in item.keywords and not run_heavy_models:
            item.add_marker(skip_heavy_models)

def pytest_runtest_setup(item):
    # Enforce hard failure if a GPU-marked test attempts to run on CPU-only host
    if "gpu" in item.keywords:
        ...
```

Cơ chế này ngăn chặn các lần chạy CI hoặc `pytest` thường ngày vô tình tải hàng gigabyte trọng số mô hình mạng nơ-ron (`--run-heavy-models`) hay ghi rác lên bucket S3 thực tế (`--run-live-storage`), đồng thời bảo đảm bài kiểm thử đánh dấu `@pytest.mark.gpu` không bao giờ chạy nhầm trên CPU gây hiểu sai kết quả hiệu năng.

---

## 6.4. Giám sát Ngân sách Lưu trữ (`20 GB`) & Công cụ Vận hành Thực tế

Với giới hạn hạ tầng lưu trữ đối tượng tự triển khai được ấn định qua tham số **`LAKEHOUSE_BUDGET_GB = 20.0`** ([config.py](../../backend/app/core/config.py)), `StorageService` ([storage_service.py](../../backend/app/services/storage_service.py)) giám sát liên tục phân bổ dung lượng theo từng tầng dữ liệu (`raw/`, `silver/`, `gold/chunks/`, `gold/mining/`) và trạng thái chỉ mục Qdrant. Để bảo đảm hệ thống vận hành bền bỉ qua nhiều đợt thu hoạch và nâng cấp mô hình, kho công cụ `scripts/` cung cấp đầy đủ các kịch bản tác nghiệp chuẩn:

| Kịch bản Vận hành | Đường dẫn | Vai trò trong vòng đời vận hành |
| :--- | :--- | :--- |
| Khởi chạy cụm dịch vụ đầy đủ | [start_app.sh](../../scripts/start_app.sh) | Khởi động đồng thời Backend FastAPI (`uvicorn`), kiểm tra kết nối và Frontend Vite |
| Di trú ChunkStore lên Silver | [migrate_chunks_to_silver.py](../../scripts/migrate_chunks_to_silver.py) | Hợp nhất các phân mảnh `ChunkStore` và chuẩn hóa siêu dữ liệu sang cấu trúc Silver ZSTD |
| Bù đắp toàn văn bài còn thiếu | [backfill_missing_papers.py](../../scripts/backfill_missing_papers.py) | Quét các bài báo đã có metadata/vector nhưng khuyết toàn văn để bổ sung Hydration |
| Tái lập chỉ mục Qdrant từ đầu | [reindex_qdrant.py](../../scripts/reindex_qdrant.py) | Tái sinh vector 768D từ `ChunkStore` hoặc Silver khi thay đổi chiến lược chia đoạn hay mô hình nhúng |
| Bù đắp trường `year` trên Qdrant | [backfill_qdrant_year.py](../../scripts/backfill_qdrant_year.py) | Cập nhật bổ sung trường lọc thời gian `year` vào 5 trường payload bất biến trên Qdrant mà không cần nhúng lại vector |
