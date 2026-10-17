# Dashboard UI/UX & Scientific Cockpit Standards

## 1. Zero AI-Slop & Professional Aesthetic Enforcement
- **TUYỆT ĐỐI KHÔNG** tạo các hộp thông tin "AI Executive Insight", "AI Summary", "Smart Insights" dạng pill hay drawer co giãn với các gạch đầu dòng tóm tắt chung chung.
- Các hộp chữ này gây mất thẩm mỹ nghiêm trọng, chiếm dụng diện tích hiển thị quý giá của viewport và làm giảm tính chuyên nghiệp của hệ thống Khoa học Dữ liệu / Data Mining.
- Tất cả các phát hiện và chỉ số phải được biểu diễn thông qua **dữ liệu định lượng trực quan**: KPI metric cards, interactive charts (SVG Donut, Stacked Bars, Scatter Plots), và Data Quality Schema Inspection Tables có SLA trạng thái rõ ràng.

## 2. Dynamic Data & R2 Lakehouse Synchronization
- Mọi con số trên giao diện phải là **Dynamic 100%**:
  - Kết nối trực tiếp với Cloudflare R2 Lakehouse Storage Manifest (`storageStats`) và tiến trình SSE CDC Streaming (`isStreaming`, `sessionIngested`, `streamSpeed`).
  - Không bao giờ để các giá trị số cứng (hardcoded static numbers) hoặc chuỗi tóm tắt tĩnh.
- **Nút Đồng Bộ R2**:
  - Nút Sync R2 chỉ đặt **duy nhất một vị trí** tại Master HeaderBar (`SyncR2Button`).
  - Trong các sub-view và deck (như `CollectionEdaView`), không được tạo thêm các nút "Đồng Bộ R2" lặp lại gây rối rắm; chỉ sử dụng Telemetry Status Pill (e.g. `R2 SYNCED: HH:MM:SS` / `ĐANG SYNC R2 TỔNG...`) để phản ánh trạng thái Master Sync.

## 3. Ergonomics & Viewport Density
- Tối ưu hóa cockpit không cần cuộn dọc (Zero-scroll ergonomic viewport).
- Tỷ lệ các cột và biểu đồ phải cân xứng, triệt tiêu các khoảng trống thừa (whitespace/empty gaps) bằng cách sử dụng flexbox/grid có tỷ lệ hợp lý và lấp đầy bằng bảng thẩm định kỹ thuật chất lượng cao.
