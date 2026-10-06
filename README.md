# UTH Scientific Data Mining & Advanced RAG System for AI/DS

- **Motivation/Background**: Xây dựng hệ thống khai thác dữ liệu nghiên cứu khoa học thời gian thực và truy xuất tri thức nâng cao (RAG) cho miền Trí tuệ Nhân tạo & Khoa học Dữ liệu (AI/DS) phục vụ học phần Khai phá Dữ liệu tại Trường Đại học Giao thông Vận tải TP.HCM (UTH).
- **Purpose**: Đóng vai trò là điểm truy cập trung tâm, đặc tả kiến trúc kỹ thuật, hướng dẫn khởi chạy phân hệ khai phá dữ liệu, dịch vụ backend API và giao diện giám sát dashboard tương tác.
- **Methodology**: Kiến trúc Medallion Lakehouse kết hợp quy trình chuẩn CRISP-DM & KDD (Thu thập arXiv/OpenAlex -> Lưu trữ Bronze bất biến -> Chuẩn hóa Silver Parquet & Đồ thị trích dẫn -> Đánh chỉ mục Gold LanceDB & 4 Trụ cột Khai phá -> Phục vụ qua FastAPI & React 19).
- **References**: [docs/PURPOSE.md](docs/PURPOSE.md), [docs/OVERVIEW.md](docs/OVERVIEW.md), [docs/presentation/data_mining_defense_presentation.html](docs/presentation/data_mining_defense_presentation.html), [docs/mining/FOUR_DATA_MINING_PILLARS.md](docs/mining/FOUR_DATA_MINING_PILLARS.md), [docs/mining/PIPELINE_EXECUTION_GUIDE.md](docs/mining/PIPELINE_EXECUTION_GUIDE.md), [agents/rules/AGENT_AI.md](agents/rules/AGENT_AI.md).
- **Created**: 2026-07-25T00:00:00+07:00
- **Last Updated**: 2026-10-06T07:00:00+07:00

---

## 1. Cấu trúc Dự án (Polyglot Monorepo Architecture)

Dự án được chuẩn hóa theo kiến trúc Monorepo phân tách rõ ràng giữa phân hệ **Khai phá Dữ liệu (Python)**, **Ứng dụng Phục vụ Backend API (FastAPI)**, **Giao diện Giám sát Dashboard (React 19 / Vite)**, và **Hệ thống Quản trị AI Governance**:

```text
UTH-Data-Mining/
├── frontend/                      # [1] Phân hệ Giao diện Dashboard (React 19 / Vite / Tailwind)
│   ├── src/
│   │   ├── components/            # MiningPillarsView, Live Telemetry, RAG Chat, ScientificMath
│   │   └── App.tsx                # Dashboard điều khiển & giám sát thời gian thực
│   ├── package.json
│   └── vite.config.ts
│
├── backend/                       # [2] Phân hệ Backend API & Serving (Python / FastAPI)
│   ├── app/
│   │   ├── api/endpoints/        # Endpoints: search, chat, papers, storage, mining
│   │   ├── core/config.py        # Cấu hình Pydantic đọc từ file .env
│   │   ├── schemas/              # Pydantic Schemas (Request/Response)
│   │   ├── services/             # Retrieval, RAG, Storage, Mining services
│   │   └── main.py               # Điểm khởi chạy FastAPI, CORS, SSE, Swagger
│   ├── tests/                    # Integration TestClient test suite (12/12 passing)
│   ├── requirements.txt
│   └── README.md
│
├── data_mining/                   # [3] Phân hệ Data Mining & Lakehouse (Python)
│   ├── src/
│   │   ├── config/               # Cấu hình hệ thống & môi trường
│   │   ├── ingestion/            # Thu thập arXiv OAI-PMH & cào HTML5
│   │   ├── transformation/       # Parser HTML & Silver Parquet Writer
│   │   ├── indexing/             # Nomic Embedder (MPS/GPU/CPU) & LanceDB
│   │   ├── storage/              # Cloudflare R2 & DuckDB SQL Engine
│   │   ├── rag/                  # Scientific RAG Engine & Prompt Templates
│   │   ├── mining/               # Master Mining Engine & 4 Analytical Pillars:
│   │   │   ├── association_rules.py     # Pillar 1: FP-Growth Rule Mining
│   │   │   ├── cluster_analysis.py      # Pillar 2: K-Means & DBSCAN Semantic Clustering
│   │   │   ├── graph_mining.py          # Pillar 3: Directed Citation Graph & PageRank
│   │   │   ├── trend_anomaly_mining.py  # Pillar 4: Isolation Forest & Trend Velocity
│   │   │   └── mining_engine.py         # Master Sequential Orchestrator
│   │   └── pipelines/            # Master Pipeline (Bronze -> Silver -> Gold)
│   ├── tests/                    # Integration & connection tests
│   ├── tools/                    # Công cụ kiểm tra storage (check_storage.py)
│   ├── main.py                   # Điểm kích hoạt Ingestion Pipeline
│   └── requirements.txt
│
├── src/                           # [4] Thư viện pipeline trung tâm & utilities
│   ├── indexing/                 # Chunker, Embedder, LanceDB manager
│   ├── ingestion/                # arXiv harvester & batch collector
│   ├── mining/                   # Core mining modules
│   ├── pipelines/                # Pipeline orchestrator scripts
│   ├── rag/                      # RAG engine & prompt templates
│   ├── storage/                  # DuckDB engine & Cloudflare R2 client
│   └── transformation/           # HTML parser & Silver Parquet writer
│
├── agents/                        # [5] Constitutional AI Governance (Quy chuẩn bất biến)
│   ├── README.md                  # Hướng dẫn điều hướng governance
│   ├── rules/                     # Tiêu chuẩn ràng buộc (AGENT_AI, MD_CONVENTION, v.v.)
│   └── templates/                 # Biểu mẫu chuẩn (BUG, EXPERIMENT, PHASE, PROGRESS)
│
├── docs/                          # [6] Toàn bộ tài liệu kiến trúc, nghiên cứu & báo cáo
│   ├── README.md                  # Mục lục tài liệu nghiên cứu
│   ├── PURPOSE.md                 # Yêu cầu dự án & tiêu chí thành công
│   ├── OVERVIEW.md                # Bản thiết kế kỹ thuật tổng thể & lộ trình
│   ├── benchmarks/                # Đánh giá hiệu năng RAG (DeepEval Suite & Báo cáo)
│   │   ├── DEEPEVAL_GUIDE.md      # Hướng dẫn chạy benchmark DeepEval
│   │   └── RAG_EVALUATION_REPORT_21_SAMPLES.md # Báo cáo đánh giá so sánh 21 mẫu (+35% Precision)
│   ├── mining/                    # Tài liệu chi tiết 4 Trụ cột Khai phá Dữ liệu
│   │   ├── FOUR_DATA_MINING_PILLARS.md    # Đặc tả kỹ thuật & công thức toán học
│   │   └── PIPELINE_EXECUTION_GUIDE.md    # Hướng dẫn vận hành chi tiết
│   └── shared/                    # SOPs và mẫu bàn giao (HANDOFF_TEMPLATE.md)
│
├── data/                          # [7] Bộ nhớ đệm dữ liệu cục bộ (.gitignore)
│   ├── raw/                      # 9,000+ HTML học thuật thô & JSON manifest
│   ├── silver/year=2026/         # Parquet (13,000 bài báo, 2.76M công thức toán)
│   ├── silver/citations.parquet  # 441,445 liên kết trích dẫn (86,295 liên kết nội bộ)
│   ├── gold/lancedb/             # LanceDB Vector Table (143,523 vectors 768-dim)
│   └── gold/mining/              # Các artifact JSON phục vụ 4 Trụ cột Mining
│
├── models/                        # [8] Trọng số mô hình AI (.gitignore)
│   ├── nomic-embed-text-v1.5/    # Mô hình nhúng học thuật
│   └── qwen2.5-7b-instruct-...   # Mô hình LLM cục bộ (GGUF Q4_K_M)
│
├── tests/                         # [9] Suite kiểm thử đơn vị và tích hợp hệ thống
├── logs/                          # [10] Nhật ký thực thi theo timestamp (.gitignore)
├── requirements.txt               # Tập tin phụ thuộc Python hợp nhất
├── pyproject.toml                 # Cấu hình gói và build hệ thống
└── .env                           # Biến môi trường và khóa Cloudflare R2
```

---

## 2. Hướng dẫn Khởi chạy Từng Phân hệ

### A. Khởi tạo Môi trường Python

```bash
# Windows
python -m venv .venv
.\.venv\Scripts\activate

# Linux / macOS
python3 -m venv .venv
source .venv/bin/activate

# Nâng cấp pip và cài đặt thư viện
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install -e .
```

---

### B. Chạy Master Data Mining Engine (4 Trụ Cột Khai Phá)

Phân hệ Khai phá Dữ liệu xử lý toàn bộ 13,000 bài báo và 86,295 liên kết trích dẫn, tạo ra các artifact trong `data/gold/mining/`:

#### Trên Windows (PowerShell):

```powershell
# 1. Kích hoạt môi trường ảo
.\.venv\Scripts\Activate.ps1

# 2. Khai báo PYTHONPATH
$env:PYTHONPATH = "data_mining"

# 3. Chạy toàn bộ 4 Trụ cột Khai phá & Modeling
.\.venv\Scripts\python.exe data_mining/src/mining/mining_engine.py
```

#### Trên Linux / macOS (Bash):

```bash
# 1. Kích hoạt môi trường ảo
source .venv/bin/activate

# 2. Khai báo PYTHONPATH và chạy engine
PYTHONPATH=data_mining python data_mining/src/mining/mining_engine.py
```

> **Xem tài liệu chi tiết**:
>
> - Đặc tả thuật toán & toán học: [`docs/mining/FOUR_DATA_MINING_PILLARS.md`](docs/mining/FOUR_DATA_MINING_PILLARS.md)
> - Hướng dẫn vận hành & cờ dòng lệnh CLI: [`docs/mining/PIPELINE_EXECUTION_GUIDE.md`](docs/mining/PIPELINE_EXECUTION_GUIDE.md)

---

### C. Phân hệ Local LLM Microservice (Port 9001 / Ollama Port 11434)

Hệ thống RAG sử dụng mô hình ngôn ngữ lớn cục bộ (Qwen 2.5 7B Instruct GGUF Q4_K_M) để tổng hợp câu trả lời học thuật:

#### Cách 1: Khởi chạy NestJS LLM Microservice với GPU CUDA (Khuyến nghị - Port 9001)

```powershell
# Chạy từ thư mục gốc dự án (yêu cầu Node.js >= 18):
node dist/apps/llm-service/apps/llm-service/src/main.js

# Máy chủ LLM sẽ tải mô hình GGUF và tăng tốc qua CUDA:
# - LLM Service API:     http://localhost:9001
# - Swagger API Docs:    http://localhost:9001/docs
# - Endpoint tương thích: http://localhost:9001/v1/chat/completions
```

#### Cách 2: Khởi chạy qua Ollama (Dự phòng - Port 11434)

```bash
# Khởi động máy chủ Ollama
ollama serve

# Tải và chạy mô hình Qwen 2.5 7B
ollama run qwen2.5:7b
```

---

### D. Phân hệ Backend API & Serving (`backend/` - FastAPI Port 8000)

Máy chủ FastAPI phục vụ cả truy xuất ngữ nghĩa RAG thời gian thực (hybrid FTS + BM25 + LanceDB) lẫn 4 Trụ cột Khai phá:

#### Trên Windows (PowerShell):

```powershell
# 1. Kích hoạt môi trường ảo
.\.venv\Scripts\Activate.ps1

# 2. Khởi chạy máy chủ FastAPI (Port 8000)
.\.venv\Scripts\uvicorn.exe backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### Trên Linux / macOS (Bash):

```bash
# 1. Kích hoạt môi trường ảo
source .venv/bin/activate

# 2. Khởi chạy máy chủ FastAPI (Port 8000)
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### Kiểm thử & Tài liệu API:

```bash
# Chạy kiểm thử tự động (12/12 passing)
pytest backend/tests/test_api.py -v

# Xem tài liệu API tương tác:
# - Swagger UI: http://localhost:8000/docs
# - ReDoc:      http://localhost:8000/redoc
# - Health API: http://localhost:8000/health
```

---

### E. Phân hệ Giao diện Dashboard (`frontend/` - React 19 / Vite Port 5173)

Giao diện tương tác trực quan hóa biểu đồ 4 Trụ cột Mining và trò chuyện RAG học thuật theo thời gian thực:

```bash
# 1. Chuyển vào thư mục frontend
cd frontend

# 2. Cài đặt thư viện phụ thuộc (nếu chưa cài)
npm install

# 3. Khởi chạy máy chủ giao diện (Port 5173)
npm run dev

# 4. Build kiểm tra sản phẩm:
npm run build

# 5. Truy cập giao diện tại: http://localhost:5173
```

---

### F. Thứ Tự Khởi Chạy Chuẩn Toàn Hệ Thống (End-to-End Startup Sequence)

Để đảm bảo toàn bộ hệ thống hoạt động đồng bộ và không gặp lỗi kết nối, hãy mở 3 terminal riêng biệt và khởi chạy theo đúng thứ tự:

1. **Terminal 1 (LLM Microservice)**:

   ```powershell
   node dist/apps/llm-service/apps/llm-service/src/main.js
   ```

   *(Chờ đến khi xuất hiện thông báo `LLM Service running on http://localhost:9001`)*
2. **Terminal 2 (FastAPI Backend)**:

   ```powershell
   .\.venv\Scripts\uvicorn.exe backend.app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

   *(Backend sẽ tự động phát hiện LLM microservice trên port 9001 và kết nối LanceDB cục bộ)*
3. **Terminal 3 (React 19 Frontend)**:

   ```powershell
   cd frontend
   npm run dev
   ```

   *(Mở trình duyệt tại `http://localhost:5173`. Các tab EDA, 4 Trụ cột Mining và Grounded RAG Chat sẽ tải dữ liệu mượt mà)*

---

## 3. Tổng quan 4 Trụ Cột Khai Phá & Modeling (Data Mining Pillars)

1. **Trụ cột 1: Khai phá Tập mục Phổ biến & Luật Kết hợp (FP-Growth)**
   - Khai phá các quy luật kết hợp giữa các phân ngành arXiv (`cs.CL`, `cs.AI`, `cs.CV`) và 25+ khái niệm công nghệ AI/DS.
   - Xử lý 11,404 giao dịch (độ bao phủ 87.7% toàn tập dữ liệu), loại trừ luật đối xứng trùng lặp, phát hiện các luật có Lift cao (e.g. `tag:large-language-models` $\to$ `cat:cs.CL`, Lift: 3.45x).
2. **Trụ cột 2: Phân cụm Ngữ nghĩa & Phân tích Mật độ (Semantic Clustering)**
   - Phân cụm trên vector đại diện từng bài báo (L2-normalized) kết hợp chiếu tọa độ 2D bằng PCA đã khử kỳ vọng (Centered PCA).
   - Đánh giá chất lượng phân cụm: Silhouette Score = 0.0629, Davies-Bouldin Index = 3.98, Calinski-Harabasz Index = 84.1.
   - Thuật toán DBSCAN phát hiện 4 vùng chủ đề lõi đậm đặc và 53.5% bài báo ngoại biên.
3. **Trụ cột 3: Khai phá Mạng lưới Khoa học & Đồ thị Trích dẫn (Citation Graph Mining)**
   - Đồ thị trích dẫn có hướng gồm 8,892 bài báo và 86,295 liên kết trích dẫn nội bộ.
   - Thuật toán PageRank có hướng ($\alpha=0.85$) phát hiện các công trình mang tính cột mốc học thuật (*Attention Is All You Need*, *ELMo*, v.v.) và phân chia 92 cộng đồng nghiên cứu chuyên sâu.
4. **Trụ cột 4: Vận tốc Xu hướng & Phát hiện Điểm dị biệt Cấu trúc (Trend & Anomalies)**
   - Mô hình Isolation Forest với hàm co dãn $\log(1+x)$ phát hiện 30 công trình dị biệt về cấu trúc (luận văn dày dặn, mật độ công thức toán cực cao, nhóm hợp tác quy mô lớn).
   - Phân tích vận tốc xu hướng chuẩn hóa theo tỷ trọng thị trường ($\Delta \text{Share}$), phân loại khách quan 3 nhóm động lượng: `SURGING` (Tăng trưởng nóng), `STABLE` (Ổn định), `DECLINING` (Thu hẹp tỷ trọng).

---

## 4. Kiến trúc Dữ liệu Medallion Lakehouse

- **Bronze Zone (`s3://uth-scientific-lakehouse/bronze/`)**: Lưu trữ 9,022 file HTML học thuật thô và các payload JSON thu thập từ arXiv OAI-PMH với chữ ký bảo toàn SHA-256.
- **Silver Zone (`s3://uth-scientific-lakehouse/silver/`)**: Lưu trữ 13,000 bài báo dạng bảng cột Apache Parquet nén `zstd`, chứa hơn 2.76 triệu công thức toán LaTeX và 441,445 liên kết trích dẫn khoa học.
- **Gold Zone (`s3://uth-scientific-lakehouse/gold/`)**: Bảng vector LanceDB chứa 143,523 vector nhúng ngữ cảnh 768 chiều phục vụ tìm kiếm ngữ nghĩa, cùng 5 tệp artifact JSON phục vụ phân tích 4 Trụ cột Khai phá.

---

## 5. 📊 Đánh giá Chất lượng RAG (DeepEval Benchmarking)

Hệ thống RAG được đánh giá tự động bằng bộ kiểm thử [DeepEval 2.x](https://github.com/confident-ai/deepeval) trên 21 câu hỏi học thuật vàng (`gold-001` đến `gold-021`) sử dụng mô hình thẩm định cục bộ `qwen2.5-7b-instruct` (CUDA).

### Bảng So sánh Hiệu năng (Baseline vs. Upgraded RAG với Cross-Encoder)

| Chỉ số DeepEval                     | Baseline (Dense Only) |       Reranker + Guardrails       |   Mức Cải thiện   | Trạng thái                                              |
| :------------------------------------ | :--------------------: | :-------------------------------: | :------------------: | :-------------------------------------------------------- |
| **Contextual Precision**        | `0.637` (60.0% pass) | **`0.860` (80.0% pass)** | **+35.0%** 🚀 | **Độ chính xác tăng vọt**                     |
| **Answer Relevancy**            | `0.687` (47.4% pass) | **`0.752` (55.0% pass)** |  **+9.4%** 📈  | **Câu trả lời cô đọng, đúng trọng tâm**   |
| **Contextual Recall**           | `0.950` (95.0% pass) | **`1.000` (100.0% pass)** |  **+5.3%** 🎯  | **Bao phủ 100% tri thức chuẩn**                  |
| **Faithfulness**                | `0.668` (50.0% pass) | **`0.699` (52.9% pass)** | **+4.7%** 🛡️ | **Giảm thiểu tối đa ảo giác (hallucination)** |
| **Academic Citation Grounding** | `0.757` (90.5% pass) | **`0.720` (90.0% pass)** |     Đạt chuẩn     | **90% trích dẫn chính xác `[Paper: <id>]`**   |

> 📖 **Xem báo cáo phân tích chi tiết toàn diện**:
>
> - [Báo cáo Đánh giá Hiệu năng RAG 21 Mẫu (RAG_EVALUATION_REPORT_21_SAMPLES.md)](docs/benchmarks/RAG_EVALUATION_REPORT_21_SAMPLES.md)
> - [Hướng dẫn Vận hành Suite DeepEval (DEEPEVAL_GUIDE.md)](docs/benchmarks/DEEPEVAL_GUIDE.md)

---

## 6. 📑 Báo Cáo & Slide Thuyết Trình Hội Đồng (Executive Defense Deck)

Báo cáo thuyết trình bảo vệ đồ án được biên soạn dưới dạng **Standalone HTML Slide Deck** chuẩn học thuật (Scientific Editorial / arXiv Print style), tích hợp trực tiếp dữ liệu thực nghiệm từ Lakehouse Gold và kết quả DeepEval:

- **Tệp trình chiếu chính**: [`docs/presentation/data_mining_defense_presentation.html`](docs/presentation/data_mining_defense_presentation.html) *(Mở trực tiếp trên bất kỳ trình duyệt web nào, không cần máy chủ phục vụ)*
- **Kịch bản biên dịch lại**:

  ```powershell
  .\.venv\Scripts\python.exe scripts/build_presentation_report.py
  ```
- **Cấu trúc 16 Slide Bảo vệ (Plot-First)**:

  - **Slide 1**: Bìa học thuật & Thông tin đề tài Hội đồng.
  - **Slide 2**: Kiến trúc Medallion Lakehouse 3 tầng & DuckDB Zero-copy OLAP Flow.
  - **Slide 3 - 5**: Khám phá dữ liệu (EDA) — Phân bố chuyên ngành, 2.76M công thức toán, Bùng nổ GenAI 2024, và Ma trận đồng xuất bản liên ngành.
  - **Slide 6 - 7**: Trụ cột 1 — FP-Growth Mining (30 luật kết hợp) & Phân định luật kỹ thuật (`cs.SY <=> eess.SY`) vs. luật thực chất (`{cs.AI, cs.CV} => {cs.LG}`).
  - **Slide 8 - 9**: Trụ cột 2 — Không gian phân cụm 2D TruncatedSVD (6 trường phái) & Biện giải học thuật về Silhouette Score 0.063 do ranh giới liên ngành mờ.
  - **Slide 10 - 11**: Trụ cột 3 — Đồ thị trích dẫn 8,892 đỉnh, 86,295 cạnh, 92 cộng đồng Louvain & PageRank định lượng uy tín cho RAG Retrieval.
  - **Slide 12 - 13**: Trụ cột 4 — Share-Normalized Momentum (+123% cs.CV) & Isolation Forest P99 phát hiện 260 bài báo dị biệt cấu trúc.
  - **Slide 14**: Cầu nối Data Mining $\to$ RAG Architecture (PageRank weighting, FP-Growth keyword expansion, LaTeX preservation).
  - **Slide 15**: Kết quả đối đầu DeepEval 21 mẫu thử (+35% Contextual Precision, 100% Contextual Recall).
  - **Slide 16**: Phản biện học thuật — 3 Hạn chế trung thực & Lộ trình hoàn thiện 3 bước.
- **Phím Tắt Điều Khiển Khi Thuyết Trình**:

  - `→` / `Space` / `PageDown`: Tiến 1 slide.
  - `←` / `PageUp`: Lùi 1 slide.
  - `N`: **Bật/Tắt Ghi chú Thuyết minh tiếng Việt (Speaker Notes Drawer)** chứa gợi ý diễn giải chi tiết cho từng slide.
  - `O`: **Bật/Tắt Bản đồ Tổng quan 16 Slide (Overview Modal Grid)** cho phép chuyển nhanh giữa các phần khi hội đồng hỏi.
  - `F`: Chế độ Toàn màn hình (Fullscreen).
  - `Esc`: Đóng Drawer ghi chú / Modal tổng quan.
  - `Ctrl + P`: In hoặc xuất PDF chuẩn A4 Landscape (tự động phân trang 1 slide/trang, ẩn thanh điều hướng).

---

## 7. 🧪 Kiểm thử & Xác minh Hệ thống (Testing & Verification)

```bash
# 1. Kiểm tra mã nguồn với Ruff
ruff check src tests

# 2. Kiểm thử đơn vị & tích hợp pipeline
pytest tests/ -v -m "not gpu"

# 3. Kiểm thử phân hệ FastAPI backend
pytest backend/tests/test_api.py -v

# 4. Kiểm tra build frontend Dashboard
cd frontend && npm run build
```

---

## 8. 📜 Quy chuẩn Quản trị & Quy trình Làm việc (Governance & Workflow)

- Tác tử AI tuân thủ nghiêm ngặt chu trình 6 bước: `AUDIT → PLAN → IMPLEMENT → VERIFY → COMMIT → MERGE` ([agents/rules/AGENT_AI.md](agents/rules/AGENT_AI.md)).
- Hướng dẫn thiết lập chi tiết tại [docs/shared/HOW_TO_SETUP_AI_AGENT.md](docs/shared/HOW_TO_SETUP_AI_AGENT.md).
- Quy trình checkpoint và chuyển giao tác tử tuân theo [docs/shared/HANDOFF_TEMPLATE.md](docs/shared/HANDOFF_TEMPLATE.md).
