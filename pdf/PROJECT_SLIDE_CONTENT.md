# NỘI DUNG SLIDE BÁO CÁO BÀI TẬP LỚN DATA MINING (NHÓM 1)
## Đề tài: Xây Dựng Pipeline Data Mining Báo Khoa Học Đa Nguồn & Hệ Thống RAG Phục Vụ Nghiên Cứu AI/DS
### Bám sát Giáo trình Data Mining (Chương 1, 2, 4) & Codebase Thực Tế Của Dự Án
---

> **Hướng dẫn sử dụng với ChatGPT:**  
> Copy toàn bộ nội dung markdown này vào ChatGPT với câu lệnh:  
> *"Dựa trên nội dung bài tập lớn Data Mining của Nhóm 1 dưới đây, hãy chuyển đổi thành bộ slide PowerPoint (mã python-pptx hoặc dàn ý chi tiết từng trang), giữ nguyên tên các module code, thuật toán và công cụ kỹ thuật thực tế."*

---

## SLIDE 1: TRANG TIÊU ĐỀ
* **Tiêu đề chính**: BÀI TẬP LỚN MÔN DATA MINING - NHÓM 1
* **Tên đề tài**: PIPELINE KHAI PHÁ DỮ LIỆU BÁO KHOA HỌC ĐA NGUỒN (ARXIV - OPENREVIEW - CVF) VÀ HỆ THỐNG RAG THỜI GIAN THỰC
* **Bối cảnh môn học**: 
  * Áp dụng quy trình chuẩn **KDD** và **CRISP-DM**.
  * Hiện thực hóa kiến trúc **Data Lakehouse** (Bronze $\rightarrow$ Silver $\rightarrow$ Gold) và **Data Pipeline** (Collect $\rightarrow$ Ingest $\rightarrow$ Store $\rightarrow$ Compute $\rightarrow$ Consume).
* **Đơn vị**: Viện CNTT & Điện, Điện tử – UTH

---

## SLIDE 2: MỤC TIÊU DỰ ÁN (OBJECTIVE)
* **Bản chất của Data Mining (Theo lý thuyết môn học)**:
  * Data Mining về cốt lõi luôn là bài toán biến đổi không gian dữ liệu: **Đầu vào là Dữ liệu (Data In) $\rightarrow$ Đầu ra là Dữ liệu mới có cấu trúc/Tri thức (Data Out / Knowledge)**.
* **Đầu vào (Input Data)**:
  * Dữ liệu thô từ 3 nguồn báo khoa học: **ArXiv**, **OpenReview**, và **CVF**.
  * Tồn tại dưới nhiều định dạng hỗn hợp: XML/Atom feed, JSON payload, HTML DOM, và tệp PDF.
* **Đầu ra (Output Data / Artifacts)**:
  * Một bộ dữ liệu chuẩn hóa được lưu trữ và đánh chỉ mục trong **Vector Database (LanceDB)** và **Lakehouse (Apache Parquet / DuckDB)**.
  * Phục vụ trực tiếp cho bài toán ứng dụng thực tế: **Truy vấn hỏi đáp ngữ nghĩa nâng cao (Scientific RAG)** không bị ảo giác.

---

## SLIDE 3: CHI TIẾT 3 NGUỒN THU THẬP DỮ LIỆU (DATA HARVESTING SOURCES)
*Quy mô tổng thể: **29,911 bài báo khoa học** toàn văn đã cào và kiểm định chất lượng.*

* **1. ArXiv (Realtime Preprints - 25,000 bài / 83.58%)**:
  * *Đặc điểm*: Kho bản thảo mở lớn nhất thế giới; bao phủ các lĩnh vực cốt lõi: `cs.LG` (Machine Learning), `cs.CV` (Computer Vision), `cs.AI` (Artificial Intelligence), `cs.CL` (Computation & Language), `stat.ML` (Statistics).
  * *Giao thức kỹ thuật trong code*: Cào qua **ArXiv API (OAI-PMH XML)** (`export.arxiv.org/api/query`) kết hợp RSS feeds và cơ chế phân trang tự động (`src/ingestion/arxiv_harvester.py`).
  * *Bóc tách toàn văn*: Bộ chuyển đổi tự động PDF-to-Markdown trích xuất cấu trúc văn bản và giữ nguyên công thức LaTeX.
* **2. OpenReview (Peer-Review Intelligence - 3,000 bài / 10.03%)**:
  * *Đặc điểm*: Nền tảng bình duyệt học thuật hàng đầu của các hội nghị đỉnh cao (ICLR, NeurIPS, ICML). Có giá trị đặc biệt vì chứa **điểm đánh giá chuyên gia (peer review rating scores)**, quyết định chấp thuận/từ chối và biên bản phản biện công khai.
  * *Giao thức kỹ thuật trong code*: Dùng thư viện chính thức **openreview-py API (REST v2)** tích hợp cơ chế chống lỗi Cloudflare 403 và Fallback Mirror (`src/ingestion/openreview_harvester.py`).
* **3. CVF - Computer Vision Foundation (Top-Tier Verified Papers - 1,911 bài / 6.39%)**:
  * *Đặc điểm*: Kỷ yếu chính thức (open access proceedings) của các hội nghị thị giác máy tính số 1 toàn cầu: **CVPR, ICCV, WACV**. Không cung cấp API mở, công bố theo từng đợt hội nghị thường niên.
  * *Giao thức kỹ thuật trong code*: Viết crawler web chuyên dụng bằng **BeautifulSoup4 + HTTPX**, bóc tách HTML DOM, tải tệp PDF gốc, trích xuất BibTeX và Metadata bài báo (`src/ingestion/cvf_harvester.py`).

---

## SLIDE 3B: KIỂM TOÁN CHẤT LƯỢNG & ĐỘ ĐẦY ĐỦ TẦNG BRONZE (RAW DATA QUALITY AUDIT)
*Trực quan hóa trực tiếp trên Frontend: Deck `[EDA-00] Tầng 1: Thu thập & Dữ liệu thô`*

* **Ma trận kiểm toán độ đầy đủ (Missingness Audit Matrix trên 29,911 bài)**:
  * `paper_id`: **100.0%** (29,911/29,911) – Chuẩn hóa định danh duy nhất (ArXiv ID, OpenReview ID, CVF slug).
  * `title`: **100.0%** (29,911/29,911) – 0 bài khuyết thiếu.
  * `full_text`: **100.0%** (29,911/29,911) – **Tỷ lệ bảo toàn toàn văn đạt 100%** qua PDF Miner.
  * `categories`: **100.0%** (29,911/29,911) – Toàn bộ bài báo được gán nhãn danh mục chuyên ngành.
  * `abstract`: **99.8%** (29,851/29,911) – Chỉ 60 bài thiếu tóm tắt (được bổ sung từ đoạn mở đầu Introduction).
  * `authors`: **99.5%** (29,762/29,911) – 149 bài thiếu danh sách tác giả do định dạng PDF đặc thù.
  * `review_score`: **10.0%** (3,000/29,911) – Đặc thù chỉ nguồn OpenReview có điểm phản biện (giữ nguyên phân phối, không gán giá trị nhân tạo imputation).
* **Cơ chế phòng thủ chất lượng thu thập (Data Quality Shields)**:
  * **DedupHashShield (`src/storage/dedup_hash_shield.py`)**: Kết hợp mã băm SHA-256 nội dung và chuẩn hóa xâu ký tự tiêu đề để loại bỏ triệt để trùng lặp giữa các đợt cào.
  * **Rate-Limit Jitter & Exponential Backoff**: Điều tiết tần suất gửi request tránh bị chặn IP từ ArXiv và OpenReview.

---

## SLIDE 4: CHIẾN LƯỢC DỮ LIỆU 3 TẦNG (3-TIER DATA ARCHITECTURE)
*Code triển khai: `src/pipelines/run_three_tier_pipeline.py`*

* **Tầng 1 - Tier 1: Historical Core (Đỉnh cao lịch sử)**:
  * Thu thập các bài báo kinh điển, cột mốc nền tảng của AI/Data Science (sắp xếp theo `cite_count DESC`, mốc lịch sử).
  * *Vai trò*: Làm chân lý nền tảng (*ground truth*), đảm bảo tri thức cốt lõi chuẩn xác nhất.
* **Tầng 2 - Tier 2: Near-Past Trending (Xu hướng gần đây 2024 - nay)**:
  * Thu thập từ CVF và OpenReview trong khung thời gian 2024 đến hiện tại.
  * *Vai trò*: Bổ sung góc nhìn phản biện từ chuyên gia, đánh giá ưu/nhược điểm các thuật toán đang thịnh hành.
* **Tầng 3 - Tier 3: Live Real-Time Forward Stream (Thời gian thực đến tương lai)**:
  * Luồng cào tự động liên tục các bài báo zero-day mới nhất vừa xuất bản trên ArXiv hàng ngày/hàng tuần.
  * *Vai trò*: Đón đầu các kỹ thuật mới nhất, giúp kho tri thức không bao giờ bị lỗi thời.

---

## SLIDE 5: MÔ HÌNH CHUNG CỦA DATA MINING (LÝ THUYẾT GIÁO TRÌNH)
* **Giao thoa nền tảng**:
  $$\text{Data Mining} = \text{Statistics} \cap \text{Database} \cap \text{Machine Learning}$$
* **Quy trình học thuật KDD**:
  $$\text{Selection} \rightarrow \text{Preprocessing} \rightarrow \text{Transformation} \rightarrow \text{Data Mining} \rightarrow \text{Evaluation} \rightarrow \text{Presentation}$$
* **Khung chuẩn công nghiệp CRISP-DM ánh xạ vào bài tập**:
  1. *Business Understanding*: Mục tiêu hỗ trợ tra cứu bài báo khoa học AI/DS.
  2. *Data Understanding*: Thu thập và khám phá 3 nguồn ArXiv, OpenReview, CVF.
  3. *Data Preparation*: Làm sạch PDF, chuẩn hóa schema, Semantic Chunking (chiếm phần lớn khối lượng code).
  4. *Modeling / Processing*: Trích xuất vector 768 chiều, phân cụm chủ đề, khai phá luật.
  5. *Evaluation*: Đo lường Silhouette Score và các chỉ số RAG Triad.
  6. *Deployment*: Serving API qua LanceDB và Engine RAG cục bộ.
* **Luồng Data Pipeline doanh nghiệp**:
  $$\text{Collect} \rightarrow \text{Ingest} \rightarrow \text{Store} \rightarrow \text{Compute} \rightarrow \text{Consume}$$

---

## SLIDE 6: CÔNG CỤ & KIẾN TRÚC HỆ THỐNG TRONG CODE (TECH STACK)
*Bảng đối chiếu công cụ thực tế được lập trình trong project:*

* **Cào dữ liệu (Collect)**: `httpx`, `BeautifulSoup4`, `openreview-py`, `feedparser`.
* **Lưu trữ Medallion Lakehouse (Store)**:
  * **Bronze (Raw)**: `data/raw/` (JSON thô, HTML, PDF tải về) + Cloudflare R2 backup.
  * **Silver (Cleaned)**: `data/silver/` (Tệp Apache Parquet nén `zstd`, quản lý qua `DuckDBEngine` và `SilverLakehouseWriter`).
  * **Gold (Indexed & Ready)**: `data/gold/` (LanceDB vector tables và Parquet artifacts).
* **Bóc tách & Tiền xử lý (Compute / Preprocess)**:
  * `PyMuPDF (fitz)` & `marker_extractor.py` (chuyển PDF sang Markdown/LaTeX).
  * `html_parser.py` (bóc tách cấu trúc bài báo).
  * `AcademicChunker` (cắt đoạn bảo toàn ranh giới mục học thuật).
* **Mã hóa Vector & Cơ sở dữ liệu Vector**:
  * Mô hình nhúng: `nomic-ai/nomic-embed-text-v1.5` (768 chiều, context 8,192 tokens, tăng tốc phần cứng qua Apple Silicon MPS / CUDA).
  * Vector Store: **LanceDB** (`scientific_papers_gold`).
* **Khai phá & Mô hình học máy (Mining Engine)**:
  * `mlxtend` (thuật toán FP-Growth), `scikit-learn` (K-Means, DBSCAN, Isolation Forest, PCA), `duckdb`.
* **Phục vụ & RAG (Consume)**:
  * `ScientificRAGEngine` kết hợp mô hình ngôn ngữ lớn chạy offline `Qwen2.5-7B-Instruct-Q4_K_M.gguf`.

---

## SLIDE 7A: GIAI ĐOẠN 1 – EDA TẦNG 1: THU THẬP & DỮ LIỆU THÔ (COLLECTION EDA)
*Theo bài giảng Chương 2: Selection & Khám phá dữ liệu thô (Trực quan hóa tại Deck `[EDA-00]`)*

* **1. Hồ sơ 3 kênh thu thập (29,911 bài báo)**:
  * **ArXiv**: 25,000 bài (83.58%) – Cột mốc preprints đa ngành (cs.LG, cs.CV, cs.AI, cs.CL, stat.ML).
  * **OpenReview**: 3,000 bài (10.03%) – Chứa điểm rating chuyên gia và biên bản phản biện ICLR/NeurIPS.
  * **CVF**: 1,911 bài (6.39%) – Kỷ yếu chính thức CVPR/ICCV/WACV.
* **2. Tiến trình thu hoạch theo năm (2020 - 2024)**:
  * Số lượng bài tăng trưởng liên tục: 2020 (1,820 bài) $\rightarrow$ 2021 (3,410 bài) $\rightarrow$ 2022 (6,240 bài) $\rightarrow$ 2023 (8,120 bài) $\rightarrow$ **Đỉnh điểm 2024 (10,321 bài)**.
* **3. Kiểm toán khuyết thiếu (Missingness Audit)**:
  * Tỷ lệ toàn văn đạt **100% (29,911/29,911 bài)** được chuyển đổi sang Markdown chuẩn.
  * Tiêu đề và mã định danh đạt 100%; Abstract đạt 99.8%; Authors đạt 99.5%. Trường `review_score` đạt 10% (đặc thù OpenReview).

---

## SLIDE 7B: GIAI ĐOẠN 1 – EDA TẦNG 2: TIỀN XỬ LÝ & PHÂN CỤM GMM (PROCESSING & GMM EDA)
*Theo bài giảng Chương 2: Tiền xử lý & Phân tích tương tác đa biến (Trực quan hóa tại Deck `[EDA-03]`)*

* **1. Đổi mới phương pháp: Phân cụm mô hình hỗn hợp Gauss (GMM - Gaussian Mixture Models)**:
  * Khắc phục nhược điểm của K-Means (vốn giả định cụm hình cầu đẳng hướng): GMM sử dụng ma trận hiệp phương sai đầy đủ (*full covariance*), cho phép các cụm có hình ellipse nghiêng tự do theo hướng dữ liệu thực tế.
  * Cơ chế **Soft Clustering**: Tính toán xác suất hậu nghiệm $P(C_k|x)$ cho từng bài báo, phản ánh đúng tính đa ngành của nghiên cứu khoa học.
* **2. Đường bao tin cậy Ellipse 1.5-sigma (Confidence Ellipses)**:
  * Tự động tính bán trục $r_x = 1.5\sqrt{\lambda_1}$, $r_y = 1.5\sqrt{\lambda_2}$ và góc xoay $\theta = \frac{1}{2} \text{atan2}(2\sigma_{xy}, \sigma_x^2 - \sigma_y^2)$ bao phủ ~80% mật độ xác suất của từng cụm.
* **3. Bốn Archetype bài báo khoa học phát hiện bởi GMM ($K=4$)**:
  * **Cụm 0 (Cam) - Lý thuyết nặng Toán (Q1)**: Súc tích, mật độ công thức cao (Lý thuyết tối ưu, xác suất thống kê).
  * **Cụm 1 (Xanh dương) - Chuyên khảo Toàn diện (Q2)**: Dung lượng lớn, nhiều công thức (Survey, Benchmark, Deep Learning toàn diện).
  * **Cụm 2 (Xám) - Bài ngắn & Workshop (Q3)**: Dung lượng vừa, ít công thức (Short paper, demo, preliminary work).
  * **Cụm 3 (Xanh ngọc) - Hệ thống thực nghiệm LLM (Q4)**: Số từ lớn nhưng ít công thức toán (Empirical AI, Agent workflows, Prompting).
* **4. Bài học tương tác đa biến (Nghịch lý thống kê Case study §6.3)**:
  * Hệ số Pearson $r \approx 0.04$ ($p = 0.003$) ngỡ như độc lập tuyến tính, nhưng **Thông tin tương hỗ Mutual Information $I(X;Y) = 0.36$** chứng minh mối liên kết phi tuyến cực mạnh. GMM phân tách chính xác các nhóm này mà hồi quy tuyến tính bỏ sót!

---

## SLIDE 8: GIAI ĐOẠN 2 – DATA CLEANING (LÀM SẠCH DỮ LIỆU)
*Theo bài giảng Chương 2: Data Cleaning*

* **1. Làm sạch bảng Metadata**:
  * Khử trùng lặp đa tầng (`DedupHashShield` tại `src/storage/dedup_hash_shield.py`):
    * Tính mã hash SHA-256 trên chuỗi Abstract đã chuẩn hóa.
    * So khớp tiêu đề chuẩn hóa (`normalized_title`) để tránh cào trùng bài giữa các lần chạy.
* **2. Khử nhiễu văn bản phi cấu trúc (PDF & HTML)**:
  * Xử lý lỗi ngắt từ do xuống dòng trong PDF (ví dụ: `con-nectivity` $\rightarrow$ `connectivity`).
  * Chuẩn hóa bảng mã Unicode tiếng Việt và ký tự đặc biệt về dạng chuẩn **NFC** (`unicodedata.normalize`).
  * Làm sạch cú pháp LaTeX: giữ nguyên công thức toán có nghĩa, loại bỏ các lệnh định dạng thừa (`\vspace`, `\newpage`, `\textbf`).
  * Cắt bỏ phần phụ lục rác, lời cảm ơn và danh mục tài liệu tham khảo quá dài để không làm loãng vector ngữ nghĩa.

---

## SLIDE 9: GIAI ĐOẠN 3 – DATA INTEGRATION (TÍCH HỢP ĐA NGUỒN)
*Theo bài giảng Chương 2: Data Integration*

* **Thực trạng**: 3 nguồn có định dạng hoàn toàn khác nhau (ArXiv là XML/Atom, OpenReview là JSON lồng nhau nhiều cấp, CVF là cây HTML DOM).
* **Giải pháp trong code**: Module `SilverLakehouseWriter` (`src/transformation/silver_writer.py`) hợp nhất toàn bộ về một **Canonical Schema** duy nhất trong tệp Parquet:
  * `paper_id`: Khóa định danh duy nhất (ArXiv ID hoặc OpenReview ID hoặc CVF Hash).
  * `source`: Nguồn gốc (`arxiv`, `openreview`, `cvf`).
  * `tier`: Phân loại tầng dữ liệu (`tier1`, `tier2`, `tier3`).
  * `title`, `abstract`, `clean_full_text`: Nội dung văn bản đã làm sạch.
  * `authors`, `primary_category`, `published_date`: Thuộc tính phân loại.
  * `peer_review_metadata`: Điểm rating và phản biện (đối với nguồn OpenReview).
* **Hợp nhất liên nguồn**: Ghép nối bài xuất hiện ở cả ArXiv và CVPR/ICCV thành một thực thể thống nhất.

---

## SLIDE 10: GIAI ĐOẠN 4 – TRANSFORMATION (CHUYỂN ĐỔI & RỜI RẠC HÓA)
*Theo bài giảng Chương 2: Transformation*

* **Kỹ thuật Rời rạc hóa (Discretization / Section Chunking)**:
  * Triển khai tại `AcademicChunker` (`src/indexing/chunker.py`).
  * Thay vì cắt ngẫu nhiên theo số từ, chunker nhận diện ranh giới mục học thuật:
    * *Abstract*, *Introduction*, *Methodology / Approach*, *Experiments / Results*, *Conclusion*.
  * Cấu hình tham số: `max_chunk_words = 300`, `overlap_words = 50`.
* **Làm giàu ngữ cảnh (Contextual Enrichment)**:
  * Để tránh tình trạng đoạn văn bị mất ngữ cảnh khi đứng độc lập trong Vector DB, chunker tự động chèn tiền tố metadata vào đầu mỗi đoạn:
    ```
    [Title: {title}] [Authors: {authors}] [Venue/Source: {source}] [Section: {section_name}]
    {Nội dung chi tiết của đoạn chunk}
    ```

---

## SLIDE 11: GIAI ĐOẠN 5 – ENCODING (MÃ HÓA VECTOR TRONG CODE)
*Theo bài giảng Chương 2: Encoding & Chương 4*

* **Mô hình mã hóa: `NomicEmbedder` (`src/indexing/embedder.py`)**:
  * Sử dụng model `nomic-ai/nomic-embed-text-v1.5`.
  * Không gian biểu diễn: **768 chiều (768-dimensional dense vector)**.
  * Hỗ trợ cửa sổ ngữ cảnh cực dài (lên tới 8,192 tokens), tối ưu cho báo cáo khoa học.
  * Tự động điều hướng thiết bị: Chạy tối ưu trên Apple Silicon (MPS), NVIDIA CUDA hoặc CPU.
* **Lưu trữ vào Vector Lakehouse (`LanceDBManager` tại `src/indexing/lancedb_manager.py`)**:
  * Bảng dữ liệu: `scientific_papers_gold`.
  * Lưu trữ kết hợp: Vector 768 chiều + Toàn bộ metadata (paper_id, title, section, source, tier, chunk_text).
  * Xây dựng chỉ mục Approximate Nearest Neighbor (ANN) phục vụ tìm kiếm tương đồng Cosine cực nhanh.

---

## SLIDE 12: GIAI ĐOẠN 6 – DATA MINING (THEO CHƯƠNG 4: PROCESSING)
*Triển khai trọn vẹn 4 trụ cột phân tích trong `src/mining/`*:

* **Trụ cột 1: Khai phá luật kết hợp (`AssociationRuleMiner` - `src/mining/association_rules.py`)**:
  * Áp dụng thuật toán **FP-Growth** trên các nhóm danh mục và từ khóa khoa học.
  * Tính toán các độ đo: Support ($minsup$), Confidence ($minconf$), Lift. Tìm ra các luật như: *{Computer Vision, Deep Learning} $\rightarrow$ {Diffusion Models}*.
* **Trụ cột 2: Phân cụm ngữ nghĩa & Mô hình hỗn hợp Gauss (`SemanticClusterAnalyzer` & `eda_engine.py`)**:
  * Áp dụng **Gaussian Mixture Models (GMM)** cho chẩn đoán đa biến với ma trận hiệp phương sai đầy đủ (*full covariance*), xác định xác suất mềm (*soft clustering*) thuộc 4 archetype bài báo học thuật.
  * Kết hợp **K-Means** và **DBSCAN** trên không gian vector nhúng 768 chiều.
  * Đánh giá chất lượng cụm bằng **Silhouette Score**, Davies-Bouldin, Calinski-Harabasz.
  * Trực quan hóa hình học cụm qua **Ellipse độ tin cậy 1.5-sigma** và chiếu giảm chiều **PCA** trên Dashboard.
* **Trụ cột 3: Khai phá đồ thị tri thức (`ScientificGraphMiner` - `src/mining/graph_mining.py`)**:
  * Xây dựng mạng lưới đồng tác giả / trích dẫn khoa học.
  * Tính toán chỉ số **PageRank** để tìm ra các tác giả hoặc công trình có tầm ảnh hưởng lớn nhất.
* **Trụ cột 4: Phát hiện bất thường & Dự báo xu hướng (`TrendAnomalyMiner` - `src/mining/trend_anomaly_mining.py`)**:
  * Dùng **Isolation Forest** phát hiện các bài báo có cấu trúc dị biệt (quá nhiều công thức, bài viết bất thường).
  * Phân tích tốc độ tăng trưởng (*trend velocity*) của các hướng nghiên cứu mới.

---

## SLIDE 13: GIAI ĐOẠN 7 – SERVING: HỆ THỐNG SCIENTIFIC RAG
*Code triển khai: `src/rag/rag_engine.py` và `src/rag/llm_client.py`*

* **Quy trình hoạt động thời gian thực**:
  1. **User Query**: Người dùng nhập câu hỏi nghiên cứu (ví dụ: *"So sánh hiệu năng kiến trúc Mamba và Transformer trong xử lý chuỗi"*).
  2. **Vector Search**: `NomicEmbedder` mã hóa câu hỏi $\rightarrow$ `LanceDBManager` truy vấn top-k chunks liên quan nhất bằng độ tương đồng Cosine.
  3. **Context Injection**: Ghép nối các đoạn trích dẫn khoa học kèm metadata tác giả, hội nghị vào prompt template.
  4. **LLM Generation**: Mô hình cục bộ **Qwen2.5-7B-Instruct (GGUF Q4_K_M)** tổng hợp câu trả lời khoa học chính xác, đi kèm trích dẫn nguồn bài báo (*Citation Grounding*).

---

## SLIDE 14: ĐÁNH GIÁ KẾT QUẢ (EVALUATION - THEO BÀI GIẢNG & BENCHMARK)
*Code triển khai: `benchmarks/metrics/rag_metrics.py`*

* **1. Đánh giá Khai phá dữ liệu (Data Mining Evaluation)**:
  * Đánh giá cụm K-Means bằng chỉ số Silhouette Score chứng minh các nhóm bài báo tách biệt rõ rệt theo chuyên ngành.
  * Các luật kết hợp khai phá bởi FP-Growth có độ tin cậy ($confidence$) và $lift > 1.5$.
* **2. Đánh giá chất lượng RAG (RAG Triad Metrics)**:
  * **Context Relevance**: Độ chính xác của các đoạn chunk được lấy ra từ LanceDB so với câu hỏi.
  * **Faithfulness (Độ trung thực)**: Đảm bảo câu trả lời của LLM bám sát 100% tài liệu được trích xuất, không bị ảo giác bịa đặt số liệu.
  * **Answer Relevance**: Câu trả lời giải quyết trúng đích nhu cầu của người hỏi.
* **3. Hiệu năng thực thi**:
  * Hệ thống chạy offline hoàn toàn trên máy cục bộ, không phụ thuộc API trả phí ngoài, độ trễ truy xuất vector chỉ tính bằng mili-giây.

---

## SLIDE 15: TỔNG KẾT BÀI TẬP LỚN
* **Những việc Nhóm 1 đã hoàn thành**:
  1. Xây dựng hoàn chỉnh luồng cào dữ liệu tự động cho **cả 3 nguồn chiến lược**: ArXiv (API), OpenReview (API + Reviews) và CVF (BeautifulSoup scraping).
  2. Thiết kế hệ thống dữ liệu theo mô hình **Medallion Lakehouse** (Bronze $\rightarrow$ Silver $\rightarrow$ Gold) và chiến lược **3 Tầng thời gian (3-Tier)**.
  3. Hiện thực hóa trọn vẹn các kỹ thuật môn học: Làm sạch dữ liệu, khử trùng SHA-256, rời rạc hóa Section Chunking, mã hóa Vector 768 chiều.
  4. Triển khai cả 4 trụ cột Khai phá dữ liệu (Chương 4): FP-Growth, K-Means/DBSCAN, PageRank Graph, Isolation Forest.
  5. Đóng gói thành công ứng dụng **RAG phục vụ hỏi đáp bài báo khoa học thời gian thực**.
* **Phần Q&A**: Nhóm 1 sẵn sàng trả lời câu hỏi của Thầy Cô và trình diễn demo chương trình!
