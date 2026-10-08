# KẾ HOẠCH TRIỂN KHAI HOÀN THIỆN ĐA NGÔN NGỮ (I18N EN / VI) TOÀN DIỆN CHO DASHBOARD
## (Comprehensive Full-Dashboard i18n EN / VI Implementation Plan)

**Dự án**: UTH Scientific Data Mining & Advanced RAG System  
**Tài liệu**: Kế hoạch & Danh mục Triển khai Đa ngôn ngữ Dashboard  
**Vị trí lưu trữ**: [docs/I18N_FULL_DASHBOARD_IMPLEMENTATION_PLAN.md](file:///home/bush/Projects/UTH-Data-Mining-Real-Time-Scientific-Data-Mining-Advanced-RAG-System-for-AI-DS/docs/I18N_FULL_DASHBOARD_IMPLEMENTATION_PLAN.md)  
**Mục tiêu**: Đưa toàn bộ 100% giao diện dashboard (5 màn hình chính + các components điều khiển) chuyển đổi mượt mà theo nút EN / VI trong thời gian thực.

---

## 1. MỤC TIÊU & PHẠM VI TRIỂN KHAI

### 1.1. Mục tiêu
- Loại bỏ hoàn toàn tình trạng "chỉ dịch khung vỏ bên ngoài, màn hình con vẫn giữ chữ tĩnh".
- Khi người dùng bấm **EN**: Toàn bộ hệ thống (tiêu đề, thẻ KPI, bộ lọc, biểu đồ, tooltip, nút bấm, thông báo trạng thái, tin nhắn trợ lý AI) chuyển sang tiếng Anh học thuật chuẩn.
- Khi người dùng bấm **VI**: Toàn bộ hệ thống chuyển sang tiếng Việt khoa học chuẩn xác.
- Đảm bảo hiệu năng tức thì (0ms trễ), không reload trang, lưu trạng thái ngôn ngữ vào `localStorage['uth-language']`.

### 1.2. Danh sách các Tệp & Thành phần cần cập nhật

| STT | Tệp mục tiêu | Vị trí | Các hạng mục cần chuyển ngữ |
| :--- | :--- | :--- | :--- |
| **01** | `StorageMeter.component.tsx` | `frontend/src/navigation/header/` | Tooltip chi tiết R2 Storage Lens (Hạn mức, đã dùng, còn trống, zero egress). |
| **02** | `schematic.screen.tsx` | `frontend/src/screens/` | Nút chuyển chế độ `FLOW CANVAS` / `BENTO & STORAGE INSPECTOR`, chân trang Continuous Verification. |
| **03** | `EdaView.component.tsx` | `frontend/src/components/eda/` | 6 thẻ KPI lớn, nút `SYNC LAKEHOUSE ML`, nút `Đặt lại bộ lọc`, tiêu đề các biểu đồ Scatter & Taxonomy, 4 góc phần tư Quadrant. |
| **04** | `MiningPillarsView.component.tsx` | `frontend/src/components/pillars/` | 4 tab Trụ cột (Luật kết hợp, Phân cụm ngữ nghĩa, Đồ thị khoa học, Xu hướng & Dị biệt), thanh Lakehouse Gold Sync Cockpit, nút `RECOMPUTE 4 PILLARS`, các bảng dữ liệu & bộ lọc. |
| **05** | `GroundedRagChat.component.tsx` | `frontend/src/components/rag/` | Lời chào khởi đầu của trợ lý AI, các bước suy luận stream, placeholder câu hỏi, thanh gợi ý nghiên cứu, drawer chi tiết bài báo. |
| **06** | `LiveTelemetryFeed.component.tsx` | `frontend/src/components/logs/` | Ô tìm kiếm log, nút xóa log, nhãn bộ lọc cấp độ (ALL, SUCCESS, INFO...). |
| **07** | `en.json` & `vi.json` | `frontend/src/assets/languages/` | Bổ sung các cụm từ chuyên sâu cho 4 Trụ Cột và Schematic nếu còn thiếu. |

---

## 2. LỘ TRÌNH THỰC HIỆN TỪNG BƯỚC

```
[ BƯỚC 1: HEADER & SCHEMATIC ] ──► [ BƯỚC 2: EDA VIEW ] ──► [ BƯỚC 3: 4 MINING PILLARS ] ──► [ BƯỚC 4: RAG & LOGS ] ──► [ BƯỚC 5: BUILD & VERIFY ]
  • Song ngữ StorageMeter tooltip    • Dịch 6 KPI Cards       • Dịch 4 Pillar Header tabs        • Lời chào song ngữ RAG      • npm run build (0 errors)
  • Dịch nút Flow / Bento            • Dịch Scatter & Slicers • Dịch nút Recompute               • Placeholder & Trạng thái    • Git commit & push
```

---

## 3. NGUYÊN TẮC THIẾT KẾ & THUẬT NGỮ KHOA HỌC CHUẨN

- **Thuật ngữ nhất quán**:
  - `Corpus`: Kho ngữ liệu bài báo khoa học.
  - `Enrichment Ratio`: Tỷ lệ làm giàu văn bản (LaTeX & Markdown).
  - `Association Rules`: Khai phá Luật kết hợp (FP-Growth & Apriori).
  - `Semantic Clustering`: Phân cụm ngữ nghĩa (K-Means & SVD Manifold).
  - `Scientific Network`: Mạng lưới tri thức khoa học (Louvain & PageRank).
  - `Trend Velocity & Anomalies`: Tốc độ xu hướng & Dị biệt (Isolation Forest).
  - `Zero Egress`: Không tốn phí băng thông tải ra.
