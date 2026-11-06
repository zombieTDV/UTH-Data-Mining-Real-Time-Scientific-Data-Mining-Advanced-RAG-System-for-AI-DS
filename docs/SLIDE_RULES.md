# Quy tắc làm slide (rút ra từ `report_slides-2.html`)

Phong cách: **báo cáo kỹ thuật kiểu biên tập (editorial / technical report)**: nền trắng, chữ đen, một màu nhấn đỏ, đường kẻ mảnh thay cho hộp và bóng đổ.

## 1. Khung kỹ thuật
- Một file HTML duy nhất, tự chứa (ảnh nhúng base64, CSS và JS inline). Font duy nhất lấy từ Google Fonts.
- Sân khấu cố định **1920×1080**, scale theo cửa sổ (`--scale = min(w/1920, h/1080)`).
- `fitContent()`: tự phóng to hoặc thu nhỏ nội dung (zoom 0,7–1,35) cho vừa khoảng giữa header và footer, nhờ đó không slide nào thừa trắng hay tràn.
- Điều hướng bằng phím ←/→, cuộn, vuốt, nút bấm. Có thanh tiến độ đỏ, chấm điều hướng, bộ đếm `05 / 28` và URL hash `#5`.
- `@media print`: in mỗi slide một trang 1920×1080, ẩn phần điều khiển. Xuất PDF được bằng Ctrl+P.
- Tôn trọng `prefers-reduced-motion`. Chuyển slide chỉ fade 0,25 s, không có hiệu ứng khác.

## 2. Hệ thống thiết kế
| Token | Giá trị |
|---|---|
| Nền / chữ | `#ffffff` / `#141414`, chữ phụ `#3b3a36`, mờ `#7a766c` |
| Đường kẻ | `rgba(20,20,20,.16)` (mảnh), `1px #141414` (đậm) |
| **Màu nhấn duy nhất** | `#cf3a1c` (đỏ gạch): số nổi bật, gạch đầu dòng, nhãn quan trọng |
| Trạng thái | ok `#2e6b34`, bad = accent. Chỉ dùng cho trạng thái thật |
| Font | Tiêu đề: **Source Serif 4** 600 · Thân: **IBM Plex Sans** · Mã/nhãn: **IBM Plex Mono** |
| Cỡ chữ | H1 84 · H2 58 · H3 26 · lede 27 · body 24 · small 21 · code 18 · nhãn mono 14–16 (px trên khung 1920) |
| Lề | padding slide 96 px · gap nội dung 56 px |

- **Không dùng hộp hay bóng đổ.** Phân vùng bằng đường kẻ ngang: card có `border-top` 1 px, card nhấn mạnh có 3 px.
- Bo góc bằng 0, kể cả hình trong SVG.
- Gạch đầu dòng là dấu `—` màu đỏ, không dùng chấm tròn.
- Nhãn (`.label`, `th`) viết chữ mono, IN HOA, giãn chữ 0,06em, màu mờ.
- Số liệu dùng `tabular-nums`. Số trong bảng căn phải.
- Sơ đồ SVG chỉ dùng **mực đen và một màu nhấn**. CSS ép mọi màu khác về đen hoặc trắng.
- Ngoại lệ có chủ đích: slide tech stack dùng 3 màu nền nhạt để phân tầng (xanh lá BE, xanh dương FE, đỏ hạ tầng).

## 3. Giải phẫu một slide
```
[01 / MỤC ĐÍCH HỆ THỐNG]                         [TS-RAG-2026 · Báo cáo kỹ thuật]   ← running header (mono)
───────────────────────────────────────────────────────────────────────────────   ← đường kẻ 1px
                     H2 serif: kết luận / chủ đề slide
                lede: 1 câu nói ý chính, ≤ 64 ký tự/dòng
        [ nội dung: 2 cột / bảng + code / số liệu / sơ đồ ]
Tên mục   path/to/source.ts                                            ‹ 05 / 28 ›    ← foot: nguồn kiểm chứng
```
- **Chip** (số slide tự đếm + tên mục) nằm trên running header, bên trái. Bên phải là mã tài liệu.
- **H2 là một câu khẳng định có số** khi có thể, ví dụ "Thiết Kế API: 5 Controller, 17 Endpoint", "Tầng HTTP: Stress Test 5 Phút (1.600 CU)". Không đặt tiêu đề chung chung kiểu "API".
- **Lede luôn có**: một câu trả lời "slide này nói gì".
- **Foot ghi nguồn**: file code, tài liệu hoặc run id chứng minh nội dung (`backend_rag/benchmark/results`, `bench-run-2026-10-28T19-40-11-edbb8`).
- Nội dung căn giữa, rộng tối đa 1640 px.

## 4. Cấu trúc bộ slide
1. **Title slide**: kicker đỏ, H1, lede, hàng "flow" liệt kê các phần (01 Tổng quan · 02 Tính năng · 03 Kiểm thử), dòng thông tin (GV, môn, nhóm) bằng chữ mono.
2. **Mục đích**: khối "Bài toán" (serif lớn, viền trên đỏ) cạnh lưới 4 mục tiêu đánh số `01–04`.
3. Mỗi phần mở bằng **slide divider**: số phần rất lớn (`01`) bên trái, tên phần, lede và danh sách agenda các slide trong phần.
4. Các phần theo thứ tự: **Tổng quan → Tính năng → Kiểm thử & Đánh giá → Tổng kết**.
5. Kết thúc bằng **Tổng kết** (mỗi phần một dòng, có số) và **Hạn chế & Hướng cải thiện** (lấy từ số liệu đo thật, mỗi hạn chế đi kèm `→` hướng sửa).

## 5. Các mẫu bố cục (dùng lại, không tự chế)
| Mẫu | Khi dùng |
|---|---|
| `cols-wide` (1.5 : 1): **bảng bên trái + code bên phải** | Yêu cầu, API, phân quyền: bảng là "cái gì", code là "bằng chứng nó có thật" |
| `diagram-card` + SVG | Kiến trúc, pipeline, ERD, luồng xác thực |
| `metrics`: số lớn serif 68 px trên đường kẻ | KPI. Số đầu tiên tô đỏ |
| `plot-container` + `plot-caption` | Biểu đồ benchmark, caption mono ghi "Hình n: …" |
| `kpis` (lưới ô số) + `notes` | Trang kết quả đánh giá |
| `stack-cols` 3 card | Tech stack có phiên bản (`dt` tên, `dd` version mono) |
| `codebox` + `.src` | Đoạn code thật kèm đường dẫn file `↳ path` |
| `table tr.future` (sọc chéo, chữ mờ) + `.tag` | Tính năng chưa làm hoặc đang làm, đánh dấu trung thực |

## 6. Quy tắc nội dung
- **Chỉ dùng số liệu đo thật** và ghi nguồn ở foot. Không bịa số.
- **Mỗi khẳng định đều có bằng chứng**: code thật, file thật, run id, hình chụp benchmark.
- Mỗi slide khoảng **140–310 từ**. Trang "Hạn chế" là ngoại lệ (dày hơn).
- Thuật ngữ kỹ thuật giữ tiếng Anh (Recall@5, P95, JWT). Câu chữ viết bằng tiếng Việt.
- Một slide trả lời **một câu hỏi**, ví dụ "Hệ thống có chịu tải không?" thì kèm ngưỡng SLA và kết quả.
- Kết quả đánh giá luôn có **ví dụ cụ thể** (một test case thật: input, expected, actual, điểm) đặt cạnh bảng metric. Giải thích "vì sao cần nhiều metric" bằng chính ví dụ đó.
- Nói thẳng điểm yếu, ví dụ "MRR 0,49: bài đúng thường đứng hạng 2–3", "3–5 câu vượt timeout 60 s".
- Bảng yêu cầu phi chức năng có 3 cột: **Yêu cầu · Cơ chế đảm bảo · Kết quả đo** (kết quả viết mono, màu xanh).
