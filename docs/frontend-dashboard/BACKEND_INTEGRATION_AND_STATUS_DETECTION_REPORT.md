# UTH SCIENTIFIC DATA MINING & REAL-TIME RAG SYSTEM
## BÁO CÁO KỸ THUẬT: TÍCH HỢP TOÀN DIỆN BACKEND VÀ CHUẨN HÓA TRẠNG THÁI HỆ THỐNG
*Ngày báo cáo: 03/10/2026*  
*Người thực hiện: Antigravity AI Engineer*  
*Đơn vị: Trường Đại học Giao thông vận tải TP.HCM (UTH) // Scientific Data Mining Lab 2026*  
*Branch: `feature/frontend-dashboard`*

---

### 1. TỔNG QUAN VÀ MỤC TIÊU BÁO CÁO

Báo cáo này tổng kết hai nội dung kỹ thuật quan trọng vừa được xử lý trên hệ thống Dashboard Frontend:
1. **Khắc phục triệt để sự cố phát hiện sai trạng thái Backend**: Điều tra và loại bỏ tình trạng frontend hiển thị sai lệch `FASTAPI ONLINE [LIVE 18ms]` dù dịch vụ FastAPI backend ở cổng 8000 chưa khởi chạy.
2. **Kiểm tra và hoàn thiện tích hợp Backend cho 100% chỉ số (Metrics)**: Rà soát toàn bộ các API endpoints của hệ thống, chuyển đổi toàn bộ các số liệu còn mang tính hardcoded ở Tab 1 sang cơ chế liên kết động (Dynamic Data Binding) trực tiếp từ response của Backend.

---

### 2. BÁO CÁO SỰ CỐ: XỬ LÝ LỖI PHÁT HIỆN TRẠNG THÁI BACKEND

#### 2.1. Triệu chứng sự cố
Khi cổng 8000 của FastAPI Backend chưa chạy (`curl: (7) Failed to connect to 127.0.0.1 port 8000`), trên thanh điều khiển (Header) của Dashboard vẫn hiển thị:
- Huy hiệu trạng thái: `FASTAPI ONLINE [LIVE 18ms]` (màu xanh ngọc).
- Đèn LED xung nhịp: Nhấp nháy màu xanh giả lập.
- Chân trang (Footer): `● CLIENT SYNC: OK`.

#### 2.2. Phân tích 4 nguyên nhân gốc rễ (Root Cause Analysis)

1. **Lỗi logic toán tử 3 ngôi (Ternary Operator Bug) tại `src/App.tsx` (dòng 115):**
   ```tsx
   fetchHealth()
     .then((h) => setBackendStatus(h.status === 'ONLINE' ? 'ONLINE' : 'ONLINE'))
     .catch(() => setBackendStatus('OFFLINE'));
   ```
   - Trong `src/api/client.ts`, hàm `fetchHealth()` bắt lỗi bằng `try/catch` và trả về đối tượng `{ status: 'OFFLINE' }` (Promise không bị reject nên không bao giờ nhảy vào `.catch()`).
   - Biểu thức `h.status === 'ONLINE' ? 'ONLINE' : 'ONLINE'` luôn trả về `'ONLINE'` trong mọi trường hợp.

2. **Cơ chế Fallback SSE Heartbeat tự động ghi đè trạng thái tại `src/App.tsx` (dòng 124):**
   - Khi `EventSource` không kết nối được backend (`/api/mining/telemetry/stream`), sự kiện `eventSource.onerror` kích hoạt bộ đếm `setInterval` phát tín hiệu mô phỏng mỗi 5 giây (`TELEMETRY_HEARTBEAT`) để phục vụ demo offline.
   - Nhưng trong `src/App.tsx`, callback nhận telemetry lại thực thi `setBackendStatus('ONLINE')`. Cứ mỗi 5 giây, tín hiệu mô phỏng này lại ép trạng thái quay về `ONLINE`.

3. **Giá trị khởi tạo mặc định (Initial State):**
   - Biến `const [backendStatus, setBackendStatus] = useState<'ONLINE' | 'OFFLINE'>('ONLINE')` được gán sẵn giá trị `'ONLINE'` ngay khi khởi tạo component.

4. **Chuỗi text mặc định `[LIVE 18ms]`:**
   - Chuỗi `{lastTelemetryTick ? \`[${lastTelemetryTick}]\` : '[LIVE 18ms]'}` khi chưa có timestamp thật thì fallback tĩnh về chuỗi `'[LIVE 18ms]'`.

#### 2.3. Giải pháp đã thực hiện

1. Khởi tạo mặc định `backendStatus = 'OFFLINE'`.
2. Sửa biểu thức kiểm tra: `setBackendStatus(h.status === 'ONLINE' ? 'ONLINE' : 'OFFLINE')`.
3. Bổ sung cờ `isFallback: true` trong `TelemetryEvent` (`src/api/types.ts` và `src/api/client.ts`).
4. Trong callback `subscribeTelemetry`, chỉ cập nhật `backendStatus = 'ONLINE'` khi sự kiện là real SSE (`!data.isFallback`).
5. Cập nhật giao diện trung thực:
   - **Khi Offline**: Huy hiệu màu hổ phách/amber `FASTAPI OFFLINE [OFFLINE SNAPSHOT]`, đèn LED tĩnh không nhấp nháy, chân trang hiển thị `● OFFLINE CACHE: READY`.
   - **Khi Online**: Huy hiệu màu xanh ngọc/emerald `FASTAPI ONLINE [LIVE]` kèm timestamp thực, đèn LED xung nhịp nhấp nháy, chân trang hiển thị `● BACKEND LINK: ACTIVE`.
   - **Tab 5 Telemetry Stream**: Huy hiệu `OFFLINE REPLAY` màu hổ phách khi chưa kết nối, chuyển sang `LIVE SSE STREAM` màu xanh khi có stream thực.

---

### 3. KIỂM TRA & RÀ SOÁT TÍCH HỢP BACKEND (FULL AUDIT)

#### 3.1. Bản đồ ánh xạ Endpoint (API Mapping)

| Tính năng | API Endpoint Backend | Client Method | Dữ liệu trả về |
| :--- | :--- | :--- | :--- |
| **Health Check** | `GET /health` | `fetchHealth()` | `status`, `lancedb_ready`, `parquet_ready` |
| **Storage Stats** | `GET /api/storage/stats` | `fetchStorageStats()` | Dung lượng R2, % quota, số object, chunk Gold |
| **EDA Analysis** | `GET /api/mining/eda` | `fetchEdaSummary()` | Tổng số bài báo, công thức LaTeX, phân phối danh mục |
| **Pillar 1: Association** | `GET /api/mining/pillars/association-rules` | `fetchAssociationRules()` | Frequent itemsets, Support, Confidence, Lift, Conviction |
| **Pillar 2: Clusters** | `GET /api/mining/pillars/clusters` | `fetchClusters()` | HDBSCAN clusters, Silhouette score, UMAP coords |
| **Pillar 3: Graph** | `GET /api/mining/pillars/graph` | `fetchGraph()` | NetworkX graph: Nodes, Links, PageRank, Communities |
| **Pillar 4: Trends** | `GET /api/mining/pillars/trends` | `fetchTrends()` | Vận tốc danh mục, Isolation Forest anomaly scores |
| **Scientific RAG** | `POST /api/chat` | `sendChatQuery()` | Câu trả lời, Similarity score, Citations, Latency |
| **Telemetry Stream** | `GET /api/mining/telemetry/stream` | `subscribeTelemetry()` | Luồng Server-Sent Events (SSE) thời gian thực |

#### 3.2. Đánh giá trạng thái tích hợp từng phân hệ

1. **Tab 2: DuckDB EDA (`src/components/EdaView.tsx`)**: Đã kết nối hoàn toàn. Khởi tạo `fetchEdaSummary()` trong `useEffect`, hiển thị biểu đồ phân phối, bảng xếp hạng tác giả, ma trận đồng xuất hiện danh mục trực tiếp từ backend.
2. **Tab 3: 4 Mining Pillars (`src/components/MiningPillarsView.tsx`)**: Đã kết nối hoàn toàn. Gọi song song `Promise.all` 4 API pillars, hiển thị phân tích liên kết, phân cụm ngữ nghĩa, đồ thị mạng lưới tác giả và phát hiện bất thường.
3. **Tab 4: Scientific RAG Console (`src/components/ScientificRagConsole.tsx`)**: Đã kết nối hoàn toàn. Gửi truy vấn người dùng tới endpoint `POST /api/chat`, hiển thị câu trả lời suy luận, độ tương đồng cosine vector LanceDB và nguồn trích dẫn.
4. **Tab 5: Live Telemetry Feed (`src/components/LiveTelemetryFeed.tsx`)**: Đã kết nối hoàn toàn. Đăng ký nhận luồng SSE từ backend để ghi log thực thi theo thời gian thực.

---

### 4. NÂNG CẤP ĐỒNG BỘ DỮ LIỆU ĐỘNG CHO TAB 1 (DYNAMIC BENTO BINDING)

Trước khi nâng cấp, Tab 1 vẫn còn một số component sử dụng số liệu hardcoded. Đã thực hiện tái cấu trúc đồng bộ:

1. **`src/components/MetricsBento.tsx`**:
   - Thêm interface props `MetricsBentoProps` nhận `storageStats`, `edaData`, `backendStatus`.
   - **Card 1 (Corpus Scale)**: Gắn `edaData.dataset_overview.total_papers` và `enriched_html_papers`.
   - **Card 2 (Gold Vectors)**: Gắn `storageStats.zones.goldChunkCount` từ LanceDB.
   - **Card 3 (Cloudflare R2)**: Gắn `storageStats.total_size_gb`, `storageStats.free_tier_quota_gb`, và % thanh tiến trình động theo `storageStats.used_percentage`.
   - **Card 4 (Math Extraction)**: Gắn `edaData.dataset_overview.total_math_formulas`.
   - **Card Status Badges**: Tự động chuyển `100% INGESTED` khi Online hoặc `CACHED CORPUS` khi Offline.

2. **`src/components/GeometricTelemetryGauges.tsx`**:
   - Nhận prop `storageStats`.
   - Vòng cung đo dung lượng (Radial SVG Arc) tự động tính toán lại `strokeDashoffset` theo % dung lượng thực tế của R2 bucket từ backend.

3. **`src/components/StorageInspector.tsx`**:
   - Nhận prop `storageStats`.
   - Header bảng phân vùng Medallion hiển thị `TOTAL FOOTPRINT` và `FREE TIER LIMIT` đồng bộ từ `storageStats`.

4. **Thanh Header & Footer (`src/App.tsx`)**:
   - Dòng tóm tắt ở Header và các chỉ số ở Footer tự động liên kết với `edaData` và `storageStats`.

---

### 5. KIẾN TRÚC CHỊU LỖI KÉP (RESILIENT OFFLINE-FIRST ARCHITECTURE)

- **Nguyên tắc thiết kế**: Frontend được thiết kế theo mô hình Resilient Offline-First.
- **Khi Backend Online**: 100% số liệu, biểu đồ, kết quả RAG, log stream được nạp động từ các dịch vụ Python FastAPI, DuckDB, và LanceDB.
- **Khi Backend Offline**: Hệ thống không bị treo hoặc phát sinh màn hình trắng (White Screen of Death), mà tự động chuyển sang chế độ `OFFLINE SNAPSHOT` với dữ liệu snapshot của 10,000 bài báo đã được chuẩn hóa sẵn, phục vụ việc trình chiếu và kiểm thử giao diện mượt mà.

---

### 6. KẾT QUẢ KIỂM THỬ VÀ XÁC NHẬN CHẤT LƯỢNG

- **Linter**: `npm run lint` (`oxlint`) hoàn thành trong 107ms: **0 warnings, 0 errors**.
- **TypeScript & Build**: `npm run build` (`tsc -b && vite build`) hoàn thành trong 407ms: **Thành công 100%**.
- **Chính sách dấu câu (Zero Em-Dash Policy)**: Kiểm tra qua lệnh `grep -rn "—" src/ docs/frontend-dashboard/BACKEND_INTEGRATION_AND_STATUS_DETECTION_REPORT.md` cho kết quả **0 vi phạm**.
- **Phiên bản Git Commit**:
  - `d8dc284`: *fix(telemetry): accurately detect backend status and prevent false online reporting*
  - `4f6a9e7`: *feat(metrics): bind all dashboard bento and lakehouse metrics dynamically to backend API*
  - Đã đẩy (pushed) toàn bộ lên nhánh remote `origin/feature/frontend-dashboard`.
