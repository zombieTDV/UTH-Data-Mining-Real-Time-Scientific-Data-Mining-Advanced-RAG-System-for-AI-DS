# KẾ HOẠCH TỐI ƯU HÓA VÀ ĐẠI TU TOÀN DIỆN UI/UX 4 TRỤ CỘT KHAI PHÁ DỮ LIỆU
## (DEEP 4-PILLAR SCIENTIFIC UI/UX OVERHAUL PLAN)

*Dự án:* UTH Data Mining Real-Time Scientific Data Mining & Advanced RAG System  
*Thời gian lập kế hoạch:* 2026-10-05  
*Tiêu chuẩn thiết kế:* High-Contrast Swiss Technical Print (WCAG AAA) & Tactical Obsidian Telemetry  
*Chính sách dấu câu bắt buộc:* Zero Em-Dash Policy (Tuyệt đối không dùng ký tự gạch ngang dài em-dash, thay thế bằng dấu hai chấm `:` hoặc gạch nối `-`)  
*Tệp mã nguồn trọng tâm:* `frontend/src/components/MiningPillarsView.tsx`

---

## 1. PHÂN TÍCH NGUYÊN NHÂN GỐC RỄ (ROOT CAUSE ANALYSIS) TỪ 4 ẢNH CHỤP THỰC TẾ

```
[4 ẢNH THỰC TẾ CẦN XỬ LÝ]
├── Ảnh 0 (Pillar 1 - Association Rules): Va chạm nhãn Baseline Lift 1.0x & Các bóng luật đè lên chữ
├── Ảnh 1 (Pillar 2 - Topic Clusters): Lệch tâm toán học SVD làm 100% dữ liệu dồn về nửa trái (75% bên phải trống rỗng)
├── Ảnh 2 (Pillar 3 - Co-authorship Graph): Bố cục Circular tùy tiện, các node văng ra ngoài, link chằng chịt rối rắm
└── Ảnh 3 (Pillar 4 - Trend & Outliers): Nhãn P99 bị điểm dị biệt đè thẳng lên chữ "NGOẠI LAI", điểm cận dưới bị trục X cắt đôi
```

### 1.1. Trụ Cột 1: Khai Phá Luật Kết Hợp FP-Growth (`uploaded_media_0_1791144744447.png`)
- **Triệu chứng phát hiện:**
  1. Hộp nhãn `NGƯỠNG ĐỘC LẬP NGẪU NHIÊN (LIFT = 1.0x)` nằm trên đường nét đứt `y = 175` và tọa độ `x = 438..698`.
  2. Tại vùng `support = 2.0% - 3.5%` và `confidence = 15% - 25%`, các luật kết hợp phổ biến có tọa độ `cx = 400..650, cy ~ 170..180`. Các quả bóng này được render sau tấm nền nhãn, dẫn tới **hàng loạt bóng tròn màu cam đè trực tiếp lên nhãn chữ**, che khuất hoàn toàn nội dung ("NGƯỠNG ... LẬP NGẪU NHIÊN (LIFT = 1.0x)").
  3. Cụm bóng ở vị trí `support ~ 1.75%` bị xếp chồng lên nhau thành một khối bùi nhùi, người dùng không thể phân biệt ranh giới và nhấp chọn từng luật riêng lẻ.
  4. Hộp nhãn `★ VÙNG QUY TẮC VÀNG` ở phía trên bị bóng tròn `cx ~ 310, cy ~ 80` chèn sát mép dưới của khung nhãn.
- **Nguyên nhân kỹ thuật:** Nhãn đường tham chiếu đặt cố định trong không gian phân bố có mật độ điểm cao nhất, thứ tự render (Z-Index SVG) để nhãn nằm dưới điểm dữ liệu, và thiếu cơ chế tách cụm vi mô (jitter offset / halo rings) cho các luật có độ hỗ trợ gần nhau.

---

### 1.2. Trụ Cột 2: Không Gian Phân Cụm Ngữ Nghĩa 2D SVD (`uploaded_media_1_1791144744447.png`)
- **Triệu chứng phát hiện:**
  1. **Toàn bộ đám mây dữ liệu của 6 cụm K-Means bị co bẹp và dồn hẳn sang nửa bên trái của đồ thị (`x < 0`)**.
  2. Khoảng 75% diện tích đồ thị bên phải, phía trên và các góc phần tư I, IV **hoàn toàn trống rỗng**.
  3. Hệ trục tọa độ chữ thập và các vòng tròn đồng tâm phân cực (polar concentric rings) nằm chơ vơ ở trung tâm canvas, trong khi dữ liệu nằm lệch hẳn về một góc.
  4. Thanh công cụ phía trên gom hơn 15 nút điều khiển (`Copy LaTeX`, `Thu Gọn`, `All`, `C#0..C#5`, zoom `- / +`, `Bảng`, `Rạp Hát`, `SVG`, `CSV`) thành một dải dài vô tổ chức.
- **Nguyên nhân kỹ thuật:**
  - Về mặt toán học: `TruncatedSVD(n_components=2)` thực thi trên vector embedding văn bản chưa trừ vector trung bình (uncentered embeddings). Thành phần kỳ dị thứ nhất (First Singular Vector) luôn thu nạp hướng của vector trung bình khiến `coords_2d[:, 0]` luôn có giá trị âm lớn (`x` từ -0.9 đến -0.4), trong khi `coords_2d[:, 1]` dao động quanh 0.
  - Về mặt giao diện: Canvas SVG sử dụng `viewBox="-1.2 -1.2 2.4 2.4"` ghim cứng tâm tại `(0, 0)` mà không có thuật toán tự động căn chỉnh khung bao thực tế (Dynamic Bounding Box & Normalization).

---

### 1.3. Trụ Cột 3: Đồ Thị Mạng Lưới Đồng Tác Giả Louvain (`uploaded_media_2_1791144744447.png`)
- **Triệu chứng phát hiện:**
  1. Bố cục `Circular` hiện tại xếp các node theo góc `(idx / total) * 2 * PI` mà **không gom nhóm theo cộng đồng Louvain**.
  2. Bán kính được tính bằng công thức ngẫu nhiên `r = 95 + (node.community % 4) * 32`, khiến các node cùng một cụm bị văng ra ngoài bán kính xa (các chấm đỏ, cam, xanh nằm lơ lửng bên ngoài không gian chính).
  3. Các đường liên kết giữa các node cắt ngang tâm hình tròn như một mớ mạng nhện chằng chịt, khiến người dùng hoàn toàn không nhận diện được cấu trúc nhóm nghiên cứu hay các tác giả đầu ngành (Key Influencers).
  4. Thẻ chuyển Tab ở phía trên bị tràn không gian hoặc va chạm với các thanh thông báo hệ thống.
- **Nguyên nhân kỹ thuật:** Thuật toán tọa độ `getNodeCoordinates` chưa tối ưu cho lý thuyết đồ thị mạng xã hội khoa học (Co-authorship Social Network), thiếu thuật toán gom cụm cung tròn (Community Arcs) và thiếu đường cong Bezier cho các liên kết nội bộ.

---

### 1.4. Trụ Cột 4: Bản Đồ Dị Biệt Isolation Forest (`uploaded_media_3_1791144744447.png`)
- **Triệu chứng phát hiện:**
  1. Hộp nhãn `VÙNG DỊ BIỆT NGOẠI LAI P99 (SCORE > 0.85)` nằm tại tọa độ `y = 28..46` và `x = 166..416`.
  2. Điểm ngoại lai có số lượng công thức toán cao nhất (`math_count ~ 3,800`) có tọa độ rơi đúng vào `y = 37.5, x = 304`. Kết quả là **chấm tròn màu đỏ lớn đè trực tiếp lên chữ "NGOẠI LAI"**, tạo thành chữ dị dạng `VÙNG DỊ BIỆT NGO●LAI`.
  3. Ở cận dưới (`math_count` thấp), các điểm dị biệt có `cy = 180` nằm trùng khít lên đường trục X (`y = 180`), làm nửa dưới của các hạt bị trục X cắt đôi.
- **Nguyên nhân kỹ thuật:** Tọa độ nhãn tham chiếu đặt trực tiếp trong luồng phân bố dị biệt cao, trục X thiếu khoảng đệm an toàn (baseline padding).

---

## 2. KIẾN TRÚC GIẢI PHÁP KỸ THUẬT CHO TỪNG TRỤ CỘT

### 2.1. Nâng cấp Trụ Cột 1 (FP-Growth Association Rules)
1. **Dời Nhãn Baseline Ra Mép Biên An Toàn (Safe Margin Anchor):**
   - Dời nhãn `NGƯỠNG ĐỘC LẬP NGẪU NHIÊN (LIFT = 1.0x)` sang mép trái sát trục tung `x = 60, y = 168` (nơi `support < 0.5%`, không bao giờ có điểm dữ liệu xuất hiện).
   - Đặt nhãn `★ VÙNG QUY TẮC VÀNG` cố định ở đỉnh trên cùng của đồ thị `x = 245, y = 20` (ngoài phạm vi bay của bóng).
2. **Kỹ thuật Phân Tách Bóng Lồng Ghép (Smart Bubble Jitter & Negative Rings):**
   - Điểm bóng sử dụng fill mờ có kiểm soát `fillOpacity="0.75"`, viền trắng/tối `strokeWidth="1.5"`.
   - Bổ sung viền âm (Negative space stroke) giúp các bóng khi xếp chồng vẫn hiển thị rõ ràng tâm và bán kính từng luật.
   - Thêm tooltip telemetry gộp: Khi rê chuột vào khu vực có nhiều hơn 1 luật, hiển thị bảng danh sách các luật lân cận.

---

### 2.2. Nâng cấp Trụ Cột 2 (Semantic Topic Clusters SVD Manifold)
1. **Thuật Toán Căn Chỉnh Khung Bao Tự Động (Dynamic Bounding Box & Normalization):**
   - Thay vì ghim cứng hệ tọa độ tại `(0, 0)`:
   ```typescript
   // Tính toán Bounding Box từ dữ liệu thực tế
   const bounds = useMemo(() => {
     if (!clustersData?.scatter_2d?.length) return { minX: -1, maxX: 1, minY: -1, maxY: 1, cx: 0, cy: 0, span: 2 };
     let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
     clustersData.scatter_2d.forEach(pt => {
       if (pt.x < minX) minX = pt.x;
       if (pt.x > maxX) maxX = pt.x;
       if (pt.y < minY) minY = pt.y;
       if (pt.y > maxY) maxY = pt.y;
     });
     const cx = (minX + maxX) / 2;
     const cy = (minY + maxY) / 2;
     const span = Math.max(maxX - minX, maxY - minY) * 1.15; // 15% padding
     return { minX, maxX, minY, maxY, cx, cy, span };
   }, [clustersData]);
   ```
   - Chuẩn hóa các điểm về trung tâm canvas:
   ```typescript
   const normX = ((pt.x - bounds.cx) / bounds.span) * 2.0;
   const normY = ((pt.y - bounds.cy) / bounds.span) * 2.0;
   ```
   - Kết quả: Đám mây 6 cụm K-Means sẽ bung tỏa 360 độ từ tâm, lấp đầy không gian canvas một cách cân xứng và chuyên nghiệp.
2. **Tái cấu trúc Thanh Điều Khiển 2 Tầng (Two-Tier Command Deck):**
   - Tầng 1: Tiêu đề súc tích `[MINING-02] KHÔNG GIAN VECTOR TIỀM ẨN 2D` + Bộ lọc Cụm Pills (`All`, `C#0` đến `C#5`).
   - Tầng 2: Chip telemetry validity (`Silhouette`, `Davies-Bouldin`) + Bộ công cụ xuất bản (`Copy LaTeX`, `Zoom Toolbar`, `ChartToolbar`).

---

### 2.3. Nâng cấp Trụ Cột 3 (Co-authorship Network Graph)
1. **Bố Cục Cung Tròn Cộng Đồng (Louvain Clustered Arc Layout):**
   - Phân chia vòng tròn thành 6 cung tương ứng với 6 cộng đồng Louvain.
   - Sắp xếp các tác giả theo thứ tự cộng đồng: Các tác giả trong cùng một nhóm nghiên cứu sẽ đứng sát nhau trên một cung tròn.
   - Giữa các cộng đồng có khoảng hở cách biệt 15 độ.
   - Đặt nhãn định danh cụm chuyên đề (ví dụ `C#0: Deep Learning`, `C#1: Computer Vision`) chìm ở phía ngoài mỗi cung.
2. **Đường Liên Kết Cong Thanh Lịch (Curved Quadratic Bezier Links):**
   - Các liên kết hợp tác nội bộ (Intra-community links) được vẽ bằng đường cong uốn nhẹ sát vành đai.
   - Các liên kết cầu nối liên ngành (Inter-community bridge links) được vẽ bằng đường nét đứt màu tím/hồng nổi bật, độ đục thích ứng khi hover để giảm tối đa hiện tượng rối mắt.
3. **Chế Độ Lực Đàn Hồi Cải Tiến (Enhanced Clustered Force Simulation):**
   - Đặt 6 tâm cộng đồng theo mạng lưới tổ ong lục giác (Hexagonal Layout) cách đều nhau, bán kính mỗi cụm được tính toán để không chồng lấn.

---

### 2.4. Nâng cấp Trụ Cột 4 (Trend Velocity & Isolation Forest Outliers)
1. **Triệt Tiêu Va Chạm Nhãn Vùng Dị Biệt P99:**
   - Dời nhãn `VÙNG DỊ BIỆT NGOẠI LAI P99` sang góc trên bên phải `x = 420, y = 20` (ngoài luồng dữ liệu) hoặc tích hợp thẳng vào thanh Sub-deck Tầng 2.
   - Khu vực P99 chỉ sử dụng viền đỏ nét đứt nhẹ nhàng `rgba(239, 68, 68, 0.25)` và nền mờ `fill="rgba(239, 68, 68, 0.03)"`, tuyệt đối không đặt khung nhãn cứng bên trong tọa độ của các bài báo có công thức toán cao.
2. **Khoảng Đệm Trục Hoành (Safe Baseline Padding):**
   - Hạ đường trục hoành xuống `y = 190` và giới hạn điểm thấp nhất ở `cy = 182`, đảm bảo các điểm dị biệt ở cận dưới luôn có khoảng hở 8px với trục tọa độ, không bao giờ bị cắt đôi hạt.

---

## 3. LỘ TRÌNH THỰC THI (ACTIONABLE EXECUTION PHASES)

```
[LỘ TRÌNH THỰC THI 4 TRỤ CỘT]
├── Giai đoạn 1: Sửa triệt để va chạm Pillar 1 (Dời nhãn Lift 1.0x ra mép trái, tách bóng lồng ghép)
├── Giai đoạn 2: Chuẩn hóa toán học & Căn giữa hoàn hảo Pillar 2 (Bounding Box Centering SVD Manifold)
├── Giai đoạn 3: Tái thiết kế Đồ thị Mạng lưới Pillar 3 (Louvain Clustered Arc Layout & Curved Links)
├── Giai đoạn 4: Sửa dứt điểm va chạm Pillar 4 (Dời nhãn P99, khoảng đệm trục hoành 8px)
└── Giai đoạn 5: Kiểm định toàn diện (Build 0 error, Lint 0 error, Zero Em-Dash, Git Sync)
```

### Chi tiết các bước thực hiện:
- **Bước 1 (Pillar 1):** Sửa L1185-L1225 trong `MiningPillarsView.tsx`: Dời nhãn `NGƯỠNG ĐỘC LẬP NGẪU NHIÊN` về `x = 60, y = 168`. Dời nhãn `VÙNG QUY TẮC VÀNG` lên `y = 20`. Thêm `fillOpacity="0.8"` và stroke thích ứng cho các quả bóng.
- **Bước 2 (Pillar 2):** Bổ sung hook tính `bounds` cho `scatter_2d`, chuẩn hóa tọa độ `normX, normY` và tính lại `clusterCentroids` theo tọa độ chuẩn hóa. Tái cấu trúc Header điều khiển thành Two-Tier Deck.
- **Bước 3 (Pillar 3):** Viết lại hàm `getNodeCoordinates` sắp xếp node theo `node.community`, phân chia cung tròn góc mở 60 độ với khoảng hở 15 độ. Vẽ đường cong Bezier cho các liên kết nội cụm.
- **Bước 4 (Pillar 4):** Dời nhãn P99 ra ngoài luồng điểm dữ liệu (`x = 410, y = 20, textAnchor="end"`). Tăng chiều cao canvas lên 220px, hạ trục X xuống `y = 190` để tạo khoảng đệm cho các điểm dị biệt cận dưới.
- **Bước 5 (Kiểm định):** Chạy `npm run build`, `npm run lint`, rà soát `grep -rn $'\u2014'`, cập nhật tài liệu báo cáo và commit lên GitHub.

---

## 4. TIÊU CHÍ NGHIỆM THU (ACCEPTANCE CRITERIA)

1. **Khắc phục 100% 4 lỗi trong 4 ảnh:**
   - Ảnh 0: Không có bất kỳ bóng tròn nào đè lên chữ nhãn Lift 1.0x hoặc vùng quy tắc vàng.
   - Ảnh 1: Đám mây 2D SVD phân bố cân đối ở trung tâm canvas, lấp đầy không gian hài hòa, không bị dồn lệch sang trái.
   - Ảnh 2: Đồ thị tác giả hiển thị rõ 6 cụm cộng đồng Louvain, không còn node văng ra ngoài bất thường, đường link gọn gàng có trật tự.
   - Ảnh 3: Điểm ngoại lai P99 không còn đè lên chữ nhãn, các điểm cận dưới không bị trục X cắt đôi.
2. **Kỹ thuật & Mã nguồn:**
   - 0 lỗi TypeScript (`tsc -b` pass).
   - 0 lỗi Linter (`oxlint` pass).
   - Tuân thủ 100% Zero Em-Dash Policy trên toàn bộ codebase và tài liệu.
