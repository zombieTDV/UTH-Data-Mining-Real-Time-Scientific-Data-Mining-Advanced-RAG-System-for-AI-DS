# KẾ HOẠCH VÀ ĐẶC TẢ KIẾN TRÚC: PIPELINE KHAI PHÁ DỮ LIỆU EDA STREAMING LIÊN TỤC
## Đề Tài: Real-Time Scientific Data Mining & Advanced RAG System for AI/DS (ArXiv Academic Lakehouse)

---

## 1. TỔNG QUAN VÀ MỤC TIÊU CỦA MODULE EDA TRONG ĐỀ TÀI

### 1.1. Bối Cảnh Đề Tài
Hệ thống **Scientific Data Mining & RAG** xử lý kho tài liệu nghiên cứu khoa học quy mô lớn (10.000 đến 150.000+ bài báo ArXiv thuộc các lĩnh vực Trí tuệ Nhân tạo - AI, Học máy - Machine Learning, Khoa học Dữ liệu - Data Science). 

Trong mô hình kiến trúc Medallion Lakehouse:
- **Bronze Layer**: Dữ liệu thô JSON/XML thu thập từ ArXiv OAI-PMH API và HTML bài báo khoa học đầy đủ từ ar5iv.
- **Silver Layer**: Bảng dữ liệu dạng cột Parquet đã được làm sạch, bóc tách cấu trúc (sections, công thức toán LaTeX, danh sách tác giả, phân loại danh mục).
- **Gold Layer**: Vector embeddings (768 chiều Nomic), LanceDB vector index và các artifacts phân tích Data Mining (4 trụ cột: Luật kết hợp, Phân cụm ngữ nghĩa, Đồ thị đồng tác giả, Phát hiện dị biệt & Xu hướng).

### 1.2. Vai Trò Của EDA (Exploratory Data Analysis)
EDA không đơn thuần là vẽ biểu đồ tĩnh một lần, mà đóng 3 vai trò sống còn:
1. **Kiểm chuẩn chất lượng dữ liệu (Data Quality Assurance & Profiling)**: Đánh giá độ đầy đủ của metadata, tỷ lệ bài báo có HTML toàn văn so với chỉ có abstract, tỷ lệ lỗi parse.
2. **Khai phá đặc trưng đa chiều (Multi-dimensional Scientific Characterization)**: Phân bố toán học, độ dài học thuật, mạng lưới chuyên ngành chéo, phân bố tác giả theo định luật Lotka.
3. **Cung cấp Grounding & Guardrails cho RAG**: Cung cấp phân bố tiên nghiệm (prior distribution) để hệ thống RAG giải thích ngữ cảnh, phát hiện ảo giác (hallucination) và định vị xu hướng nghiên cứu trong câu trả lời.

---

## 2. DANH MỤC CÁC CHIỀU PHÂN TÍCH EDA CẦN THIẾT CHO ĐỀ TÀI

Để đạt tiêu chuẩn của một đồ án tốt nghiệp / luận văn thạc sĩ kỹ thuật xuất sắc, module EDA cần bao quát 7 chiều phân tích sau:

### 2.1. Chiều 1: Thống Kê Tổng Quan & Độ Đầy Đủ Dataset (Dataset Overview & Ingestion Health)
| Chỉ Số / Metric | Công Thức / Định Nghĩa | Ý Nghĩa Học Thuật |
| :--- | :--- | :--- |
| **Total Corpus Volume** | $N = \sum 1$ | Quy mô mẫu nghiên cứu |
| **HTML Enrichment Ratio** | $R_{enrich} = \frac{N_{HTML}}{N} \times 100\%$ | Tỷ lệ bài báo khai thác được toàn văn (full-text) thay vì chỉ abstract |
| **Section Completeness** | Phân bố số lượng section: Intro, Methods, Results, Discussion | Mức độ cấu trúc hóa của văn bản khoa học |
| **Payload Data Size** | Dung lượng bytes thô vs nén Parquet | Tỷ lệ nén cột (Snappy/ZSTD) của Silver Lakehouse |

### 2.2. Chiều 2: Phân Bố Đa Thể Loại & Tính Liên Ngành (Taxonomy & Category Co-occurrence)
Khoa học hiện đại mang tính giao thoa liên ngành rất cao. Khai phá thể loại cần:
1. **Phân bố thể loại chính (Primary Category Distribution)**:
   - Tần suất các tag cốt lõi: `cs.AI` (Artificial Intelligence), `cs.LG` (Machine Learning), `cs.CV` (Computer Vision), `cs.CL` (Computation & Language / NLP), `cs.RO` (Robotics), `stat.ML` (Statistical Machine Learning).
   - Tỷ trọng phần trăm và độ lệch phân bố (Skewness / Gini index của các thể loại).
2. **Bậc liên ngành (Interdisciplinary Cardinality)**:
   - Phân bố số lượng categories trên mỗi bài báo: $P(k) = P(|C_{paper}| = k)$.
   - Bài báo đơn ngành ($k=1$) vs bài báo đa ngành ($k \ge 3$).
3. **Ma trận tương quan đồng xuất hiện (Category Co-occurrence Matrix)**:
   - Tần suất cặp thể loại $(c_i, c_j)$ xuất hiện cùng nhau trong cùng một bài báo.
   - Điểm liên kết chuẩn hóa (Jaccard Similarity hoặc Pointwise Mutual Information - PMI):
     $$PMI(c_i, c_j) = \log \frac{P(c_i, c_j)}{P(c_i) P(c_j)}$$
   - Phát hiện các hướng nghiên cứu giao thoa mạnh nhất (ví dụ: `cs.CV` x `cs.RO` = Thị giác Robot, `cs.CL` x `cs.AI` = Large Language Models).

### 2.3. Chiều 3: Mật Độ Toán Học & Độ Sâu Nội Dung (Mathematical & Content Density)
Đặc trưng cốt lõi phân biệt văn bản học thuật AI/DS với tin tức thông thường là công thức toán và mã giả:
1. **Mật độ công thức toán (Math Formula Density)**:
   - Đếm số lượng biểu thức toán học inline ($...$) và block display ($$...$$, `\begin{equation}`).
   - Chỉ số mật độ: 
     $$D_{math} = \frac{N_{math\_formulas}}{Total\_Words} \times 1000$$
   - Giúp phân biệt bài báo thiên về lý thuyết nền tảng (high math density, ví dụ `stat.ML`, `cs.LG`) với bài báo thiên về hệ thống, ứng dụng (low math density, ví dụ `cs.SE`, `cs.HC`).
2. **Phân vị thống kê độ dài (Quantiles & Five-number Summary)**:
   - Không chỉ tính Trung bình (Mean), bắt buộc phải có phân vị: Min, Q1 (P25), Median (P50), Q3 (P75), P95, Max và Khoảng tứ phân vị $IQR = Q_3 - Q_1$.
   - Tính toán cho cả 2 biến: `total_words` và `total_math_count`.

### 2.4. Chiều 4: Động Lực Học Thời Gian & Xu Hướng (Temporal Dynamics & Scientific Momentum)
1. **Chuỗi thời gian công bố (Publication Time Series)**:
   - Gom cụm theo Tháng/Năm (`YYYY-MM`) để phân tích tốc độ phát triển của từng nhánh AI.
2. **Tính chu kỳ và hạn nộp (Seasonality & Deadline Spikes)**:
   - Phân tích số lượng submit theo ngày trong tuần, tháng trong năm để tìm vết các kỳ hội nghị lớn (NeurIPS, ICML, CVPR, ACL).
3. **Tốc độ tăng trưởng danh mục (Velocity & Acceleration)**:
   - Tăng trưởng quý trên quý:
     $$GrowthRate = \frac{N_{Q_t} - N_{Q_{t-1}}}{N_{Q_{t-1}}} \times 100\%$$
   - Phân loại trạng thái: `SURGING` (Tăng phi mã), `STEADY` (Ổn định), `DECLINING` (Thoái trào).

### 2.5. Chiều 5: Trắc Lượng Khoa Học Về Tác Giả & Hợp Tác (Scientometrics & Author Distribution)
1. **Quy mô nhóm nghiên cứu (Team Size Distribution)**:
   - Số lượng tác giả trên mỗi bài báo: Solo author ($k=1$), Small team ($2 \le k \le 4$), Large lab ($5 \le k \le 10$), Mega-consortium ($k > 10$).
2. **Định luật Lotka về năng suất khoa học (Lotka's Law of Scientific Productivity)**:
   - Kiểm định quy luật lũy thừa (Power-Law Distribution): Số tác giả công bố $x$ bài báo tỷ lệ nghịch với $x^2$:
     $$y = \frac{C}{x^\alpha}, \quad (\alpha \approx 2)$$
   - Nhận diện nhóm tác giả tinh hoa (Top 1% Prolific Authors).

### 2.6. Chiều 6: Đặc Trưng Ngôn Ngữ & Không Gian Vector (Lexical & Embedding Space Topology)
1. **Sự phong phú từ vựng (Lexical Diversity)**:
   - Type-Token Ratio ($TTR = \frac{V}{N}$): Tỷ lệ từ vựng độc nhất trên tổng số từ.
   - Thống kê các từ khóa chuyên ngành chiếm ưu thế (Term Frequency distribution).
2. **Hình học không gian nhúng (Embedding Geometry - Nomic 768d)**:
   - Phân bố khoảng cách Cosine nội cụm và liên cụm.
   - Độ tập trung (Dispersion) của các bài báo theo chủ đề trên không gian biểu diễn ẩn.

### 2.7. Chiều 7: Hồ Sơ Dị Biệt & Cảnh Báo Bất Thường (Outlier Profiling)
1. **Dị biệt đa biến (Multivariate Anomalies)**:
   - Bài báo cực ngắn (Workshop abstract, retracted paper notice) vs Bài báo đồ sộ (Survey 150 trang, 60.000 từ).
   - Bài báo mật độ công thức toán dị biệt (ví dụ: bài báo lý thuyết chứng minh định lý chứa > 1.000 công thức).
   - Bài báo có số lượng tác giả bất thường (> 50 tác giả).
2. **Phương pháp phát hiện**:
   - Sử dụng kết hợp Isolation Forest Score và $IQR$ Outlier Filtering ($Value > Q_3 + 3 \times IQR$).

---

## 3. THIẾT KẾ LUỒNG EDA STREAMING LIÊN TỤC (CONTINUOUS STREAMING ARCHITECTURE)

### 3.1. Nghịch Lý Của Xử Lý Dòng (The Streaming Dilemma) Và Giải Pháp
- **Vấn đề**: Trong kiến trúc xử lý lô (Batch), hàm EDA chỉ việc gọi `duckdb.query("SELECT approx_quantile(...) FROM parquet")`. Nhưng khi dữ liệu được thu thập liên tục (Streaming Ingestion từ OAI-PMH hoặc Web crawler), việc quét lại toàn bộ file Parquet dung lượng hàng gigabytes cho mỗi bài báo mới sẽ làm sập CPU, nghẽn I/O và tiêu tốn hàng triệu Class A operations trên Cloudflare R2.
- **Giải pháp**: Xây dựng **Continuous Online EDA Engine** dựa trên **Thuật toán trực tuyến một lượt quét (Single-pass Streaming Algorithms)** và **Cấu trúc dữ liệu xác suất (Probabilistic Sketches)**.

```
+---------------------------------------------------------------------------------------+
|                             STREAMING EDA PIPELINE ARCHITECTURE                       |
+---------------------------------------------------------------------------------------+

 [ArXiv Harvester / Real-time Ingestion Stream]
                      │
                      ▼ (Stream Event: Ingested Paper Metadata & Extracted Text)
        ┌─────────────────────────────┐
        │  STREAMING INGESTION QUEUE  │ (asyncio.Queue / Kafka / Redpanda)
        └──────────────┬──────────────┘
                       │
                       ▼
 ╔═════════════════════════════════════════════════════════════════════════════════════╗
 ║                CONTINUOUS ONLINE EDA ENGINE (In-Memory State Store)                 ║
 ║                                                                                     ║
 ║  1. Welford Online Accumulator   --> Mean & Variance (Words, Math, Sections)        ║
 ║  2. HyperLogLog (HLL)            --> Distinct Authors & Unique Vocabulary Count     ║
 ║  3. t-Digest Streaming Sketch    --> Continuous Quantiles (P25, Median, P75, P95)   ║
 ║  4. Sliding Window Ring Buffer   --> Ingestion Velocity, Bursts & Time Series       ║
 ║  5. Sparse Co-occurrence Matrix  --> Online Pairwise Category Counter               ║
 ║  6. Streaming Z-Score Filter     --> Real-Time Anomaly Detection                    ║
 ╚═════════════════════════════════════════════════════════════════════════════════════╝
           │                                            │
           │ (State Snapshot mỗi 100 papers)             │ (Micro-batch SSE Push mỗi 1s - 3s)
           ▼                                            ▼
 ┌───────────────────────────────────┐        ┌────────────────────────────────────────┐
 │   Incremental Parquet & R2 Sink   │        │     FastAPI SSE Telemetry Endpoint     │
 │ (Cloudflare R2 Zero-Cost Storage) │        │     `/api/mining/telemetry/stream`     │
 └───────────────────────────────────┘        └───────────────────┬────────────────────┘
                                                                  │
                                                                  ▼
                                                      ┌────────────────────────┐
                                                      │  Frontend EdaView.tsx  │
                                                      │  (Smooth Live Updates) │
                                                      └────────────────────────┘
```

---

## 4. CHI TIẾT CÁC THUẬT TOÁN TRỰC TUYẾN (ONLINE ALGORITHMS & SKETCHES)

Để hệ thống tính toán EDA với độ phức tạp thời gian $O(1)$ và bộ nhớ cố định $O(1)$ cho mỗi record bài báo mới vào, ta áp dụng 5 giải thuật cốt lõi:

### 4.1. Thuật Toán Welford: Tính Trung Bình & Phương Sai Trực Tuyến
Không cần lưu trữ mảng số nguyên các độ dài từ hoặc số công thức toán.
Khi nhận phần tử thứ $n$ có giá trị $x$:

$$M_1 = x_1, \quad S_1 = 0$$
$$M_n = M_{n-1} + \frac{x_n - M_{n-1}}{n}$$
$$S_n = S_{n-1} + (x_n - M_{n-1})(x_n - M_n)$$
$$\sigma_n^2 = \frac{S_n}{n - 1}$$

- **Ưu điểm**: Ổn định số học tuyệt đối (tránh sai số làm tròn khi $n$ lớn), không tốn RAM.

### 4.2. t-Digest: Ước Lượng Phân Vị Liên Tục (Online Quantiles: P25, P50, P75, P95)
- Thuật toán gom nhóm các điểm dữ liệu vào các "Centroid" với kích thước tỷ lệ thuận với vị trí phân vị (centroid rất nhỏ và chính xác ở hai đuôi P01, P95, P99; centroid lớn hơn ở vùng trung vị).
- Cho phép ước lượng cực kỳ chính xác các mốc $Q_1$, $Median$, $Q_3$, $P_{95}$ trong luồng streaming với dung lượng RAM chưa tới 50KB.

### 4.3. HyperLogLog (HLL): Đếm Số Lượng Tác Giả Độc Nhất (Cardinality Estimation)
- Có hàng chục ngàn tác giả trong 10.000 bài báo. Việc lưu toàn bộ chuỗi tên tác giả vào `set()` trong Python sẽ làm tiêu tốn hàng chục MB RAM và chậm dần theo thời gian.
- **HLL** sử dụng hàm băm 64-bit và đếm số bit 0 dẫn đầu (leading zeros).
- Sai số chuẩn: $\approx \frac{1.04}{\sqrt{m}}$, với $m = 2^{12} = 4096$ thanh ghi, sai số chỉ $1.6\%$, tốn đúng 3KB bộ nhớ.

### 4.4. Sliding Window Ring Buffer: Đo Vận Tốc & Xung Nhịp Thu Thập (Ingestion Velocity)
- Duy trì một Circular Buffer lưu trữ timestamp của $K$ bài báo gần nhất (ví dụ: $K = 500$).
- Vận tốc tức thời:
  $$V_{instant} = \frac{K}{T_{now} - T_{oldest}} \quad (\text{papers / second})$$
- Tương tự tính cho: từ học thuật / giây, công thức toán / giây.

### 4.5. Online Anomaly Scoring: Bộ Lọc Dị Biệt Thời Gian Thực
- Mỗi bài báo mới đến được tính điểm Z-score đa biến dựa trên các tham số động từ Welford:
  $$Z_{words} = \frac{words - \mu_{words}}{\sigma_{words}}, \quad Z_{math} = \frac{math - \mu_{math}}{\sigma_{math}}$$
- Nếu $|Z| > 3.5$, bài báo ngay lập tức được đẩy vào danh sách `Recent Anomalies` và gửi sự kiện cảnh báo qua SSE.

---

## 5. THIẾT KẾ ĐẶC TẢ STREAMING PROTOCOL & SCHEMAS

### 5.1. Mô Hình Kênh Truyền Server-Sent Events (SSE)
Backend FastAPI duy trì kết nối HTTP trường cửu (Long-lived HTTP Connection) tại endpoint:
`GET /api/mining/telemetry/stream`

Khác với cơ chế hiện tại chỉ gửi heartbeat định kỳ 3 giây với dữ liệu tĩnh, cơ chế streaming chuẩn sẽ hỗ trợ đa kênh sự kiện (Multi-event Streaming):
- `event: telemetry`: Nhịp tim tổng quan hệ thống (mỗi 1 giây - 3 giây).
- `event: eda_delta`: Dữ liệu phân vị, danh mục, tác giả được cập nhật theo luồng (mỗi khi có batch mới).
- `event: anomaly_alert`: Bắn ngay lập tức khi phát hiện bài báo dị biệt.

### 5.2. Cấu Trúc Payload SSE Chuẩn

#### Sự Kiện 1: `event: telemetry` (Nhịp Xung Hệ Thống)
```json
{
  "timestamp": "2026-10-04T00:50:00.123Z",
  "status": "STREAMING_INGESTION",
  "pipeline_phase": "PHASE_2_HTML_ENRICHMENT",
  "ingestion_rate_papers_per_sec": 14.2,
  "ingestion_rate_words_per_sec": 84200.0,
  "total_papers_streamed": 10450,
  "enriched_html_papers": 8920,
  "enrichment_ratio": 0.8536,
  "system_metrics": {
    "cpu_percent": 24.5,
    "ram_mb": 420.8,
    "lakehouse_write_latency_ms": 42.1
  }
}
```

#### Sự Kiện 2: `event: eda_delta` (Cập Nhật Thống Kê EDA Tức Thì)
```json
{
  "timestamp": "2026-10-04T00:50:00.123Z",
  "batch_size": 25,
  "dynamic_quantiles": {
    "math_formulas": {
      "p25": 18.0,
      "median": 46.0,
      "p75": 94.0,
      "p95": 218.0,
      "max": 1840
    },
    "word_counts": {
      "p25": 4200.0,
      "median": 6850.0,
      "p75": 9420.0,
      "p95": 14200.0,
      "max": 48200
    }
  },
  "top_active_categories": [
    {"category": "cs.CV", "count": 3120, "percentage": 29.86},
    {"category": "cs.LG", "count": 2840, "percentage": 27.18},
    {"category": "cs.AI", "count": 1650, "percentage": 15.79},
    {"category": "cs.CL", "count": 1420, "percentage": 13.59}
  ],
  "estimated_unique_authors_hll": 36450,
  "recent_category_velocity": {
    "cs.CL": "+8.4%",
    "cs.LG": "+4.1%",
    "cs.CV": "+2.0%"
  }
}
```

#### Sự Kiện 3: `event: anomaly_alert` (Cảnh Báo Dị Biệt Ngay Lập Tức)
```json
{
  "timestamp": "2026-10-04T00:50:02.500Z",
  "paper_id": "arxiv:2603.18942",
  "title": "Foundational Survey on Ultra-Scale Multimodal Reasoning: 200 Benchmarks",
  "primary_category": "cs.AI",
  "anomaly_score": 0.985,
  "metrics": {
    "word_count": 52400,
    "math_count": 890,
    "author_count": 64
  },
  "reasons": [
    "WORD_COUNT_P99_EXCEEDED (52,400 > 14,200)",
    "AUTHOR_COUNT_SPIKE (64 authors > threshold 15)"
  ]
}
```

---

## 6. KIẾN TRÚC LƯU TRỮ VÀ TỐI ƯU CHI PHÍ CLOUDFLARE R2

Khi vận hành streaming liên tục lên Lakehouse, nguy cơ lớn nhất là **phát sinh chi phí Class A Operations (PutObject/ListObjects) trên Cloudflare R2**:
- Gói Free Tier của R2 chỉ cho phép 1.000.000 Class A request/tháng.
- Nếu ghi trực tiếp mỗi bài báo thành 1 file lên R2, 100.000 bài báo x nhiều lần ghi sẽ nhanh chóng vượt ngưỡng giới hạn.

### 6.1. Chiến Lược Buffer Micro-Batching
1. **In-Memory Buffer**: Toàn bộ dữ liệu stream được tích lũy trong bộ nhớ RAM (hoặc local cache SSD) thành Micro-batches (ví dụ: mỗi 500 bài báo hoặc mỗi 5 phút).
2. **Columnar Parquet Packing**: Khi micro-batch đầy, nén thành 1 file Parquet duy nhất và đẩy lên R2 Silver Partition:
   `silver/papers/year=2026/month=10/batch_<timestamp>_<uuid>.parquet`
3. **Artifact Snapshotting**: Snapshot EDA JSON (`eda_summary.json`) chỉ được ghi lên R2 Gold Zone theo chu kỳ định kỳ (ví dụ: 15 phút/lần hoặc khi hoàn tất pipeline), loại bỏ hoàn toàn việc spam PutObject liên tục lên R2.

---

## 7. ĐẶC TẢ TƯƠNG TÁC FRONTEND (REACTIVE STREAMING UI)

Frontend React (`src/components/EdaView.tsx`) sẽ được nâng cấp để chuyển từ giao diện tĩnh sang bảng điều khiển thời gian thực:

### 7.1. Cơ Chế Quản Lý Trạng Thái (State Management)
1. **Custom Hook `useStreamingEda`**:
   - Sử dụng `EventSource` nguyên bản của trình duyệt để lắng nghe `/api/mining/telemetry/stream`.
   - Cơ chế tự động kết nối lại (Auto-reconnect với Exponential Backoff).
   - Tích hợp Fallback sang polling nếu SSE bị gián đoạn.
2. **Giảm Thiểu Hiện Tượng Re-render (Render Throttling)**:
   - Sử dụng `requestAnimationFrame` hoặc `lodash.throttle` (throttle 500ms) để gom các cập nhật stream lại, tránh làm giao diện React bị giật lag khi luồng dữ liệu đổ về quá nhanh.
   - Các chỉ số KPI (Total Papers, Words/sec, Math formulas) sử dụng component `<AnimatedCounter value={n} />` với hiệu ứng số nhảy mượt mà.

### 7.2. Các Thành Phần Trực Quan Hóa Động (Dynamic Visual Components)
1. **Live Velocity Gauge**: Hiển thị tốc độ ingest bài báo/giây theo thời gian thực (Speedometer hoặc Sparkline 60 giây gần nhất).
2. **Streaming Boxplot / IQR Visualizer**: Thanh trượt hiển thị P25, Median, P75, P95 của công thức toán và độ dài bài báo tự động co giãn khi có batch mới.
3. **Real-Time Category Bar Chart**: Các thanh tỷ lệ phần trăm phân bố thể loại tự động trượt vị trí mượt mà (smooth CSS transition) khi thứ hạng thay đổi.
4. **Live Anomaly Toast Stream**: Khi backend phát hiện bài báo dị biệt, hiển thị banner thông báo nhỏ gọn ở góc dưới bảng điều khiển, cho phép người dùng click để xem chi tiết bài báo bất thường.

---

## 8. SKELETON CODE MẪU CHO MODULE STREAMING EDA (THAM KHẢO IMPLEMENTATION)

Dưới đây là thiết kế lớp Python chuẩn bị cho việc hiện thực hóa ở backend:

```python
# data_mining/src/mining/streaming_eda_engine.py
import math
import time
from typing import Dict, Any, List
from collections import deque, Counter

class WelfordAccumulator:
    """Tinh toan Mean va Variance truc tuyen voi do phuc tap O(1) bo nho va thoi gian."""
    def __init__(self):
        self.count = 0
        self.mean = 0.0
        self.M2 = 0.0

    def update(self, x: float):
        self.count += 1
        delta = x - self.mean
        self.mean += delta / self.count
        delta2 = x - self.mean
        self.M2 += delta * delta2

    @property
    def variance(self) -> float:
        return self.M2 / (self.count - 1) if self.count > 1 else 0.0

    @property
    def std_dev(self) -> float:
        return math.sqrt(self.variance)


class StreamingEdaEngine:
    """Engine phan tich EDA dong lien tuc cho luong bai bao khoa hoc."""
    def __init__(self, window_size: int = 500):
        self.total_papers = 0
        self.total_math_count = 0
        self.total_words_count = 0
        
        # Welford accumulators
        self.words_acc = WelfordAccumulator()
        self.math_acc = WelfordAccumulator()
        
        # Category counters
        self.category_counts = Counter()
        self.category_cooccurrence = Counter()
        
        # Sliding window for velocity calculation
        self.time_window = deque(maxlen=window_size)
        
        # Anomaly registry (last 20 outliers)
        self.recent_anomalies = deque(maxlen=20)

    def process_paper_event(self, paper: Dict[str, Any]) -> Dict[str, Any]:
        """Xu ly mot record bai bao moi den trong thoi gian thuc."""
        now = time.time()
        self.total_papers += 1
        
        words = paper.get("total_words", 0)
        math_count = paper.get("total_math_count", 0)
        categories = paper.get("categories", [])
        primary_cat = paper.get("primary_category", "unknown")
        
        self.total_words_count += words
        self.total_math_count += math_count
        
        # 1. Update Welford
        self.words_acc.update(words)
        self.math_acc.update(math_count)
        
        # 2. Update Categories
        self.category_counts[primary_cat] += 1
        for i in range(len(categories)):
            for j in range(i + 1, len(categories)):
                pair = tuple(sorted([categories[i], categories[j]]))
                self.category_cooccurrence[pair] += 1
                
        # 3. Update Velocity Window
        self.time_window.append(now)
        
        # 4. Outlier Detection
        is_anomaly = False
        reasons = []
        if self.words_acc.count > 30:
            z_words = (words - self.words_acc.mean) / max(1.0, self.words_acc.std_dev)
            z_math = (math_count - self.math_acc.mean) / max(1.0, self.math_acc.std_dev)
            if z_words > 3.5:
                is_anomaly = True
                reasons.append(f"Z_WORDS_EXTREME ({z_words:.1f} sigma)")
            if z_math > 3.5:
                is_anomaly = True
                reasons.append(f"Z_MATH_EXTREME ({z_math:.1f} sigma)")
                
        if is_anomaly:
            anomaly_payload = {
                "paper_id": paper.get("paper_id"),
                "title": paper.get("title"),
                "primary_category": primary_cat,
                "reasons": reasons,
                "timestamp": now
            }
            self.recent_anomalies.append(anomaly_payload)
            return {"type": "ANOMALY_DETECTED", "data": anomaly_payload}
            
        return {"type": "TICK_PROCESSED"}

    def get_snapshot(self) -> Dict[str, Any]:
        """Xuat snapshot EDA tuc thoi de phuc vu SSE stream hoac REST API."""
        velocity = 0.0
        if len(self.time_window) > 1:
            time_span = self.time_window[-1] - self.time_window[0]
            if time_span > 0:
                velocity = len(self.time_window) / time_span

        return {
            "total_papers": self.total_papers,
            "avg_words": round(self.words_acc.mean, 1),
            "std_words": round(self.words_acc.std_dev, 1),
            "avg_math": round(self.math_acc.mean, 1),
            "std_math": round(self.math_acc.std_dev, 1),
            "ingestion_velocity_papers_per_sec": round(velocity, 2),
            "category_distribution": [
                {"category": cat, "count": cnt, "pct": round(cnt * 100.0 / self.total_papers, 2)}
                for cat, cnt in self.category_counts.most_common(10)
            ],
            "recent_anomalies": list(self.recent_anomalies)
        }
```

---

## 9. LỘ TRÌNH TRIỂN KHAI THEO TỪNG GIAI ĐOẠN (IMPLEMENTATION ROADMAP)

Khi chuyển sang nhánh chuyên trách phát triển backend (`feature/backend-streaming` hoặc tương đương), quy trình implement sẽ gồm 4 bước:

1. **Bước 1: Triển khai Streaming Accumulators (Backend Engine)**
   - Cài đặt thư viện `tdigest` (hoặc viết module `WelfordAccumulator` thuần túy).
   - Tích hợp lớp `StreamingEdaEngine` vào luồng thu thập `arxiv_batch_harvester.py`.

2. **Bước 2: Nâng cấp SSE Telemetry Endpoint (FastAPI)**
   - Mở rộng hàm `stream_telemetry()` trong `backend/app/services/mining_service.py` để lấy trực tiếp dữ liệu từ `StreamingEdaEngine` thay vì đọc file tĩnh.
   - Thêm bộ đệm nhịp xung (Heartbeat buffer 1s - 2s).

3. **Bước 3: Tối ưu Hóa Ghi Hồ Sơ Parquet & Cloudflare R2**
   - Thiết lập micro-batching 500 bài báo/lần ghi Parquet.
   - Đồng bộ snapshot `eda_summary.json` lên R2 định kỳ để duy trì tính toàn vẹn cho Gold Lakehouse.

4. **Bước 4: Nâng Cấp Frontend Dashboard (`EdaView.tsx`)**
   - Đăng ký nhận sự kiện `eda_delta` từ SSE endpoint.
   - Thêm giao diện Live Ingestion Gauge và Boxplot trượt động.
   - Kiểm thử hiển thị Toast cảnh báo dị biệt theo thời gian thực.
