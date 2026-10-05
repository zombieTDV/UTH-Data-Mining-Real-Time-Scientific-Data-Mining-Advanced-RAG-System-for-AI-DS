# Sơ Đồ Kiến Trúc Pipeline & Hiện Trạng Vận Hành Dự Án (Current Workflow Status)

> **Dự án:** UTH Real-Time Scientific Data Mining & Advanced RAG System for AI/DS  
> **Thời điểm thẩm định:** 05/10/2026  
> **Mục tiêu:** Minh họa trực quan toàn bộ quy trình từ Thu thập (Ingestion), Hồ lưu trữ (Medallion Lakehouse), Khai phá dữ liệu (4 Mining Pillars) đến Dịch vụ API và Giao diện Dashboard; phân định rõ ràng các thành phần **[HOẠT ĐỘNG TỐT]**, **[HOẠT ĐỘNG CÓ DỰ PHÒNG/MOCK]**, và **[CHƯA HOÀN THIỆN/CẦN BỔ SUNG]**.

---

## 1. Sơ Đồ Tổng Thể Luồng Dữ Liệu & Trạng Thái Từng Thành Phần (Pipeline Status Map)

```mermaid
flowchart TD
    %% Định nghĩa bảng màu trực quan
    classDef good fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#ecfdf5;
    classDef partial fill:#78350f,stroke:#f59e0b,stroke-width:2px,color:#fffbeb;
    classDef pending fill:#881337,stroke:#f43f5e,stroke-width:2px,color:#fff1f2;

    subgraph INGESTION["1. THU THẬP DỮ LIỆU KHOA HỌC (INGESTION LAYER)"]
        ING_ARXIV_OAI["arXiv OAI-PMH & ar5iv HTML5 Harvester<br/><b>[HOẠT ĐỘNG TỐT]</b>"]:::good
        ING_CDC_STREAM["Real-Time Streaming CDC Harvester (FastAPI/SSE)<br/><b>[HOẠT ĐỘNG TỐT]</b>"]:::good
        ING_OPENALEX_V2["OpenAlex Works API Crawler v2 (17 Modules)<br/><b>[CHƯA HOÀN THIỆN: Thiếu config settings.py]</b>"]:::pending
        ING_OPENALEX_V1["OpenAlex Bronze Collector v1.0 (Khoi)<br/><b>[CHƯA MERGE VÀO NHÁNH]</b>"]:::pending
    end

    subgraph LAKEHOUSE["2. HỒ DỮ LIỆU HUY CHƯƠNG (MEDALLION LAKEHOUSE)"]
        LH_BRONZE["Bronze Zone: Cloudflare R2 Bucket<br/>(9,022 Raw HTML + JSON Feeds + SHA-256)<br/><b>[HOẠT ĐỘNG TỐT]</b>"]:::good
        LH_SILVER_PARSER["Silver Parser: HTML to Markdown & LaTeX Extractor<br/><b>[HOẠT ĐỘNG TỐT TRONG CODE]</b>"]:::good
        LH_SILVER_FILE["Local File: data/silver/year=2026/papers.parquet<br/><b>[CHƯA CÓ: File trống 0 byte trên máy]</b>"]:::pending
        LH_GOLD_LANCE["Gold Zone: LanceDB Vector Table<br/>(scientific_papers_gold.lance)<br/><b>[HOẠT ĐỘNG TỐT]</b>"]:::good
        LH_GOLD_MINING["Gold Zone: Mining JSON Artifacts<br/>(eda, rules, clusters, graph, trends)<br/><b>[HOẠT ĐỘNG TỐT: Sẵn sàng 332 KB]</b>"]:::good
    end

    subgraph MINING["3. BỐN TRỤ CỘT KHAI PHÁ DỮ LIỆU (DATA MINING PILLARS)"]
        MIN_P1["Trụ cột 1: FP-Growth Association Rules (11.4k txns)<br/><b>[HOẠT ĐỘNG TỐT]</b>"]:::good
        MIN_P2["Trụ cột 2: Topic Clustering (K-Means K=6 & DBSCAN)<br/><b>[HOẠT ĐỘNG TỐT]</b>"]:::good
        MIN_P3["Trụ cột 3: Citation Graph Mining (PageRank & Louvain)<br/><b>[HOẠT ĐỘNG TỐT]</b>"]:::good
        MIN_P4["Trụ cột 4: Trend Velocity & Isolation Forest Anomalies<br/><b>[HOẠT ĐỘNG TỐT]</b>"]:::good
        MIN_ENGINE["MiningEngine.run_all() Re-run Trigger<br/><b>[HOẠT ĐỘNG MỘT PHẦN: Phụ thuộc vào papers.parquet]</b>"]:::partial
    end

    subgraph BACKEND["4. DỊCH VỤ PHỤC VỤ (FASTAPI BACKEND :8000)"]
        BE_HEALTH["GET /health & /api/storage/stats<br/><b>[HOẠT ĐỘNG TỐT]</b>"]:::good
        BE_MINING_API["GET /api/mining/eda & /api/mining/pillars/*<br/><b>[HOẠT ĐỘNG TỐT: 100% test pass]</b>"]:::good
        BE_TELEMETRY["GET /api/mining/telemetry/stream (SSE Heartbeat)<br/><b>[HOẠT ĐỘNG TỐT]</b>"]:::good
        BE_SEARCH["POST /api/search (LanceDB FTS + In-memory Gold Corpus)<br/><b>[HOẠT ĐỘNG TỐT CÓ DỰ PHÒNG]</b>"]:::good
        BE_EMBEDDER["Dense Vector Embedder (Nomic 768-dim cho query text)<br/><b>[CHƯA TÍCH HỢP TRỰC TIẾP]</b>"]:::pending
        BE_LLM_CLIENT["Local Qwen2.5-7B Inference (:9001)<br/><b>[HOẠT ĐỘNG CÓ DỰ PHÒNG: Model có sẵn, process chưa bật, đang chạy Mock]</b>"]:::partial
    end

    subgraph FRONTEND["5. GIAO DIỆN ĐIỀU HÀNH (REACT 19 DASHBOARD :5173)"]
        FE_CANVAS["Interactive Workflow Canvas (Pan-Zoom, Visual Pipeline)<br/><b>[HOẠT ĐỘNG TỐT: Đã đại tu UI/UX]</b>"]:::good
        FE_DRAWER["Bottom Tool Inspector Drawer (Specs, DuckDB, Qwen RAG, Terminal 68/32)<br/><b>[HOẠT ĐỘNG TỐT: Khử màu chói, thêm biểu đồ]</b>"]:::good
        FE_EDA["Tab EDA Analytics (PowerBI Slicers, Scatter, Heatmap)<br/><b>[HOẠT ĐỘNG TỐT]</b>"]:::good
        FE_PILLARS["Tab 4 Mining Pillars (Network Graph, Manifold 2D, Clustered Bars)<br/><b>[HOẠT ĐỘNG TỐT]</b>"]:::good
        FE_CHAT["Tab Grounded RAG Chat (LaTeX Math Rendering, Citations)<br/><b>[HOẠT ĐỘNG TỐT]</b>"]:::good
        FE_THEME["Hệ thống Giao diện Kép: Dark Hardware & Light Alabaster<br/><b>[HOẠT ĐỘNG TỐT: Chuẩn WCAG AAA]</b>"]:::good
    end

    %% Liên kết luồng dữ liệu
    ING_ARXIV_OAI --> LH_BRONZE
    ING_CDC_STREAM --> LH_BRONZE
    ING_OPENALEX_V2 -.-> LH_BRONZE
    LH_BRONZE --> LH_SILVER_PARSER
    LH_SILVER_PARSER --> LH_SILVER_FILE
    LH_SILVER_FILE --> LH_GOLD_LANCE
    LH_SILVER_FILE --> MIN_ENGINE
    MIN_ENGINE --> MIN_P1 & MIN_P2 & MIN_P3 & MIN_P4
    MIN_P1 & MIN_P2 & MIN_P3 & MIN_P4 --> LH_GOLD_GOLD_ARTIFACTS["Tạo artifacts vào data/gold/mining/"]
    LH_GOLD_GOLD_ARTIFACTS --> LH_GOLD_MINING
    LH_GOLD_MINING --> BE_MINING_API
    LH_GOLD_LANCE --> BE_SEARCH
    BE_SEARCH --> BE_LLM_CLIENT
    BE_HEALTH --> FE_CANVAS
    BE_MINING_API --> FE_EDA & FE_PILLARS
    BE_TELEMETRY --> FE_DRAWER
    BE_LLM_CLIENT --> FE_CHAT
```

---

## 2. Bảng Đối Soát Trạng Thái Chi Tiết Từng Khâu

| Phân hệ (Subsystem) | Thành phần cụ thể | Trạng thái hiện tại | Đánh giá kỹ thuật | Hướng khắc phục / Yêu cầu tiếp theo |
| :--- | :--- | :--- | :--- | :--- |
| **1. Thu thập dữ liệu** | arXiv OAI-PMH & ar5iv HTML5 | **HOẠT ĐỘNG TỐT** | Cào dữ liệu theo batch, phân vùng chuẩn S3. | Duy trì ổn định. |
| | CDC Streaming Harvester | **HOẠT ĐỘNG TỐT** | Phát xung SSE bài mới thời gian thực lên Dashboard. | Duy trì ổn định. |
| | OpenAlex Crawler v2 (Nhật) | **CHƯA HOÀN THIỆN** | 17 modules đã sync vào `data_mining`, nhưng `settings.py` thiếu biến. | Bổ sung 7 biến cấu hình OpenAlex vào `settings.py`. |
| | OpenAlex Crawler v1 (Khôi) | **CHƯA ĐƯỢC MERGE** | Đang nằm ở nhánh `Refactor_crawl_data_05102026`. | Sync vào `data_mining/src/ingestion/openalex.py`. |
| **2. Medallion Lakehouse** | Bronze Zone (Cloudflare R2) | **HOẠT ĐỘNG TỐT** | Lưu trữ 9,022 files HTML và metadata với chữ ký SHA-256. | Duy trì chi phí Egress 0 VND. |
| | Silver Parser Engine | **HOẠT ĐỘNG TỐT** | Code bóc tách Markdown, trích xuất công thức toán KaTeX đã sẵn sàng. | Chạy tạo dữ liệu cục bộ. |
| | Silver File `papers.parquet` | **CHƯA CÓ TRÊN MÁY** | Thư mục `data/silver/year=2026/` rỗng, `health` báo `parquet_ready: false`. | Chạy pipeline sinh file hoặc tải bản snapshot từ R2. |
| | Gold LanceDB Vector Table | **HOẠT ĐỘNG TỐT** | Bảng `scientific_papers_gold.lance` đã tạo và nạp dữ liệu. | Duy trì ổn định. |
| | Gold Mining JSON Artifacts | **HOẠT ĐỘNG TỐT** | Đầy đủ 6 tệp JSON (eda, rules, clusters, graph, trends, manifest). | Backend đọc trực tiếp từ cache tức thì. |
| **3. Bốn Trụ Cột Mining** | Trụ cột 1: FP-Growth Rules | **HOẠT ĐỘNG TỐT** | Khai phá luật kết hợp danh mục và 25+ tags công nghệ. | Thuật toán chạy chuẩn xác. |
| | Trụ cột 2: Semantic Clusters | **HOẠT ĐỘNG TỐT** | K-Means K=6 và DBSCAN phân cụm mật độ, PCA 2D coordinates. | Đã tính sẵn tọa độ trực quan hóa. |
| | Trụ cột 3: Citation Graph | **HOẠT ĐỘNG TỐT** | Directed PageRank phát hiện bài báo lõi, 92 Louvain communities. | Đã trích xuất cấu trúc đồ thị mạng lưới. |
| | Trụ cột 4: Trends & Anomalies | **HOẠT ĐỘNG TỐT** | Isolation Forest phát hiện 30 dị biệt, đo vận tốc xu hướng. | Hiển thị động lượng Surging/Declining. |
| | Re-run Trigger (`/mining/trigger`) | **MỘT PHẦN** | API hàng đợi nhận lệnh tốt, nhưng chạy lại thật cần `papers.parquet`. | Cần có file parquet để engine tính toán từ đầu. |
| **4. Backend FastAPI** | Endpoints Health, Storage, Mining | **HOẠT ĐỘNG TỐT** | 12/12 pytest tests PASSED trong 3.47s. | Sẵn sàng production. |
| | Retrieval Search (`/api/search`) | **HOẠT ĐỘNG TỐT** | Dùng FTS BM25 trên LanceDB kèm fallback in-memory Gold Corpus. | Hoạt động trơn tru, không bị lỗi khi mất mạng. |
| | Dense Embedder trực tiếp | **CHƯA TÍCH HỢP** | Chưa gắn mô hình nhúng text sang vector 768 chiều lúc truy vấn. | Tích hợp module embedder nhẹ cho query người dùng. |
| | Local LLM Serving (`/api/chat`) | **MỘT PHẦN (MOCK)** | Model Qwen 7B GGUF 4.68GB đã có trên máy, nhưng tiến trình cổng 9001 chưa bật. | Bật `llama_cpp.server` khi cần sinh phản hồi thần kinh. |
| **5. Frontend Dashboard** | Interactive Workflow Canvas | **HOẠT ĐỘNG TỐT** | Điều khiển Pan/Zoom mượt mà, sơ đồ trực quan hóa nằm ngang. | Đã khắc phục triệt để layer chồng chéo. |
| | Tool Inspector Drawer | **HOẠT ĐỘNG TỐT** | Chia cột Terminal 68/32, nút tactical amber/indigo, biểu đồ SVG. | Đã xử lý theo đúng yêu cầu phản hồi từ ảnh thực tế. |
| | Các Tab EDA, Mining, RAG Chat | **HOẠT ĐỘNG TỐT** | Render toán KaTeX, đồ thị mạng lưới d3, thanh đo Grounding 91.4%. | Không còn khoảng đen trống trải, bố cục cân đối. |
| | Hệ thống Theme (Dark / Light) | **HOẠT ĐỘNG TỐT** | Khử bỏ hoàn toàn hộp đen lạc lõng, tương phản đạt chuẩn WCAG AAA. | Đảm bảo Zero Em-Dash Policy trên toàn bộ code. |

---

## 3. Ba Nhiệm Vụ Cần Xử Lý Để Toàn Bộ Pipeline Hoạt Động Hoàn Hảo 100%

1. **Khắc phục lỗi tiềm ẩn ở Ingestion OpenAlex v2:**
   * Bổ sung 7 biến môi trường OpenAlex vào `data_mining/src/config/settings.py` để script `run_openalex_v2_collector.py` không bị văng lỗi `AttributeError`.
2. **Kích hoạt dữ liệu Silver Parquet cục bộ:**
   * Chạy script tạo hoặc tải tệp `data/silver/year=2026/papers.parquet` để endpoint `/health` chuyển `parquet_ready: true` và nút Re-run Mining có thể quét dữ liệu thực tế.
3. **Kích hoạt máy chủ Local LLM:**
   * Chạy lệnh `python -m llama_cpp.server --model models/qwen2.5-7b-instruct-q4_k_m.gguf --port 9001` khi cần chuyển giao diện từ Mock Mode sang Sinh văn bản thật bằng mô hình Qwen 7B.
