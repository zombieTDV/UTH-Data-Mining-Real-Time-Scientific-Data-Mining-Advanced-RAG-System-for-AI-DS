# BÁO CÁO NGHIỆM THU ĐẠI TU TOÀN DIỆN UI/UX VÀ KHẮC PHỤC TRIỆT ĐỂ VA CHẠM LAYOUT DASHBOARD

*Dự án:* UTH Data Mining Real-Time Scientific Data Mining & Advanced RAG System  
*Thời gian thực thi:* 2026-10-05  
*Tiêu chuẩn thiết kế:* High-Contrast Swiss Technical Print (WCAG AAA) & Tactical Obsidian Telemetry  
*Chính sách dấu câu:* Zero Em-Dash Policy (Tuyệt đối không dùng ký tự em-dash)  
*Mã nguồn áp dụng:* `frontend/src/components/EdaView.tsx`, `frontend/src/components/MiningPillarsView.tsx`

---

## 1. TỔNG QUAN HIỆN TRẠNG VÀ MỤC TIÊU ĐẠI TU

Dựa trên hình ảnh thực tế từ người dùng phản ánh tình trạng va chạm layout, đè chồng chéo các lớp đồ thị và màu sắc gây rối mắt:
1. **Lỗi 1 (Ảnh 0): Header Biểu đồ Bị Chèn Ép & Chữ Trượt Sau Nút Bấm:** Tiêu đề biểu đồ `PHÂN BỐ THỂ THỨC KHẢO SÁT VÀ NĂM CÔNG BỐ (COMBO CLUSTERED COLUMN & LINE)` đặt cùng hàng ngang với dãy nút công cụ (`Pareto 80%`, `Log/Linear Scale`, `Export Toolbar`) mà thiếu `flexShrink: 0`, dẫn tới khi thu nhỏ card, văn bản bị co rúm và trượt ra sau các nút điều khiển.
2. **Lỗi 2 (Ảnh 1): Va Chạm Trực Tiếp Giữa Nhãn Ngưỡng Pareto 80% Và Điểm Dữ Liệu:** Hộp nhãn `80% PARETO CUTOFF` được ghim cứng tại tọa độ `x = 655, y = 61`. Trong khi đó, các điểm tích lũy đạt 78% và 80% có tọa độ `cx = 670 - 750, cy = 79` và vẽ nhãn tại `y = 60`, gây chồng đè văn bản và biểu tượng dữ liệu lên nhau.
3. **Lỗi 3 (Ảnh 2): 4 Thẻ Phân Vị (Quadrant Cards) Đè Lên Dữ Liệu Scatter Plot:** Các khung chữ nhật lớn của 4 góc phần tư vẽ đè trực tiếp trong lòng không gian dữ liệu (`x: 70..440, y: 26..155`), khiến hơn 800 hạt điểm phân tán (scatter dots) vẽ xuyên qua chữ và viền khung.
4. **Lỗi 4 (Ảnh 3): Ma Trận Giao Thoa Liên Ngành (Heatmap Matrix) Sử Dụng Màu Tím Đậm Gây Rối Mắt:** Các ô liên ngành dùng màu tím bão hòa cao (`rgba(124, 58, 237, 0.65)`), tương phản kém với text đen `#111827`, cạnh các thẻ dưới màu xanh nhạt tạo cảm giác vỡ vụn giao diện.

---

## 2. BẢNG ĐỐI CHIẾU GIẢI PHÁP KỸ THUẬT ĐÃ TRIỂN KHAI

| Hạng mục | Trước khi sửa (Lỗi phát hiện) | Giải pháp kỹ thuật đã áp dụng | Tệp nguồn & Phạm vi |
| :--- | :--- | :--- | :--- |
| **Kiến trúc Header Biểu đồ** | 1 tầng gộp chung Tiêu đề + Telemetry + Nút thao tác; dễ vỡ layout khi co hẹp | **Two-Tier Decoupled Swiss Architecture**: Tầng 1 chứa Mã Catalog (`[EDA-01]` đến `[EDA-05]`) + Tiêu đề ngắn gọn + Nút thao tác chính (`flexShrink: 0`). Tầng 2 chứa thanh Sub-deck riêng với background `cardSubtle`, gom gọn filter, toggle, telemetry chip và ChartToolbar | `EdaView.tsx` (L1370-L1425, L1550-L1605, L1880-L1940, L2335-L2415) |
| **Đường Ngưỡng Pareto 80%** | Nhãn cutoff đặt tại `x = 655, y = 61`, va chạm trực tiếp với điểm tích lũy 78% và 80% | **Mép Biên An Toàn (Safe Margin Anchor)**: Dời toàn bộ nhãn cutoff ra mép trái `x = 65, y = cutoffY - 17`. Bổ sung **Smart Milestones**: Chỉ vẽ nhãn dữ liệu tại điểm tích lũy quan trọng và dynamic Y-offset để triệt tiêu va chạm | `EdaView.tsx` (L1460-L1510) |
| **Góc Phần Tư Scatter Plot** | 4 thẻ `<rect>` và `<text>` vẽ cứng trong lòng đồ thị, làm điểm scatter tròn đè lên chữ | **Typography Watermarks Chìm**: Loại bỏ toàn bộ 4 thẻ cứng. Thay bằng Watermark Typography chìm ở 4 góc nền (`Q1`, `Q2`, `Q3`, `Q4` với `fontSize: 36, opacity: 0.10, pointerEvents: 'none'`) | `EdaView.tsx` (L1965-L2008) |
| **Viền Điểm Scatter Dark Mode** | Stroke màu trắng tinh `#ffffff` gây chói lóa trong giao diện nền tối | **Tương phản Thích ứng**: Sử dụng `stroke={isSelectedForDrawer ? '#f59e0b' : isDark ? '#0f172a' : '#ffffff'}` tạo khoảng thở âm (negative space) sắc nét giữa các điểm | `EdaView.tsx` (L2055-L2065) |
| **Bảng Màu Ma Trận Giao Thoa (Heatmap)** | Nền tím bão hòa cao (`rgba(124, 58, 237, 0.65)`), text xám đen khó đọc, rời rạc | **Precision Swiss Sapphire Palette**: Nền sapphire dịu mắt (`rgba(37, 99, 235, alpha)`), con số to rõ 15px, bổ sung **Micro Density Bar** (thanh mật độ vi mô 3px ở chân mỗi thẻ) | `EdaView.tsx` (L2415-L2480) |
| **Đồng bộ 4 Trụ Cột Khai Phá (Mining Pillars)** | Nhãn Tâm Cụm K-Means bị điểm scatter đè lên chữ; thiếu mã định danh chuẩn | Thêm **Tấm Nền Bảo Vệ (Protective Plate)** cho Tâm Cụm Pillar 2; gắn mã định danh khoa học `[MINING-01]` đến `[MINING-05]` | `MiningPillarsView.tsx` (L1030, L1795, L2005-L2025, L2465, L3185, L3470) |

---

## 3. KẾT QUẢ ĐO LƯỜNG VÀ KIỂM ĐỊNH CHẤT LƯỢNG

1. **Kiểm tra Biên dịch TypeScript & Vite Build:**
   - Lệnh thực thi: `npm run build --prefix frontend`
   - Kết quả: **THÀNH CÔNG (Exit code: 0)**
   - Thời gian build: **347ms**
   - Không có bất kỳ cảnh báo hoặc lỗi cú pháp TypeScript nào (`tsc -b` pass 100%).

2. **Kiểm tra Linter (Oxlint):**
   - Lệnh thực thi: `npm run lint --prefix frontend`
   - Kết quả: **0 LỖI (0 errors)** trên toàn bộ 19 tệp nguồn TypeScript/React.

3. **Kiểm tra Tuân thủ Zero Em-Dash Policy:**
   - Lệnh thực thi: `grep -rn $'\u2014' frontend/src/`
   - Kết quả: **0 kết quả vi phạm (100% tuân thủ)**. Mọi dấu phân cách đều dùng dấu hai chấm `:`, dấu gạch nối `-` hoặc dấu chấm tròn tâm `·`.

4. **Trải nghiệm Người dùng (UX/UI):**
   - Layout 100% không bị co rúm, không tràn ngang ngoài tầm kiểm soát khi co kéo cửa sổ trình duyệt.
   - Các điểm dữ liệu scatter, đường Pareto, vùng quy tắc vàng và các phân vị có không gian hiển thị độc lập, rõ ràng, đạt chuẩn hiển thị màn hình Dashboard giám sát khoa học thực tế.

---

## 4. KẾT LUẬN

Toàn bộ các giai đoạn đại tu UI/UX trong kế hoạch tổng thể đã được thực thi hoàn tất và nghiệm thu thành công. Dashboard đã đạt tiêu chuẩn sản phẩm khoa học cao cấp: ổn định, thẩm mỹ kỹ thuật Thụy Sĩ (Swiss Technical Print), rõ ràng và không còn hiện tượng va chạm layer hay màu sắc xung đột.
