# UTH SCIENTIFIC DATA MINING & REAL-TIME RAG SYSTEM
## BÁO CÁO KỸ THUẬT: TỐI ƯU HÓA TRẠNG THÁI ACTIVE CHO DARK MODE (CHỐNG CHÓI MẮT & NÂNG CẤP TRẢI NGHIỆM UI/UX)
*Ngày báo cáo: 03/10/2026*  
*Người thực hiện: Antigravity AI Engineer*  
*Đơn vị: Trường Đại học Giao thông vận tải TP.HCM (UTH) // Scientific Data Mining Lab 2026*  
*Branch: `feature/frontend-dashboard`*

---

### 1. TỔNG QUAN VÀ MỤC ĐÍCH

- **Phản hồi của người dùng**: *"check lại UI UX giao diện nhé việc chọn vào nó hiện trắng luôn làm khá chói mắt và trải nghiệm k tốt wor darkmode check lại và fix tìm cách tốt hơn cho giao diện nhé"*.
- **Mục tiêu**: Loại bỏ triệt để hiện tượng nghịch đảo màu sang nền trắng (`#f8fafc`) khi người dùng click/chọn các tab, bộ lọc, phân vùng hoặc nút bấm trong Dark Mode, thay thế bằng thiết kế bề mặt nổi vi mô (Elevated Dark Surface) kết hợp viền chỉ báo màu sắc (Accent Border & Indicators) chuẩn công nghệ cao (Tactical UI).

---

### 2. PHÂN TÍCH NGUYÊN NHÂN GỐC RỄ (ANTI-PATTERN INVERTED WHITE)

Trước khi sửa đổi, hệ thống tồn tại mẫu thiết kế cũ (Invert-to-white pattern):
```css
/* Mẫu thiết kế cũ gây chói mắt */
background: isActive ? 'var(--text-primary)' : 'var(--bg-surface)';
color: isActive ? 'var(--bg-surface)' : 'var(--text-secondary)';
```

**Hậu quả trên giao diện Dark Mode**:
- Biến `var(--text-primary)` trong Dark Mode có giá trị `#f8fafc` (màu trắng sáng tuyệt đối).
- Khi người dùng bấm chọn một nút hoặc thẻ (đặc biệt là 4 thẻ lớn ở Tab 3 với chiều rộng hơn 220px), toàn bộ bề mặt thẻ bị biến thành một mảng trắng chói lòa giữa không gian nền tối (`#05070c`).
- Điều này gây mỏi mắt đột ngột (visual shock / glare), phá vỡ phong cách sang trọng của phòng thí nghiệm dữ liệu khoa học.

---

### 3. CÁC ĐIỂM ĐÃ RÀ SOÁT VÀ NÂNG CẤP TRIỆT ĐỂ

Toàn bộ 7 vị trí sử dụng mẫu nghịch đảo màu đã được tái cấu trúc:

#### 3.1. Thẻ chọn 4 Trụ cột Khai phá Dữ liệu (`src/components/MiningPillarsView.tsx`)
- **Trước đây**: Khi chọn 1 trong 4 trụ cột, toàn bộ card chuyển sang màu trắng bệt.
- **Sau nâng cấp**:
  - Nền chuyển sang bề mặt nổi cao cấp: `var(--bg-surface-elevated)`.
  - Viền chỉ báo theo mã màu riêng biệt của từng trụ cột:
    - Pillar 01 (Association Rules): `var(--accent-emerald)` (Xanh ngọc).
    - Pillar 02 (Topic Clustering): `var(--accent-silver)` (Xanh bạc).
    - Pillar 03 (Graph Mining): `var(--accent-violet)` (Tím lượng tử).
    - Pillar 04 (Trend & Anomaly): `var(--accent-bronze)` (Hổ phách).
  - Bổ sung thanh chỉ báo viền đỉnh (Top Indicator Bar) và đèn LED phát sáng thu nhỏ bên cạnh mã trụ cột.
  - Tiêu đề chữ giữ màu trắng sáng sắc nét `var(--text-primary)` trên nền tối, hoàn toàn không gây chói.

#### 3.2. Bộ chuyển đổi chế độ xem Pipeline (`src/App.tsx`)
- **Vị trí**: Chuyển đổi giữa `PARALLEL BUS SCHEMATIC (8 TRACES)` và `4-PHASE SEQUENTIAL STEPPER`.
- **Trước đây**: Nút đang chọn bị bọc khối trắng toàn phần.
- **Sau nâng cấp**: Sử dụng nền tối nổi `var(--bg-surface)` với viền nổi `var(--border-highlight)`, bóng đổ nhẹ `rgba(0,0,0,0.25)`, và biểu tượng icon xanh ngọc `var(--accent-emerald)`.

#### 3.3. Bộ lọc phân vùng Medallion Lakehouse (`src/components/StorageInspector.tsx`)
- **Vị trí**: Các chip lọc `ALL`, `BRONZE`, `SILVER`, `GOLD`.
- **Sau nâng cấp**: Nút kích hoạt có nền `var(--bg-surface)` + viền `var(--border-highlight)` + chữ nổi `var(--text-primary)`, tạo cảm giác phím cơ xúc giác (tactile capsule).

#### 3.4. Bộ lọc danh mục nền tảng công cụ (`src/components/ToolLogos.tsx`)
- **Vị trí**: Các nút danh mục `ALL PLATFORMS`, `INGESTION & LAKEHOUSE`, `DATA MINING ENGINE`, `SCIENTIFIC RAG & LLM`, `OBSERVABILITY`.
- **Sau nâng cấp**: Chuyển thành dạng thẻ pill tối màu, viền highlight nổi bật khi được chọn.

#### 3.5. Bộ lọc mức độ log viễn trắc (`src/components/LiveTelemetryFeed.tsx`)
- **Vị trí**: Các nút `ALL`, `SUCCESS`, `QUERY`, `STORAGE`, `INFO`.
- **Sau nâng cấp**: Khi chọn, nút giữ màu nền tối bề mặt với viền tinh tế, loại bỏ hiện tượng nhấp nháy trắng khi chuyển log.

#### 3.6. Điều khiển tốc độ mô phỏng xung (`src/components/GeometricPipelineDiagram.tsx`)
- **Vị trí**: Cụm nút `1x SPEED`, `2x BOOST`, `PAUSE`.
- **Sau nâng cấp**:
  - `1x SPEED`: Nền tối viền highlight.
  - `2x BOOST`: Nền xanh ngọc trong suốt dịu mắt `rgba(16, 185, 129, 0.18)` + chữ xanh ngọc.
  - `PAUSE`: Nền đỏ trong suốt dịu mắt `rgba(239, 68, 68, 0.18)` + chữ đỏ.

#### 3.7. Nút gửi truy vấn RAG (`src/components/ScientificRagConsole.tsx`)
- **Vị trí**: Nút `RUN QUERY`.
- **Trước đây**: Nút màu trắng bệt nằm cạnh ô nhập liệu màu tối.
- **Sau nâng cấp**: Nút chuyển sang dải gradient xanh ngọc công nghệ `linear-gradient(135deg, rgba(16, 185, 129, 0.95), rgba(5, 150, 105, 0.95))` với viền ngọc và đổ bóng phát quang nhẹ (soft neon glow), tạo điểm nhấn hành động mà không gây chói mắt.

#### 3.8. Huy hiệu thương hiệu UTH-AI trên Header (`src/App.tsx`)
- **Sau nâng cấp**: Chuyển từ hộp trắng sang huy hiệu xanh ngọc tinh tế `rgba(16, 185, 129, 0.14)` viền `rgba(16, 185, 129, 0.35)` mang đậm dấu ấn viện nghiên cứu AI.

---

### 4. KẾT QUẢ KIỂM THỬ VÀ NGHIỆM THU

- **Kiểm tra mã nguồn**:
  - Tìm kiếm toàn bộ dự án lệnh `grep -rn "color.*var(--bg-surface)" src/`: **0 kết quả** (Đã triệt tiêu 100% mẫu thiết kế nghịch đảo màu).
- **Linter**: `oxlint` đạt **0 warnings, 0 errors** trên toàn bộ 20 files.
- **Build**: `tsc -b && vite build` hoàn thành thành công trong **374ms**.
- **Chính sách dấu câu**: Đạt 0 ký tự em-dash (`—`).
