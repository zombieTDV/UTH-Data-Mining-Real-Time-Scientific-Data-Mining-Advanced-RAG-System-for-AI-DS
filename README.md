# UTH Scientific Data Mining & Advanced RAG System for AI/DS

Hệ thống Khai phá Dữ liệu Khoa học Thời gian thực và RAG Nâng cao (Real-Time Scientific Data Mining & Advanced RAG System) phục vụ nghiên cứu và tổng quan tài liệu trong miền Trí tuệ Nhân tạo & Khoa học Dữ liệu (AI/DS).

---

## 1. Cấu trúc Dự án (Polyglot Monorepo Architecture)

Dự án được chuẩn hóa thành kiến trúc Monorepo phân tách rõ ràng giữa phân hệ **Khai phá Dữ liệu (Python)**, **Ứng dụng Phục vụ Backend API (FastAPI)**, và **Giao diện Giám sát Dashboard (React 19 / Vite)**:

```text
UTH-Data-Mining-Real-Time-Scientific-Data-Mining-Advanced-RAG-System-for-AI-DS/
│
├── frontend/                      # [1] Phân hệ Giao diện Dashboard (React 19 / Vite / Tailwind)
│   ├── src/
│   │   ├── components/            # MiningPillarsView, Live Telemetry, RAG Chat
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
│   │   ├── indexing/             # Nomic Embedder (MPS GPU) & LanceDB
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
├── data/                          # [4] Bộ nhớ đệm dữ liệu cục bộ (.gitignore)
│   ├── raw/html/                 # 9,000+ HTML học thuật thô
│   ├── silver/year=2026/         # Parquet (13,000 bài báo, 2.76M công thức toán)
│   ├── silver/citations.parquet  # 441,445 liên kết trích dẫn (86,295 liên kết nội bộ)
│   ├── gold/lancedb/             # LanceDB Vector Table (143,523 vectors 768-dim)
│   └── gold/mining/              # Các artifact JSON phục vụ 4 Trụ cột Mining
│
├── models/                        # [5] Trọng số mô hình AI nặng (.gitignore)
│   ├── nomic-embed-text-v1.5/    # Mô hình nhúng học thuật
│   └── qwen2.5-7b-instruct-...   # Mô hình LLM cục bộ (GGUF Q4_K_M)
│
├── logs/                          # [6] Nhật ký thực thi theo timestamp (.gitignore)
├── docs/                          # [7] Toàn bộ tài liệu kiến trúc & báo cáo
│   ├── mining/                   # Tài liệu chi tiết 4 Trụ cột Khai phá Dữ liệu
│   │   ├── FOUR_DATA_MINING_PILLARS.md    # Đặc tả kỹ thuật & công thức toán học
│   │   └── PIPELINE_EXECUTION_GUIDE.md    # Hướng dẫn vận hành chi tiết
│   └── agents/rules/             # Quy chuẩn phát triển & logging checkpoint
│
└── .env                           # Biến môi trường và khóa Cloudflare R2
```

---

## 2. Hướng dẫn Khởi chạy Từng Phân hệ

### A. Chạy Master Data Mining Engine (4 Trụ Cột Khai Phá)

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
> - Đặc tả thuật toán & toán học: [`docs/mining/FOUR_DATA_MINING_PILLARS.md`](docs/mining/FOUR_DATA_MINING_PILLARS.md)
> - Hướng dẫn vận hành & cờ dòng lệnh CLI: [`docs/mining/PIPELINE_EXECUTION_GUIDE.md`](docs/mining/PIPELINE_EXECUTION_GUIDE.md)

---

### B. Phân hệ Backend API & Serving (`backend/` - FastAPI)

Máy chủ FastAPI phục vụ cả truy xuất ngữ nghĩa RAG thời gian thực lẫn 4 Trụ cột Khai phá:

```bash
# 1. Kích hoạt môi trường ảo
source .venv/bin/activate  # Trên Windows: .\.venv\Scripts\Activate.ps1

# 2. Khởi chạy máy chủ FastAPI (Port 8000)
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload

# 3. Chạy toàn bộ kiểm thử tự động (12/12 passing)
pytest backend/tests/test_api.py -v

# 4. Xem tài liệu API tương tác:
# - Swagger UI: http://localhost:8000/docs
# - ReDoc:      http://localhost:8000/redoc
```

---

### C. Phân hệ Giao diện Dashboard (`frontend/` - React 19)

Giao diện tương tác trực quan hóa biểu đồ 4 Trụ cột Mining và hội thoại RAG:

```bash
# 1. Chuyển vào thư mục frontend
cd frontend

# 2. Cài đặt thư viện phụ thuộc
npm install

# 3. Khởi chạy máy chủ giao diện (Port 5173)
npm run dev

# 4. Truy cập giao diện tại: http://localhost:5173
```

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
