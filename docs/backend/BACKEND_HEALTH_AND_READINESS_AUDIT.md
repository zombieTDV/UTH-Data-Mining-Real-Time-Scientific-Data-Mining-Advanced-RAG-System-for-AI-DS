# Báo Cáo Kiểm Tra Toàn Diện Hệ Thống Backend FastAPI & Đánh Giá Điều Kiện Hoạt Động Tốt

> **Dự án:** UTH Real-Time Scientific Data Mining & Advanced RAG System  
> **Thời điểm kiểm tra:** 05/10/2026  
> **Phân hệ thẩm định:** `backend/` (FastAPI, LanceDB, Qwen LLM, Data Mining Serving)

---

## 1. Kết Quả Kiểm Tra Tổng Quan (Executive Summary)

Phân hệ Backend FastAPI đã được rà soát chi tiết qua 12 bài kiểm thử tự động, cấu trúc tệp mã nguồn, kết nối cơ sở dữ liệu và các dịch vụ phục vụ.

* **Trạng thái kiểm thử tự động (`pytest`):** **12/12 PASSED** (100% thành công).
* **Kiến trúc phục vụ:** Đã chuyển dịch hoàn chỉnh sang FastAPI bất đồng bộ (`asyncio`/`uvicorn`), tích hợp SSE Streaming (`sse-starlette`), LanceDB vector search và Gold mining artifacts cache.
* **Giao diện Swagger / ReDoc:** Sẵn sàng tại `/docs` và `/redoc`.

Tuy nhiên, để Backend hoạt động **hoàn hảo và đầy đủ tính năng trong môi trường Production/Full-System**, hệ thống đang có **4 điểm thiếu hụt cốt lõi** và **3 khuyến nghị tối ưu** cần được hoàn thiện.

---

## 2. Chi Tiết Các Hạng Mục Còn Thiếu Để Backend Hoạt Động Tốt Nhất

### Thiếu sót 1: Tệp dữ liệu Silver Parquet cục bộ (`papers.parquet`)
* **Vị trí kiểm tra:** `data/silver/year=2026/papers.parquet`
* **Hiện trạng:**
  * Thư mục `data/silver/year=2026/` hiện đang rỗng (kích thước 0 byte).
  * Trong endpoint `/health`, chỉ số `parquet_ready` sẽ trả về `false` vì kiểm tra `settings.SILVER_PARQUET.exists()` không tìm thấy tệp.
  * Trong endpoint `/mining/trigger`, hàm `MiningEngine.run_all()` cần đọc dữ liệu từ Silver Parquet để tính toán lại các ma trận khai phá.
* **Tác động:** Dịch vụ đọc file tóm tắt mining vẫn chạy được nhờ vào các file JSON đã tính toán sẵn trong `data/gold/mining/`, nhưng nút `TRIGGER RE-RUN` hoặc các thao tác DuckDB quét bảng parquet thật sẽ thiếu dữ liệu nguồn.
* **Giải pháp khắc phục:**
  1. Chạy pipeline thu thập hoặc chuyển đổi để tạo `papers.parquet` vào `data/silver/year=2026/`.
  2. Hoặc cấu hình lệnh tải snapshot Parquet từ Cloudflare R2 bucket (`uth-scientific-lakehouse/silver/`) về thư mục cục bộ.

---

### Thiếu sót 2: Tiến trình suy luận Local LLM Engine (Port 9001 hoặc 11434)
* **Vị trí kiểm tra:** `backend/app/services/llm_client.py` và `backend/app/core/config.py`
* **Hiện trạng:**
  * Model GGUF `models/qwen2.5-7b-instruct-q4_k_m.gguf` (4.68 GB) **đã có sẵn đầy đủ** trong thư mục `models/`.
  * Thư viện `llama-cpp-python` phiên bản `0.3.36` **đã được cài đặt** trong môi trường ảo `venv`.
  * Tuy nhiên, tiến trình máy chủ LLM phục vụ API OpenAI-compatible trên cổng `9001` (node-llama-cpp) hoặc `11434` (Ollama) hiện chưa được bật.
  * Hiện tại Backend đang đặt cấu hình mặc định `LLM_MODE: str = "mock"` để phục vụ kiểm thử giao diện siêu tốc. Khi chuyển `LLM_MODE = "local"`, nếu port 9001 không lắng nghe, backend sẽ chuyển sang chế độ hiển thị trích dẫn thô (grounded context fallback).
* **Tác động:** Chưa kích hoạt được khả năng sinh câu trả lời thần kinh đầy đủ (full neural generation) của mô hình Qwen 7B khi người dùng chat trên giao diện.
* **Giải pháp khắc phục:**
  * Khởi chạy máy chủ LLM local trước khi khởi động backend bằng lệnh:
    ```bash
    python -m llama_cpp.server --model models/qwen2.5-7b-instruct-q4_k_m.gguf --port 9001 --n_ctx 4096
    ```
  * Cập nhật `LLM_MODE=local` trong tệp `.env`.

---

### Thiếu sót 3: Đồng bộ biến môi trường OpenAlex trong Backend Config
* **Vị trí kiểm tra:** `backend/app/core/config.py`
* **Hiện trạng:**
  * Phân hệ `data_mining` đã phát triển đợt thu thập dữ liệu OpenAlex v2, nhưng trong `backend/app/core/config.py` chỉ mới khai báo các thông số cho arXiv và R2.
  * Các biến `OPENALEX_API_KEY`, `OPENALEX_SUBFIELDS` chưa được đồng bộ vào cấu hình Pydantic của Backend.
* **Tác động:** Nếu sau này Backend gọi trực tiếp các module ingestion của OpenAlex hoặc expose API cấu hình crawler OpenAlex cho Frontend, Backend sẽ thiếu biến môi trường.
* **Giải pháp khắc phục:** Bổ sung cấu hình `OPENALEX_API_KEY` và `OPENALEX_SUBFIELDS` vào `backend/app/core/config.py`.

---

### Thiếu sót 4: Vector Embeddings Inference Engine cho Semantic Search trực tiếp
* **Vị trí kiểm tra:** `backend/app/services/retrieval_service.py`
* **Hiện trạng:**
  * Dịch vụ tìm kiếm `RetrievalService` hiện đang dùng chế độ Full-Text Search (FTS BM25) qua LanceDB và cơ chế đối soát từ khóa dự phòng `CANONICAL_SCIENTIFIC_CHUNKS`.
  * Bảng vector `data/gold/lancedb/scientific_papers_gold.lance` đã có sẵn trên ổ đĩa.
  * Tuy nhiên, thư viện sinh vector ngữ nghĩa trực tiếp từ câu hỏi người dùng (như `fastembed` hoặc `sentence-transformers` dùng mô hình `nomic-embed-text-v1.5`) chưa được tích hợp vào `backend/requirements.txt`.
* **Tác động:** Câu truy vấn mới của người dùng trong `/api/search` hiện phụ thuộc vào FTS (Full-Text Search) thay vì Dense Vector Cosine ANN Search thuần túy.
* **Giải pháp khắc phục:** Cài đặt module embedder nhẹ (ví dụ `fastembed` hoặc nhúng qua ONNX/Nomic) để khi người dùng gửi câu hỏi, hệ thống chuyển câu hỏi thành vector 768 chiều trước khi gọi `table.search(vector)`.

---

## 3. Bảng Ma Trận Tình Trạng Các Thành Phần Backend

| Phân hệ / Endpoint | Trạng thái hiện tại | Đánh giá | Điều kiện để đạt mức tối ưu |
| :--- | :--- | :--- | :--- |
| **GET /health** | Hoạt động tốt | Ổn định | Cần `papers.parquet` tồn tại để `parquet_ready = true`. |
| **GET /api/storage/stats** | Hoạt động tốt | Xuất sắc | Đọc đúng dung lượng các vùng Bronze, Silver, Gold. |
| **POST /api/search** | Hoạt động tốt (FTS + Fallback) | Tốt | Bổ sung Dense Embedder để tăng độ phủ ngữ nghĩa. |
| **POST /api/chat & SSE Stream** | Hoạt động tốt (Mock & Fallback) | Tốt | Bật tiến trình máy chủ Qwen GGUF trên cổng 9001. |
| **GET /api/papers/{paper_id}** | Hoạt động tốt | Xuất sắc | Đã xử lý chuẩn hóa tiền tố `arXiv:`. |
| **GET /api/mining/eda** | Hoạt động tốt | Xuất sắc | Đọc dữ liệu từ `eda_summary.json` thành công. |
| **GET /api/mining/pillars/*** | Hoạt động tốt | Xuất sắc | Đầy đủ 4 Trụ cột (FP-growth, K-means, Graph, Trends). |
| **GET /api/mining/telemetry/stream** | Hoạt động tốt (SSE) | Xuất sắc | Phát nhịp tim viễn thám đều đặn mỗi 3 giây. |
| **POST /api/mining/trigger** | Hàng đợi BackgroundTask | Khá | Cần tệp `papers.parquet` nguồn để engine chạy trọn vẹn. |
| **GET /api/ingestion/status** | Hoạt động tốt | Xuất sắc | Trả về trạng thái bộ đếm CDC Streaming thời gian thực. |
| **POST /api/ingestion/start & stop** | Hoạt động tốt | Xuất sắc | Điều khiển tác vụ streaming chạy ngầm mượt mà. |

---

## 4. Danh Mục Công Việc Khuyến Nghị Thực Hiện (Checklist)

1. [ ] **Khởi tạo dữ liệu Silver Parquet:** Tạo file mẫu hoặc đồng bộ `papers.parquet` vào `data/silver/year=2026/` để kiểm tra độ sẵn sàng 100% của hồ dữ liệu.
2. [ ] **Khởi chạy Qwen Local LLM Engine:** Viết một script tiện ích `scripts/run_local_llm.sh` (hoặc `.bat`) chạy `llama_cpp.server` với model `qwen2.5-7b-instruct-q4_k_m.gguf` trên port 9001.
3. [ ] **Bổ sung Dense Vector Embedding vào Retrieval Service:** Tích hợp bộ chuyển đổi query text sang vector 768 chiều để khai thác tối đa bảng LanceDB Gold.
4. [ ] **Đồng bộ hóa Config:** Thêm các trường OpenAlex vào `backend/app/core/config.py` để đồng nhất với `data_mining`.
