# UTH Scientific Data Mining & Real-Time Advanced RAG System for AI/DS

- **Motivation/Background**: Hệ thống nghiên cứu AI/DS cần một nền tảng hội tụ ba năng lực: khai phá dữ liệu khoa học quy mô lớn, truy xuất ngữ nghĩa thời gian thực, và hội thoại RAG có căn cứ — mà vẫn chạy được trên máy cá nhân.
- **Purpose**: Tài liệu này là hướng dẫn tham chiếu duy nhất (single source of truth) về kiến trúc, cấu hình, cài đặt và vận hành toàn bộ hệ thống sau đợt refactor backend 9 bước.
- **Overview Pipeline**: Nội dung được tổng hợp từ mã nguồn thực thi trong [`backend/app/`](backend/app/), [`data_mining/src/`](data_mining/src/), [`frontend/src/`](frontend/src/), cấu hình `.env` thực tế, và OpenAPI spec sinh tự động từ ứng dụng FastAPI.
- **Detailed Plan**: §1 Tổng quan & Quick Start; §2 Kiến trúc Monorepo; §3 Cấu hình môi trường; §4 Cài đặt theo từng hệ điều hành; §5 Vận hành từng phân hệ; §6 Tham chiếu API; §7 Bốn Trụ cột Khai phá; §8 Kiến trúc Dữ liệu Medallion; §9 Kiểm thử; §10 Xử lý sự cố; §11 Quy ước phát triển.
- **References**: [FastAPI](https://fastapi.tiangolo.com/), [Pydantic Settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/), [React 19](https://react.dev/), [Vite](https://vite.dev/), [LanceDB](https://lancedb.github.io/lancedb/), [Cloudflare R2](https://developers.cloudflare.com/r2/), [MD_CONVENTION.md](data_mining/docs/agents/rules/MD_CONVENTION.md).
- **Created**: 2026-10-05T21:35:00+07:00
- **Last Updated**: 2026-10-05T21:50:10+07:00

[STATUS: ACTIVE]

---

## Table of Contents

- [1. Tổng quan & Quick Start](#1-tổng-quan-quick-start)
- [2. Kiến trúc Monorepo](#2-kiến-trúc-monorepo)
  - [2.1 Bản đồ phân hệ](#21-bản-đồ-phân-hệ)
  - [2.2 Kiến trúc backend sau refactor](#22-kiến-trúc-backend-sau-refactor)
  - [2.3 Quy tắc phân tầng](#23-quy-tắc-phân-tầng)
- [3. Cấu hình môi trường](#3-cấu-hình-môi-trường)
  - [3.1 Tạo file .env](#31-tạo-file-env)
  - [3.2 Nhóm biến cấu hình backend](#32-nhóm-biến-cấu-hình-backend)
  - [3.3 Cấu hình Cloudflare R2](#33-cấu-hình-cloudflare-r2)
  - [3.4 Cấu hình dữ liệu thu thập](#34-cấu-hình-dữ-liệu-thu-thập)
- [4. Cài đặt theo hệ điều hành](#4-cài-đặt-theo-hệ-điều-hành)
  - [4.1 Yêu cầu tiên quyết](#41-yêu-cầu-tiên-quyết)
  - [4.2 macOS](#42-macos)
  - [4.3 Windows](#43-windows)
  - [4.4 Linux](#44-linux)
  - [4.5 Docker](#45-docker)
- [5. Vận hành từng phân hệ](#5-vận-hành-từng-phân-hệ)
  - [5.1 Backend API](#51-backend-api)
  - [5.2 Frontend Dashboard](#52-frontend-dashboard)
  - [5.3 Data Mining Engine](#53-data-mining-engine)
- [6. Tham chiếu API](#6-tham-chiếu-api)
  - [6.1 Danh sách endpoint](#61-danh-sách-endpoint)
  - [6.2 Luồng SSE thời gian thực](#62-luồng-sse-thời-gian-thực)
- [7. Bốn Trụ cột Khai phá](#7-bốn-trụ-cột-khai-phá)
- [8. Kiến trúc Dữ liệu Medallion](#8-kiến-trúc-dữ-liệu-medallion)
- [9. Kiểm thử](#9-kiểm-thử)
- [10. Xử lý sự cố](#10-xử-lý-sự-cố)
- [11. Quy ước phát triển](#11-quy-ước-phát-triển)

---

## 1. Tổng quan & Quick Start

### 1.1 Hệ thống này là gì

Hệ thống khai phá khoa học thời gian thực và RAG nâng cao, phục vụ nghiên cứu và tổng quan tài liệu trong miền Trí tuệ Nhân tạo và Khoa học Dữ liệu. Ba năng lực chính:

1. **Thu thập & khai phá** — thu thập hàng chục nghìn bài báo từ arXiv và OpenAlex, xử lý thành Lakehouse ba tầng, khai phá bằng bốn thuật toán chuyên sâu.
2. **Truy xuất ngữ nghĩa** — tìm kiếm vector trên LanceDB với embedding 768 chiều, trả kết quả kèm điểm liên quan.
3. **Hội thoại có căn cứ** — RAG sinh câu trả lời chỉ dựa trên bài báo đã truy xuất, mọi khẳng định đều dẫn nguồn.

### 1.2 Công nghệ sử dụng

| Tầng | Công nghệ |
|------|-----------|
| Giao diện | React 19, Vite 8, TypeScript 6, KaTeX |
| API | FastAPI, Uvicorn, SSE-Starlette, Pydantic 2 |
| Truy xuất | LanceDB, boto3 (S3 protocol) |
| Xử lý dữ liệu | Pandas, PyArrow, Polars, DuckDB |
| Lưu trữ | Cloudflare R2, Parquet (zstd) |
| Mô hình | Nomic Embed Text v1.5, Qwen2.5 7B Instruct (GGUF) |

### 1.3 Quick Start (rút gọn)

<details open>
<summary><b>macOS / Linux — 5 lệnh</b></summary>

```bash
git clone <repository-url> UTH-Data-Mining-Real-Time-Scientific-Data-Mining-Advanced-RAG-System-for-AI-DS
cd UTH-Data-Mining-Real-Time-Scientific-Data-Mining-Advanced-RAG-System-for-AI-DS
python3.11 -m venv venv && source venv/bin/activate
pip install -r backend/requirements.txt && cd frontend && npm install && cd ..
```

</details>

<details>
<summary><b>Windows PowerShell — 5 lệnh</b></summary>

```powershell
git clone <repository-url> UTH-Data-Mining-Real-Time-Scientific-Data-Mining-Advanced-RAG-System-for-AI-DS
Set-Location UTH-Data-Mining-Real-Time-Scientific-Data-Mining-Advanced-RAG-System-for-AI-DS
py -3.11 -m venv venv
.\venv\Scripts\Activate.ps1
.\venv\Scripts\pip.exe install -r backend\requirements.txt
Set-Location frontend; npm install; Set-Location ..
```

</details>

Sau khi cài xong, mở **hai terminal riêng biệt**:

```bash
# Terminal 1 — Backend API
source venv/bin/activate
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

```bash
# Terminal 2 — Frontend Dashboard
cd frontend && npm run dev
```

Truy cập `http://localhost:5173`. Tài liệu API tương tác tại `http://localhost:8000/docs`.

> **Lưu ý quan trọng**: Hướng dẫn đầy đủ cho từng hệ điều hành nằm ở [§4 Cài đặt theo hệ điều hành](#4-cài-đặt-theo-hệ-điều-hành). Khuyến nghị đọc [§3 Cấu hình môi trường](#3-cấu-hình-môi-trường) trước khi chạy vì backend phụ thuộc vào file `.env` tại thư mục gốc.

---

--- 

## 2. Kiến trúc Monorepo

### 2.1 Bản đồ phân hệ

Dự án là một monorepo chứa ba phân hệ độc lập, phân tách rõ ranh giới trách nhiệm:

```text
UTH-Data-Mining-Real-Time-Scientific-Data-Mining-Advanced-RAG-System-for-AI-DS/
│
├── [1] data_mining/            Phân hệ khai phá dữ liệu (Python)
│   ├── src/
│   │   ├── config/             Cấu hình hệ thống và thư mục dữ liệu
│   │   ├── ingestion/          Thu thập arXiv, OpenAlex, cào HTML
│   │   │   ├── openalex_v2/    Crawler OpenAlex bản 2 (retry, circuit breaker)
│   │   │   ├── common/         Thành phần dùng chung cho crawler
│   │   │   └── sources/        Cấu hình nguồn dữ liệu
│   │   ├── transformation/     Parser HTML và Silver Parquet Writer
│   │   ├── indexing/           Nomic Embedder và quản lý LanceDB
│   │   ├── storage/            Cloudflare R2 client, DuckDB engine
│   │   ├── gold/               Tầng Gold: schema, writer, publisher, snapshot
│   │   ├── mining/             Bốn trụ cột khai phá và engine điều phối
│   │   ├── rag/                RAG engine, prompt builder, reranker, evaluator
│   │   ├── quality/           Kiểm tra chất lượng dữ liệu
│   │   ├── utils/              hasher, logger
│   │   ├── cli/                Giao diện dòng lệnh cho tầng Gold
│   │   └── pipelines/          Script điều phối Bronze → Silver → Gold
│   ├── tests/                  Kiểm thử tích hợp và kết nối
│   ├── tools/                  Công cụ kiểm tra storage
│   ├── docs/                   Tài liệu kiến trúc và quy chuẩn phát triển
│   ├── main.py                 Điểm kích hoạt pipeline thu thập
│   └── requirements.txt
│
├── [2] backend/                Phân hệ API và phục vụ (FastAPI)
│   ├── app/
│   │   ├── api/endpoints/      Lớp HTTP: chat, search, papers, storage, mining
│   │   ├── core/               Cấu hình tập trung và đường dẫn
│   │   ├── schemas/            Hợp đồng dữ liệu Pydantic
│   │   ├── services/           Nghiệp vụ: llm, retrieval, rag, storage, mining
│   │   └── main.py             Khởi tạo ứng dụng, CORS, đăng ký router
│   ├── tests/                  Bộ kiểm thử tích hợp TestClient
│   └── requirements.txt
│
├── [3] frontend/               Phân hệ giao diện giám sát (React 19 / Vite)
│   ├── src/
│   │   ├── assets/             Hình ảnh, icon, ngôn ngữ đa locale
│   │   ├── components/         Component chia theo vai trò
│   │   ├── config/             Hằng số cấu hình frontend
│   │   ├── hooks/              Hook dùng chung
│   │   ├── navigation/         Rail điều hướng, route, header
│   │   ├── screens/            Màn hình theo khu vực
│   │   ├── services/           Lớp gọi API
│   │   ├── store/              Zustand store (theme, auth)
│   │   ├── theme/              Design token, primitive
│   │   ├── types/              Kiểu dữ liệu TypeScript
│   │   ├── App.tsx             Điểm gốc ứng dụng
│   │   └── main.tsx            Điểm gắn React vào DOM
│   ├── package.json
│   └── vite.config.ts
│
├── data/                       Dữ liệu cục bộ và cache (không theo dõi git)
│   ├── raw/html/               HTML học thuật thô
│   ├── silver/                 Bảng Parquet đã chuẩn hóa
│   ├── gold/lancedb/           Bảng vector cho truy xuất ngữ nghĩa
│   └── gold/mining/            Artifact JSON của bốn trụ cột
│
├── models/                     Trọng số mô hình AI (không theo dõi git)
│   ├── nomic-embed-text-v1.5/  Mô hình nhúng văn bản
│   └── qwen2.5-7b-instruct/    Mô hình ngôn ngữ cục bộ dạng GGUF
│
├── .env                        Biến môi trường và khóa Cloudflare R2
├── .gitignore                  Quy tắc loại trừ tệp
├── Architecture.md             Cây thư mục toàn dự án
└── README.md                   Tài liệu này
```

### 2.2 Kiến trúc backend sau refactor

Backend được tái cấu trúc thành chín package, mỗi package một miền nghiệp vụ:

```text
backend/app/
│
├── main.py                    Khởi tạo FastAPI, CORS, đăng ký router
│
├── core/                      Tầng cấu hình tập trung
│   ├── paths.py               Xác định thư mục gốc dự án, vị trí file env
│   ├── fields/                Nhóm biến cấu hình theo miền
│   │   ├── server.py          Cổng, tên dự án, phiên bản, tiền tố API
│   │   ├── storage.py         Thông tin Cloudflare R2
│   │   ├── lakehouse.py       Đường dẫn dữ liệu Bronze, Silver, Gold
│   │   └── llm.py             Cấu hình mô hình ngôn ngữ
│   ├── settings.py            Lớp Settings gộp và biến thể đơn
│   └── config.py              Lớp tương thích, tái xuất từ module trên
│
├── schemas/                   Hợp đồng dữ liệu vào và ra
│   ├── mining/                Nhóm schema khai phá
│   │   ├── common.py          Kiểu dữ liệu dùng chung
│   │   ├── eda.py             Schema thống kê mô tả dữ liệu
│   │   └── pillars.py         Schema bốn trụ cột
│   ├── chat.py                Schema hội thoại
│   ├── health.py              Schema sức khỏe
│   ├── search.py              Schema tìm kiếm
│   └── storage.py             Schema thống kê lưu trữ
│
├── services/                  Lớp nghiệp vụ
│   ├── llm/                   Khách gọi mô hình ngôn ngữ
│   │   ├── client.py          Điều phối chuỗi dự phòng, xử lý streaming
│   │   ├── endpoints.py       Xây dựng và chọn URL
│   │   ├── primary.py         Máy chủ cục bộ chạy mô hình GGUF
│   │   ├── ollama.py          Máy chủ Ollama
│   │   └── groq.py            Dịch vụ Groq đám mây
│   ├── retrieval/             Truy xuất vector trên LanceDB
│   │   ├── service.py         Điều phối truy xuất
│   │   ├── connection.py      Kết nối LanceDB và cấu hình S3
│   │   ├── row_mapper.py      Ánh xạ dòng sang miền nghiệp vụ
│   │   ├── queries.py         Câu truy vấn tìm kiếm
│   │   ├── defaults.py        Hằng số mặc định
│   │   └── search.py          Tìm kiếm tương đồng
│   ├── rag/                   Hội thoại có căn cứ
│   │   ├── service.py         Điều phối luồng hội thoại
│   │   ├── retrieval.py       Bướp truy xuất ngữ cảnh
│   │   ├── prompt.py          Dựng lời nhắc hệ thốg
│   │   ├── context.py         Định dạng ngữ cảnh trích dẫn
│   │   ├── citations.py       Trích xuất trích dẫn
│   │   ├── response.py        Chuẩn hóa phản hồi
│   │   ├── fallback.py        Xử lý khi không có ngữ cảnh
│   │   └── constants.py       Hằng số nghiệp vụ
│   ├── storage/               Thống kê Cloudflare R2
│   │   ├── service.py         Điều phối thống kê
│   │   ├── zones.py           Quy mô từng vùng lưu trữ
│   │   ├── response.py        Chuẩn hóa phản hồi
│   │   ├── aggregate.py       Hàm tổng hợp
│   │   └── constants.py       Hằng số dung lượng
│   ├── mining/                Đọc artifact của bốn trụ cột
│   │   ├── service.py         Điều phối nghiệp vụ
│   │   ├── paths.py           Vị trí artifact
│   │   ├── loader.py          Nạp và phân tích JSON
│   │   ├── manifest.py        Manifest tổng quan
│   │   ├── telemetry.py       Dữ liệu telemetry
│   │   ├── artifacts.py       Truy cập artifact gốc
│   │   └── constants.py       Hằng số
│   └── streaming/             Nguồn sự kiện thời gian thực
│       ├── service.py          Điều phối luồng
│       ├── worker.py           Luồng nền
│       ├── events.py           Định nghĩa sự kiện
│       ├── subscriber.py       Đăng ký người nghe
│       ├── state.py            Máy trạng thái
│       ├── metrics.py          Tính toán chỉ số
│       ├── sample_data.py      Dữ liệu mẫu khi chưa có pipeline
│       └── constants.py        Hằng số
│
└── api/                       Lớp HTTP
    ├── router.py              Gom các router con
    └── endpoints/
        ├── mining/             Nhóm endpoint khai phá
        │   ├── router.py       Khai báo đường dẫn
        │   ├── readers.py      Đọc tệp artifact
        │   ├── trigger.py     Kích hoạt chạy khai phá
        │   ├── manifest_route.py  Endpoint manifest
        │   ├── telemetry_route.py Endpoint telemetry
        │   ├── errors.py      Ánh xạ lỗi HTTP
        │   └── constants.py   Hằng số
        ├── chat.py            Endpoint hội thoại
        ├── health.py          Endpoint sức khỏe
        ├── ingestion.py       Endpoint thu thập
        ├── papers.py          Endpoint bài báo
        ├── search.py          Endpoint tìm kiếm
        └── storage.py         Endpoint lưu trữ
```

### 2.3 Quy tắc phân tầng

Kiến trúc áp dụng luật phụ thuộc một chiều, mỗi tầng chỉ biết tầng bên dưới:

| Tầng | Trách nhiệm | Không được làm |
|------|-------------|-----------------|
| `core` | Cấu hình và đường dẫn | Không chứa nghiệp vụ |
| `schemas` | Định nghĩa hợp đồng dữ liệu | Không chứa logic nghiệp vụ |
| `services` | Triển khai nghiệp vụ | Không phụ thuộc lớp HTTP |
| `api` | Ánh xạ HTTP sang nghiệp vụ | Không chứa logic nghiệp vụ |

Ba nguyên tắc bắt buộc khi phát triển:

1. **Một package, một miền.** Không trộn hai miền nghiệp vụ vào cùng thư mục. Ví dụ `services/retrieval/` chỉ lo truy xuất, không chứa logic hội thoại.
2. **Không gom chức năng của tầng này cho tầng khác.** Tầng `api` chỉ gọi `services`, không tự truy vấn LanceDB hay gọi mô hình ngôn ngữ.
3. **Không dồn nhiều việc vào một tệp.** Tệp quá 80 dòng là tín hiệu cần tách. Hằng số, định tuyến, xử lý lỗi và logic nghiệp vụ phải nằm ở tệp riêng.

---

---

---

## 3. Cấu hình môi trường

### 3.1 Tạo file .env

Backend và pipeline khai phá dùng chung một tệp `.env` đặt tại thư mục gốc dự án. Tệp này được bỏ qua bởi git theo quy tắc trong [`.gitignore`](.gitignore).

Tạo tệp sao chép từ mẫu cấu hình:

<details open>
<summary><b>macOS / Linux</b></summary>

```bash
cp .env.example .env
```

</details>

<details>
<summary><b>Windows PowerShell</b></summary>

```powershell
Copy-Item .env.example .env
```

</details>

<details>
<summary><b>Windows Command Prompt</b></summary>

```bat
copy .env.example .env
```

</details>

Sau khi tạo `.env`, mở bằng trình soạn thảo văn bản và điền các giá trị thật. Nội dung tối thiểu cần có cho backend:

```dotenv
R2_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<access-key-id>
R2_SECRET_ACCESS_KEY=<secret-access-key>
R2_BUCKET_NAME=uth-scientific-lakehouse
```

Backend vẫn khởi động được nếu thiếu các khóa R2. Khi đó các endpoint thống kê lưu trữ sẽ báo trạng thái không sẵn sàng thay vì trả về số liệu thật.

### 3.2 Nhóm biến cấu hình backend

Cấu hình được tổ chức theo bốn nhóm nghiệp vụ trong thư mục [`backend/app/core/fields/`](backend/app/core/fields/). Mỗi nhóm nằm trong một tệp riêng, hợp nhất lại trong lớp `Settings`. Biến nào không khai báo trong `.env` sẽ dùng giá trị mặc định.

**Nhóm máy chủ** — nguồn: [`backend/app/core/fields/server.py`](backend/app/core/fields/server.py)

| Biến | Kiểu | Mặc định | Ý nghĩa |
|------|------|----------|---------|
| `HOST` | chuỗi | `0.0.0.0` | Địa chỉ lắng nghe của máy chủ |
| `PORT` | số nguyên | `8000` | Cổng lắng nghe |
| `PROJECT_NAME` | chuỗi | `UTH Scientific Data Mining & Real-Time RAG API` | Tên hiển thị trong tài liệu API |
| `VERSION` | chuỗi | `1.0.0` | Phiên bản API |
| `API_PREFIX` | chuỗi | `/api` | Tiền tố đường dẫn cho toàn bộ endpoint |
| `FRONTEND_ORIGIN` | chuỗi | `http://localhost:5173` | Địa chỉ frontend được phép truy cập chéo miền |

**Nhóm lưu trữ** — nguồn: [`backend/app/core/fields/storage.py`](backend/app/core/fields/storage.py)

| Biến | Kiểu | Mặc định | Ý nghĩa |
|------|------|----------|---------|
| `R2_ENDPOINT_URL` | chuỗi | rỗng | Điểm cuối S3 của Cloudflare R2 |
| `R2_ACCESS_KEY_ID` | chuỗi | rỗng | Khóa truy cập R2 |
| `R2_SECRET_ACCESS_KEY` | chuỗi | rỗng | Khóa bí mật R2 |
| `R2_BUCKET_NAME` | chuỗi | `uth-scientific-lakehouse` | Tên bucket lưu trữ Lakehouse |

**Nhóm Lakehouse** — nguồn: [`backend/app/core/fields/lakehouse.py`](backend/app/core/fields/lakehouse.py)

| Biến | Kiểu | Mặc định | Ý nghĩa |
|------|------|----------|---------|
| `PROJECT_ROOT_DIR` | đường dẫn | thư mục gốc dự án | Gốc dự án |
| `DATA_DIR` | đường dẫn | `<gốc>/data` | Thư mục dữ liệu cục bộ |
| `SILVER_PARQUET` | đường dẫn | `<gốc>/data/silver/year=2026/papers.parquet` | Tệp Parquet tầng Silver |
| `LANCEDB_URI` | chuỗi | `<gốc>/data/gold/lancedb` | Địa chỉ cơ sở dữ liệu vector |
| `LANCEDB_TABLE` | chuỗi | `scientific_papers_gold` | Tên bảng vector |
| `MINING_ARTIFACTS_DIR` | đường dẫn | `<gốc>/data/gold/mining` | Thư mục artifact của bốn trụ cột |

**Nhóm mô hình ngôn ngữ** — nguồn: [`backend/app/core/fields/llm.py`](backend/app/core/fields/llm.py)

| Biến | Kiểu | Mặc định | Ý nghĩa |
|------|------|----------|---------|
| `LLM_MODE` | chuỗi | `local` | Chế độ gọi mô hình |
| `LLM_SERVICE_URL` | chuỗi | `http://localhost:9001/v1` | Máy chủ mô hình cục bộ |
| `OLLAMA_SERVICE_URL` | chuỗi | `http://localhost:11434/v1` | Máy chủ Ollama dự phòng |
| `LLM_MODEL_PATH` | chuỗi | đường dẫn tới tệp GGUF | Tệp trọng số mô hình cục bộ |
| `LLM_MAX_TOKENS` | số nguyên | `1536` | Số token tối đa mỗi câu trả lời |
| `LLM_TEMPERATURE` | số thực | `0.7` | Nhiệt độ lấy mẫu |
| `GROQ_API_KEY` | chuỗi | rỗng | Khóa API Groq cho dự phòng đám mây |

Chuỗi dự phòng của hệ thống được thử theo thứ tự: máy chủ cục bộ trước, tới Ollama, cuối cùng mới tới Groq nếu có khóa. Nếu tất cả đều không phản hồi, hệ thống trả về phản hồi dựng sẵn thay vì báo lỗi.

### 3.3 Cấu hình Cloudflare R2

Thống kê lưu trữ và truy xuất vector cần một bucket R2 hợp lệ. Tạo bucket theo các bước sau:

1. Đăng nhập vào bảng điều khiển Cloudflare, chọn mục R2.
2. Tạo bucket với tên `uth-scientific-lakehouse` để khớp mặc định.
3. Mở trang R2 và chọn *Manage R2 API Tokens*.
4. Tạo token với quyền *Object Read & Write* cho bucket vừa tạo.
5. Sao chép ba giá trị: điểm cuối, khóa truy cập, khóa bí mật.
6. Điền ba giá trị đó vào `.env` cùng tên bucket.

Khi cấu hình đúng, lệnh kiểm tra sau sẽ trả về kích thước từng vùng lưu trữ:

```bash
curl http://localhost:8000/api/storage/stats
```

Nếu không có quyền truy cập, endpoint trả về trạng thái lỗi thay vì làm sập ứng dụng. Nguyên nhân thường gặp là điểm cuối sai vùng, tên bucket không khớp, hoặc token đã hết hạn.

### 3.4 Cấu hình dữ liệu thu thập

Nhóm biến này chỉ phân hệ khai phá dữ liệu sử dụng, không ảnh hưởng đến việc chạy backend.

| Nhóm | Biến tiêu biểu | Mục đích |
|------|-----------------|----------|
| Thu thập arXiv | `ARXIV_CATEGORIES`, `ARXIV_REQUEST_DELAY_SECONDS` | Chủ đề theo dõi và nhịp gửi yêu cầu |
| Thu thập OpenAlex | `OPENALEX_API_KEY`, `OPENALEX_EMAIL`, `OPENALEX_SUB_FIELDS` | Khóa, thư điện liên hệ và trường dữ liệu cần lấy |
| Giới hạn tải | `CRAWLER_MAX_CONCURRENCY`, `CRAWLER_MAX_RETRIES`, `CRAWLER_TIMEOUT_TOTAL` | Số luồng song song và thời gian chờ tối đa |
| Bộ ngắt mạch | `CRAWLER_CIRCUIT_BREAKER_THRESHOLD`, `CRAWLER_CIRCUIT_BREAKER_COOLDOWN` | Ngưỡng lỗi và thời gian nghỉ |
| Hạn mức theo nguồn | `ICLR_RATE_LIMIT_RPS`, `ICML_RATE_LIMIT_RPS`, `KDD_RATE_LIMIT_RPS`, `NEURIPS_RATE_LIMIT_RPS`, `OPENREVIEW_RATE_LIMIT_RPS` | Số yêu cầu mỗi giây cho từng hội nghị |
| Vùng dữ liệu | `DATA_RAW_DIR`, `SILVER_DIR`, `MANIFEST_DIR` | Vị trí lưu dữ liệu cục bộ |
| Mô hình nhúng | `EMBEDDING_MODEL_PATH` | Đường dẫn tới mô hình nhúng văn bản |

---
---

## 4. Cài đặt theo hệ điều hành

### 4.1 Yêu cầu tiên quyết

| Công cụ | Phiên bản | Ghi chú |
|---------|-----------|---------|
| Python | 3.11 hoặc 3.12 | Ràng buộc khai báo trong [`data_mining/pyproject.toml`](data_mining/pyproject.toml). Python 3.10 không được hỗ trợ |
| Node.js | 22 trở lên | Bản dài hạn, tương thích Vite 8 |
| Trình quản lý phiên bản | uv, pyenv hoặc asdf | Giúp chuyển đổi phiên bản Python linh hoạt |
| Công cụ cho biến môi trường | Tích hợp sẵn | Windows dùng `setx`, các hệ còn lại dùng `export` |

Kiểm tra phiên bản đang cài trước khi bắt đầu:

```bash
python3 --version
node --version
npm --version
```

Nếu chưa có Python 3.11, cách nhanh nhất trên macOS và Linux là dùng `uv`:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
uv python install 3.11
```

Trên Windows dùng trình cài đặt chính thức của Python và chọn phiên bản 3.11 trong trình hướng dẫn.

### 4.2 macOS

<details open>
<summary><b>Các bước cài đặt</b></summary>

**Bước 1 — Sao chép mã nguồn**

```bash
git clone <repository-url> UTH-Data-Mining-Real-Time-Scientific-Data-Mining-Advanced-RAG-System-for-AI-DS
cd UTH-Data-Mining-Real-Time-Scientific-Data-Mining-Advanced-RAG-System-for-AI-DS
```

**Bước 2 — Tạo môi trường ảo Python**

```bash
python3.11 -m venv venv
source venv/bin/activate
python -m pip install --upgrade pip
```

Kiểm tra môi trường đã kích hoạt:

```bash
which python
python --version
```

**Bước 3 — Cài thư viện backend**

```bash
pip install -r backend/requirements.txt
```

**Bước 4 — Cài thư viện phân hệ khai phá dữ liệu**

Chỉ cần bước này nếu bạn định chạy pipeline thu thập hoặc bốn trụ cột khai phá. Nếu chỉ chạy API và giao diện thì có thể bỏ qua.

```bash
pip install -r data_mining/requirements.txt
```

**Bước 5 — Cài thư viện giao diện**

```bash
cd frontend
npm install
cd ..
```

**Bước 6 — Tạo tệp cấu hình**

```bash
cp .env.example .env
```

Sau đó mở `.env` bằng trình soạn thảo và điền khóa Cloudflare R2 theo [§3.3](#33-cấu-hình-cloudflare-r2).

**Bước 7 — Kiểm tra cài đặt**

```bash
python -c "from backend.app.core.config import settings; print('Cau hinh OK:', settings.PROJECT_NAME)"
```

</details>

**Ghi chú riêng cho máy Mac dùng chip Apple Silicon**

Mô hình nhúng văn bản hỗ trợ chạy trực tiếp trên GPU của máy. Nếu gặp lỗi liên quan đến Metal, hãy đặt biến môi trường sau trước khi chạy pipeline:

```bash
export PYTORCH_ENABLE_MPS_FALLBACK=1
```

### 4.3 Windows

<details open>
<summary><b>Các bước cài đặt bằng PowerShell</b></summary>

**Bước 1 — Sao chép mã nguồn**

```powershell
git clone <repository-url> UTH-Data-Mining-Real-Time-Scientific-Data-Mining-Advanced-RAG-System-for-AI-DS
Set-Location UTH-Data-Mining-Real-Time-Scientific-Data-Mining-Advanced-RAG-System-for-AI-DS
```

**Bước 2 — Tạo môi trường ảo Python**

```powershell
py -3.11 -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
```

Nếu PowerShell báo lỗi không cho phép chạy script, mở PowerShell với quyền quản trị và cho phép thực thi:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

**Bước 3 — Cài thư viện backend**

```powershell
.\venv\Scripts\pip.exe install -r backend\requirements.txt
```

**Bước 4 — Cài thư viện phân hệ khai phá dữ liệu**

```powershell
.\venv\Scripts\pip.exe install -r data_mining\requirements.txt
```

**Bước 5 — Cài thư viện giao diện**

```powershell
Set-Location frontend
npm install
Set-Location ..
```

**Bước 6 — Tạo tệp cấu hình**

```powershell
Copy-Item .env.example .env
notepad .env
```

**Bước 7 — Kiểm tra cài đặt**

```powershell
.\venv\Scripts\python.exe -c "from backend.app.core.config import settings; print('Cau hinh OK:', settings.PROJECT_NAME)"
```

</details>

<details>
<summary><b>Các bước cài đặt bằng Command Prompt</b></summary>

```bat
git clone <repository-url> UTH-Data-Mining-Real-Time-Scientific-Data-Mining-Advanced-RAG-System-for-AI-DS
cd UTH-Data-Mining-Real-Time-Scientific-Data-Mining-Advanced-RAG-System-for-AI-DS

py -3.11 -m venv venv
venv\Scripts\activate.bat
python -m pip install --upgrade pip

pip install -r backend\requirements.txt
pip install -r data_mining\requirements.txt

cd frontend
npm install
cd ..

copy .env.example .env
```

</details>

**Xử lý sự cố đường dẫn dài trên Windows**

Windows giới hạn chiều dài đường dẫn ở mức 260 ký tự. Nếu lỗi cài đặt hoặc biên dịch gói xuất hiện, hãy bật đường dẫn dài bằng lệnh sau trong PowerShell quản trị:

```powershell
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
```

Sau đó sao chép dự án vào thư mục ngắn hơn, ví dụ `C:\dev\uth-rag`, thay vì thư mục tài liệu mặc định.

### 4.4 Linux

<details open>
<summary><b>Các bước cài đặt trên Ubuntu hoặc Debian</b></summary>

**Bước 1 — Cài các gói phụ thuộc hệ thống**

```bash
sudo apt update
sudo apt install -y git python3.11 python3.11-venv python3-pip build-essential
```

Trên Ubuntu 22.04 trở lời, cần thêm kho lưu trữ deadsnakes cho Python 3.11:

```bash
sudo apt install -y software-properties-common
sudo add-apt-repository ppa:deadsnakes/ppa
sudo apt update
sudo apt install -y python3.11 python3.11-venv
```

**Bước 2 — Sao chép mã nguồn**

```bash
git clone <repository-url> UTH-Data-Mining-Real-Time-Scientific-Data-Mining-Advanced-RAG-System-for-AI-DS
cd UTH-Data-Mining-Real-Time-Scientific-Data-Mining-Advanced-RAG-System-for-AI-DS
```

**Bước 3 — Tạo môi trường ảo và cài thư viện**

```bash
python3.11 -m venv venv
source venv/bin/activate
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
pip install -r data_mining/requirements.txt
```

**Bước 4 — Cài thư viện giao diện**

```bash
cd frontend
npm install
cd ..
```

**Bước 5 — Tạo tệp cấu hình**

```bash
cp .env.example .env
nano .env
```

**Bước 6 — Kiểm tra cài đặt**

```bash
python -c "from backend.app.core.config import settings; print('Cau hinh OK:', settings.PROJECT_NAME)"
```

</details>

**Cài Node.js trên Linux**

Nếu chưa có Node.js, dùng trình quản lý phiên bản `nvm` để tránh xung đột với gói của hệ thống:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
node --version
```

### 4.5 Docker

Phương án này dành cho môi trường kiểm thử và triển khai, không thay thế cài đặt gốc khi phát triển.

**Dockerfile mẫu cho backend**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend
COPY data_mining ./data_mining

ENV PYTHONPATH=/app
EXPOSE 8000

CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Build và chạy**

```bash
docker build -t uth-rag-backend .
docker run --rm -p 8000:8000 --env-file .env uth-rag-backend
```

**Chạy frontend trong container**

```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci

COPY frontend .
EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
```

Lưu ý rằng frontend trong container cần proxy trỏ về tên service của backend, không phải `127.0.0.1`, vì mỗi container có không gian mạng riêng.

---

---

## 5. Vận hành từng phân hệ

Ba phân hệ chạy độc lập, mỗi phân hệ một terminal riêng. Trước khi bắt đầu, mở hai hoặc ba terminal và kích hoạt môi trường ảo trong từng terminal.

### 5.1 Backend API

<details open>
<summary><b>macOS / Linux (Bash)</b></summary>

```bash
cd UTH-Data-Mining-Real-Time-Scientific-Data-Mining-Advanced-RAG-System-for-AI-DS
source venv/bin/activate
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

</details>

<details open>
<summary><b>Windows (PowerShell)</b></summary>

```powershell
Set-Location UTH-Data-Mining-Real-Time-Scientific-Data-Mining-Advanced-RAG-System-for-AI-DS
.\venv\Scripts\Activate.ps1
.\venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

</details>

<details>
<summary><b>Windows (Command Prompt)</b></summary>

```bat
cd UTH-Data-Mining-Real-Time-Scientific-Data-Mining-Advanced-RAG-System-for-AI-DS
venv\Scripts\activate.bat
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

</details>

**Giải thích từng cờ lệnh**

| Cờ | Ý nghĩa |
|-----|---------|
| `backend.app.main:app` | Đường dẫn tới đối tượng ứng dụng FastAPI |
| `--host 0.0.0.0` | Lắng nghe trên mọi giao diện mạng, cho phép truy cập từ thiết bị khác trong cùng mạng nội bộ |
| `--port 8000` | Cổng lắng nghe, giá trị này phải khớp với cấu hình proxy của frontend |
| `--reload` | Tự tải lại khi mã nguồn thay đổi, chỉ dùng ở chế độ phát triển |

**Xác nhận máy chủ đã khởi động**

```bash
curl http://localhost:8000/health
```

Phản hồi mong đợi:

```json
{
  "status": "ok",
  "version": "1.0.0",
  "parquet_ready": false
}
```

Trường `parquet_ready` cho biết tệp Parquet tầng Silver đã sẵn sàng hay chưa. Giá trị `false` là bình thường nếu bạn chưa chạy pipeline chuyển đổi dữ liệu.

Ba địa chỉ hữu ích sau khi máy chủ chạy:

| Địa chỉ | Nội dung |
|----------|----------|
| `http://localhost:8000/docs` | Giao diện Swagger, thử các endpoint trực tiếp trên trình duyệt |
| `http://localhost:8000/redoc` | Giao diện ReDoc, hiển thị dạng văn bản |
| `http://localhost:8000/openapi.json` | Đặc tả OpenAPI 3.1 dạng JSON |

### 5.2 Frontend Dashboard

<details open>
<summary><b>macOS / Linux (Bash)</b></summary>

```bash
cd UTH-Data-Mining-Real-Time-Scientific-Data-Mining-Advanced-RAG-System-for-AI-DS/frontend
npm run dev
```

</details>

<details open>
<summary><b>Windows (PowerShell)</b></summary>

```powershell
Set-Location UTH-Data-Mining-Real-Time-Scientific-Data-Mining-Advanced-RAG-System-for-AI-DS\frontend
npm run dev
```

</details>

Mở trình duyệt tại `http://localhost:5173`.

**Cấu hình proxy**

Frontend không gọi trực tiếp cổng 8000. Máy chủ phát triển Vite chuyển tiếp hai đường dẫn tới backend, cấu hình trong [`frontend/vite.config.ts`](frontend/vite.config.ts):

| Đường dẫn | Đích | Mục đích |
|-----------|------|---------|
| `/api` | `http://127.0.0.1:8000` | Toàn bộ endpoint nghiệp vụ |
| `/health` | `http://127.0.0.1:8000` | Kiểm tra sức khỏe |

Nhờ vậy, các lệnh gọi trong mã nguồn dùng đường dẫn tương đối, không phụ thuộc địa chỉ máy chủ. Cùng một mã nguồn chạy được ở cả chế độ phát triển và bản dựng.

**Các lệnh khác**

```bash
npm run build     # Kiểm tra kiểu dữ liệu rồi dựng bản phát hành vào thư mục dist
npm run preview   # Xem trước bản dựng
npm run lint      # Kiểm tra lỗi bằng oxlint
```

### 5.3 Data Mining Engine

Phân hệ khai phá dữ liệu cung cấp các script điều phối cho từng giai đoạn của kiến trúc Lakehouse. Tất cả lệnh dưới đây giả định đã kích hoạt môi trường ảo và đang đứng ở thư mục gốc dự án.

<details open>
<summary><b>macOS / Linux (Bash)</b></summary>

```bash
cd data_mining
export PYTHONPATH=.
python main.py
```

</details>

<details open>
<summary><b>Windows (PowerShell)</b></summary>

```powershell
Set-Location data_mining
$env:PYTHONPATH = "."
..\venv\Scripts\python.exe main.py
```

</details>

**Chạy từng giai đoạn riêng lẻ**

Thay vì chạy toàn bộ pipeline, có thể chạy từng giai đoạn để kiểm soát tốc độ và xử lý lỗi:

```bash
# Giai đoạn 1 — Thu thập dữ liệu thô từ arXiv vào tầng Bronze
python -m src.pipelines.run_ingest --limit 100

# Giai đoạn 2 — Thu thập theo lô lớn
python -m src.pipelines.run_batch_ingest --target 10000

# Giai đoạn 3 — Chuyển đổi từ Bronze sang Silver
python -m src.pipelines.run_transform

# Giai đoạn 4 — Phân rã văn bản và lập chỉ mục vector
python -m src.pipelines.run_indexing

# Giai đoạn 5 — Thử nghiệm RAG trên dữ liệu đã lập chỉ mục
python -m src.pipelines.run_rag
```

**Thu thập từ OpenAlex**

```bash
python -m src.pipelines.run_openalex_collector
python -m src.pipelines.run_openalex_v2_collector
```

Bộ thu thập bản 2 bổ sung cơ chế thử lại theo lũy thừa, bộ ngắt mạch, kiểm soát hạn mức tốc độ và khôi phục sau sự cố. Đây là lựa chọn mặc định khi cần thu thập quy mô lớn.

**Chuẩn bị mô hình nhúng**

```bash
python -m src.pipelines.prepare_embedding_model
```

Chạy lệnh này một lần trước khi lập chỉ mục, để tải và kiểm tra mô hình nhúng về đúng vị trí.

**Kích hoạt bốn trụ cột khai phá từ giao diện**

Sau khi có artifact trong thư mục `data/gold/mining/`, có thể kích hoạt lại quá trình khai phá mà không cần chạy lại pipeline thu thập:

```bash
curl -X POST http://localhost:8000/api/mining/trigger
```

Lệnh này trả về ngay với trạng thái đã đưa vào hàng đợi. Kết quả từng trụ cột được ghi ra thư mục artifact, frontend theo dõi tiến trình qua luồng telemetry.

**Quy trình đầy đủ theo thứ tự**

| Bước | Lệnh | Đầu ra |
|------|------|--------|
| 1 | `python -m src.pipelines.run_ingest --limit 100` | Dữ liệu thô trong tầng Bronze |
| 2 | `python -m src.pipelines.run_transform` | Bảng Parquet ở tầng Silver |
| 3 | `python -m src.pipelines.prepare_embedding_model` | Mô hình nhúng sẵn sàng |
| 4 | `python -m src.pipelines.run_indexing` | Bảng vector ở tầng Gold |
| 5 | `curl -X POST http://localhost:8000/api/mining/trigger` | Artifact của bốn trụ cột |

Bước một đến bốn chạy trong terminal của phân hệ khai phá dữ liệu. Bước năm chạy sau khi backend đã khởi động.

---

## 6. Tham chiếu API

### 6.1 Danh sách endpoint

Máy chủ cung cấp mười tám thao tác, chia thành sáu nhóm chức năng.

**Kiểm tra sức khỏe**

| Phương thức | Đường dẫn | Mô tả |
|-------------|-----------|-------|
| `GET` | `/health` | Trạng thái máy chủ, phiên bản và tình trạng dữ liệu tầng Silver |

**Tìm kiếm và bài báo**

| Phương thức | Đường dẫn | Mô tả |
|-------------|-----------|-------|
| `POST` | `/api/search` | Tìm kiếm ngữ nghĩa trên tầng Gold |
| `GET` | `/api/papers/{paper_id}` | Chi tiết một bài báo theo định danh |

**Hội thoại RAG**

| Phương thức | Đường dẫn | Mô tả |
|-------------|-----------|-------|
| `POST` | `/api/chat` | Hỏi đáp có căn cứ, trả về kết quả đầy đủ |
| `POST` | `/api/chat/stream` | Hỏi đáp có căn cứ, trả về từng đoạn theo thời gian thực |

**Thu thập dữ liệu**

| Phương thức | Đường dẫn | Mô tả |
|-------------|-----------|-------|
| `POST` | `/api/ingestion/start` | Khởi động quá trình thu thập nền |
| `GET` | `/api/ingestion/status` | Trạng thái quá trình thu thập |
| `POST` | `/api/ingestion/stop` | Dừng quá trình thu thập |
| `GET` | `/api/ingestion/stream` | Nguồn sự kiện thu thập theo thời gian thực |

**Lưu trữ**

| Phương thức | Đường dẫn | Mô tả |
|-------------|-----------|-------|
| `GET` | `/api/storage/stats` | Quy mô từng vùng lưu trữ trên Cloudflare R2 |

**Khai phá dữ liệu**

| Phương thức | Đường dẫn | Mô tả |
|-------------|-----------|-------|
| `GET` | `/api/mining/manifest` | Tổng quan kết quả khai phá |
| `GET` | `/api/mining/eda` | Thống kê mô tả tập dữ liệu |
| `GET` | `/api/mining/pillars/association-rules` | Trụ cột 1, luật kết hợp |
| `GET` | `/api/mining/pillars/clusters` | Trụ cột 2, phân cụm ngữ nghĩa |
| `GET` | `/api/mining/pillars/graph` | Trụ cột 3, mạng lưới đồng tác giả |
| `GET` | `/api/mining/pillars/trends` | Trụ cột 4, xu hướng và dị biệt |
| `GET` | `/api/mining/telemetry/stream` | Nguồn sự kiện telemetry theo thời gian thực |
| `POST` | `/api/mining/trigger` | Kích hoạt chạy lại bốn trụ cột |

**Ví dụ gọi bằng dòng lệnh**

Tìm kiếm ngữ nghĩa:

```bash
curl -X POST http://localhost:8000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "transformer attention mechanism", "top_k": 5}'
```

Hỏi đáp có căn cứ:

```bash
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"query": "What is multi-head attention?", "top_k": 5}'
```

Xem luật kết hợp:

```bash
curl http://localhost:8000/api/mining/pillars/association-rules
```

**Mã trạng thái trả về**

| Mã | Ý nghĩa trong hệ thống này |
|----|---------------------------|
| `200` | Thành công |
| `404` | Chưa có artifact khai phá, hoặc không tìm thấy bài báo |
| `503` | Dịch vụ phụ thuộc chưa sẵn sàng, ví dụ chưa có bảng vector |

Hệ thống thiết kế để trả về phản hồi kể cả khi chưa có dữ liệu, thay vì báo lỗi. Giao diện hiển thị trạng thái chờ đi khi thiếu artifact, nhờ đó vẫn xem được các thành phần khác của hệ thống.

### 6.2 Luồng SSE thời gian thực

Ba endpoint trả về luồng sự kiện theo chuẩn Server-Sent Events. Mỗi sự kiện có hai trường, tên sự kiện và tải dữ liệu dạng JSON.

| Đường dẫn | Loại sự kiện |
|-----------|--------------|
| `/api/chat/stream` | Từng đoạn văn bản sinh ra |
| `/api/ingestion/stream` | Tiến độ thu thập dữ liệu |
| `/api/mining/telemetry/stream` | Chỉ số khai phá theo thời gian thực |

**Cấu trúc một sự kiện**

```text
event: tên_sự_kiện
data: {"khoa": "giá trị", ...}

```

**Theo dõi bằng dòng lệnh**

```bash
curl -N http://localhost:8000/api/mining/telemetry/stream
```

Cờ `-N` tắt bộ đệm, cần thiết để sự kiện hiện ra ngay khi đến thay vì bị gom lại rồi mới truyền.

**Cách frontend tiêu thụ**

Lớp dịch vụ trong [`frontend/src/services/mining/mining.stream.service.ts`](frontend/src/services/mining/mining.stream.service.ts) và [`frontend/src/services/rag/rag.stream.service.ts`](frontend/src/services/rag/rag.stream.service.ts) mở kết nối bằng API `EventSource` của trình duyệt, sau đó cập nhật giao diện theo từng sự kiện nhận được.

Khi kết nối bị gián đoạn, frontend tự kết nối lại sau một khoảng chờ ngắn. Backend không cần khởi động lại.

---

---

## 7. Bốn Trụ cột Khai phá

Hệ thống khai phá dữ liệu tổ chức thuật toán thành bốn trụ cột phân tích độc lập. Mỗi trụ cột đọc dữ liệu tầng Gold và ghi kết quả ra tệp JSON riêng trong thư mục `data/gold/mining/`.

| Trụ cột | Thuật toán | Tệp kết quả |
|---------|-----------|--------------|
| 1. Luật kết hợp | Tăng trưởng mẫu phổ biến | `association_rules.json` |
| 2. Phân cụm ngữ nghĩa | K-Means kết hợp DBSCAN | `clusters.json` |
| 3. Mạng lưới đồng tác | Xếp hạng PageRank có hướng | `graph_coauthorship.json` |
| 4. Xu hướng và dị biệt | Rừng cô lập | `trends_anomalies.json` |

Hai tệp bổ trợ phục vụ thống kê mô tả và tổng quan: `eda_summary.json` và `mining_manifest.json`. Tất cả định nghĩa trong [`backend/app/services/mining/constants.py`](backend/app/services/mining/constants.py).

**Trụ cột 1 — Luật kết hợp**

Phát hiện mối quan hệ giữa phân ngành và khái niệm công nghệ. Thuật toán dùng độ bao phủ, độ tin cậy, độ nâng, đòn bẩy và sức thuyết phục. Các luật đối xứng bị loại bỏ để tránh trùng lặp. Kết quả cho phép trả lời câu hỏi như chủ đề nào thường xuất hiện cùng nhau.

**Trụ cột 2 — Phân cụm ngữ nghĩa**

Phân cụm trên vector biểu diễn của từng bài báo sau khi chuẩn hóa độ dài, kết hợp phép chiếu hai chiều bằng phân tích thành phần chính đã trung tâm hóa. Ba chỉ số đánh giá chất lượng phân cụm:

| Chỉ số | Ý nghĩa | Giá trị mong muốn |
|--------|---------|-------------------|
| Silhouette | Mức tách biệt giữa các cụm | càng gần 1 càng tốt |
| Davies-Bouldin | Tỉ lệ tánh rộng trên khoảng cách trung tâm | càng nhỏ càng tốt |
| Calinski-Harabasz | Tỉ lệ giữa phân tán trong và ngoài cụm | càng lớn càng tốt |

Thuật toán mật độ phát hiện thêm các vùng chủ đề lõi đặc và các điểm ngoại biên.

**Trụ cột 3 — Mạng lưới đồng tác**

Dựng đồ thị có hướng trong đó mỗi đỉnh là một bài báo và mỗi cạnh thể hiện quan hệ trích dẫn hoặc đồng tác giả. Xếp hạng PageRank với hệ số giảm dần 0.85 xác định các công trình nền tảng. Phát hiện cộng đồng bằng thuật toán phát hiện cộng đồng, kết hợp với phân tích mức độ và số lượng liên kết.

**Trụ cột 4 — Xu hướng và dị biệt**

Mô hình rừng cô lập, áp dụng biến đổi logarit để giảm ảnh hưởng của giá trị lớn, phát hiện các công trình có cấu trúc bất thường. Phân tích vận tốc xu hướng so sánh quý gần nhất với quý liền trước, rồi phân loại theo mức thay đổi tỷ trọng:

| Phân loại | Ý nghĩa |
|-----------|---------|
| `SURGING` | Tăng trưởng mạnh so với quý trước |
| `STABLE` | Ổn định |
| `DECLINING` | Suy giảm so với quý trước |

Đặc tả toán học đầy đủ của cả bốn trụ cột nằm trong [`data_mining/docs/mining/FOUR_DATA_MINING_PILLARS.md`](data_mining/docs/mining/FOUR_DATA_MINING_PILLARS.md).

---

## 8. Kiến trúc Dữ liệu Medallion

Dữ liệu đi qua ba tầng, mỗi tầng tăng thêm chất lượng và giảm dần mức độ thô.

| Tầng | Nội dung | Định dạng | Đường dẫn |
|------|----------|-----------|-----------|
| Bronze | Tệp HTML thô và siêu dữ liệu JSON chưa chuẩn hóa | HTML, JSON | `bronze/` |
| Silver | Bảng bài báo đã chuẩn hóa, phân vùng theo năm | Parquet nén zstd | `silver/year=<năm>/` |
| Gold | Bảng vector nhúng ngữ cảnh | LanceDB | `gold/lancedb/` |

**Tầng Bronze** giữ nguyên dữ liệu như thu thập được, kèm chữ ký băm bảo toàn tính toàn vẹn. Tầng này cho phép khôi phục nếu tầng phía trên gặp sự cố.

**Tầng Silver** chuẩn hóa cấu trúc, tách theo năm xuất bản để truy vấn theo phạm vi, nén bằng zstd để giảm dung lượng. Bảng chứa siêu dữ liệu, toàn văn, và chỉ mục trích dẫn.

**Tầng Gold** lưu vector nhúng của từng đoạn văn bản, phục vụ truy xuất ngữ nghĩa thời gian thực. Bảng vector cùng nằm trong tầng này là nơi lưu artifact của bốn trụ cột.

**Liên kết từ R2**

Ba tầng đều được nhân bản lên Cloudflare R2 dưới cùng một bucket. Khi cấu hình `LANCEDB_URI` bắt đầu bằng `s3://`, tầng Gold được truy cập trực tiếp từ đám mây thay vì đĩa cục bộ. Cơ chế này dùng giao thức S3 tương thích, nên không cần cài thêm thư viện.

---

## 9. Kiểm thử

### 9.1 Kiểm thử backend

<details open>
<summary><b>macOS / Linux (Bash)</b></summary>

```bash
source venv/bin/activate
python -m pytest backend/tests/test_api.py -v
```

</details>

<details open>
<summary><b>Windows (PowerShell)</b></summary>

```powershell
.\venv\Scripts\Activate.ps1
.\venv\Scripts\python.exe -m pytest backend\tests\test_api.py -v
```

</details>

Bộ kiểm thử dùng `TestClient` của FastAPI nên không cần khởi động máy chủ thật.

### 9.2 Kiểm thử phân hệ khai phá dữ liệu

```bash
cd data_mining
python -m pytest tests/ -v
```

Cấu hình pytest trong [`data_mining/pytest.ini`](data_mining/pytest.ini) tự động bỏ qua các bài kiểm thử cần thiết bị đồ họa khi máy không có GPU.

### 9.3 Kiểm thử giao diện

```bash
cd frontend
npm run lint
npm run build
```

Lệnh build chạy kiểm tra kiểu dữ liệu TypeScript trước khi dựng gói. Chỉ khi cả hai bước đều đạt thì bản dựng mới được tạo ra thư mục `dist/`.

### 9.4 Kiểm thử liên tục

Hồ sơ [`\.github/workflows/ci.yml`](.github/workflows/ci.yml) chạy kiểm tra tự động trên mỗi lần đẩy mã. Quy trình cài đặt Node.js trong hồ sơ này dựa vào tệp `.nvmrc` ở thư mục gốc. Nếu tệp này chưa tồn tại trong bản sao cục bộ, cần tạo trước khi chạy CI.

---

## 10. Xử lý sự cố

<details>
<summary><b>Máy chủ backend không khởi động</b></summary>

**Triệu chứng**

```text
ModuleNotFoundError: No module named 'data_mining.src.mining.mining_engine'
```

**Nguyên nhân**

Tệp `mining_engine.py` trong thư mục `data_mining/src/mining/` không có trong bản sao cục bộ. Tệp này thuộc nhóm artifact dùng chung giữa các nhánh và không được theo dõi bởi git.

**Cách xử lý**

Lấy tệp từ nhánh khác trong cùng kho mã nguồn rồi đặt vào `data_mining/src/mining/`. Hoặc chạy lệnh sau từ thư mục gốc để backend tìm thấy mã nguồn:

```bash
PYTHONPATH=. python -m uvicorn backend.app.main:app --port 8000
```

Trên Windows dùng `$env:PYTHONPATH = "."` thay cho dòng trên.

</details>

<details>
<summary><b>Không truy cập được trang tài liệu API</b></summary>

**Triệu chứng**

Trình duyệt báo không kết nối được tới `http://localhost:8000/docs`.

**Cách xử lý**

Kiểm tra máy chủ đã khởi động chưa:

```bash
curl http://localhost:8000/health
```

Nếu cổng 8000 bị chiếm, đổi cổng cho backend rồi cập nhật cấu hình proxy trong [`frontend/vite.config.ts`](frontend/vite.config.ts) cho khớp:

```bash
python -m uvicorn backend.app.main:app --port 8001
```

Tìm và giết tiến trình đang chiếm cổng:

```bash
# macOS và Linux
lsof -ti:8000 | xargs kill

# Windows
netstat -ano | findstr :8000
taskkill /PID <mã-tiến-trình> /F
```

</details>

<details>
<summary><b>Frontend tải được nhưng không có dữ liệu</b></summary>

**Triệu chứng**

Giao diện hiển thị trạng thái chờ đi hoặc thông báo chưa có dữ liệu.

**Nguyên nhân thường gặp**

| Triệu chứng | Nguyên nhân | Cách xử lý |
|-------------|-------------|-------------|
| Thống kê lưu trữ báo lỗi | Thiếu hoặc sai khóa R2 trong `.env` | Điền lại khóa theo [§3.3](#33-cấu-hình-cloudflare-r2) |
| Tìm kiếm trả về rỗng | Chưa có bảng vector ở tầng Gold | Chạy `python -m src.pipelines.run_indexing` |
| Các trụ cột báo chưa có | Chưa sinh artifact khai phá | Gọi `POST /api/mining/trigger` |
| Trường `parquet_ready` là `false` | Chưa chuyển đổi sang tầng Silver | Chạy `python -m src.pipelines.run_transform` |

</details>

<details>
<summary><b>Hội thoại RAG trả lời chung chung</b></summary>

**Nguyên nhân**

Không có mô hình ngôn ngữ nào phản hồi, nên hệ thống dùng câu trả lời dựng sẵn. Chuỗi dự phòng được thử theo thứ tự máy chủ cục bộ, Ollama, rồi Groq.

**Cách xử lý**

Kiểm tra từng dịch vụ có phản hồi không:

```bash
curl http://localhost:9001/v1/models
curl http://localhost:11434/api/tags
```

Nếu dùng Groq, đảm bảo `.env` có `GROQ_API_KEY` hợp lệ.

</details>

<details>
<summary><b>Lỗi khi cài thư viện trên Windows</b></summary>

| Thông báo | Nguyên nhân | Cách xử lý |
|-----------|-------------|-------------|
| `running scripts is disabled on this system` | Chính sách thực thi của PowerShell | `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` |
| `ImportError: DLL load failed` | Thiếu Visual C++ Redistributable | Cài gói cập nhật từ trang Microsoft Visual C++ |
| Lỗi đường dẫn quá 260 ký tự | Giới hạn đường dẫn cũ của Windows | Bật `LongPathsEnabled`, sao chép dự án vào `C:\dev\uth-rag` |

</details>

<details>
<summary><b>Môi trường ảo không kích hoạt được</b></summary>

Nếu lệnh `source venv/bin/activate` báo lỗi, thường là do môi trường ảo được tạo bằng phiên bản Python khác. Tạo lại từ đầu:

```bash
rm -rf venv
python3.11 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
```

Trên Windows dùng `Remove-Item -Recurse -Force venv` thay cho `rm -rf`.

</details>

---

## 11. Quy ước phát triển

### 11.1 Cấu trúc mã nguồn

Ba nguyên tắc bắt buộc khi thêm mã nguồn mới, áp dụng cho cả ba phân hệ:

1. **Một package, một miền nghiệp vụ.** Không trộn hai miền vào cùng thư mục. Muốn thêm chức năng thuộc miền mới thì tạo package mới.
2. **Không gom chức năng của tầng này sang tầng khác.** Tầng `api` chỉ điều phối HTTP, không chứa logic nghiệp vụ. Tầng `services` không biết về HTTP.
3. **Không dồn nhiều việc vào một tệp.** Giữ mỗi tệp dưới 80 dòng. Khi vượt ngưỡng, tách theo trách nhiệm: hằng số riêng, định tuyến riêng, xử lý lỗi riêng, logic riêng.

Ngoài ra, mã nguồn không chứa chú thích giải thích, không dùng biểu tượng cảm xúc, và không để nhánh mặc định của tệp `.env` vào kho mã nguồn.

### 11.2 Tài liệu

Mọi tệp Markdown mới hoặc được cập nhật phải tuân theo bảy trường tiêu đề bắt buộc, gồm lý do tồn tại, mục đích, quy trình tổng hợp, kế hoạch chi tiết, tài liệu tham chiếu, thời điểm tạo và thời điểm cập nhật gần nhất theo chuẩn ISO 8601 kèm múi giờ.

Quy định đầy đủ nằm trong [`data_mining/docs/agents/rules/MD_CONVENTION.md`](data_mining/docs/agents/rules/MD_CONVENTION.md).

### 11.3 Quy ước đặt tên

| Loại | Quy ước | Ví dụ |
|------|----------|-------|
| Tệp Python | `snake_case` | `row_mapper.py` |
| Lớp Pydantic | `PascalCase` kèm hậu tố | `ClustersResponse` |
| Hàm và biến | `snake_case` | `convert_to_gb` |
| Hằng số | `UPPER_SNAKE_CASE` | `DEFAULT_TOP_K` |
| Component React | `PascalCase.component.tsx` | `PaperCard.component.tsx` |
| Hàm tiện ích TypeScript | `use` tiềp tố | `useTranslation.ts` |

Mỗi thư mục khai phá dữ liệu có tệp `__init__.py` tái xuất các thành phần công khai, giúp cho việc nhập theo gói thay vì theo tệp.

### 11.4 Tài liệu tham khảo

| Tài liệu | Nội dung |
|----------|----------|
| [`Architecture.md`](Architecture.md) | Cây thư mục toàn dự án, sinh tự động |
| [`data_mining/docs/mining/FOUR_DATA_MINING_PILLARS.md`](data_mining/docs/mining/FOUR_DATA_MINING_PILLARS.md) | Đặc tả thuật toán và công thức toán học của bốn trụ cột |
| [`data_mining/docs/mining/PIPELINE_EXECUTION_GUIDE.md`](data_mining/docs/mining/PIPELINE_EXECUTION_GUIDE.md) | Hướng dẫn vận hành pipeline và cờ dòng lệnh |
| [`data_mining/docs/agents/rules/MD_CONVENTION.md`](data_mining/docs/agents/rules/MD_CONVENTION.md) | Chuẩn định dạng tài liệu Markdown |
| [`data_mining/docs/agents/rules/NAMING_CONVENTION.md`](data_mining/docs/agents/rules/NAMING_CONVENTION.md) | Chuẩn đặt tên mã nguồn |
| [`backend/README.md`](backend/README.md) | Tài liệu riêng của phân hệ backend |
| [`frontend/README.md`](frontend/README.md) | Tài liệu riêng của phân hệ giao diện |

---
