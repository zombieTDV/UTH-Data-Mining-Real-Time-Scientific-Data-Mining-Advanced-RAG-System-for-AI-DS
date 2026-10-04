# UTH SCIENTIFIC DATA MINING & REAL-TIME RAG SYSTEM
## BÁO CÁO KỸ THUẬT: ĐỒNG BỘ FRONTEND VỚI BACKEND REFACTOR & TRIỂN KHAI CHATBOT RAG QWEN2.5-7B GGUF
*Ngày báo cáo: 04/10/2026*  
*Người thực hiện: Antigravity AI Engineer*  
*Đơn vị: Trường Đại học Giao thông vận tải TP.HCM (UTH) // Scientific Data Mining Lab 2026*  
*Branch: `feature/frontend-dashboard`*

---

### 1. TỔNG QUAN VÀ MỤC ĐÍCH

Triển khai thực thi toàn diện theo kế hoạch đồng bộ giao diện người dùng Frontend với Backend mới được merge từ nhánh `refactor`, đồng thời kích hoạt và kết nối mô hình ngôn ngữ lớn cục bộ **Qwen2.5-7B-Instruct (GGUF Q4_K_M)** vào hệ thống Chatbot RAG học thuật:

1. **Đồng bộ hóa luồng dữ liệu Backend mới**:
   - Tích hợp số liệu thu hoạch thời gian thực từ CDC Streaming Harvester (`/api/ingestion/status`, `/api/ingestion/trigger`).
   - Kết nối kênh Telemetry Server-Sent Events (`/api/mining/telemetry/stream`) và kho lưu trữ Medallion Lakehouse (`/api/storage/stats`).
2. **Kích hoạt động cơ suy luận Qwen2.5-7B GGUF**:
   - Cài đặt thành công gói `llama-cpp-python` (phiên bản `0.3.36`) với bản dựng x86_64 tối ưu hóa CPU trong môi trường ảo của dự án.
   - Kết nối trực tiếp tệp mô hình `models/qwen2.5-7b-instruct-q4_k_m.gguf` (dung lượng 4.68 GB) với dịch vụ RAG của backend.
3. **Nâng cấp giao diện Chatbot RAG (`GroundedRagChat.tsx`)**:
   - Hỗ trợ toàn diện 2 chế độ giao diện Dark Mode (Obsidian) và Light Mode (Nordic White).
   - Hiển thị huy hiệu vi mô nhận diện mô hình: `QWEN2.5-7B GGUF • 10,000 Papers · 143k LanceDB Vectors (Nomic 768-D)`.
   - Bổ sung các chip gợi ý câu hỏi nghiên cứu mẫu ⚡ giúp kiểm thử suy luận nhanh chóng.
   - Đồng bộ luồng điều hướng: Nhấp "Hỏi RAG về bài báo này" tại tab Trụ cột khai phá sẽ tự động điền câu hỏi và chuyển sang tab RAG.

---

### 2. CÁC THAY ĐỔI KỸ THUẬT CHI TIẾT

#### 2.1. Cấu hình Backend (`backend/app/core/config.py`)
- Thiết lập chế độ mặc định `LLM_MODE: str = "local"`.
- Bổ sung phương thức `get_model_path()` tự động giải quyết vị trí tệp GGUF trên đĩa cứng, hỗ trợ kiểm tra linh hoạt cả đường dẫn trực tiếp lẫn thư mục con lồng nhau.

#### 2.2. Dịch vụ RAG Học Thuật (`backend/app/services/rag_service.py`)
- **Khởi tạo Singleton Lười (Lazy Singleton Initialization)**: Chỉ nạp mô hình vào bộ nhớ khi có yêu cầu truy vấn đầu tiên, thiết lập cấu hình 4 luồng xử lý CPU (`n_threads=4`) và cửa sổ ngữ cảnh 2,048 tokens (`n_ctx=2048`).
- **Kho Ngữ Cảnh LanceDB Gold Table**: Tự động truy vấn top-k đoạn văn bản liên quan nhất từ kho 143,523 vector embeddings 768 chiều.
- **Academic Prompt Grounding**: Đóng gói ngữ cảnh có cấu trúc (`Paper ID`, `Title`, `Authors`, `Section Title`, `Text`) kết hợp chỉ thị nghiêm ngặt ép buộc mô hình trích dẫn nguồn `[Paper: <paper_id>, Section: <section_title>]` và giữ nguyên công thức toán LaTeX (`$...$`).
- **Bảo Vệ Ngắt Lỗi (Graceful Fallback)**: Tự động chuyển đổi sang bộ tổng hợp ngữ cảnh có cấu trúc nếu tệp mô hình chưa sẵn sàng hoặc CPU bận, đảm bảo backend không bao giờ trả mã lỗi 500.

#### 2.3. Quản Lý Trạng Thái Toàn Cục (`frontend/src/App.tsx`)
- Thêm state `ragInitialQuery` để tiếp nhận tiêu đề bài báo khi người dùng nhấn chuyển từ tab Khai phá (Pillars) sang tab RAG.
- Truyền đồng bộ thuộc tính `theme={theme}` và `initialQuery={ragInitialQuery}` xuống component `GroundedRagChat`.

#### 2.4. Giao Diện Chatbot Khoa Học (`frontend/src/components/GroundedRagChat.tsx`)
- **Tương phản thẩm mỹ Dark/Light**: Thẻ tin nhắn trợ lý, khung nhập liệu nổi và bảng điều khiển đều được tinh chỉnh màu sắc để không gây chói mắt trên nền tối (`#0f172a`, viền `#1e293b`).
- **Gợi ý câu hỏi nghiên cứu (Quick Prompt Chips)**:
  - ⚡ *Sampling $z_t$ in Diffusion Distillation (2310.01407)*
  - ⚡ *LoRA Parameter Efficiency in Large Language Models*
  - ⚡ *SGLD Generalization Bounds & Convergence*
- **Trực quan hóa trích dẫn**: Hiển thị danh sách các bài báo arXiv và phân đoạn được trích dẫn kèm nút sao chép nhanh câu trả lời.

---

### 3. KẾT QUẢ KIỂM THỬ VÀ NGHIỆM THU

1. **Kiểm Thử Backend (`pytest backend/tests`)**:
   - Toàn bộ **11/11 bài kiểm thử** (Health, Storage Stats, Search, Chat RAG, EDA, Association Rules, Clusters, Graph, Trends, Ingestion) đều vượt qua thành công trong **14.01 giây**.
   - Endpoint `/api/chat` thực hiện truy vấn và trả về kết quả hợp lệ với đầy đủ câu trả lời, trích dẫn học thuật và điểm số tương đồng.
2. **Kiểm Thử Frontend Build (`npm run build`)**:
   - `tsc -b && vite build` hoàn tất thành công trong **211ms**, 0 lỗi TypeScript, bundle tối ưu.
3. **Chính Sách Zero Em-Dash**: Quét toàn bộ mã nguồn Frontend và Backend xác nhận **0 ký tự em-dash** vi phạm.
4. **Sàn Kích Thước Chữ (Font Floor >= 10px)**: Toàn bộ nhãn, văn bản và chú thích tuân thủ nghiêm ngặt kích thước tối thiểu từ 10px trở lên.

---

### 4. KẾT LUẬN

Hệ thống đã đồng bộ hoàn chỉnh giữa giao diện người dùng và hạ tầng backend mới. Người dùng có thể khởi chạy server backend (`uvicorn backend.app.main:app --port 8000`) và frontend (`npm run dev`) để trải nghiệm trò chuyện học thuật trực tiếp với mô hình Qwen2.5-7B trên tập dữ liệu 10,000 bài báo khoa học.
