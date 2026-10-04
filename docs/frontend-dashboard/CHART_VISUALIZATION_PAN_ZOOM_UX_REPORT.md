# UTH SCIENTIFIC DATA MINING & REAL-TIME RAG SYSTEM
## BÁO CÁO KỸ THUẬT: NÂNG CẤP HỆ THỐNG ĐIỀU KHIỂN ĐỒ THỊ KHOA HỌC TƯƠNG TÁC
### TÍCH HỢP ZOOM IN / ZOOM OUT TOUCHPAD & CHUỘT, DRAG-TO-PAN CANVAS VÀ BẢO VỆ TƯƠNG TÁC CLICK
*Ngày báo cáo: 04/10/2026*  
*Người thực hiện: Antigravity AI Engineer*  
*Đơn vị: Trường Đại học Giao thông vận tải TP.HCM (UTH) // Scientific Data Mining Lab 2026*  
*Branch: `feature/frontend-dashboard`*

---

### 1. TỔNG QUAN YÊU CẦU & BỐI CẢNH NÂNG CẤP

Nhằm đáp ứng yêu cầu nâng tầm trải nghiệm giao diện người dùng (UI/UX) cho phòng thí nghiệm khai phá dữ liệu khoa học Mission Control, hệ thống đồ thị tương tác cần giải quyết các bài toán công thái học trọng yếu:
1. **Thiếu khả năng phóng to / thu nhỏ linh hoạt**: Các biểu đồ mật độ cao (10,000 điểm Truncated SVD, mạng lưới liên kết đồng tác giả Louvain 120 nodes, phân vị dị biệt P99 Isolation Forest) trước đây hiển thị cố định trong khung viewBox tĩnh, gây khó khăn cho việc nghiên cứu sâu từng chi tiết.
2. **Thiếu công thái học điều khiển đa thiết bị**: Cần hỗ trợ mượt mà cả bánh xe chuột (Mouse Wheel) lẫn bàn di chuột (Touchpad / Trackpad) với cử chỉ nhúm 2 ngón (Pinch-to-zoom) và cuộn 2 ngón để pan.
3. **Hiện tượng xung đột thao tác (Drag vs Click Conflict)**: Khi người dùng kéo canvas để di chuyển khung nhìn, nếu nhả chuột trên một hạt phân cụm hoặc bóng luật kết hợp thì sự kiện click vô tình kích hoạt mở drawer chẩn đoán, gây gián đoạn trải nghiệm quan sát.
4. **Loại bỏ các yếu tố rườm rà thiếu chuyên nghiệp**: Loại bỏ triệt để các emoji phong cách mạng xã hội (như bóng đèn), thay thế bằng phong cách Scientific Telemetry chuẩn phòng lab với viền sắc nét, font chữ kỹ thuật monospace và thông số đo lường thực tế.

---

### 2. KIẾN TRÚC GIẢI PHÁP KỸ THUẬT: HOOK `useSvgPanZoom`

Đã thiết kế và đóng gói giải pháp thành custom hook dùng chung tại `frontend/src/hooks/useSvgPanZoom.ts`:

#### 2.1. Toán Học Zoom Bám Theo Con Trỏ Chuột (Cursor-Invariant Zoom)
Tâm phóng to thu nhỏ được giữ bất biến tại vị trí chuột người dùng trỏ vào:
```typescript
// Tính tỷ lệ vị trí chuột tương đối trong viewport SVG
const fx = (clientX - rect.left) / rect.width;
const fy = (clientY - rect.top) / rect.height;

// Xác định tọa độ thực tế trong không gian SVG hiện tại
const curMinX = centerOrigin ? -w / 2 - pan.x : (nominalWidth - w) / 2 - pan.x;
const curMinY = centerOrigin ? -h / 2 - pan.y : (nominalHeight - h) / 2 - pan.y;
const mouseSvgX = curMinX + fx * w;
const mouseSvgY = curMinY + fy * h;

// Tính toán viewBox mới sau khi áp dụng hệ số zoom
const newW = nominalWidth / newZoom;
const newH = nominalHeight / newZoom;
const newMinX = mouseSvgX - fx * newW;
const newMinY = mouseSvgY - fy * newH;

// Cập nhật khoảng dời pan để giữ con trỏ chuột đứng yên trong không gian dữ liệu
const newPanX = centerOrigin ? -newW / 2 - newMinX : (nominalWidth - newW) / 2 - newMinX;
const newPanY = centerOrigin ? -newH / 2 - newMinY : (nominalHeight - newH) / 2 - newMinY;
```

#### 2.2. Hỗ Trợ Đa Nền Tảng (Mouse, Touchpad & Touch Devices)
- **Mouse Wheel**: Lăn chuột tiến để phóng to (Zoom in), lùi để thu nhỏ (Zoom out).
- **Touchpad Pinch**: Nhận diện sự kiện `e.ctrlKey === true` từ trackpad để co giãn mượt mà với bước tăng siêu mịn (`deltaY * -0.01`).
- **Touchpad Two-Finger Pan**: Khi biểu đồ đang được phóng to (`zoom > 1.05`), thao tác vuốt 2 ngón trên trackpad tự động dịch chuyển tọa độ pan theo trục X/Y mà không cuộn trang.
- **Drag-to-Pan Chuột**: Giữ chuột trái và kéo rê tự do; con trỏ chuột chuyển từ `grab` sang `grabbing`.
- **Cử chỉ cảm ứng**: 1 ngón tay chạm kéo để pan, 2 ngón tay chụm mở để pinch-to-zoom.
- **Double Click / Reset**: Nhấp đúp chuột vào canvas để hoàn trả ngay lập tức về tỷ lệ chuẩn 100% tại trung tâm.

#### 2.3. Thuật Toán Ngăn Chặn Click Nhầm Khi Kéo (`didDrag`)
Ghi lại vị trí `pointerDown` và tính khoảng cách dịch chuyển Euclide khi nhả chuột:
```typescript
const didDrag = useCallback((): boolean => {
  const dist = Math.hypot(
    lastDragPosRef.current.x - dragStartRef.current.x,
    lastDragPosRef.current.y - dragStartRef.current.y
  );
  return dist > 4; // Ngưỡng dịch chuyển 4px phân biệt giữa click và drag
}, []);
```
Mọi sự kiện `onClick` của từng phần tử bóng luật, điểm scatter, node mạng đều được bọc qua điều kiện `if (!panZoom.didDrag())`, đảm bảo an toàn tuyệt đối khi điều hướng.

#### 2.4. Hỗ Trợ Hệ Tọa Độ Manifold Đối Xứng (`centerOrigin: true`)
Đối với biểu đồ phân cụm Truncated SVD 2D (Trụ cột 2), các trục tọa độ âm/dương đối xứng quanh gốc `(0, 0)`. Tùy chọn `centerOrigin: true` cho phép gốc `(0, 0)` luôn là trung tâm đối xứng của canvas thay vì gốc `(0, 0)` nằm ở góc trên cùng bên trái.

---

### 3. DANH SÁCH 8 BIỂU ĐỒ ĐÃ ĐƯỢC NÂNG CẤP ĐỒNG BỘ

| STT | Biểu Đồ | Phân Hệ | File Nguồn | Kích Thước Danh Định | Đặc Tính Riêng |
| :---: | :--- | :--- | :--- | :--- | :--- |
| 1 | **Phân Phối & Tích Lũy Pareto** | EDA Sub-Deck 1 | `EdaView.tsx` | 920 x 300 | Tích hợp đường cong Pareto 80/20, zoom cột danh mục |
| 2 | **Chuỗi Thời Gian 24 Tháng** | EDA Sub-Deck 1 | `EdaView.tsx` | 460 x 230 | Soi chi tiết từng mốc xuất bản từ 2023 đến 2024 |
| 3 | **Độ Dài Nội Dung vs Toán Học** | EDA Sub-Deck 2 | `EdaView.tsx` | 940 x 330 | Khám phá 4 góc phần tư học thuật, rê/kéo trên 1,000 điểm |
| 4 | **FP-Growth Association Rules** | Trụ Cột 1 | `MiningPillarsView.tsx` | 720 x 280 | Soi phóng to Vùng Quy Tắc Vàng (Lift >= 2.5x, Conf >= 35%) |
| 5 | **SVD 2D Topic Manifold** | Trụ Cột 2 | `MiningPillarsView.tsx` | 2.4 x 2.4 (Gốc 0,0) | Tự động giữ kích thước nét stroke và bán kính hạt cố định |
| 6 | **Louvain Co-Authorship Graph** | Trụ Cột 3 | `MiningPillarsView.tsx` | 580 x 320 | Khám phá mạng lưới liên kết, cô lập Ego-Network không giật |
| 7 | **Quarterly Trend Velocity** | Trụ Cột 4.1 | `MiningPillarsView.tsx` | 520 x 220 | Phóng to so sánh cột quý gần nhất và quý trước |
| 8 | **Isolation Forest Outliers** | Trụ Cột 4.2 | `MiningPillarsView.tsx` | 460 x 210 | Soi chi tiết vùng ngưỡng P99 dị biệt nội dung và công thức |

---

### 4. NÂNG CẤP PHẢN HỒI THỊ GIÁC & CÔNG CỤ ĐIỀU KHIỂN

#### 4.1. Thanh Công Cụ Đồ Thị Chuẩn Hóa (`ChartToolbar.tsx`)
- Nút đặt lại hiển thị động: `↺ {Math.round(zoomLevel * 100)}%`.
- Khi người dùng thực hiện thao tác kéo pan hoặc thay đổi mức zoom (`hasPannedOrZoomed === true`), nút đặt lại lập tức sáng viền xanh/chàm nổi bật để tạo điểm nhấn hướng dẫn phục hồi góc nhìn chuẩn.

#### 4.2. Huy Hiệu Chỉ Báo Đo Lường Vi Mô (Floating Telemetry Badge)
- Khi biểu đồ ở trạng thái panned hoặc zoomed, một badge bán trong suốt tự động xuất hiện ở góc dưới bên trái canvas: `[✥ 100% • Kéo để pan]`.
- Badge sử dụng hiệu ứng làm mờ nền (backdrop-filter blur), màu chữ kỹ thuật xanh ngọc/xanh thiên thanh, hoàn toàn không cản trở thao tác chuột (`pointerEvents: 'none'`).

---

### 5. KIỂM ĐỊNH KỸ THUẬT & CHUẨN MỰC BẢO ĐẢM

1. **Kiểm Tra Biên Dịch**:
   - Lệnh `npm run build` thực thi `tsc -b && vite build` thành công xuất sắc với mã thoát `0`.
   - Thời gian biên dịch đạt **274ms**, bundle nén tối ưu (CSS 4.88 kB, JS 485.78 kB).
2. **Chính Sách Không Dấu Gạch Ngang Dài (Zero Em-Dash Compliance)**:
   - Toàn bộ codebase tại `frontend/src` được quét xác nhận kết quả `0` lượt vi phạm ký tự em-dash.
3. **Sàn Kích Thước Chữ Tối Thiểu (Font Floor >= 10px)**:
   - Toàn bộ nhãn đồ thị, số đo trục tọa độ và văn bản chú thích tuân thủ nghiêm ngặt kích thước tối thiểu từ `10px` trở lên, không còn hiện tượng chữ bị vỡ hạt hay chồng lấn trên màn hình độ phân giải tiêu chuẩn.

---

### 6. KẾT LUẬN

Hệ thống giao diện trực quan hóa dữ liệu khoa học của dự án UTH Data Mining RAG System hiện đã đạt mức độ hoàn thiện cao về công thái học, hỗ trợ thao tác tự nhiên trên mọi thiết bị ngoại vi và đáp ứng tiêu chuẩn khắt khe của một hệ thống phân tích dữ liệu chuyên nghiệp.
