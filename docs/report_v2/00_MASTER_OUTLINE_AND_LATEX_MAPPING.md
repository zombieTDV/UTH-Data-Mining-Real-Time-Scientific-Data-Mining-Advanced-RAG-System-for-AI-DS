# 00 — Đề Cương Tổng Thể & Ma Trận Ánh Xạ LaTeX (Master Outline & LaTeX Mapping)

- **Motivation/Background**: Phiên bản báo cáo hợp nhất (`report_v2`) tái cấu trúc toàn bộ tài liệu kỹ thuật của hệ thống UTH Scientific Data Mining & Advanced RAG theo trình tự pipeline KDD hiện đại (*Pipeline-First*: Bài toán $\rightarrow$ Kỹ thuật dữ liệu $\rightarrow$ EDA $\rightarrow$ Khai phá & RAG $\rightarrow$ Đánh giá $\rightarrow$ Triển khai $\rightarrow$ Kết luận), đồng bộ hóa hoàn toàn từ mã nguồn thực tế tới kho chứng cứ thực nghiệm tháng 10–11/2026 (`71,927` bài báo Silver, `1,043,594` vector Qdrant, kiến trúc tách payload `ChunkStore` D-058 và benchmark Laya/PageRank/Evidence Gate).
- **Purpose**: Cung cấp bản thiết kế tổng thể cho bộ báo cáo kỹ thuật mô-đun (`00` đến `07`), bao gồm siêu dữ liệu đề tài UTH, bản thảo Tóm tắt chuẩn học thuật, ma trận ánh xạ 1:1 sang mã nguồn LaTeX, ma trận truy vết snapshot chứng cứ và quy chuẩn đánh số hình/bảng/công thức xuyên suốt toàn đồ án.
- **Overview Pipeline**: Kiểm toán mã nguồn & artifact thực nghiệm $\rightarrow$ Chuẩn hóa cấu trúc 7 chương KDD $\rightarrow$ Lập ma trận ánh xạ tới [main.tex](../../data-mining-latek/main.tex) và [UTH_THESIS_FORMAT_RULES.md](../../data-mining-latek/UTH_THESIS_FORMAT_RULES.md) $\rightarrow$ Đồng bộ hóa số liệu theo từng mốc snapshot độc lập.
- **Detailed Plan**: §1 Siêu dữ liệu Dự án & Phân công Nhóm; §2 Bản thảo Tóm tắt Học thuật (Cập nhật); §3 Đề cương 7 Chương Theo Trình tự Pipeline KDD; §4 Ma trận Ánh xạ 1:1 (`docs/report_v2/*.md` $\leftrightarrow$ `data-mining-latek/sections/*.tex`); §5 Ma trận Truy vết Mốc Dữ liệu (Snapshot Provenance Matrix); §6 Quy chuẩn Đánh số Hình vẽ, Bảng biểu & Công thức.
- **References**: [metadata.tex](../../data-mining-latek/config/metadata.tex), [00_team_members.tex](../../data-mining-latek/sections/00_team_members.tex), [01_abstract.tex](../../data-mining-latek/sections/01_abstract.tex), [main.tex](../../data-mining-latek/main.tex), [UTH_THESIS_FORMAT_RULES.md](../../data-mining-latek/UTH_THESIS_FORMAT_RULES.md), [MD_CONVENTION.md](../../agents/rules/MD_CONVENTION.md), [RESULTS_REPORTING.md](../../agents/rules/RESULTS_REPORTING.md), [laya_pagerank_benchmark_report.md](../benchmarks/laya_pagerank_benchmark_report.md), [PERFORMANCE_BENCHMARK_REPORT.md](../benchmarks/PERFORMANCE_BENCHMARK_REPORT.md), [RAG_EVALUATION_REPORT_21_SAMPLES.md](../benchmarks/RAG_EVALUATION_REPORT_21_SAMPLES.md), [RAG_EVALUATION_REPORT_768D_COMPARISON.md](../benchmarks/RAG_EVALUATION_REPORT_768D_COMPARISON.md), [laya_ab_final_benchmark.json](../../logs/benchmarks/laya_ab_final_benchmark.json), [vector_final_benchmark.json](../../logs/benchmarks/vector_final_benchmark.json).
- **Created**: 2026-11-25T12:55:00+07:00
- **Last Updated**: 2026-11-25T12:55:00+07:00

[STATUS: ACTIVE]

---

## Mục Lục

- [1. Siêu Dữ Liệu Dự Án & Bảng Phân Công Thành Viên](#1-siêu-dữ-liệu-dự-án--bảng-phân-công-thành-viên)
- [2. Bản Thảo Tóm Tắt Học Thuật (Vietnamese Abstract Draft)](#2-bản-thảo-tóm-tắt-học-thuật-vietnamese-abstract-draft)
- [3. Đề Cương Chi Tiết 7 Chương Theo Trình Tự Pipeline KDD](#3-đề-cương-chi-tiết-7-chương-theo-trình-tự-pipeline-kdd)
- [4. Ma Trận Ánh Xạ 1:1 Sang Hệ Thống LaTeX UTH](#4-ma-trận-ánh-xạ-11-sang-hệ-thống-latex-uth)
- [5. Ma Trận Truy Vết Mốc Dữ Liệu (Snapshot Provenance Matrix)](#5-ma-trận-truy-vết-mốc-dữ-liệu-snapshot-provenance-matrix)
- [6. Quy Chuẩn Đánh Số Hình Vẽ, Bảng Biểu & Công Thức](#6-quy-chuẩn-đánh-số-hình-vẽ-bảng-biểu--công-thức)

---

## 1. Siêu Dữ Liệu Dự Án & Bảng Phân Công Thành Viên

Thông tin hành chính dưới đây được đồng bộ trực tiếp từ [metadata.tex](../../data-mining-latek/config/metadata.tex), [00_cover.tex](../../data-mining-latek/sections/00_cover.tex) và [00_team_members.tex](../../data-mining-latek/sections/00_team_members.tex) để bảo đảm tính nhất quán tuyệt đối khi kết xuất PDF bằng XeLaTeX/Tectonic theo [UTH_THESIS_FORMAT_RULES.md](../../data-mining-latek/UTH_THESIS_FORMAT_RULES.md):

| Thuộc tính | Giá trị chuẩn hóa UTH |
| :--- | :--- |
| **Cơ sở đào tạo** | Trường Đại học Giao thông Vận tải TP. Hồ Chí Minh (UTH) |
| **Đơn vị chuyên môn** | Viện Công nghệ Thông tin và Điện, Điện tử |
| **Loại tài liệu** | Báo cáo Bài tập lớn — Môn học: Khai thác Dữ liệu |
| **Tên đề tài** | KHAI THÁC DỮ LIỆU NGHIÊN CỨU KHOA HỌC THỜI GIAN THỰC VÀ HỆ THỐNG TRUY XUẤT TRI THỨC TĂNG CƯỜNG (RAG) CHO MIỀN AI/DS |
| **Giảng viên hướng dẫn** | TS. Trần Thế Vinh |
| **Nhóm thực hiện** | Nhóm 1 (07 thành viên) |
| **Địa điểm & Thời gian** | TP. Hồ Chí Minh, ngày 25 tháng 11 năm 2026 |
| **Kho mã nguồn** | `https://github.com/zombieTDV/UTH-Data-Mining-Real-Time-Scientific-Data-Mining-Advanced-RAG-System-for-AI-DS` |

> **5W1H — Danh sách Phân công Nhiệm vụ Thành viên Nhóm 1**
> - **What**: Bảng định danh 7 sinh viên, chuyên ngành đào tạo và tỷ lệ đóng góp chính thức cho đồ án.
> - **Why**: Ghi nhận minh bạch trách nhiệm thực hiện theo quy định trình bày trang đầu (Front Matter) của UTH.
> - **When**: Chốt phiên bản nộp báo cáo ngày 25/11/2026.
> - **Where**: Trích xuất nguyên văn từ [00_team_members.tex](../../data-mining-latek/sections/00_team_members.tex).
> - **Who**: Nhóm 1 thực hiện dưới sự hướng dẫn của TS. Trần Thế Vinh.
> - **How**: Đối chiếu từng MSSV, họ tên, chuyên ngành và phần trăm tham gia theo hồ sơ nhóm.

**Bảng 0.1: Phân công thành viên thực hiện đồ án (Nhóm 1)**

| STT | MSSV | Họ và Tên | Chuyên ngành | Mức độ tham gia |
| :---: | :---: | :--- | :--- | :---: |
| 1 | `067206006852` | Nhữ Phạm Quang Mạnh | Data Science | 100% |
| 2 | `056206009261` | Trương Đỗ Vương | Data Science | 100% |
| 3 | `056206005447` | Lê Huỳnh Anh Khôi | Data Science | 100% |
| 4 | `052206007980` | Võ Anh Nhật | Data Science and AI | 100% |
| 5 | `079204034414` | Lê Hoàng Tuấn | Data Science and AI | 100% |
| 6 | `075206015931` | Tống Minh Quân | Data Science and AI | 100% |
| 7 | `038207000074` | Nguyễn Quốc Anh | Smart Logistics | 0% |

*Nguồn: [00_team_members.tex](../../data-mining-latek/sections/00_team_members.tex).*

---

## 2. Bản Thảo Tóm Tắt Học Thuật (Vietnamese Abstract Draft)

Bản thảo tóm tắt dưới đây cập nhật đầy đủ quy mô sản xuất (`71,927` bài báo, `1,043,594` vector), kiến trúc thủy hóa `ChunkStore` (`D-058`), kết quả khai phá 4 trụ cột và chuỗi thực nghiệm truy xuất/kiểm soát ảo giác mới nhất, sẵn sàng đưa vào [01_abstract.tex](../../data-mining-latek/sections/01_abstract.tex):

> **TÓM TẮT**
>
> Đồ án thiết kế và triển khai hoàn chỉnh một hệ thống **Khai thác Dữ liệu Nghiên cứu Khoa học Thời gian thực và Hỏi đáp Tăng cường Truy xuất (RAG)** dành riêng cho miền Trí tuệ Nhân tạo và Khoa học Dữ liệu (AI/DS). Hệ thống giải quyết đồng thời ba bài toán kỹ thuật cốt lõi: (i) thu thập liên tục và khử trùng lặp đa nguồn theo ngân sách lưu trữ hữu hạn (`20 GB`); (ii) bóc tách có cấu trúc tài liệu học thuật bảo toàn biểu thức toán LaTeX và tách bạch vòng đời văn bản khỏi chỉ mục vector; và (iii) tích hợp đa góc nhìn khai phá dữ liệu (luật kết hợp, phân cụm ngữ nghĩa, đồ thị mạng lưới, phát hiện dị biệt xu hướng) cùng tầng truy xuất lai có cơ chế từ chối câu hỏi thiếu chứng cứ.
>
> Về kiến trúc hạ tầng, đường ống xử lý tuân theo mô hình **Medallion Lakehouse (Bronze–Silver–Gold)** kết hợp điều phối **Apache Airflow 2.10** (3 tầng thu thập: Tier 1 arXiv RSS lúc 19:00 ICT, Tier 2 luân phiên CVF/arXiv OAI-PMH theo thuật toán *Water-Filling* lúc 19:10 ICT, Tier 3 Semantic Scholar thủ công) và hàng đợi **RabbitMQ tách hai pha** (`--stage fetch` / `--stage embed`) có cơ chế *backpressure* và *Dead Letter Queue*. Theo quyết định kiến trúc `D-058`, cơ sở dữ liệu vector **Qdrant HNSW** (`768-D`, `nomic-embed-text-v1.5`, cửa sổ `2,048` tokens) chỉ lưu trữ vector cùng `5` trường định danh/lọc tối thiểu, trong khi toàn văn các phân đoạn được nén ZSTD theo nhóm dòng (`ROW_GROUP_SIZE=512`) trong `ChunkStore` (`silver/chunks/`) trên MinIO S3 và thủy hóa tức thời bằng phép đọc dải byte song song (*S3 Byte-Range Read*). Phân đoạn văn bản được chuẩn hóa bởi `AcademicChunker` cân bằng độ dài cửa sổ với độ gối đầu tỷ lệ `15%`, bám ranh giới câu và gộp đuôi ngắn.
>
> Ở phiên vận hành quy mô lớn ngày 04/11/2026 (`logs/run/backend.log`), hồ dữ liệu đạt **71,927 bài báo phân biệt** trong tầng Silver và **1,043,594 vector** trong Qdrant; bộ máy khai phá 4 trụ cột hoàn thành toàn bộ EDA và mô hình hóa trong **234.57 giây**, bao gồm **61,319 giao dịch hợp lệ** (tìm được **45 luật kết hợp khử đối xứng**, *top lift* **34.940**), phân cụm **PCA 2D + GMM** trên **70,539 vector bài báo** (BIC `246,306.5`, Silhouette `0.0490`), mạng lưới đồng tác giả **PageRank / Louvain**, và **Isolation Forest** gắn nhãn **1,000 bài báo dị biệt cấu trúc** trên **48 nhánh xu hướng**. Các chuỗi đánh giá thực nghiệm bổ sung ngày 06–09/11/2026 chứng minh hiệu quả định lượng rõ rệt: chiến lược phân đoạn `B_new_pct15` nâng phân vị $p_{10}$ từ `103` lên `166` từ và `Recall@5` lên **0.7679**; bộ đánh giá *5-Scenario Hydrated* (`N=120`) xác nhận tổ hợp `Vector + Laya (RRF) + PageRank` đạt **MRR 0.6076** và **Hit@1 55.0%**; thử nghiệm Retrieval v1 (`100` câu có đáp án + `50` câu không có đáp án) với `laya_ft1_hybrid` đạt **MRR@10 0.824**, **nDCG@10 0.850** và **Evidence Gate AUROC 0.986** (chặn chính xác `50/50` câu ngoài phạm vi); và đối chuẩn 3 bên trên `150` mẫu xác nhận Laya mới đạt **MRR 0.8939**, **Hit@5 98.0%** và **Faithfulness 0.7977**. Về mặt phần cứng, đo lường trên NVIDIA RTX 4060/CUDA ngày 19/10/2026 đạt **TTFT 609.8 ms**, tốc độ sinh **46.33 tokens/s** và mức VRAM đỉnh **5.7 GB / 8.0 GB**.
>
> **Từ khóa:** Khai thác Dữ liệu, AI/DS, Medallion Lakehouse, ChunkStore, Qdrant, RAG, Cross-Encoder, Evidence Gate, FP-Growth, GMM, PageRank, Isolation Forest.

---

## 3. Đề Cương Chi Tiết 7 Chương Theo Trình Tự Pipeline KDD

Bộ báo cáo `docs/report_v2/` tổ chức nội dung theo luồng **Pipeline-First KDD** (từ thu thập $\rightarrow$ tích hợp $\rightarrow$ làm sạch $\rightarrow$ chuyển đổi/chỉ mục $\rightarrow$ khám phá EDA $\rightarrow$ mô hình hóa khai phá & RAG $\rightarrow$ đánh giá $\rightarrow$ triển khai), tách các giai đoạn kỹ thuật nặng thành các mô-đun độc lập (`02a`–`02d`, `04a`–`04b`) nhằm bảo đảm độ sâu toán học và khả năng ánh xạ từng tệp vào LaTeX:

| Mã tệp (`docs/report_v2/`) | Tên Chương / Mô-đun | Nội dung trọng tâm |
| :--- | :--- | :--- |
| [00_MASTER_OUTLINE_AND_LATEX_MAPPING.md](./00_MASTER_OUTLINE_AND_LATEX_MAPPING.md) | Đề cương Tổng thể & Ánh xạ LaTeX | Siêu dữ liệu UTH, Tóm tắt cập nhật, Đề cương KDD 7 chương, Bảng ánh xạ LaTeX, Ma trận snapshot, Quy chuẩn đánh số |
| [01_CH1_TONG_QUAN_VA_BAI_TOAN.md](./01_CH1_TONG_QUAN_VA_BAI_TOAN.md) | **Chương 1**: Hiểu Bài toán & Kiến trúc Tổng thể | Bối cảnh phân tán tri thức AI/DS, Sơ đồ Medallion + RAG tổng thể, 5 đóng góp kỹ thuật, Ma trận KPI, Phạm vi & Trade-offs |
| [02a_CH2_THU_THAP_DU_LIEU_COLLECT.md](./02a_CH2_THU_THAP_DU_LIEU_COLLECT.md) | **Chương 2 (Phần A)**: Thu thập Dữ liệu Đa tầng (*Collect*) | Điều phối Airflow 3 tầng (RSS, CVF/OAI-PMH, Semantic Scholar), Toán học *Water-Filling* & *Credit Pacing*, Ngân sách 20 GB, MD5 Hash-Modulo Sharding |
| [02b_CH2_TICH_HOP_VA_DIEU_PHOI_INTEGRATE.md](./02b_CH2_TICH_HOP_VA_DIEU_PHOI_INTEGRATE.md) | **Chương 2 (Phần B)**: Tích hợp & Điều phối (*Integrate*) | Hợp nhất 23 trường Arrow Silver Schema, Lá chắn Khử trùng lặp 2 tầng (`paper_id` + SHA-256 `abstract_hash`), Hàng đợi RabbitMQ tách pha (`fetch`/`embed`), Backpressure, DLQ & Toàn vẹn tham chiếu |
| [02c_CH2_LAM_SACH_VA_BOC_TACH_CLEAN.md](./02c_CH2_LAM_SACH_VA_BOC_TACH_CLEAN.md) | **Chương 2 (Phần C)**: Làm sạch & Bóc tách Học thuật (*Clean*) | Thác nước HTML-First (`UnifiedContentResolver`), Bóc tách DOM/LaTeX (`AcademicHTMLParser`, 9 loại section), PyMuPDF Tier-3 fallback, Diệt Surrogate `BUG-01` & Quality Gates |
| [02d_CH2_CHUYEN_DOI_PHAN_MANH_VA_CHI_MUC_TRANSFORM.md](./02d_CH2_CHUYEN_DOI_PHAN_MANH_VA_CHI_MUC_TRANSFORM.md) | **Chương 2 (Phần D)**: Chuyển đổi, Phân mảnh & Chỉ mục (*Transform & Index*) | Zero-Local-Disk ZSTD Parquet & Compaction LSM, Thiết kế `ChunkStore` S3 Byte-Range (`D-058`), Toán học phân mảnh `AcademicChunker`, Nhúng `NomicEmbedder` 768-D & Qdrant HNSW, Feature Engineering |
| `03_CH3_PHAN_TICH_KHAM_PHA_EDA.md` | **Chương 3**: Phân tích Khám phá Dữ liệu (*EDA*) | Thống kê DuckDB S3 kép (Macro/Micro), Phân bố 71,927 bài & snapshot 10k/13k, Chẩn đoán 3 lăng kính (Skewness/Kurtosis/D'Agostino $K^2$, Mutual Information, Splines), Governance Rules |
| `04a_CH4_BON_TRU_COT_KHAI_PHA_DU_LIEU.md` | **Chương 4 (Phần A)**: Bốn Trụ cột Khai phá Dữ liệu | Trụ cột 1 (FP-Growth 61,319 tx), Trụ cột 2 (KMeans/Centered PCA/GMM/DBSCAN trên 70,539 vec), Trụ cột 3 (PageRank/Louvain trọng số phân số), Trụ cột 4 ($\Delta\text{Share}$ Momentum & Isolation Forest $\log(1+x)$) |
| `04b_CH4_KIEN_TRUC_HYBRID_RAG_VA_RERANKING.md` | **Chương 4 (Phần B)**: Kiến trúc Hybrid RAG & Reranking | Truy xuất đa nhánh (ID/Title/Vector + Hydrate `ChunkStore`), Lexical Scorer, RRF ($k=60$), PageRank Authority Multiplier, Cross-Encoder & Laya `soft-ce` + Evidence Gate, Prompt Guardrails |
| `05_CH5_DANH_GIA_THUC_NGHIEM_VA_BENCHMARK.md` | **Chương 5**: Đánh giá Thực nghiệm & Benchmark | Tổng hợp định lượng 5 chuỗi thí nghiệm (`EXP_01`–`EXP_05`), Mining 72k (234.57s), Chunking A/B, 5-Scenario Hydrated (`N=120`), Retrieval v1 + Evidence Gate (AUROC 0.986), 3-Way 150-Sample, DeepEval & RTX 4060 Hardware Telemetry |
| `06_CH6_TRIEN_KHAI_BAO_MAT_VA_VAN_HANH.md` | **Chương 6**: Triển khai, Bảo mật & Vận hành | Microservices Docker/FastAPI/React 19/SSE, Zero-Trust Cloudflare Tunnel (MinIO `student_readonly`, Qdrant Read-Only Key), SOP khởi chạy, Healthcheck & Khắc phục sự cố/Migration |
| `07_CH7_KET_LUAN_VA_PHU_LUC.md` | **Chương 7**: Kết luận, Giới hạn & Phụ lục | Đối chiếu mục tiêu vs kết quả thực tế, Giới hạn học thuật (skew thời gian, tái lập DeepEval trên Qdrant), Hướng phát triển, Traceability & Key Code Listings |

---

## 4. Ma Trận Ánh Xạ 1:1 Sang Hệ Thống LaTeX UTH

Khi chuyển đổi từ tập tài liệu Markdown `docs/report_v2/` sang cây biên dịch LaTeX trong `data-mining-latek/`, cần lưu ý sự thay đổi thứ tự giữa hai mô hình trình bày: cấu trúc LaTeX hiện hành (`f421707`) đặt Chương 2 là *Hiểu dữ liệu & EDA* ([03_data_understanding.tex](../../data-mining-latek/sections/03_data_understanding.tex)) và Chương 3 là *Chuẩn bị dữ liệu* ([04_data_preparation.tex](../../data-mining-latek/sections/04_data_preparation.tex)), trong khi `report_v2` áp dụng **Pipeline-First KDD** đưa toàn bộ Chuẩn bị Dữ liệu (`02a`–`02d`) lên **Chương 2** và **EDA** sang **Chương 3**. Bảng 0.2 xác lập ánh xạ 1:1 cho lần biên tập LaTeX kế tiếp:

> **5W1H — Ma trận Ánh xạ Mô-đun Markdown sang Tệp LaTeX**
> - **What**: Bảng ánh xạ 1:1 giữa 12 tệp mô-đun trong `docs/report_v2/` (cùng 5 báo cáo thí nghiệm `docs/experiments/`) với các tệp `.tex` trong `data-mining-latek/`.
> - **Why**: Bảo đảm không thất lạc nội dung khi ghép các phần mô-đun (`02a`–`02d`, `04a`–`04b`) vào các tệp chương LaTeX tương ứng và cập nhật thứ tự `\input{...}` trong [main.tex](../../data-mining-latek/main.tex).
> - **When**: Thiết lập đồng bộ ngày 25/11/2026 dựa trên cấu trúc tệp tại commit `f421707` và `aae74de`.
> - **Where**: Liên kết trực tiếp tới cây thư mục `data-mining-latek/sections/`, `data-mining-latek/tables/` và `data-mining-latek/listings/`.
> - **Who**: Nhóm 1 sử dụng cho quy trình biên soạn và tổng hợp PDF bằng XeLaTeX/Tectonic.
> - **How**: Đối chiếu từng tệp nguồn `.md` với tệp đích `.tex` và liệt kê các tệp bảng/mã phụ thuộc.

**Bảng 0.2: Ma trận ánh xạ 1:1 từ `docs/report_v2/` sang `data-mining-latek/`**

| Tệp Markdown Nguồn (`docs/report_v2/` & `docs/experiments/`) | Tệp LaTeX Đích (`data-mining-latek/`) | Tài nguyên LaTeX Phụ thuộc (`tables/`, `figures/`, `listings/`) | Ghi chú chuyển đổi |
| :--- | :--- | :--- | :--- |
| [00_MASTER_OUTLINE_AND_LATEX_MAPPING.md](./00_MASTER_OUTLINE_AND_LATEX_MAPPING.md) | [00_cover.tex](../../data-mining-latek/sections/00_cover.tex), [00_team_members.tex](../../data-mining-latek/sections/00_team_members.tex), [01_abstract.tex](../../data-mining-latek/sections/01_abstract.tex), [main.tex](../../data-mining-latek/main.tex) | [metadata.tex](../../data-mining-latek/config/metadata.tex), [preamble.tex](../../data-mining-latek/config/preamble.tex) | Cập nhật Tóm tắt 71,927 bài & thứ tự `\input` Ch.2 $\leftrightarrow$ Ch.3 trong [main.tex](../../data-mining-latek/main.tex) |
| [01_CH1_TONG_QUAN_VA_BAI_TOAN.md](./01_CH1_TONG_QUAN_VA_BAI_TOAN.md) | [02_business_understanding.tex](../../data-mining-latek/sections/02_business_understanding.tex) | [table_kpi.tex](../../data-mining-latek/tables/table_kpi.tex), [diagrams.tex](../../data-mining-latek/figures/diagrams.tex) | Chuyển Mermaid kiến trúc tổng thể sang `\DrawSystemArchitecture`; cập nhật KPI mới |
| [02a_CH2_THU_THAP_DU_LIEU_COLLECT.md](./02a_CH2_THU_THAP_DU_LIEU_COLLECT.md) + [02b](./02b_CH2_TICH_HOP_VA_DIEU_PHOI_INTEGRATE.md) + [02c](./02c_CH2_LAM_SACH_VA_BOC_TACH_CLEAN.md) + [02d](./02d_CH2_CHUYEN_DOI_PHAN_MANH_VA_CHI_MUC_TRANSFORM.md) | [04_data_preparation.tex](../../data-mining-latek/sections/04_data_preparation.tex) | [02_bronze_raw_metadata.png](../../data-mining-latek/figures/captured_20261123_082337/02_bronze_raw_metadata.png), [qdrant_payload_hydrate.py](../../data-mining-latek/listings/qdrant_payload_hydrate.py), [silver_before_vector.py](../../data-mining-latek/listings/silver_before_vector.py) | Hợp nhất 4 mô-đun thành **Chương 2 (Chuẩn bị Dữ liệu)**; dùng chú thích ASCII trong `lstlisting` |
| `03_CH3_PHAN_TICH_KHAM_PHA_EDA.md` | [03_data_understanding.tex](../../data-mining-latek/sections/03_data_understanding.tex) | [table_eda_categories.tex](../../data-mining-latek/tables/table_eda_categories.tex), [table_snapshot_sources.tex](../../data-mining-latek/tables/table_snapshot_sources.tex), [03_eda_silver_overview.png](../../data-mining-latek/figures/captured_20261123_082337/03_eda_silver_overview.png), [04_pearson_correlation.png](../../data-mining-latek/figures/captured_20261123_082337/04_pearson_correlation.png), [05_spearman_correlation.png](../../data-mining-latek/figures/captured_20261123_082337/05_spearman_correlation.png) | Đặt làm **Chương 3 (Hiểu Dữ liệu & EDA)** ngay sau khi xây dựng xong Silver/Gold |
| `04a_CH4_BON_TRU_COT_KHAI_PHA_DU_LIEU.md` + `04b_CH4_KIEN_TRUC_HYBRID_RAG_VA_RERANKING.md` | [05_modeling.tex](../../data-mining-latek/sections/05_modeling.tex) | [table_association_rules.tex](../../data-mining-latek/tables/table_association_rules.tex), [table_clustering_metrics.tex](../../data-mining-latek/tables/table_clustering_metrics.tex), [table_graph_influencers.tex](../../data-mining-latek/tables/table_graph_influencers.tex), [table_anomalies.tex](../../data-mining-latek/tables/table_anomalies.tex), [table_hyperparameters.tex](../../data-mining-latek/tables/table_hyperparameters.tex), [06_gmm_clusters.png](../../data-mining-latek/figures/captured_20261123_082337/06_gmm_clusters.png), `\DrawRagPipelineDiagram` | Hợp nhất 2 mô-đun thành **Chương 4 (Mô hình Khai phá & Hệ thống RAG)** |
| `05_CH5_DANH_GIA_THUC_NGHIEM_VA_BENCHMARK.md` + `docs/experiments/EXP_01..EXP_05` | [06_evaluation.tex](../../data-mining-latek/sections/06_evaluation.tex) | [table_rag_benchmark.tex](../../data-mining-latek/tables/table_rag_benchmark.tex), [table_latency_profile.tex](../../data-mining-latek/tables/table_latency_profile.tex), [table_chunking_ab.tex](../../data-mining-latek/tables/table_chunking_ab.tex), [table_retrieval_v1.tex](../../data-mining-latek/tables/table_retrieval_v1.tex), [table_snapshot_sources.tex](../../data-mining-latek/tables/table_snapshot_sources.tex) | Bổ sung bảng 5-Scenario `N=120` và bảng 3 bên `150` mẫu từ `EXP_04`/`EXP_05` |
| `06_CH6_TRIEN_KHAI_BAO_MAT_VA_VAN_HANH.md` | [07_deployment.tex](../../data-mining-latek/sections/07_deployment.tex) | [01_pipeline_ui.png](../../data-mining-latek/figures/captured_20261123_082337/01_pipeline_ui.png), `\DrawSystemArchitecture` | Đồng bộ danh sách DAGs, RabbitMQ 2 pha, Zero-Trust Cloudflare Tunnel |
| `07_CH7_KET_LUAN_VA_PHU_LUC.md` | [08_conclusion.tex](../../data-mining-latek/sections/08_conclusion.tex), [09_appendix.tex](../../data-mining-latek/sections/09_appendix.tex) | [07_gold_mining_manifest.png](../../data-mining-latek/figures/captured_20261123_082337/07_gold_mining_manifest.png), [references.bib](../../data-mining-latek/references.bib) | Giữ nguyên bảng đối chiếu truy vết, trích đoạn code ASCII và phụ lục |

---

## 5. Ma Trận Truy Vết Mốc Dữ Liệu (Snapshot Provenance Matrix)

Hệ thống phát triển qua nhiều giai đoạn mở rộng hạ tầng (từ LanceDB/Cloudflare R2 lên MinIO/Qdrant/ChunkStore). Nhằm tuân thủ quy chuẩn liêm chính học thuật tại Mục 10 của [UTH_THESIS_FORMAT_RULES.md](../../data-mining-latek/UTH_THESIS_FORMAT_RULES.md) và [RESULTS_REPORTING.md](../../agents/rules/RESULTS_REPORTING.md), mọi số liệu trong toàn bộ `docs/report_v2/` được phân tách rạch ròi theo **6 mốc dữ liệu (snapshots)** tại Bảng 0.3, tuyệt đối không gộp chéo số liệu của hai thời điểm kiến trúc khác nhau thành một phép đo đơn lẻ:

> **5W1H — Ma trận Truy vết Các Mốc Dữ liệu & Thực nghiệm**
> - **What**: Phân định 6 mốc dữ liệu lịch sử và sản xuất (từ 04/10/2026 đến 09/11/2026) dùng trong toàn bộ báo cáo.
> - **Why**: Ngăn chặn nhầm lẫn giữa quy mô snapshot EDA/LanceDB cũ với hệ thống sản xuất Qdrant + ChunkStore (`71,927` bài, `1,043,594` vector) và các đợt benchmark độc lập.
> - **When**: Tổng hợp từ nhật ký chạy máy, manifest trên kho S3 và báo cáo benchmark lưu trữ trong giai đoạn 04/10–09/11/2026 (đối chiếu ngày 25/11/2026).
> - **Where**: Lưu rải rác tại MinIO (`s3://uth-scientific-lakehouse/...`), `logs/run/backend.log`, [docs/benchmarks/](../benchmarks/laya_pagerank_benchmark_report.md), [logs/benchmarks/](../../logs/benchmarks/laya_ab_final_benchmark.json) và [manifest.json](../../data-mining-latek/figures/captured_20261123_082337/manifest.json).
> - **Who**: Nhóm 1 tổng hợp để làm bảng tham chiếu chuẩn cho giảng viên phản biện và các chương báo cáo sau.
> - **How**: Kiểm tra chữ ký thời gian, commit code, kích thước tập mẫu và nguồn lưu trữ của từng artifact.

**Bảng 0.3: Ma trận Truy vết Nguồn gốc Các Mốc Dữ liệu (Snapshot Provenance Matrix)**

| Mã Mốc | Thời điểm ghi nhận | Nền tảng / Commit | Quy mô Corpus & Vector | Chứng cứ & Phạm vi sử dụng chính xác |
| :--- | :--- | :--- | :--- | :--- |
| **SNAP-01** | `04/10/2026` | Silver Parquet local + LanceDB | **10,000 bài** (9,015 enriched = 90.15%, 47,782,707 từ, 2,220,938 công thức parser đếm) | [table_eda_categories.tex](../../data-mining-latek/tables/table_eda_categories.tex), [table_snapshot_sources.tex](../../data-mining-latek/tables/table_snapshot_sources.tex): Bảng phân bố 10 chuyên ngành chi tiết và ví dụ artifact mining lịch sử (`282` giao dịch FP-Growth, `5,000` mẫu Silhouette `0.0210`). |
| **SNAP-02** | `05–07/10/2026` | LanceDB trên Cloudflare R2 (`6cb1c52`) | **143,523 chunks** (21 mẫu) $\rightarrow$ **164,702 chunks** (26 mẫu, 768-D Nomic) | [RAG_EVALUATION_REPORT_21_SAMPLES.md](../benchmarks/RAG_EVALUATION_REPORT_21_SAMPLES.md), [RAG_EVALUATION_REPORT_768D_COMPARISON.md](../benchmarks/RAG_EVALUATION_REPORT_768D_COMPARISON.md): Chứng cứ DeepEval 2.x lịch sử (`Contextual Precision 0.860`, `Faithfulness 0.699` trên 21 mẫu; `0.890` / `0.892` trên 768-D reranked). |
| **SNAP-03** | `17/10/2026` | MinIO S3 EDA & Mining UI | **13,000 bài** (11,619 làm giàu = 89.38%, 2,825,871 công thức, 62,288,266 từ, `8.15 GB`, `10,452` objects) | [03_eda_silver_overview.png](../../data-mining-latek/figures/captured_20261123_082337/03_eda_silver_overview.png), [04_pearson_correlation.png](../../data-mining-latek/figures/captured_20261123_082337/04_pearson_correlation.png), [05_spearman_correlation.png](../../data-mining-latek/figures/captured_20261123_082337/05_spearman_correlation.png): Ảnh EDA và ma trận tương quan ($n=11,659$; 30 luật, Silhouette `0.0515`). |
| **SNAP-04** | `19/10/2026` | RTX 4060 Laptop 8 GB + CUDA 12.4 + Qdrant | **374,082 vectors** (768-D) trên Qdrant Cloud | [PERFORMANCE_BENCHMARK_REPORT.md](../benchmarks/PERFORMANCE_BENCHMARK_REPORT.md): Benchmark phần cứng & độ trễ (`269.46 ms` top-5 Qdrant pool, `609.77 ms` TTFT, `46.33 tok/s`, `3,392.50 ms` E2E, `5.7 GB / 8.0 GB` peak VRAM). |
| **SNAP-05** | `20/10/2026` | Artifact GMM UI trên kho | **800 mẫu**, $K=6$ phân phối Gaussian | [06_gmm_clusters.png](../../data-mining-latek/figures/captured_20261123_082337/06_gmm_clusters.png): Minh họa giao diện trực quan GMM 2D (`BIC 2,889.41`, `Silhouette 0.3528`). |
| **SNAP-06A** | `04/11/2026` | Production MinIO + Qdrant (`ChunkStore` D-058) | **71,927 bài báo phân biệt** Silver; **1,043,594 vector** Qdrant (`70,539` vector abstract duy nhất) | `logs/run/backend.log`: Phiên chạy toàn phần EDA + 4 trụ cột (`234.57 s`: EDA `39.09 s`, FP-Growth `36.26 s` / `61,319` tx / `45` luật / lift `34.940`, Clustering `39.94 s` / BIC `246,306.5` / Sil `0.0490`, Graph `116.39 s`, Anomalies `2.89 s` / `1,000` dị biệt / `48` nhánh). |
| **SNAP-06B** | `06–09/11/2026` | Commit `f421707` & `aae74de` (Chunking A/B, Laya CUDA/ONNX, `RAG_TS`) | **1,000 bài** (Chunking A/B); **120 câu** (5-Scenario + 29,523 PageRank); **150 câu** (Retrieval v1 + 3-Way) | [laya_pagerank_benchmark_report.md](../benchmarks/laya_pagerank_benchmark_report.md), [laya_5_scenarios_comparison_120q.json](../../logs/benchmarks/laya_5_scenarios_comparison_120q.json), [laya_ab_final_benchmark.json](../../logs/benchmarks/laya_ab_final_benchmark.json), [vector_final_benchmark.json](../../logs/benchmarks/vector_final_benchmark.json), `logs/benchmarks/chunking_ab/summary.json`, `logs/benchmarks/rag_eval/report_retrieval.json`: Chứng cứ định lượng cho `AcademicChunker`, Laya `soft-ce`, PageRank và Evidence Gate (`AUROC 0.986`). |

---

## 6. Quy Chuẩn Đánh Số Hình Vẽ, Bảng Biểu & Công Thức

Để phục vụ việc hợp nhất và chuyển đổi mượt mà sang LaTeX (`\ref{fig:...}`, `\ref{tab:...}`, `\eqref{eq:...}`), toàn bộ hình vẽ, bảng biểu và công thức toán học trong bộ `docs/report_v2/` tuân thủ quy ước đánh số phân cấp theo chương (`X.Y`, trong đó `X` là số chương từ 1 đến 7):

### 6.1 Danh mục Đánh số Hình vẽ (`Hình X.Y`)

| Ký hiệu | Tiêu đề hình vẽ / Sơ đồ | Vị trí mô-đun | Hình thức kết xuất đích (LaTeX) |
| :--- | :--- | :--- | :--- |
| **Hình 1.1** | Kiến trúc tổng thể Medallion Lakehouse kết hợp Khai phá & Hybrid RAG | [01_CH1_TONG_QUAN_VA_BAI_TOAN.md](./01_CH1_TONG_QUAN_VA_BAI_TOAN.md) | Sơ đồ TikZ `\DrawSystemArchitecture` trong [diagrams.tex](../../data-mining-latek/figures/diagrams.tex) |
| **Hình 2.1** | Luồng điều phối 3 tầng thu thập trên Apache Airflow & vòng quay Tier 2 | [02a_CH2_THU_THAP_DU_LIEU_COLLECT.md](./02a_CH2_THU_THAP_DU_LIEU_COLLECT.md) | Sơ đồ luồng Mermaid $\rightarrow$ TikZ |
| **Hình 2.2** | Cơ chế lá chắn khử trùng lặp 2 tầng (`paper_id` + SHA-256 `abstract_hash`) | [02b_CH2_TICH_HOP_VA_DIEU_PHOI_INTEGRATE.md](./02b_CH2_TICH_HOP_VA_DIEU_PHOI_INTEGRATE.md) | Sơ đồ luồng Mermaid $\rightarrow$ TikZ |
| **Hình 2.3** | Biểu đồ tuần tự tách pha RabbitMQ (`fetch`/`embed`), Backpressure & DLQ | [02b_CH2_TICH_HOP_VA_DIEU_PHOI_INTEGRATE.md](./02b_CH2_TICH_HOP_VA_DIEU_PHOI_INTEGRATE.md) | Sequence Diagram Mermaid $\rightarrow$ TikZ |
| **Hình 2.4** | Ví dụ bản ghi metadata thô Bronze trên Explorer | [02b_CH2_TICH_HOP_VA_DIEU_PHOI_INTEGRATE.md](./02b_CH2_TICH_HOP_VA_DIEU_PHOI_INTEGRATE.md) | Ảnh chụp [02_bronze_raw_metadata.png](../../data-mining-latek/figures/captured_20261123_082337/02_bronze_raw_metadata.png) |
| **Hình 2.5** | Sơ đồ thác nước phân giải nội dung HTML-First (`UnifiedContentResolver`) | [02c_CH2_LAM_SACH_VA_BOC_TACH_CLEAN.md](./02c_CH2_LAM_SACH_VA_BOC_TACH_CLEAN.md) | Flowchart Mermaid $\rightarrow$ TikZ |
| **Hình 2.6** | Đường ống bóc tách DOM HTML5, bảo toàn LaTeX & làm sạch Surrogate `BUG-01` | [02c_CH2_LAM_SACH_VA_BOC_TACH_CLEAN.md](./02c_CH2_LAM_SACH_VA_BOC_TACH_CLEAN.md) | Flowchart Mermaid $\rightarrow$ TikZ |
| **Hình 2.7** | Kiến trúc `ChunkStore` D-058: Ghi part ZSTD, Compaction LSM & Đọc dải byte S3 | [02d_CH2_CHUYEN_DOI_PHAN_MANH_VA_CHI_MUC_TRANSFORM.md](./02d_CH2_CHUYEN_DOI_PHAN_MANH_VA_CHI_MUC_TRANSFORM.md) | Flowchart Mermaid $\rightarrow$ TikZ |
| **Hình 2.8** | Phân mảnh ngữ cảnh 4 tầng `AcademicChunker` & Vector hóa `NomicEmbedder` 768-D | [02d_CH2_CHUYEN_DOI_PHAN_MANH_VA_CHI_MUC_TRANSFORM.md](./02d_CH2_CHUYEN_DOI_PHAN_MANH_VA_CHI_MUC_TRANSFORM.md) | Flowchart Mermaid $\rightarrow$ TikZ |
| **Hình 3.1 – 3.3** | Giao diện EDA Silver 13k bài, Ma trận Pearson $r$ và Spearman $\rho$ | `03_CH3_PHAN_TICH_KHAM_PHA_EDA.md` | Ảnh chụp `03_eda_silver_overview.png`, `04_pearson_correlation.png`, `05_spearman_correlation.png` |
| **Hình 4.1 – 4.2** | Giao diện GMM 2D và Luồng truy xuất/sinh câu trả lời Hybrid RAG | `04a` & `04b` | Ảnh `06_gmm_clusters.png` & TikZ `\DrawRagPipelineDiagram` |
| **Hình 5.1 – 5.2** | Biểu đồ đối chuẩn Chunking A/B, 5-Scenario `N=120`, Evidence Gate & DeepEval | `05_CH5_DANH_GIA_THUC_NGHIEM_VA_BENCHMARK.md` | XY Charts Mermaid / PNG vector |
| **Hình 6.1 – 6.2** | Giao diện Pipeline Monitor và Manifest sản phẩm khai phá Gold | `06` & `07` | Ảnh `01_pipeline_ui.png` & `07_gold_mining_manifest.png` |

### 6.2 Danh mục Đánh số Bảng biểu (`Bảng X.Y`) & Công thức (`(X.Y)`)

- **Chương 0**: `Bảng 0.1` (Thành viên Nhóm 1), `Bảng 0.2` (Ánh xạ LaTeX), `Bảng 0.3` (Ma trận Snapshot).
- **Chương 1 (`01`)**: `Bảng 1.1` (5 Đóng góp kỹ thuật cốt lõi), `Bảng 1.2` (Ma trận KPI Hệ thống cập nhật 04–09/11/2026), `Bảng 1.3` (Các đánh đổi thiết kế *Architectural Trade-offs*); Công thức `(1.1)` (Độ cải thiện tương đối giữa các cấu hình *retrieval* / mô hình).
- **Chương 2 (`02a`–`02d`)**:
  - `02a`: `Bảng 2.1` (Đặc tả 3 tầng thu thập Airflow), `Bảng 2.2` (Nhóm chủ đề & Thông số Water-Filling/Budget); Công thức `(2.1)`–`(2.7)` (*Water-Filling*, *Credit Pacing*, Ngân sách 20 GB và phân mảnh MD5).
  - `02b`: `Bảng 2.3` (Lược đồ chuẩn hóa 23 cột `SilverLakehouseWriter.SCHEMA`), `Bảng 2.4` (Thông số RabbitMQ hai pha, Backpressure & DLQ); Công thức `(2.8)`–`(2.9)` (Chuẩn hóa ID & Mã băm bất biến `abstract_hash`).
  - `02c`: `Bảng 2.5` (So sánh 4 tầng thác nước `UnifiedContentResolver`), `Bảng 2.6` (9 lớp phân loại mục học thuật `AcademicHTMLParser`), `Bảng 2.7` (Cổng kiểm soát chất lượng & Xử lý lỗi `BUG-01`); Công thức `(2.10)`–`(2.11)` (Ngưỡng tiêu đề PyMuPDF & Quality Gate).
  - `02d`: `Bảng 2.8` (So sánh lưu trữ trước/sau `D-058`), `Bảng 2.9` (Lược đồ 14 cột `ChunkStore.SCHEMA`), `Bảng 2.10` (Tham số phân mảnh `AcademicChunker` & Tóm tắt kết quả Chunking A/B), `Bảng 2.11` (Thông số `NomicEmbedder` & Qdrant HNSW), `Bảng 2.12` (Ánh xạ Feature Engineering sang Chương 3 & 4); Công thức `(2.12)`–`(2.21)` (Cửa sổ cân bằng `AcademicChunker`, Mean Pooling, chuẩn hóa $L_2$/Cosine, UUIDv5, biến đổi $\log(1+x)$ & trọng số đồ thị phân số).
- **Chương 3–6**: Đánh số tiếp tục tuần tự (`Bảng 3.1`..`3.x`, `Bảng 4.1`..`4.x`, `Bảng 5.1`..`5.x`, `Bảng 6.1`..`6.x`) tương ứng với từng tệp mô-đun sau khi ghép hoàn thiện.

---
*Tài liệu này đóng vai trò bản đồ điều hướng trung tâm cho toàn bộ dự thảo báo cáo `docs/report_v2/` trước khi kết xuất sang cây biên dịch LaTeX UTH.*
