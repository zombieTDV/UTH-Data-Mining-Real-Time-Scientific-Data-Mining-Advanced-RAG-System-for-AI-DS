# Chương 3: Phân Tích Khám Phá Dữ Liệu & Đặc Trưng (EDA)

- **Motivation/Background**: Trước khi triển khai bốn trụ cột khai phá dữ liệu (luật kết hợp, phân cụm ngữ nghĩa, khai phá đồ thị, phát hiện bất thường) và kiến trúc Hybrid RAG trên tập dữ liệu bài báo khoa học đa nguồn quy mô lớn (`71,927` bài báo toàn văn, `1,043,594` vector trong Qdrant ở lần chạy toàn hồ `04/11/2026`), cần đánh giá định lượng toàn diện về phân bố biến, cấu trúc phân ngành, tính lệch đuôi dài và quan hệ phi tuyến để đưa ra quyết định tiền xử lý, biến đổi đặc trưng và thiết kế chia đoạn (chunking) dựa trên bằng chứng thực nghiệm.
- **Purpose**: Trình bày kiến trúc OLAP không máy chủ trên nền DuckDB đọc trực tiếp lớp Silver tại MinIO S3, tổng hợp thống kê mô tả đa tầng (Macro toàn hồ và Micro kiểm toán sâu $13,000$ bài / mẫu hiệu chỉnh $n = 11,659$), chứng minh bốn phát hiện định lượng cốt lõi của miền dữ liệu học thuật, và phân tích tương quan đa biến kết hợp khung chẩn đoán 3 Lăng kính (3-Lens Diagnostics).
- **Overview Pipeline**: MinIO S3 Silver Parquet (7 nguồn phân tầng) $\rightarrow$ DuckDB `httpfs` Views (`catalog_view`, `fulltext_view` khử trùng lặp qua hàm cửa sổ `ROW_NUMBER`) $\rightarrow$ Tổng hợp SQL phân bố chuyên ngành, đồng xuất hiện và thời gian $\rightarrow$ Phân tích SciPy/Scikit-learn 3 Lăng kính (Kiểm định chuẩn D'Agostino $K^2$, Histogram/KDE/Q-Q, Pearson $r$ vs Spearman $\rho$ vs Mutual Information) & Qdrant `section_facets()` $\rightarrow$ Xuất JSON chuẩn hóa tới MinIO (`gold/mining/eda_summary.json`) và FastAPI `/api/mining/eda`.
- **Detailed Plan**: (1) Thiết kế truy vấn OLAP DuckDB và tách biệt ranh giới dữ liệu giữa các lát cắt thời gian (`06/10/2026`, `17/10/2026`, `04/11/2026`); (2) Trình bày thống kê mô tả đa tầng kèm khung 5W1H; (3) Chứng minh 4 phát hiện định lượng cốt lõi dẫn hướng thiết kế hệ thống; (4) Phân tích tương quan đa biến và cơ sở toán học của khung 3 Lăng kính.
- **References**: [02c_CH2_LAM_SACH_VA_BOC_TACH_CLEAN.md](./02c_CH2_LAM_SACH_VA_BOC_TACH_CLEAN.md), [02d_CH2_CHUYEN_DOI_PHAN_MANH_VA_CHI_MUC_TRANSFORM.md](./02d_CH2_CHUYEN_DOI_PHAN_MANH_VA_CHI_MUC_TRANSFORM.md), [EXP_01_LAKEHOUSE_SCALING_AND_CHUNKSTORE_HYDRATION.md](../experiments/EXP_01_LAKEHOUSE_SCALING_AND_CHUNKSTORE_HYDRATION.md), [eda_engine.py](../../src/mining/eda_engine.py), [lake_access.py](../../src/mining/lake_access.py), [mining_engine.py](../../src/mining/mining_engine.py), [eda_api.json](../../data-mining-latek/figures/captured_20261123_082337/evidence/eda_api.json), [eda_summary.json](../../data/gold/mining/eda_summary.json), [mining_manifest.json](../../data/gold/mining/mining_manifest.json), [DATA_MINING_INSIGHTS_AND_CHART_GUIDE.md](../mining/DATA_MINING_INSIGHTS_AND_CHART_GUIDE.md), [RESULTS_REPORTING.md](../../agents/rules/RESULTS_REPORTING.md).
- **Created**: 2026-11-25T12:55:00+07:00
- **Last Updated**: 2026-11-25T12:55:00+07:00

[STATUS: ACTIVE]

---

## Mục lục

- [3.1. Kiến trúc Phân tích OLAP trên S3 với DuckDB](#31-kiến-trúc-phân-tích-olap-trên-s3-với-duckdb)
  - [3.1.1. Tích hợp lưu trữ đối tượng qua `httpfs` và cơ chế phục hồi lỗi](#311-tích-hợp-lưu-trữ-đối-tượng-qua-httpfs-và-cơ-chế-phục-hồi-lỗi)
  - [3.1.2. Hợp nhất đa nguồn và khử trùng lặp tại thời điểm truy vấn](#312-hợp-nhất-đa-nguồn-và-khử-trùng-lặp-tại-thời-điểm-truy-vấn)
  - [3.1.3. Quy ước tách bạch các mốc lát cắt dữ liệu (Snapshot Provenance)](#313-quy-ước-tách-bạch-các-mốc-lát-cắt-dữ-liệu-snapshot-provenance)
- [3.2. Thống kê Mô tả Đa tầng](#32-thống-kê-mô-tả-đa-tầng)
  - [3.2.1. Tổng quan toàn hồ dữ liệu (Macro) và lát cắt kiểm toán 13,000 bài (Micro)](#321-tổng-quan-toàn-hồ-dữ-liệu-macro-và-lát-cắt-kiểm-toán-13000-bài-micro)
  - [3.2.2. Phân bố theo chuyên ngành arXiv và cấu trúc vector Qdrant](#322-phân-bố-theo-chuyên-ngành-arxiv-và-cấu-trúc-vector-qdrant)
- [3.3. Bốn Phát hiện Định lượng Cốt lõi của Miền Dữ liệu Khoa học](#33-bốn-phát-hiện-định-lượng-cốt-lõi-của-miền-dữ-liệu-khoa-học)
  - [3.3.1. Phát hiện 1: Chênh lệch mật độ công thức theo phân ngành](#331-phát-hiện-1-chênh-lệch-mật-độ-công-thức-theo-phân-ngành)
  - [3.3.2. Phát hiện 2: Bất đối xứng nhãn chính (`primary_category`) và đồng xuất hiện đa nhãn](#332-phát-hiện-2-bất-đối-xứng-nhãn-chính-primary_category-và-đồng-xuất-hiện-đa-nhãn)
  - [3.3.3. Phát hiện 3: Phân bố thời gian tập trung cao độ và hệ quả lên đánh giá xu hướng](#333-phát-hiện-3-phân-bố-thời-gian-tập-trung-cao-độ-và-hệ-quả-lên-đánh-giá-xu-hướng)
  - [3.3.4. Phát hiện 4: Phân phối lệch đuôi dài (Heavy-Tail) và bác bỏ giả thuyết chuẩn](#334-phát-hiện-4-phân-phối-lệch-đuôi-dài-heavy-tail-và-bác-bỏ-giả-thuyết-chuẩn)
- [3.4. Phân tích Tương quan Đa biến và Chẩn đoán 3 Lăng kính](#34-phân-tích-tương-quan-đa-biến-và-chẩn-đoán-3-lăng-kính)
  - [3.4.1. Pearson $r$ vs Spearman $\rho$ trên ma trận 6 đặc trưng ($n = 11,659$)](#341-pearson-r-vs-spearman-rho-trên-ma-trận-6-đặc-trưng-n--11659)
  - [3.4.2. Khung chẩn đoán 3 Lăng kính: Từ kiểm định D&#39;Agostino $K^2$ đến Mutual Information](#342-khung-chẩn-đoán-3-lăng-kính-từ-kiểm-định-dagostino-k2-đến-mutual-information)

---

## 3.1. Kiến trúc Phân tích OLAP trên S3 với DuckDB

Thay vì sao chép hàng chục nghìn tệp Parquet từ lớp lưu trữ đối tượng (Object Storage) về ổ đĩa cục bộ trước khi phân tích, động cơ phân tích khám phá (`EdaEngine` trong [eda_engine.py](../../src/mining/eda_engine.py)) thực thi tính toán OLAP trực tiếp trên nền tảng lưu trữ phân tán thông qua hàm kết nối `duck_connect()` trong [lake_access.py](../../src/mining/lake_access.py). Thiết kế này tách biệt lớp tính toán (Stateless Compute) khỏi lớp lưu trữ bền vững MinIO S3 (Stateless Storage Separation), cho phép đọc chọn lọc theo cột (Columnar Projection Pushdown) và chỉ tải các phân mảnh byte cần thiết qua giao thức HTTP Range Requests.

### 3.1.1. Tích hợp lưu trữ đối tượng qua `httpfs` và cơ chế phục hồi lỗi

Khi khởi tạo phiên làm việc trong bộ nhớ (`duckdb.connect(database=":memory:")`), hàm `duck_connect()` nạp mở rộng `httpfs` và thiết lập các tham số truyền tải chuyên dụng cho MinIO chuẩn S3-compatible:

```python
# Lake access helper (ASCII comments only)
con.execute("INSTALL httpfs; LOAD httpfs;")
con.execute(f"SET s3_endpoint='{endpoint}';")
con.execute("SET s3_url_style='path';")
con.execute("SET s3_region='us-east-1';")
con.execute("SET http_retries=8;")
con.execute("SET http_retry_wait_ms=500;")
con.execute("SET http_retry_backoff=2;")
```

Việc thiết lập `s3_url_style='path'` đảm bảo tương thích với cấu hình reverse proxy và đường dẫn bucket của MinIO tự triển khai, trong khi bộ tham số `http_retries=8`, `http_retry_wait_ms=500` và `http_retry_backoff=2` kích hoạt cơ chế chờ tăng dần theo hàm mũ (exponential backoff) nhằm hấp thụ các lỗi nghẽn mạng tạm thời khi quét song song nhiều phân vùng Parquet qua Cloudflare Tunnel hoặc mạng cục bộ. Song song với kênh phân tích dạng bảng, kết nối tới Qdrant (`qdrant_client(timeout=60.0)`) thực thi thống kê tổng hợp không gian vector thông qua `section_facets(client, limit=20)` sử dụng API `facet(collection_name, key="section_type", limit=limit)`, giúp đếm phân bố đoạn văn bản (chunk) theo từng mục học thuật mà không phải quét toàn bộ payload văn bản gốc.

### 3.1.2. Hợp nhất đa nguồn và khử trùng lặp tại thời điểm truy vấn

Lớp dữ liệu Silver trong kiến trúc Lakehouse được thu thập từ nhiều luồng thu hoạch khác nhau (`SILVER_PRIMARY_KEY = "silver/papers/**/*.parquet"`, Tier 1 Landmark, Tier 2 HTML/Full-text, CVF CVPR 2024 và OpenReview). Do một bài báo có thể vừa xuất hiện ở dạng metadata thô (abstract-only) vừa được nâng cấp bổ sung toàn văn (HTML-enriched full text) ở giai đoạn sau, `EdaEngine._register_views()` xây dựng hai khung nhìn ảo (Views) tách biệt hoàn toàn:

1. **`catalog_view`**: Quét trên nguồn chính `s3://uth-scientific-lakehouse/silver/papers/**/*.parquet` để thống kê bao phủ danh mục, hoặc mở rộng qua danh sách 7 nguồn ứng viên tùy theo trạng thái tồn tại của bucket tại thời điểm truy vấn.
2. **`fulltext_view`**: Hợp nhất toàn bộ 7 đường dẫn Parquet Silver (`silver/papers/**/*.parquet`, `silver/tier3/landmark_papers.parquet`, `silver/tier3/landmark_html_papers.parquet`, `silver/tier2/html_papers.parquet`, `silver/tier2/fulltext_papers.parquet`, `silver/cvf/cvpr2024.parquet`, `silver/openreview/openreview_all.parquet`) qua phép nối `UNION ALL`, đồng thời áp dụng hàm cửa sổ SQL để chọn bản ghi giàu thông tin nhất cho mỗi `paper_id`:

```sql
-- Query-time deduplication preferring richest HTML/fulltext extraction
SELECT * EXCLUDE (rn)
FROM (
    SELECT *,
        ROW_NUMBER() OVER (
            PARTITION BY paper_id
            ORDER BY COALESCE(total_sections, 0) DESC,
                     COALESCE(total_words, 0) DESC
        ) AS rn
    FROM raw_union
)
WHERE rn = 1
```

Quy tắc ưu tiên `(total_sections DESC, total_words DESC)` đảm bảo bản ghi toàn văn từ arXiv HTML (LaTeXML) luôn thắng thế trước bản ghi chỉ có tóm tắt (abstract) nếu có trùng lặp khóa `paper_id`. Ngoài ra, `EdaEngine` thực thi chuẩn hóa lược đồ (Schema Normalization) bằng `json.loads` linh hoạt cho các cột lồng nhau (`authors`, `categories`, `sections`, `full_text`), khắc phục sự khác biệt kiểu dữ liệu giữa các tệp Parquet từ luồng Python đời cũ và luồng chuẩn hóa mới (`23` cột ZSTD).

### 3.1.3. Quy ước tách bạch các mốc lát cắt dữ liệu (Snapshot Provenance)

Trong quá trình phát triển và mở rộng Lakehouse từ quy mô thử nghiệm ban đầu lên vận hành toàn phần, các chỉ số EDA được ghi nhận tại ba lát cắt độc lập tương ứng với các giai đoạn thu thập dữ liệu. Để bảo đảm tính trung thực thực nghiệm theo quy tắc báo cáo kết quả, mọi bảng số liệu trong Chương 3 và Chương 4a đều ghi rõ nguồn gốc lát cắt:

> **5W1H — Quy ước đối chiếu ba lát cắt dữ liệu trong báo cáo (Snapshot Provenance)**
>
> - **What**: Phân tách ranh giới số liệu giữa ba lát cắt kiểm chứng: (1) Lát cắt Gold cục bộ (`06/10/2026`), (2) Lát cắt Telemetry UI S3 (`17/10/2026`, chụp bằng chứng `23/11/2026`), và (3) Lần chạy Production toàn hồ (`04/11/2026`).
> - **Why**: Tránh trộn lẫn số liệu giữa các quy mô dữ liệu khác nhau (ví dụ: tỷ lệ làm giàu HTML ở quy mô 13,000 bài so với 71,927 bài), đảm bảo khả năng kiểm chứng ngược về tệp bằng chứng tương ứng.
> - **When**: Lần lượt thực thi vào `2026-10-06`, `2026-10-17` (evidence captured `2026-11-23`), và `2026-11-04`.
> - **Where**: Tệp [eda_summary.json](../../data/gold/mining/eda_summary.json), [eda_api.json](../../data-mining-latek/figures/captured_20261123_082337/evidence/eda_api.json), và log vận hành `logs/run/backend.log`.
> - **Who**: Sinh bởi `MiningEngine` và `EdaEngine` trong quy trình tự động của hệ thống.
> - **How**: Truy vấn OLAP DuckDB trên Parquet Silver kết hợp thống kê Qdrant/Vector Store.

| Lát cắt (Snapshot)                           | Thời điểm ghi nhận                       | Số bài toàn văn (`fulltext_view`) | Danh mục / Metadata (`catalog_view`) |   Số vector chỉ mục   | Nguồn kiểm chứng                                                                                                            |
| :--------------------------------------------- | :------------------------------------------- | :-------------------------------------: | :-------------------------------------: | :----------------------: | :----------------------------------------------------------------------------------------------------------------------------- |
| **Giai đoạn Gold cục bộ (S1)**       | `06/10/2026`                               |               `29,911`               |               `100,000`               |  `913,205` (LanceDB)  | [mining_manifest.json](../../data/gold/mining/mining_manifest.json), [eda_summary.json](../../data/gold/mining/eda_summary.json) |
| **Lát cắt S3 Telemetry UI (S2)**       | `17/10/2026` (bằng chứng `23/11/2026`) | `13,000` ($n = 11,659$ mẫu sạch) |               `13,000`               | `913,205` (IVF-PQ ref) | [eda_api.json](../../data-mining-latek/figures/captured_20261123_082337/evidence/eda_api.json)                                  |
| **Vận hành toàn hồ Production (S3)** | `04/11/2026`                               |               `71,927`               |               `71,927`               |  `1,043,594` (Qdrant)  | `logs/run/backend.log`                                                                                                       |

*Chú giải chỉ số*: `fulltext_view` là số bài báo duy nhất sau khử trùng lặp `ROW_NUMBER` có ít nhất metadata cấu trúc toàn văn; mẫu $n = 11,659$ trong S2 là tập con đáp ứng điều kiện lọc nhiễu độ dài tối thiểu (`total_words >= 300`) phục vụ tính ma trận tương quan và kiểm định phân phối.

---

## 3.2. Thống kê Mô tả Đa tầng

### 3.2.1. Tổng quan toàn hồ dữ liệu (Macro) và lát cắt kiểm toán 13,000 bài (Micro)

Ở tầng vĩ mô (`04/11/2026`), quy trình `MiningEngine` hoàn tất giai đoạn EDA trong **`39.09` giây** trên toàn bộ **`71,927` bài báo** lưu trên MinIO S3 kết hợp **`1,043,594` vector 768 chiều** trên cụm Qdrant `scientific_papers_gold` (`logs/run/backend.log`). Để bóc tách sâu cấu trúc ngữ nghĩa, mật độ công thức toán học và kiểm định giả thuyết phân phối, phần phân tích vi mô dưới đây khai thác trực tiếp tệp kết xuất đầy đủ từ API `/api/mining/eda` tại lát cắt `13,000` bài ([eda_api.json](../../data-mining-latek/figures/captured_20261123_082337/evidence/eda_api.json)).

> **5W1H — Bảng tổng hợp thống kê mô tả cơ bản trên lát cắt S3 UI ($13,000$ bài)**
>
> - **What**: Thống kê quy mô văn bản, công thức LaTeX, độ bao phủ làm giàu HTML và khoảng thời gian xuất bản trên lát cắt 13,000 bài.
> - **Why**: Định lượng mật độ tri thức toán học và độ đầy đủ cấu trúc trước khi chọn kích thước cửa sổ chunking và biến đổi đặc trưng.
> - **When**: Lát cắt S2 (`17/10/2026`, bằng chứng JSON chụp lại từ API ngày `23/11/2026`).
> - **Where**: [eda_api.json](../../data-mining-latek/figures/captured_20261123_082337/evidence/eda_api.json), trường `dataset_overview` và `math_and_content_stats`.
> - **Who**: Hàm `_get_overview_metrics()` và `_get_math_and_length_stats()` thuộc lớp `EdaEngine` ([eda_engine.py](../../src/mining/eda_engine.py)).
> - **How**: Tổng hợp trực tiếp bằng SQL trên `fulltext_view` kết hợp hàm phân vị rời rạc `QUANTILE_CONT` trong DuckDB.

| Chỉ số thống kê (Metric)                               |             Giá trị đo được             | Đơn vị         | Ý nghĩa vận hành trong Lakehouse                             |
| :--------------------------------------------------------- | :-------------------------------------------: | :---------------- | :--------------------------------------------------------------- |
| Tổng số bài báo kiểm toán (`total_papers`)         |                  `13,000`                  | bài báo         | Tập S2 dùng cho phân tích sâu 3 Lăng kính                 |
| Bài báo làm giàu HTML (`enriched_html_papers`)       |            `11,619` (`89.38%`)            | bài (`%`)      | Gần 90% bài giữ nguyên cấu trúc mục và LaTeX gốc        |
| Tổng số công thức toán học (`total_math_formulas`) |                 `2,825,871`                 | biểu thức LaTeX | Trung bình `217.37` công thức/bài (`p50 = 112.0`)        |
| Tổng số từ vựng toàn văn (`total_words`)           |                `62,288,266`                | từ               | Trung bình `4,791.41` từ/bài (`p50 = 4,437.0`)            |
| Số phân đoạn trung bình (`avg_sections_per_paper`)  |                   `5.96`                   | mục/bài         | Trung bình mỗi bài tách được gần 6 mục học thuật      |
| Khoảng thời gian xuất bản (`publication_span`)       | `2005-12-28` $\rightarrow$ `2025-01-14` | ngày             | Bao phủ các bài nền tảng (Tier 3) lẫn tiền ấn phẩm mới |

Xét về phân vị độ dài và mật độ ký hiệu trên tập `13,000` bài (`math_and_content_stats`), biến `total_math_formulas` đạt giá trị tứ phân vị $(p_{25}, p_{50}, p_{75}, p_{95}, \max) = (29.0, 112.0, 258.0, 829.0, 8168)$, trong khi biến `total_words` đạt $(3112.0, 4437.0, 5793.0, 9972.0, 454250)$. Khoảng cách khổng lồ giữa $p_{95}$ (`9,972` từ / `829` công thức) và giá trị cực đại (`454,250` từ / `8,168` công thức) là chỉ dấu đầu tiên cho thấy sự hiện diện của các bài khảo luận đồ sộ (mega-surveys) hoặc chuyên khảo lý thuyết thuần túy.

### 3.2.2. Phân bố theo chuyên ngành arXiv và cấu trúc vector Qdrant

> **5W1H — Bảng phân bố Top-10 chuyên ngành chính (`primary_category`) và mật độ công thức**
>
> - **What**: Thống kê số lượng bài báo, tỷ trọng phần trăm, tổng công thức toán, số công thức trung bình/bài và số từ trung bình/bài theo 10 nhãn `primary_category` dẫn đầu.
> - **Why**: Làm rõ cấu trúc mất cân bằng chuyên ngành và sự khác biệt bản chất giữa nhánh lý thuyết (`stat.ML`, `cs.LG`) với nhánh thực nghiệm/ngôn ngữ (`cs.CV`, `cs.CL`).
> - **When**: Lát cắt S2 (`17/10/2026`, bằng chứng trong [eda_api.json](../../data-mining-latek/figures/captured_20261123_082337/evidence/eda_api.json)).
> - **Where**: Trường `category_distribution` trong [eda_api.json](../../data-mining-latek/figures/captured_20261123_082337/evidence/eda_api.json).
> - **Who**: Phương thức `EdaEngine._get_category_distribution()`.
> - **How**: `GROUP BY primary_category` trên `fulltext_view`, tính tỷ trọng trên tổng `13,000` bài.

| Thứ hạng | Chuyên ngành (`primary_category`)       | Số bài (`count`) | Tỷ trọng (`%`) | Tổng công thức (`total_math_formulas`) | Công thức TB / bài ($\mu_{\text{math}}$) | Từ TB / bài ($\mu_{\text{words}}$) |
| :--------: | :------------------------------------------ | :------------------: | :----------------: | :-----------------------------------------: | :-------------------------------------------: | :------------------------------------: |
|     1     | `cs.LG` (Machine Learning)                |      `3,093`      |     `23.79%`     |                `1,120,932`                |                   `362.4`                   |              `5,085.3`              |
|     2     | `cs.CV` (Computer Vision)                 |      `3,021`      |     `23.24%`     |                 `414,824`                 |                   `137.3`                   |              `4,401.1`              |
|     3     | `cs.CL` (Computation & Language)          |      `1,858`      |     `14.29%`     |                 `182,669`                 |                   `98.3`                   |              `4,244.8`              |
|     4     | `cs.RO` (Robotics)                        |       `879`       |     `6.76%`     |                 `127,192`                 |                   `144.7`                   |              `4,589.3`              |
|     5     | `cs.AI` (Artificial Intelligence)         |       `625`       |     `4.81%`     |                 `124,862`                 |                   `199.8`                   |              `5,342.7`              |
|     6     | `eess.IV` (Image & Video Processing)      |       `390`       |     `3.00%`     |                 `43,275`                 |                   `111.0`                   |              `4,773.8`              |
|     7     | `cs.IR` (Information Retrieval)           |       `310`       |     `2.38%`     |                 `39,330`                 |                   `126.9`                   |              `4,952.9`              |
|     8     | `stat.ML` (Machine Learning - Statistics) |       `279`       |     `2.15%`     |                 `191,664`                 |                   `687.0`                   |              `6,120.3`              |
|     9     | `cs.CR` (Cryptography & Security)         |       `251`       |     `1.93%`     |                 `40,980`                 |                   `163.3`                   |              `5,384.9`              |
|     10     | `cs.NE` (Neural & Evolutionary Computing) |       `167`       |     `1.28%`     |                 `35,039`                 |                   `209.8`                   |              `4,595.2`              |

*Chú giải chỉ số*: `primary_category` là nhãn phân loại chính đầu tiên do tác giả khai báo trên arXiv; cột Công thức TB/bài ($\mu_{\text{math}}$) được tính bằng thương số giữa `total_math_formulas` và `count` của chuyên ngành tương ứng (làm tròn 1 chữ số thập phân). Top 3 chuyên ngành lớn nhất (`cs.LG`, `cs.CV`, `cs.CL`) chiếm tổng cộng **`61.32%`** kho kiểm toán (`7,972 / 13,000` bài).

Ở góc độ cấu trúc đoạn văn bản trong kho vector (`rag_audit_metrics` trong [eda_api.json](../../data-mining-latek/figures/captured_20261123_082337/evidence/eda_api.json)), phân bố tương đối theo nhóm mục chức năng (`section_distribution`) cho thấy **`Methodology & Algorithms`** chiếm tỷ trọng lớn nhất (`32.4%`), theo sau là **`Experiments & Benchmarks`** (`28.2%`), **`Introduction & Theory`** (`23.8%`) và **`Discussion & Conclusion`** (`15.6%`). Lưu ý rằng số lượng tổng trên trường hiển thị tóm tắt trong JSON UI đó mang tính tỷ lệ phân bố tham chiếu (chuẩn hóa tỷ trọng phần trăm), trong khi ở quy mô toàn hệ thống thực tế ngày `04/11/2026`, cụm Qdrant `scientific_papers_gold` lưu trữ **`1,043,594` vector 768 chiều** sinh từ mô hình `nomic-ai/nomic-embed-text-v1.5`.

---

## 3.3. Bốn Phát hiện Định lượng Cốt lõi của Miền Dữ liệu Khoa học

Phân tích dữ liệu khám phá không dừng lại ở việc liệt kê số lượng bản ghi mà trực tiếp giải mã bốn quy luật nội tại của văn bản học thuật, từ đó ràng buộc kiến trúc cho cả mô-đun khai phá dữ liệu (Chương 4a) và luồng RAG/Chunking (Chương 4b).

### 3.3.1. Phát hiện 1: Chênh lệch mật độ công thức theo phân ngành

Dữ liệu ở Bảng 3.2.2 chứng minh sự phân hóa cực độ về mật độ ký hiệu toán học giữa các nhánh AI:

- **`stat.ML` (Thống kê Học máy)** tuy chỉ chiếm `2.15%` tổng số bài (`279` bài), nhưng sở hữu trung bình **`687.0` công thức/bài** trên độ dài trung bình `6,120.3` từ — tương đương $\approx 112.2$ biểu thức toán trên mỗi $1,000$ từ.
- **`cs.LG` (Học máy)** đạt trung bình **`362.4` công thức/bài** trên `5,085.3` từ ($\approx 71.3$ công thức/$1,000$ từ), đóng góp hơn `1.12` triệu công thức (`39.67%` tổng số công thức toàn kho `2,825,871`).
- Ngược lại, **`cs.CV`** (`137.3` công thức/bài trên `4,401.1` từ) và đặc biệt **`cs.CL`** (`98.3` công thức/bài trên `4,244.8` từ) có mật độ toán thấp hơn lần lượt **`5.0x`** và **`7.0x`** so với `stat.ML`.

**Hệ quả kiến trúc trực tiếp**: Một công thức LaTeX phức tạp như ma trận hoặc chuỗi biến đổi tích phân tuy ngắn về số từ (word count) nhưng tiêu tốn số lượng BPE token gấp `3–5` lần văn bản tiếng Anh thông thường do dày đặc ký tự điều khiển (`\frac`, `\sum`, `\mathbf`, dấu ngoặc nhọn). Nếu dùng chiến lược cắt đoạn ngây thơ theo giới hạn $512$ token hoặc độ dài cố định lớn, các đoạn trích từ `stat.ML` và `cs.LG` bị cắt cụt (truncation) làm mất biến chứng minh giữa chừng. Đây là lý do trực tiếp thúc đẩy hệ thống: (i) chuẩn hóa kích thước chia đoạn ở mức `300–450` từ (`AcademicChunker`) kèm chia cân bằng theo ranh giới câu/công thức để không cắt đứt phương trình độc lập (loại bỏ đuôi vụn ở `EXP-02`), và (ii) khai thác đầy đủ cửa sổ ngữ cảnh **`2,048` token** của `nomic-embed-text-v1.5` (RoPE scaling) khi nhúng vector.

### 3.3.2. Phát hiện 2: Bất đối xứng nhãn chính (`primary_category`) và đồng xuất hiện đa nhãn

Nếu chỉ quan sát trường đơn trị `primary_category`, chuyên ngành **`cs.AI`** chỉ xếp thứ năm với `625` bài (`4.81%`). Tuy nhiên, phương thức `_get_category_cooccurrence()` phân tích cặp nhãn đồng xuất hiện (`categories` đa trị trên arXiv) phát hiện bức tranh hoàn toàn khác:

> **5W1H — Bảng Top-10 cặp chuyên ngành đồng xuất hiện (`category_cooccurrence`)**
>
> - **What**: Đếm tần suất các cặp nhãn chuyên ngành cùng gán trên một bài báo khoa học (`category_a < category_b`).
> - **Why**: Chứng minh ranh giới đa ngành trên arXiv bị mờ đi nếu chỉ lọc cứng theo `primary_category`, làm cơ sở cho khai phá luật kết hợp FP-Growth và phân cụm mềm GMM.
> - **When**: Lát cắt S2 (`17/10/2026`, bằng chứng [eda_api.json](../../data-mining-latek/figures/captured_20261123_082337/evidence/eda_api.json)).
> - **Where**: Trường `category_cooccurrence` trong [eda_api.json](../../data-mining-latek/figures/captured_20261123_082337/evidence/eda_api.json).
> - **Who**: Phương thức `EdaEngine._get_category_cooccurrence()`.
> - **How**: `UNNEST(categories)` tự kết nối cặp `a.cat < b.cat` trong cùng `paper_id` trên `fulltext_view`.

| Thứ hạng | Cặp chuyên ngành (`category_a + category_b`) | Số bài đồng xuất hiện (`cooccurrence_count`) | Hàm ý liên ngành                                                                            |
| :--------: | :------------------------------------------------ | :--------------------------------------------------: | :---------------------------------------------------------------------------------------------- |
|     1     | `cs.AI` + `cs.LG`                             |                      `1,983`                      | `cs.AI` xuất hiện làm nhãn phụ trong học máy gấp `3.17x` số nhãn chính (`625`) |
|     2     | `cs.AI` + `cs.CL`                             |                      `1,046`                      | Tác nhân LLM và suy luận ngôn ngữ giao thoa mạnh                                         |
|     3     | `cs.CV` + `cs.LG`                             |                       `984`                       | Nền tảng học sâu cho thị giác máy tính                                                  |
|     4     | `cs.AI` + `cs.CV`                             |                       `845`                       | Thị giác đa phương thức và tác nhân thị giác                                         |
|     5     | `cs.LG` + `stat.ML`                           |                       `814`                       | Giao thoa lý thuyết thống kê và học máy                                                  |
|     6     | `cs.CL` + `cs.LG`                             |                       `646`                       | Mô hình ngôn ngữ lớn huấn luyện từ dữ liệu lớn                                       |
|     7     | `cs.CV` + `eess.IV`                           |                       `549`                       | Chuyển giao xử lý tín hiệu ảnh cổ điển sang thị giác học sâu                       |
|     8     | `cs.SD` + `eess.AS`                           |                       `374`                       | Giao thoa tuyệt đối giữa Âm học tính toán (CS) và Xử lý âm thanh (EE)               |
|     9     | `cs.CR` + `cs.LG`                             |                       `365`                       | An toàn mô hình học máy, học liên kết và tấn công đối nghịch                      |
|     10     | `cs.SY` + `eess.SY`                           |                       `327`                       | Đồng bộ hóa hai mã hệ thống điều khiển giữa CS và Kỹ thuật điện                 |

**Hệ quả kiến trúc trực tiếp**: Bất đối xứng nhãn này chứng minh hai điểm then chốt:

1. Các bài báo học thuật mang bản chất **đa nhãn đồng thời** (`cs.AI` đóng vai trò "nhãn cầu nối" gắn vào `cs.LG`, `cs.CL`, `cs.CV`). Do đó, mô hình phân cụm cứng (*K-Means*) gán mỗi bài vào đúng một tâm cụm sẽ thất bại trong việc phản ánh tính giao thoa liên ngành, buộc hệ thống phải nâng cấp lên **phân cụm mềm EM GMM (Gaussian Mixture Model)** để xuất phân phối xác suất hậu nghiệm $\gamma_{ik}$.
2. Các cặp nhãn đồng xuất hiện tần suất cao (`cs.SD`/`eess.AS`, `cs.SY`/`eess.SY`, `cs.AI`/`cs.CL`) là tín hiệu tự nhiên để **FP-Growth** khám phá luật kết hợp nhằm mở rộng truy vấn (Query Term Expansion) trong RAG.

### 3.3.3. Phát hiện 3: Phân bố thời gian tập trung cao độ và hệ quả lên đánh giá xu hướng

Thống kê theo tháng xuất bản (`temporal_distribution` trên 13,000 bài) cho thấy sự tập trung mạnh vào một số tháng thu hoạch trọng điểm do kiến trúc thu hoạch phân tầng (Tiered Harvesting): **`2024-01`** đạt **`5,027` bài**, **`2024-02`** đạt **`3,811` bài**, và **`2025-01`** đạt **`2,468` bài** (trong khi các tháng kề cận như `2023-12` có `496` bài, `2024-12` có `300` bài). Tổng riêng ba tháng đỉnh (`2024-01`, `2024-02`, `2025-01`) chiếm tới **`11,306 / 13,000` (`86.97%`)** của lát cắt này.

**Hệ quả kiến trúc trực tiếp**: Nếu xây dựng bài toán theo dõi xu hướng nghiên cứu bằng hiệu số đếm tuyệt đối ($\text{Count}_{t} - \text{Count}_{t-1}$) theo tháng dương lịch cố định, sự biến động lưu lượng của từng đợt thu thập (crawl batch skew) sẽ tạo ra sai lệch giả mạo (ví dụ: chuyên ngành nào cũng tăng vọt ở `2024-01` hoặc giảm sâu ở các tháng ít dữ liệu). Phát hiện này buộc Trụ cột 4 ([trend_anomaly_mining.py](../../src/mining/trend_anomaly_mining.py)) phải sử dụng cửa sổ thứ tự thời gian phi khoảng cách đều qua `dense_rank()` và chuẩn hóa tăng trưởng bằng **động lượng thị phần ($\Delta\text{Share}$)** thay vì đếm thô.

### 3.3.4. Phát hiện 4: Phân phối lệch đuôi dài (Heavy-Tail) và bác bỏ giả thuyết chuẩn

Để đánh giá hình học phân phối một cách chặt chẽ, `EdaEngine._get_three_lenses_diagnostics()` trích xuất ma trận 6 biến số liên tục sạch hoàn toàn (`null_counts = 0` trên toàn bộ 6 cột, kích thước ma trận `11,659 x 6`, dung lượng bộ nhớ `0.53 MB` tại lát cắt `13,000` bài sau lọc `total_words >= 300`). Kết quả kiểm định chuẩn D'Agostino-Pearson $K^2$ trên cả 6 biến được trình bày dưới đây:

> **5W1H — Bảng kiểm định phân phối đơn biến và tính chuẩn D'Agostino $K^2$ ($n = 11,659$)**
>
> - **What**: Trình bày các đặc trưng vị trí (Mean, Median, IQR), hình dáng (Skewness, Excess Kurtosis) và thống kê kiểm định chuẩn $K^2$ cho 6 biến đặc trưng bài báo.
> - **Why**: Kiểm chứng xem các biến định lượng có tuân theo phân phối chuẩn hay không trước khi chọn phép biến đổi đặc trưng cho mô hình GMM và Isolation Forest.
> - **When**: Lát cắt S2 (`17/10/2026`, bằng chứng [eda_api.json](../../data-mining-latek/figures/captured_20261123_082337/evidence/eda_api.json)).
> - **Where**: Nhánh `diagnostic_3lenses.lens2_univariate` trong [eda_api.json](../../data-mining-latek/figures/captured_20261123_082337/evidence/eda_api.json).
> - **Who**: Thống kê tính toán qua `scipy.stats.normaltest`, `scipy.stats.skew`, `scipy.stats.kurtosis` trong [eda_engine.py](../../src/mining/eda_engine.py).
> - **How**: Đọc ma trận `(11659, 6)` sạch vào NumPy/Pandas và tính trực tiếp không lấy mẫu lại.

| Biến đặc trưng (`unit`) | Trung bình ($\mu$) | Trung vị ($p_{50}$) | Độ lệch chuẩn ($\sigma$) | Phân vị ($p_{25}$ / $p_{75}$ / $p_{95}$) | Giá trị Max | Độ bất đối xứng ($S$) | Độ nhọn dư ($K$) | Kiểm định $K^2$ ($p$-value) |
| :---------------------------- | :-------------------: | :--------------------: | :----------------------------: | :----------------------------------------------: | :-----------: | :---------------------------: | :--------------------: | :--------------------------------: |
| `words` (từ)               |      `5,320.6`      |      `4,636.0`      |          `5,497.9`          |       `3,680` / `6,029` / `10,264.2`       |  `454,250`  |          `+49.92`          |     `+3,879.80`     |     `36,776.5` (`< 0.001`)     |
| `math` (công thức)        |       `242.4`       |       `131.0`       |           `349.4`           |           `52` / `287` / `869.4`           |   `8,168`   |           `+4.70`           |       `+47.21`       |     `11,616.7` (`< 0.001`)     |
| `sections` (mục)           |        `6.6`        |        `6.0`        |            `2.3`            |             `5` / `7` / `10.0`             |    `48`    |           `+5.62`           |       `+75.13`       |     `13,261.8` (`< 0.001`)     |
| `authors` (tác giả)       |        `4.9`        |        `4.0`        |            `3.7`            |             `3` / `6` / `10.0`             |    `147`    |          `+12.74`          |      `+397.78`      |     `21,041.7` (`< 0.001`)     |
| `math_density` (eq/1k)      |       `44.8`       |        `28.8`        |            `57.3`            |         `12.3` / `55.6` / `144.5`         |  `1,817.5`  |           `+5.85`           |      `+100.77`      |     `13,810.5` (`< 0.001`)     |
| `citations` (trích dẫn)   |        `9.0`        |        `4.0`        |            `18.9`            |            `1` / `10` / `33.0`            |    `480`    |           `+9.26`           |      `+144.06`      |     `17,558.4` (`< 0.001`)     |

*Chú giải chỉ số*: Độ bất đối xứng $S$ (Skewness) $> 1.0$ biểu thị đuôi phải nặng (*HEAVY_RIGHT_TAIL*); Độ nhọn dư $K$ (Excess Kurtosis, theo Fisher với phân phối chuẩn $= 0$) $> 3.0$ biểu thị phân phối nhọn cực đoan (*LEPTOKURTIC*). Giá trị kiểm định $K^2$ đều vượt ngưỡng hàng vạn với $p < 0.001$, **bác bỏ hoàn toàn giả thuyết gốc $H_0$ về phân phối chuẩn trên cả 6 biến**.

Từ bảng trên rút ra hai kết luận kỹ thuật cốt lõi:

1. **Trung bình số học ($\mu$) bị bóp méo nghiêm trọng bởi ngoại lai**: Với biến `words`, trung bình (`5,320.6`) lệch cao hơn trung vị (`4,636.0`) tới `14.8%` và độ lệch chuẩn (`5,497.9`) vượt cả giá trị trung bình do các bài dài tới `454,250` từ ($S = +49.92, K = +3879.80$). Tương tự, với `math`, $\mu = 242.4$ cao gần gấp đôi trung vị $p_{50} = 131.0$. Do đó, mọi phân tầng dữ liệu, hồ sơ nhóm bài báo (4 nhóm *Pure Theory*, *Empirical Deep Learning*, *Survey*, *Short Workshop*) và phép điền khuyết đều phải dùng thống kê phi tham số (Median và IQR).
2. **Động lực trực tiếp cho biến đổi logarit $\log(1 + x)$ trước Isolation Forest**: Vì đuôi phải kéo dài theo lũy thừa (Power-law / Heavy-tail), nếu đưa thẳng các biến thô vào thuật toán phát hiện bất thường, các phân vùng ngẫu nhiên sẽ bị chi phối gần như tuyệt đối bởi chiều `words` hoặc `math` có biên độ hàng trăm nghìn. Áp dụng phép biến đổi $\tilde{x}_j = \ln(1 + x_j)$ nén phân phối đa cấp lũy thừa về thang bậc tuyến tính cân xứng hơn, giúp Isolation Forest phân biệt tinh tế giữa một bài khảo luận dài thông thường và một bất thường cấu trúc thực thụ.

---

## 3.4. Phân tích Tương quan Đa biến và Chẩn đoán 3 Lăng kính

### 3.4.1. Pearson $r$ vs Spearman $\rho$ trên ma trận 6 đặc trưng ($n = 11,659$)

Để đánh giá cả quan hệ tuyến tính lẫn quan hệ đơn điệu phi tuyến trên không gian đặc trưng `11,659 x 6`, hệ thống tính song song hệ số tương quan tuyến tính Pearson ($r$) và tương quan hạng đơn điệu Spearman ($\rho$):

$$
r_{XY} = \frac{\sum_{i=1}^{n} (x_i - \bar{x})(y_i - \bar{y})}{\sqrt{\sum_{i=1}^{n} (x_i - \bar{x})^2} \sqrt{\sum_{i=1}^{n} (y_i - \bar{y})^2}}, \qquad \rho_{XY} = r_{\operatorname{rank}(X),\, \operatorname{rank}(Y)}
$$

Trong đó: $n = 11,659$ là số lượng bài báo hợp lệ; $x_i, y_i$ là giá trị quan sát của hai đặc trưng $X, Y$ tại bài báo thứ $i$; $\bar{x}, \bar{y}$ là trung bình mẫu; $\operatorname{rank}(X), \operatorname{rank}(Y)$ là ánh xạ thay mỗi giá trị bằng thứ hạng (được xử lý đồng hạng trung bình) trong mẫu.

> **5W1H — Bảng đối chiếu tương quan Pearson $r$ và Spearman $\rho$ cho các cặp biến trọng yếu ($n = 11,659$)**
>
> - **What**: So sánh giá trị, mức ý nghĩa $p$ và chênh lệch $|\rho - r|$ giữa tương quan tuyến tính Pearson và tương quan hạng Spearman.
> - **Why**: Phát hiện các quan hệ phi tuyến, quan hệ bão hòa hoặc nghịch lý cấu trúc bị hệ số tương quan tuyến tính che khuất.
> - **When**: Lát cắt S2 (`17/10/2026`, bằng chứng [eda_api.json](../../data-mining-latek/figures/captured_20261123_082337/evidence/eda_api.json)).
> - **Where**: Nhánh `correlations.pearson` và `correlations.spearman` trong [eda_api.json](../../data-mining-latek/figures/captured_20261123_082337/evidence/eda_api.json).
> - **Who**: Phương thức `EdaEngine._get_correlation_matrix()` sử dụng `scipy.stats.pearsonr` và `scipy.stats.spearmanr`.
> - **How**: Tính toàn bộ cặp đối xứng trên 6 biến (`words`, `math`, `sections`, `authors`, `math_density`, `citations`).

| Cặp biến $(X, Y)$                            | Pearson $r$ | Mức ý nghĩa ($p_r$) | Spearman $\rho$ | Mức ý nghĩa ($p_\rho$) | Hiện tượng thống kê quan sát được                                                                      |
| :----------------------------------------------- | :-----------: | :----------------------: | :---------------: | :-------------------------: | :-------------------------------------------------------------------------------------------------------------- |
| `words` $\leftrightarrow$ `math`           |  `+0.214`  | `< 1e-15` ($^{***}$) |    `+0.439`    |  `< 1e-15` ($^{***}$)  | Spearman cao hơn gấp đôi Pearson ($\Delta = +0.225$) do bài siêu dài (survey) ít toán kéo r xuống  |
| `words` $\leftrightarrow$ `sections`       |  `+0.383`  | `< 1e-15` ($^{***}$) |    `+0.411`    |  `< 1e-15` ($^{***}$)  | Bài viết dài phân rã thành nhiều mục cấu trúc hơn (quan hệ ổn định)                              |
| `math` $\leftrightarrow$ `math_density`    |  `+0.859`  | `< 1e-15` ($^{***}$) |    `+0.931`    |  `< 1e-15` ($^{***}$)  | Động lực chính quyết định mật độ công thức là tổng số phương trình                            |
| `math` $\leftrightarrow$ `authors`         |  `-0.110`  | `< 1e-15` ($^{***}$) |    `-0.094`    |  `< 1e-15` ($^{***}$)  | **Nghịch lý Toán & Tác giả**: Bài thuần lý thuyết có nhóm tác giả nhỏ ($1–2$ người)    |
| `authors` $\leftrightarrow$ `math_density` |  `-0.106`  | `< 1e-15` ($^{***}$) |    `-0.110`    |  `< 1e-15` ($^{***}$)  | Nhóm nghiên cứu càng đông càng nghiêng về thực nghiệm hệ thống/benchmark                           |
| `words` $\leftrightarrow$ `math_density`   |  `+0.012`  |    `0.196` (`ns`)    |    `+0.143`    |  `< 1e-15` ($^{***}$)  | **Bẫy loại biến tuyến tính**: Pearson $r \approx 0$ nhưng Spearman có ý nghĩa ở $p < 0.001$ |
| `words` $\leftrightarrow$ `citations`      |  `-0.005`  |    `0.604` (`ns`)    |    `-0.019`    |    `< 0.05` ($^{*}$)    | Độ dài toàn văn độc lập tuyến tính với số trích dẫn trong cửa sổ thu hoạch hiện tại          |

Phân tích cặp `words` $\leftrightarrow$ `math` ($r = +0.214$ so với $\rho = +0.439$) giải thích rõ cơ chế bẻ gãy đường hồi quy tuyến tính: trong phần lớn các bài báo thông thường ($3,000$–$7,000$ từ), độ dài tăng đi kèm tăng số lượng công thức chứng minh; tuy nhiên, các bài khảo luận (survey) cực dài trên $15,000$–$100,000$ từ chứa rất ít ký hiệu toán mới, tạo thành các điểm đòn bẩy (leverage points) kéo đường hồi quy tuyến tính xuống phẳng, trong khi tương quan thứ hạng Spearman không bị ảnh hưởng bởi độ lớn tuyệt đối ở phần đuôi vẫn giữ mức dương trung bình mạnh ($\rho = +0.439$).

### 3.4.2. Khung chẩn đoán 3 Lăng kính: Từ kiểm định D'Agostino $K^2$ đến Mutual Information

Nhằm chuyển hóa EDA thành quyết định tiền xử lý tự động có căn cứ toán học, phương thức `_get_three_lenses_diagnostics()` trong [eda_engine.py](../../src/mining/eda_engine.py) triển khai kiến trúc 3 Lăng kính:

1. **Lăng kính 1 — Kiểm định Cấu trúc Dữ liệu (`lens1_topology`)**: Xác nhận hình dạng ma trận `(11659, 6)`, kiểu dữ liệu nguyên/thực, mức tiêu thụ RAM (`0.53 MB`) và xác nhận `null_counts = 0` trên toàn bộ 6 đặc trưng trước khi đi qua phép biến đổi tiếp theo.
2. **Lăng kính 2 — Phẫu thuật Phân phối Đơn biến (`lens2_univariate`)**: Cho mỗi biến, tính đồng thời biểu đồ tần suất 25 khoảng (Histogram đã cắt 99% phần lõi trực quan hóa), đường cong mật độ hạt nhân 30 điểm (`gaussian_kde`), biểu đồ xác suất chuẩn Q-Q 25 phân vị và thống kê kiểm định tổng hợp D'Agostino $K^2$:
   $$
   K^2 = Z_1(g_1)^2 + Z_2(g_2)^2 \xrightarrow{H_0} \chi^2_{df=2}
   $$

   Trong đó: $g_1$ là hệ số bất đối xứng mẫu (sample skewness); $g_2$ là độ nhọn dư mẫu (sample excess kurtosis); $Z_1, Z_2$ là các biến đổi chuẩn hóa tương ứng biến đổi $g_1, g_2$ về phân phối $\mathcal{N}(0, 1)$; dưới giả thuyết gốc chuẩn hóa $H_0$, $K^2$ tiệm cận phân phối Chi-bình phương với 2 bậc tự do.
3. **Lăng kính 3 — Tương tác Phi tuyến & Lượng thông tin Tương hỗ (`lens3_multivariate`)**: Kết hợp hồi quy tuyến tính OLS, đường xu hướng 20 nút (spline binned median), phân cụm GMM hai chiều trên không gian cặp biến và chỉ số **Mutual Information** $I(X; Y)$ tính qua `sklearn.feature_selection.mutual_info_regression`:
   $$
   I(X; Y) = \iint p(x, y) \log \frac{p(x, y)}{p(x)\,p(y)} \, dx \, dy
   $$

   Trong đó: $p(x, y)$ là hàm mật độ xác suất đồng thời của hai biến $(X, Y)$; $p(x)$ và $p(y)$ là các hàm mật độ biên; $I(X; Y) \ge 0$ đo lượng bất định của $Y$ được giảm đi khi biết $X$ (ước lượng phi tham số theo phương pháp lân cận gần nhất Kraskov-Stögbauer-Grassberger tích hợp trong Scikit-learn).

> **5W1H — Bảng đối chiếu 4 cặp Lăng kính 3 giữa Tương quan Tuyến tính, Đơn điệu và Mutual Information**
>
> - **What**: So sánh $r$, $\rho$, $R^2_{\text{OLS}}$ và Mutual Information $I(X;Y)$ cho 4 cặp đặc trưng chuẩn đoán sâu.
> - **Why**: Đánh giá cấu trúc phi tuyến thực tế (phi đơn điệu chữ U ngược) mà ngay cả chỉ số tuyến tính $R^2$ không bắt được.
> - **When**: Lát cắt S2 (`17/10/2026`, bằng chứng [eda_api.json](../../data-mining-latek/figures/captured_20261123_082337/evidence/eda_api.json)).
> - **Where**: Trường `diagnostic_3lenses.lens3_multivariate.pairs` trong [eda_api.json](../../data-mining-latek/figures/captured_20261123_082337/evidence/eda_api.json).
> - **Who**: Phương thức `EdaEngine._get_three_lenses_diagnostics()`.
> - **How**: Tính `pearsonr`, `spearmanr`, `mutual_info_regression(random_state=42)` và chuỗi `spline_points` 19–20 khoảng trên mẫu $n = 11,659$.

| Mã cặp (`pair_id`)   |      Pearson $r$      |    Spearman $\rho$    | $R^2$ tuyến tính | Mutual Info $I(X; Y)$ | Xu hướng phi tuyến theo lát cắt (`spline_points`)                                                                                                                |
| :----------------------- | :----------------------: | :---------------------: | :------------------: | :---------------------: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `words_x_math`         |        `+0.214`        |       `+0.439`       |      `0.0459`      |        `0.157`        | Tăng đồng thuận ở vùng lõi rồi phân tán khi gặp bài khảo luận siêu dài                                                                                  |
| `words_x_math_density` | `+0.012` (`p=0.196`) | `+0.143` (`<0.001`) |      `0.0001`      |        `0.052`        | Đường cong chữ U ngược: tăng từ `18.33` eq/1k (`~1,666` từ) lên đỉnh `34.84` eq/1k (`~4,987` từ) rồi tụt xuống `8.40` eq/1k (`~16,613` từ) |
| `math_x_authors`       |        `-0.110`        |       `-0.094`       |      `0.0120`      |        `0.034`        | Tương quan âm bền vững: bài thuần toán ít đồng tác giả                                                                                                     |
| `words_x_citations`    |        `-0.009`        |       `-0.009`       |      `0.0001`      |        `0.000`        | Độc lập thống kê trên lát cắt hiện tại (cả tuyến tính và phi tuyến)                                                                                      |

*Lưu ý minh bạch kỹ thuật*: Trong mã nguồn UI cảnh báo tĩnh của [eda_engine.py](../../src/mining/eda_engine.py#L658), chuỗi mô tả minh họa nguyên tắc §6.3 có ghi nhãn tĩnh `r = +0.018` và `I = 0.998` mang tính sư phạm cho biểu mẫu giao diện; tuy nhiên kết quả thực nghiệm tính toán trực tiếp trên tập mẫu $n = 11,659$ trong [eda_api.json](../../data-mining-latek/figures/captured_20261123_082337/evidence/eda_api.json) là $r = 0.012$ ($p = 0.196$, $R^2 = 0.0001$), $\rho = 0.143$ ($p < 0.001$) và $I(X; Y) = 0.052$. Đường spline trung vị của `words_x_math_density` vẫn xác nhận rõ quy luật chữ U ngược phi đơn điệu: mật độ công thức tăng gấp gần đôi từ vùng bài ngắn (`18.33` eq/1k từ ở mốc `1,665.8` từ) lên cực đại ở vùng bài báo hội nghị chuẩn (`34.84` eq/1k từ ở mốc `4,987.3` từ) rồi loãng dần về `8.40` eq/1k từ tại các bài tổng quan trên `16,600` từ. Do đó, việc loại bỏ đặc trưng chỉ dựa trên hệ số Pearson $r \approx 0$ ($R^2 = 0.0001$) sẽ đánh mất tín hiệu phân biệt giữa *bài hội nghị lõi giàu thuật toán* và *bài tổng quan/hệ thống*, khẳng định giá trị của phép lọc biến dựa trên tương tác phi tuyến và mô hình dựa trên cây/hỗn hợp Gaussian ở Chương 4a.
