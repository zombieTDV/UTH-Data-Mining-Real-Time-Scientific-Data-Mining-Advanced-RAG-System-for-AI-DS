# KẾ HOẠCH ĐẠI TU TOÀN DIỆN FLOW UI/UX VÀ HỆ MÀU SẮC (PIPELINE WORKFLOW CANVAS)
## (PIPELINE WORKFLOW CANVAS & INSPECTOR DECK UI/UX OVERHAUL PLAN)

*Dự án:* UTH Data Mining Real-Time Scientific Data Mining & Advanced RAG System  
*Thời gian lập kế hoạch:* 2026-10-05  
*Mã nguồn trọng tâm:* `frontend/src/components/InteractiveWorkflowCanvas.tsx`  
*Tiêu chuẩn thiết kế:* Tactical Obsidian Hardware & Swiss Alabaster Precision (WCAG AAA)  
*Chính sách dấu câu bắt buộc:* Zero Em-Dash Policy (Tuyệt đối không dùng ký tự em-dash, thay thế bằng dấu hai chấm `:` hoặc gạch nối `-`)

---

## 1. PHÂN TÍCH HIỆN TRẠNG VÀ NGUYÊN NHÂN TỪ 4 ẢNH THỰC TẾ

| Ảnh số | Thành phần giao diện | Vấn đề UI/UX & Màu sắc phát hiện | Nguyên nhân gốc rễ trong mã nguồn |
| :--- | :--- | :--- | :--- |
| **Ảnh 0** | Inspector Tab 2: `THÔNG SỐ & TELEMETRY` (arXiv Harvester) | Nền drawer màu trắng/xám nhưng hộp `OAI-PMH SPEC` lại là một khối đen xì `#0f172a` thô cứng; danh sách gạch đầu dòng tính năng thô sơ; khoảng đệm hai bên lệch lạc | Thiếu token màu thích ứng (Adaptive color tokens) cho light mode: hardcode nền tối `#0f172a` bên cạnh `#ffffff`; không có container bọc kiểu Double-Bezel |
| **Ảnh 1** | Inspector Tab 3: `TERMINAL LOGS` (Console Stream) | **Cửa sổ Terminal đen kịt kéo dài 100% chiều ngang màn hình**, nhưng các dòng log chỉ dài 25% bên trái. **Hơn 75% diện tích màn hình bên phải là khoảng đen trống rỗng vô nghĩa** | Bố cục đơn khối (Single full-width block) không có sidebar thông số viễn thám; không có bảng phân tích throughput, bộ lọc cấp độ log hay nút thao tác nhanh |
| **Ảnh 2** | Inspector Tab 1: `CẤU HÌNH & ĐIỀU KHIỂN` (DuckDB & LaTeX) | **Nút bấm `► THỰC THI TRUY VẤN DUCKDB` có màu cam chói lòa (`#f59e0b`) đặc quánh**, chữ trắng, đập vào mắt như biển cảnh báo nguy hiểm; bảng kết quả Arrow bên phải cụt lủn chỉ có 4 dòng, để trống 65% khoảng trắng bên dưới | Lạm dụng màu solid accent (`#f59e0b`) cho button thay vì phong cách ghost/pill tinh tế; thiếu các thành phần đồ thị vi mô (micro distribution chart) để lấp đầy không gian kết quả |
| **Ảnh 3** | Inspector Tab 1: `CẤU HÌNH & ĐIỀU KHIỂN` (Qwen 2.5 RAG) | **Nút bấm `💬 KIỂM TRA PHẢN HỒI RAG` màu tím xanh (`#6366f1`) đơn điệu đè nặng**; khung input query tối đen trong light mode; cột kết quả bên phải chỉ có 1 đoạn văn bản ngắn và 2 badge, bên dưới là khoảng trắng khổng lồ | Hardcode màu indigo thô; thiếu thẻ phân tích cấu trúc trích dẫn (Attribution Dossier), thiếu thước đo độ tương đồng cosine dạng radial/gauge và công thức LaTeX |

---

## 2. NGUYÊN TẮC CẢI TIẾN HỆ THỐNG MÀU SẮC & THẨM MỸ (HIGH-END DESIGN SYSTEM)

1. **Khử Bỏ Hoàn Toàn Các Nút Bấm Màu Solid Chói Lọi (Anti-Garish Solid Buttons):**
   - Loại bỏ các khối màu cam `#f59e0b`, tím `#6366f1`, đỏ `#e11d48` đặc quánh trên toàn chiều rộng nút.
   - Thay thế bằng **Linear-Tier Tactical Action Pills**: Nút màu Obsidian bóng mờ (`bg-slate-900` trong light mode / `bg-white text-slate-950` trong dark mode) có điểm chấm trạng thái phát sáng (Glow Dot) và hiệu ứng hover nhẹ nhàng (`active:scale-[0.98]`).
   - Với các nút hành động thứ cấp: Dùng phong cách **Tinted Translucent Ghost Button** (`border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400`).

2. **Hài Hòa Giao Diện Sáng / Tối (Light & Dark Mode Cohesion):**
   - Không đặt hộp code đen đặc `#0f172a` giữa giao diện Light Mode màu trắng.
   - Trong Light Mode: Dùng nền giấy kỹ thuật Thụy Sĩ (Swiss Slate Paper `#f8fafc`), viền mềm `#e2e8f0`, chữ monospace màu mực kỹ thuật `#0f172a`.
   - Trong Dark Mode: Dùng Tactical Obsidian (`#090d16` và `#0e1422`), viền hairline `rgba(255, 255, 255, 0.08)` với góc bo squircle chuẩn `rounded-xl`.

3. **Kiến Trúc Vỏ Kép Double-Bezel (Doppelrand Technique):**
   - Tất cả các hộp code, bảng kết quả, và terminal đều được bọc lớp vỏ kép:
     - Vỏ ngoài: `p-1.5 rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10`.
     - Lõi bên trong: `rounded-lg bg-white dark:bg-[#050811] p-3`.

---

## 3. CHI TIẾT CẢI TIẾN 4 MÀN HÌNH TƯƠNG ỨNG 4 ẢNH

### Giai Đoạn 1: Tái Cấu Trúc Terminal Logs (Khắc Phục Ảnh 1: Trống 75% Không Gian)
- **Bố cục mới: Split Telemetry Console (68% / 32%):**
  - **Cột Trái (68%):** Terminal stream chuẩn phong cách macOS Unix Console:
    - Thanh điều khiển trên: 3 nút chấm traffic light tròn (`#ef4444`, `#f59e0b`, `#10b981`), nhãn tiến trình live PID, nút Copy Buffer, nút Clear Logs, nút Auto-scroll.
    - Bộ lọc cấp độ log tức thời: Pill filters `ALL`, `SUCCESS`, `EXEC`, `WARN`, `INFO`.
    - Dòng log căn chỉnh thời gian, badge cấp độ, tag kiến trúc và nội dung sắc nét.
  - **Cột Phải (32%): Bảng Đo Lường Viễn Thám Thời Gian Thực (Live Lakehouse Telemetry & Health Panel):**
    - Card 1: Tốc độ Ingestion & CDC (`Stream Speed: 120 papers/min`, `Corpus: 10,000 papers`).
    - Card 2: Hiệu năng Vectorized DuckDB SIMD (`Throughput: 42.5 MB/s`, `Latency: 0.041s`).
    - Card 3: Chỉ mục LanceDB ANN Index (`143,523 Vectors`, `IVF-PQ Partition: Healthy`).
    - Card 4: Trạng thái Egress Cloudflare R2 (`Bandwidth: $0.00 Egress Fee Active`).

### Giai Đoạn 2: Tinh Chỉnh Cấu Hình DuckDB & Phân Tích SIMD (Khắc Phục Ảnh 2: Nút Cam Chói & Bảng Trống)
- **Cột Trái (SQL Input & Execution):**
  - Khử bỏ hoàn toàn màu nền cam chói lóa. Chuyển nút thực thi thành nút Tactical Pill với viền amber phát sáng tinh tế.
  - Thêm thanh Preset Queries nhanh: `[TOP FORMULAS]`, `[PAPERS BY YEAR]`, `[AUTHOR RANKING]`, `[IQR ANOMALY]`.
  - Hiển thị chip đo lường `Vectorized SIMD Execution (Arrow IPC) · 0.041s`.
- **Cột Phải (Kết Quả & Biểu Đồ Vi Mô):**
  - Bảng kết quả 4 danh mục khoa học (`cs.AI`, `cs.LG`, `cs.CV`, `stat.ML`) với màu sắc dịu mắt.
  - **Bổ sung Micro Distribution Chart**: 4 thanh tiến trình SVG trực quan biểu thị tỷ trọng bài báo và mật độ công thức toán học trung bình, lấp đầy hoàn hảo khoảng trống 65% trước đây.
  - Thêm thanh trạng thái bộ nhớ Arrow: `Allocated Memory: 24.8 MB · 0 Memory Leaks`.

### Giai Đoạn 3: Tinh Chỉnh Qwen 2.5 RAG Inspector (Khắc Phục Ảnh 3: Nút Tím Chói & Trắng Trống)
- **Cột Trái (Grounded RAG Control Gate):**
  - Khử bỏ màu tím chói `#6366f1`. Dùng nút Tactical Obsidian kèm icon kim cương và badge `STRICT GROUNDING`.
  - Bổ sung 3 câu hỏi mẫu học thuật (Academic Query Chips): `[Diffusion Loss]`, `[Transformer Attention]`, `[PageRank Centrality]`.
  - Thanh trượt Cosine Threshold: Thiết kế thanh trượt tinh xảo với thang đo chia vạch từ `0.50` đến `0.95`.
- **Cột Phải (Hồ Sơ Chứng Minh Nguồn Gốc - Attribution Dossier):**
  - **Đồng hồ đo độ tin cậy Grounding Confidence Meter** (Radial gauge hoặc progress indicator đạt 91.4%).
  - Danh sách trích dẫn bài báo minh chứng cụ thể kèm liên kết arXiv, tên mục bài báo (Section 3.2), và điểm tương đồng Cosine.
  - **Khung toán học LaTeX**: Hiển thị công thức toán thực tế được trích dẫn (ví dụ hàm loss $\mathcal{L}_{diff}$) bằng KaTeX hoặc semantic formula box.

### Giai Đoạn 4: Tinh Chỉnh Thông Số & Telemetry (Khắc Phục Ảnh 0: Hộp Đen Nhạt Nhẽo & Lệch Lạc)
- **Cột Trái (Metric Bento & Core Capabilities):**
  - Thiết kế lại 4 thẻ chỉ số với viền Double-Bezel, số liệu tương phản cao (High Contrast Typography), có biểu tượng icon mini.
  - Danh sách tính năng cốt lõi được chuyển thành **Checklist thẻ chip** có icon dấu tích xanh ngọc lục bảo `#10b981`.
- **Cột Phải (Syntax-Highlighted Protocol Spec):**
  - Hộp OAI-PMH Ingestion Protocol Spec được thiết kế tương thích cả hai chế độ Light/Dark mode.
  - Bổ sung các tab con: `[POST OAI-PMH]`, `[PAYLOAD JSON]`, `[RESPONSE XML]`.
  - Bổ sung nút Copy Payload lên clipboard nhanh chóng.

### Giai Đoạn 5: Tối Ưu Hóa Canvas & Header Điều Khiển Inspector
- **Header Thanh Tiêu Đề Drawer:**
  - Thiết kế lại 3 tab `CẤU HÌNH & ĐIỀU KHIỂN`, `THÔNG SỐ & TELEMETRY`, `TERMINAL LOGS` thành segmented pill control với chuyển động trượt mượt mà.
  - Nút Đóng `x ĐÓNG` và nút Minimize/Expand chiều cao drawer (`320px` <-> `480px`).
- **Canvas Nodes & Particle Flow:**
  - Đồng bộ màu sắc dây cáp liên kết giữa các Node trên Canvas để tạo cảm giác năng lượng dòng chảy dữ liệu thời gian thực (Real-time Data Stream Pulse).

---

## 4. KẾ HOẠCH TRIỂN KHAI THEO TỪNG BƯỚC

1. **Bước 1:** Cập nhật `themeStyles` trong `InteractiveWorkflowCanvas.tsx` để bổ sung toàn bộ bảng màu chuẩn Swiss/Obsidian và loại bỏ hardcode màu tối trong light mode.
2. **Bước 2:** Đại tu Tab 3 (`TERMINAL LOGS`), xây dựng bố cục Split Telemetry Console (68% terminal + 32% telemetry stats).
3. **Bước 3:** Đại tu Tab 1 (`CẤU HÌNH & ĐIỀU KHIỂN`) cho DuckDB (khử nút cam, thêm micro chart, preset queries) và Qwen RAG (khử nút tím, thêm attribution dossier).
4. **Bước 4:** Đại tu Tab 2 (`THÔNG SỐ & TELEMETRY`) với giao diện thích ứng light/dark và protocol inspector đa tab.
5. **Bước 5:** Kiểm định toàn diện:
   - `npm run build --prefix frontend` (đạt 0 lỗi TypeScript).
   - `npm run lint --prefix frontend` (đạt 0 lỗi Oxlint).
   - `grep -rn $'\u2014' frontend/src/` (đạt 0 kết quả em-dash).
   - Kiểm tra trực quan cả hai chế độ Light Mode và Dark Mode.
