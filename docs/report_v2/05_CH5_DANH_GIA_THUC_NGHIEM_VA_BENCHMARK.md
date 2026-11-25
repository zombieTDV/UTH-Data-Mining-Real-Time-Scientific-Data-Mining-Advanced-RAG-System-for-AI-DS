# Chương 5: Đánh Giá Thực Nghiệm Toàn Diện & Phân Tích Benchmark

- **Motivation/Background**: Để khẳng định tính đúng đắn của từng quyết định thiết kế đã trình bày ở Chương 3 và Chương 4, mọi thành phần từ thuật toán chia đoạn (`AcademicChunker`), cơ chế hợp nhất lai (Hybrid RRF), gia cố uy tín PageRank, mô hình tái xếp hạng (`Laya` Cross-Encoder ONNX + Calibration) cho tới năng lực phục vụ phần cứng GPU thực tế đều phải trải qua hệ thống kiểm định định lượng có kiểm soát, tách bạch giữa các kịch bản cắt bỏ (*ablation study*) và đo đạc trên tập đánh giá độc lập.
- **Purpose**: Tổng hợp có hệ thống kết quả từ ba cụm thực nghiệm chính (`EXP-02` Chunking A/B, `EXP-04` 5-Scenario Ablation trên 120 câu hỏi & DeepEval, `EXP-05` Fine-Tuning Laya ONNX / Calibration / Retrieval v1 trên `100+50` mẫu / Đối sánh 3 chiều `150` mẫu), kết hợp kết quả đo hiệu năng phần cứng RTX 4060 `8 GB`, đối chiếu bảng KPI mục tiêu, và bóc tách các lỗi trọng yếu đã phát hiện và sửa chữa (`BUG-01`, `BUG-02`).
- **Overview Pipeline**: `AcademicChunker` A/B (`benchmarks/chunking_ab.py`) $\rightarrow$ Ablation 5 kịch bản xếp hạng + DeepEval (`evaluate_120_ranking_5_scenarios.py`) $\rightarrow$ Huấn luyện Laya `Soft-CE` + Temperature Scaling `T = 3.0627` (`report_seed0.json`) $\rightarrow$ Đánh giá 9 chế độ Retrieval v1 & 3-chiều 150 mẫu (`laya_ab_final_benchmark.json`, `vector_final_benchmark.json`) $\rightarrow$ Đo lường thông lượng Qdrant Pooling & Vulkan vs CUDA (`PERFORMANCE_BENCHMARK_REPORT.md`).
- **Detailed Plan**: (5.1) Hệ thống thước đo & nguyên tắc tách ranh giới; (5.2) Kết quả `EXP-02` Chunking A/B; (5.3) Kết quả `EXP-04` 5 kịch bản & phân rã độ trễ; (5.4) Kết quả `EXP-05` Fine-tuning Laya, Retrieval v1 và Đối sánh 3 chiều; (5.5) Hồ sơ phần cứng RTX 4060; (5.6) Bảng đối chiếu KPI; (5.7) Phân tích lỗi trọng yếu `BUG-01`, `BUG-02` và khoảng cách triển khai.
- **References**: [EXP_01_LAKEHOUSE_SCALING_AND_CHUNKSTORE_HYDRATION.md](../experiments/EXP_01_LAKEHOUSE_SCALING_AND_CHUNKSTORE_HYDRATION.md), [EXP_02_DOMAIN_AWARE_CHUNKING_AB.md](../experiments/EXP_02_DOMAIN_AWARE_CHUNKING_AB.md), [EXP_03_FOUR_PILLARS_MINING_72K_SCALE.md](../experiments/EXP_03_FOUR_PILLARS_MINING_72K_SCALE.md), [EXP_04_HYDRATED_5_SCENARIO_LAYA_PAGERANK.md](../experiments/EXP_04_HYDRATED_5_SCENARIO_LAYA_PAGERANK.md), [EXP_05_LAYA_SOFT_CE_FINETUNING_AND_EVIDENCE_GATE.md](../experiments/EXP_05_LAYA_SOFT_CE_FINETUNING_AND_EVIDENCE_GATE.md), [chunking_ab.py](../../benchmarks/chunking_ab.py), [evaluate_120_ranking_5_scenarios.py](../../benchmarks/evaluate_120_ranking_5_scenarios.py), [laya_pagerank_benchmark_report.md](../benchmarks/laya_pagerank_benchmark_report.md), [laya_5_scenarios_comparison_120q.json](../../logs/benchmarks/laya_5_scenarios_comparison_120q.json), [RUN_INFO.json](../../notebooks/laya_onnx_20261108-2053_seed0/RUN_INFO.json), [report_seed0.json](../../notebooks/laya_finetune/report_seed0.json), [table_retrieval_v1.tex](../../data-mining-latek/tables/table_retrieval_v1.tex), [laya_ab_final_benchmark.json](../../logs/benchmarks/laya_ab_final_benchmark.json), [vector_final_benchmark.json](../../logs/benchmarks/vector_final_benchmark.json), [PERFORMANCE_BENCHMARK_REPORT.md](../benchmarks/PERFORMANCE_BENCHMARK_REPORT.md), [RAG_EVALUATION_REPORT_21_SAMPLES.md](../benchmarks/RAG_EVALUATION_REPORT_21_SAMPLES.md), [table_kpi.tex](../../data-mining-latek/tables/table_kpi.tex), [BUG_01_TOKENIZER_SURROGATE_CRASH.md](../bugs/BUG_01_TOKENIZER_SURROGATE_CRASH.md), [BUG_02_RAG_FALSE_METHODOLOGY_FALLBACK_AND_REFUSAL.md](../bugs/BUG_02_RAG_FALSE_METHODOLOGY_FALLBACK_AND_REFUSAL.md).
- **Created**: 2026-11-25T12:55:00+07:00
- **Last Updated**: 2026-11-25T12:55:00+07:00

[STATUS: ACTIVE]

---

## Mục lục

- [5.1. Thiết kế Khung Thực nghiệm & Thước đo Chuẩn hóa](#51-thiết-kế-khung-thực-nghiệm--thước-đo-chuẩn-hóa)
- [5.2. Thực nghiệm `EXP-02`: A/B Chiến lược Chia đoạn Ngữ nghĩa (`chunking_ab.py`)](#52-thực-nghiệm-exp-02-ab-chiến-lược-chia-đoạn-ngữ-nghĩa-chunking_abpy)
- [5.3. Thực nghiệm `EXP-04`: Cắt bỏ 5 Kịch bản Xếp hạng & Đánh giá DeepEval ($N = 120$)](#53-thực-nghiệm-exp-04-cắt-bỏ-5-kịch-bản-xếp-hạng--đánh-giá-deepeval-n--120)
  - [5.3.1. Kết quả so sánh 5 kịch bản xếp hạng trên 120 truy vấn chuẩn](#531-kết-quả-so-sánh-5-kịch-bản-xếp-hạng-trên-120-truy-vấn-chuẩn)
  - [5.3.2. Phân rã độ trễ từng công đoạn và điểm nghẽn Hydration trên DeepEval](#532-phân-rã-độ-trễ-từng-công-đoạn-và-điểm-nghẽn-hydration-trên-deepeval)
- [5.4. Thực nghiệm `EXP-05`: Tinh chỉnh Laya ONNX, Calibration & Đối sánh 3 Chiều (`150` mẫu)](#54-thực-nghiệm-exp-05-tinh-chỉnh-laya-onnx-calibration--đối-sánh-3-chiều-150-mẫu)
  - [5.4.1. Kết quả huấn luyện Laya `Soft-CE`, Temperature Scaling và khử sai số ECE](#541-kết-quả-huấn-luyện-laya-soft-ce-temperature-scaling-và-khử-sai-số-ece)
  - [5.4.2. Đánh giá 9 cấu hình Retrieval v1 trên tập `100` dương + `50` âm](#542-đánh-giá-9-cấu-hình-retrieval-v1-trên-tập-100-dương--50-âm)
  - [5.4.3. Đối sánh 3 chiều cuối cùng trên 150 truy vấn và bối cảnh lịch sử PoC](#543-đối-sánh-3-chiều-cuối-cùng-trên-150-truy-vấn-và-bối-cảnh-lịch-sử-poc)
- [5.5. Hồ sơ Hiệu năng Phần cứng RTX 4060 & Tối ưu Hóa (`19/10/2026`)](#55-hồ-sơ-hiệu-năng-phần-cứng-rtx-4060--tối-ưu-hóa-19102026)
- [5.6. Bảng Tổng hợp KPI Hệ thống: Mục tiêu vs Thực đạt](#56-bảng-tổng-hợp-kpi-hệ-thống-mục-tiêu-vs-thực-đạt)
- [5.7. Phân tích Lỗi Trọng yếu & Khoảng cách Triển khai Thực tế](#57-phân-tích-lỗi-trọng-yếu--khoảng-cách-triển-khai-thực-tế)

---

## 5.1. Thiết kế Khung Thực nghiệm & Thước đo Chuẩn hóa

Hệ thống đánh giá tách biệt bốn họ thước đo độc lập tương ứng với bốn tầng rủi ro của bài toán hỏi đáp khoa học:

1. **Nhóm xếp hạng truy hồi (Information Retrieval Ranking)**:
   $$
   \mathrm{MRR} = \frac{1}{|Q|} \sum_{q \in Q} \frac{1}{\mathrm{rank}_q}, \qquad \mathrm{nDCG}@K = \frac{1}{|Q|} \sum_{q \in Q} \frac{1}{\mathrm{IDCG}_q@K} \sum_{i=1}^{K} \frac{2^{\mathrm{rel}_{q,i}} - 1}{\log_2(i + 1)}
   $$
   Trong đó: $Q$ là tập truy vấn có đáp án chuẩn; $\mathrm{rank}_q$ là thứ hạng nhỏ nhất của bài báo/đoạn văn đích trong danh sách trả về (bằng $\infty$ nếu không xuất hiện); $\mathrm{rel}_{q,i} \in \{0, 1, 2\}$ là nhãn liên quan theo từng cấp tại vị trí $i$; $\mathrm{IDCG}_q@K$ là giá trị DCG lý tưởng khi xếp tối ưu. Ngoài ra, hệ thống đo `Hit@K` (xác suất có ít nhất 1 kết quả đúng trong Top-$K$) và `Recall@K` (tỷ lệ bài báo/đoạn đúng được phủ trong Top-$K$).
2. **Nhóm hiệu chỉnh xác suất & từ chối câu hỏi không có bằng chứng (Calibration & Evidence Gate)**: Đo bằng **AUROC**, **ECE** (*Expected Calibration Error* — độ lệch trung bình có trọng số giữa xác suất dự đoán và độ chính xác thực tế), **Brier Score**, và tỷ lệ từ chối đúng trên tập câu hỏi gài bẫy âm tính (**Negative Reject@0.5 / @0.6**).
3. **Nhóm đánh giá chất lượng câu trả lời LLM (`DeepEval` LLM-as-a-Judge)**: Gồm `Context Recall` (mức độ ngữ cảnh chứa thông tin đáp án chuẩn), `Context Precision` (độ tinh khiết ngữ cảnh xếp đầu), `Citation Grounding` (tỷ lệ phát biểu có trích dẫn xác thực đúng bài), `Faithfulness` (mức độ không bịa đặt ngoài ngữ cảnh) và `Answer Relevancy`.
4. **Nhóm thông lượng phần cứng (Systems Performance)**: Thời gian sinh token đầu tiên (`TTFT`), tốc độ giải mã (`tok/s`), phân vị độ trễ `p50`/`p95` và thông lượng truy vấn (`QPS`).

---

## 5.2. Thực nghiệm `EXP-02`: A/B Chiến lược Chia đoạn Ngữ nghĩa (`chunking_ab.py`)

Kịch bản [chunking_ab.py](../../benchmarks/chunking_ab.py) tiến hành kiểm thử A/B trực tiếp ba cấu hình phân tách đoạn văn trên cùng tập dữ liệu bài báo khoa học (`logs/benchmarks/chunking_ab/summary.json`):
- **`A_old_fixed50`**: Thuật toán cũ dùng độ dài trần `450` từ và phần chồng lấn cố định `50` từ (nhiều đoạn đuôi bị cắt vụn cực ngắn).
- **`B_new_pct15`**: Thuật toán mới phân chia cân bằng với tỷ lệ chồng lấn **`15%` (`overlap_ratio = 0.15`)**, kẹp trong khoảng `[20, 80]` từ và sáp nhập đoạn đuôi ngắn hơn `min_tail_ratio = 0.4`.
- **`C_new_pct0`**: Thuật toán mới phân chia cân bằng nhưng **tắt chồng lấn (`0%` overlap)** nhằm loại bỏ lặp ngữ nghĩa giữa hai đoạn kề nhau.

> **5W1H — Bảng đối chứng A/B chiến lược chia đoạn trên kho bài báo học thuật (`EXP-02`)**
> - **What**: So sánh tổng số đoạn sinh ra, phân bố độ dài (`median`, phân vị thứ 10 `p10`) và chất lượng truy hồi trên 5 chỉ số (`Recall@5`, `Recall@10`, `MRR@10`, `nDCG@10`, `Chunk Hit@5`).
> - **Why**: Kiểm chứng xem thuật toán cắt cân bằng mới có triệt tiêu được hiện tượng đoạn đuôi vụn và cải thiện tỷ lệ tìm đúng đoạn gốc hay không.
> - **When**: Thực nghiệm `EXP-02` kiểm định trước khi lập chỉ mục toàn bộ kho Gold.
> - **Where**: Kịch bản [chunking_ab.py](../../benchmarks/chunking_ab.py), bản tóm tắt chạy `logs/benchmarks/chunking_ab/summary.json`, bảng [table_chunking_ab.tex](../../data-mining-latek/tables/table_chunking_ab.tex).
> - **Who**: Nhóm phát triển pipeline `src/indexing/chunker.py`.
> - **How**: Lập chỉ mục và truy hồi đối chứng cùng một tập truy vấn chuẩn trên 3 biến thể chunker độc lập.

| Cấu hình Chia đoạn | Số đoạn sinh (`Chunks`) | Trung vị từ (`Median`) | Phân vị `p10` (từ) | `Recall@5` | `Recall@10` | `MRR@10` | `nDCG@10` | `Chunk Hit@5` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`A_old_fixed50`** (Cũ, overlap cố định 50 từ) | `18,449` | `450` | `103` | `0.7143` | `0.8571` | `0.6126` | `0.6635` | `0.7143` |
| **`B_new_pct15`** (Mới, cân bằng + `15%` overlap) | `18,440` | `380` | **`166`** | **`0.7679`** | `0.8929` | `0.6153` | `0.6701` | **`0.7321`** |
| **`C_new_pct0`** (Mới, cân bằng + `0%` overlap) | `17,218` | `366` | `159` | `0.7500` | **`0.9286`** | **`0.6291`** | **`0.6844`** | **`0.7321`** |

*Phân tích đánh đổi kỹ thuật*:
1. **Triệt tiêu đoạn đuôi vụn**: Thuật toán mới nâng độ dài phân vị thứ 10 (`p10`) từ `103` từ lên **`166` từ (`+61.2%`)** ở `B_new_pct15` (và `159` từ ở `C_new_pct0`), loại bỏ hoàn toàn các mẩu câu cụt thiếu ngữ cảnh ở cuối mỗi section.
2. **Đánh đổi giữa `Recall@5` và `Recall@10`**: `B_new_pct15` đạt đỉnh ở **`Recall@5 = 0.7679`** (`+7.5%` tương đối so với `0.7143` của bản cũ) vì vùng chồng lấn `15%` bảo toàn câu chuyển tiếp tại ranh giới hai đoạn giúp tăng xác suất lọt ngay vào Top-5 trả về LLM. Ngược lại, `C_new_pct0` giảm `6.7%` số vector (`17,218` vs `18,449`), loại bỏ nhiễu trùng lặp thứ hạng giữa các đoạn kề nhau nên đạt đỉnh **`Recall@10 = 0.9286`**, **`MRR@10 = 0.6291`** và **`nDCG@10 = 0.6844`**. Vì đường ống sản xuất ưu tiên Top-5 ngữ cảnh đưa vào `RagService`, hệ thống chọn cấu hình mặc định `overlap_ratio = 0.15` trong [chunker.py](../../src/indexing/chunker.py) (với `max_chunk_words = 450` tại `queue_consumer.py` tương ứng `380–450` từ thực tế).

---

## 5.3. Thực nghiệm `EXP-04`: Cắt bỏ 5 Kịch bản Xếp hạng & Đánh giá DeepEval ($N = 120$)

### 5.3.1. Kết quả so sánh 5 kịch bản xếp hạng trên 120 truy vấn chuẩn

Kịch bản [evaluate_120_ranking_5_scenarios.py](../../benchmarks/evaluate_120_ranking_5_scenarios.py) (báo cáo chi tiết tại [laya_pagerank_benchmark_report.md](../benchmarks/laya_pagerank_benchmark_report.md) và log [laya_5_scenarios_comparison_120q.json](../../logs/benchmarks/laya_5_scenarios_comparison_120q.json)) thực thi nghiên cứu cắt bỏ trên **`120` câu hỏi học thuật** qua 5 tổ hợp tăng tiến từ tìm kiếm vector thuần túy tới hệ thống đầy đủ (Weighted RRF `0.65` Vector + `1.35` Cross-Encoder + Lexical + PageRank logarit `0.025`):

> **5W1H — Bảng kết quả Ablation 5 kịch bản xếp hạng trên 120 truy vấn (`EXP-04`)**
> - **What**: Đối chiếu `MRR`, `Hit@1`, `Recall@1`, `Hit@5`, `Recall@5`, `Hit@10` và độ trễ trung bình trên 5 kịch bản xếp hạng độc lập.
> - **Why**: Chứng minh đóng góp riêng lẻ và tính bổ trợ lẫn nhau giữa Bi-Encoder Vector, Cross-Encoder Laya, RRF và PageRank khoa học.
> - **When**: Tháng `11/2026`, kết xuất chính thức trong [laya_pagerank_benchmark_report.md](../benchmarks/laya_pagerank_benchmark_report.md).
> - **Where**: [evaluate_120_ranking_5_scenarios.py](../../benchmarks/evaluate_120_ranking_5_scenarios.py) và [laya_5_scenarios_comparison_120q.json](../../logs/benchmarks/laya_5_scenarios_comparison_120q.json).
> - **Who**: Bộ đánh giá tự động của nhóm UTH Data Mining trên GPU RTX 4060.
> - **How**: Truy vấn Top-10 ứng viên đã hydrate cho mỗi câu hỏi, chấm điểm theo từng tổ hợp xếp hạng trên cùng tập ứng viên cố định.

| Kịch bản Xếp hạng | `MRR` | `Hit@1` (`số câu/120`) | `Recall@1` | `Hit@5` (`số câu/120`) | `Recall@5` | Độ trễ TB (`ms`) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **1. Vector (Bi-Encoder Baseline)** | `0.5725` | `49.2%` (`59/120`) | `45.0%` | `67.5%` (`81/120`) | `60.8%` | `325.0 ms` |
| **2. Laya Alone (Cross-Encoder đơn thuần)** | `0.5822` | `51.7%` (`62/120`) | `46.2%` | `66.7%` (`80/120`) | `60.0%` | `641.2 ms` |
| **3. Vector + Laya (RRF $k=60$)** | `0.5810` | `50.8%` (`61/120`) | `46.2%` | `67.5%` (`81/120`) | `60.4%` | `641.2 ms` |
| **4. Vector + PageRank (Mạng trích dẫn)** | `0.5741` | `49.2%` (`59/120`) | `45.0%` | `68.3%` (`82/120`) | `61.7%` | `325.2 ms` |
| **5. Full System (Vector + Laya + RRF + PageRank)** | **`0.6076`** | **`55.0%` (`66/120`)** | **`49.6%`** | **`69.2%` (`83/120`)** | **`62.1%`** | `641.4 ms` |

*Ba phát hiện thực nghiệm nổi bật từ Bảng 5.3.1*:
1. **Hiệu ứng cộng hưởng siêu tuyến tính (Synergistic Gain)**: Khi tách rời, PageRank chỉ tăng `MRR` thêm `+0.0016` (`0.5725 -> 0.5741`) và Laya Alone chỉ tăng `+0.0097` (`0.5822`) thậm chí hơi tụt `Hit@5` xuống `66.7%`. Thế nhưng khi kết hợp đủ cả 4 tín hiệu (**Kịch bản 5: Full System**), `MRR` nhảy vọt lên **`0.6076` (`+6.13%` tương đối so với Vector Baseline)**, `Hit@1` tăng **`+5.8` điểm phần trăm (`49.2% -> 55.0%`, cứu thêm 7 câu đúng ngay hạng #1)** và `Hit@10` đạt **`75.0%`**. Nguyên nhân là Cross-Encoder lọc nhiễu ngữ nghĩa ở phạm vi câu chữ cục bộ, RRF cân bằng thứ hạng tránh thiên vị logit cục đoan, còn PageRank giải quyết các trường hợp hòa điểm bằng uy tín học thuật toàn cục.
2. **Chi phí PageRank gần như bằng không**: Đọc bảng băm `20,000` bài báo / `29,523` tác giả từ RAM chỉ thêm **`+0.21 ms`** nhưng đóng góp quyết định ở bước cuối của chuỗi hợp nhất.

### 5.3.2. Phân rã độ trễ từng công đoạn và điểm nghẽn Hydration trên DeepEval

> **5W1H — Bảng phân rã chi phí thời gian từng tầng trên chuỗi 120 truy vấn (`EXP-04`)**
> - **What**: Đo thời gian thực thi trung bình (ms / $\mu$s) và phần trăm đóng góp của từng bước trong chuỗi truy hồi trên GPU CUDA `bfloat16` so với GPU tuần tự và CPU ONNX.
> - **Why**: Xác định chính xác nút thắt cổ chai độ trễ để giải thích lợi ích của gom lô tĩnh (*collated batch inference*) trên GPU.
> - **When**: Tháng `11/2026`, báo cáo [laya_pagerank_benchmark_report.md](../benchmarks/laya_pagerank_benchmark_report.md).
> - **Where**: [laya_pagerank_benchmark_report.md](../benchmarks/laya_pagerank_benchmark_report.md) và [table_latency_profile.tex](../../data-mining-latek/tables/table_latency_profile.tex).
> - **Who**: Thử nghiệm thực thi trên GPU NVIDIA RTX 4060 (CUDA `bfloat16`).
> - **How**: Đo đồng hồ đơn điệu (`perf_counter`) bao quanh từng hàm truy xuất Qdrant, MinIO Hydration, Laya Inference, RRF và PageRank lookup.

| Công đoạn xử lý | Cấu hình thực thi | Độ trễ TB / truy vấn | Ghi chú kỹ thuật & Tỷ trọng |
| :--- | :--- | :---: | :--- |
| 1. **Vector Search + ChunkStore Hydration** | Qdrant HNSW + MinIO Parquet S3 | `325.01 ms` | Tải 10 đoạn văn ứng viên + giải nén ZSTD |
| 2a. **Laya Rerank (CUDA `bfloat16`, gom lô)** | Batch `10` đoạn/lần qua GPU (`31.62 ms/chunk`) | **`+316.16 ms`** | **Tối ưu được chọn** (`49.3%` tổng độ trễ `641.4 ms`) |
| 2b. *(Đối chứng)* Laya GPU chạy tuần tự từng cặp | Không gom lô | `+1,335.92 ms` | Chậm gấp `4.2x` so với gom lô `bfloat16` |
| 2c. *(Đối chứng)* Laya CPU ONNX | Chạy trên CPU không GPU | `+4,260.00 ms` | Chậm gấp **`13.5x`** so với GPU gom lô |
| 3. **Reciprocal Rank Fusion ($k=60$)** | Tính toán vector số trên RAM | `+0.02 ms` (`18.6 us`) | Không đáng kể (`0.003%`) |
| 4. **Tra cứu uy tín PageRank** | Dict lookup (`29,523` tác giả) | `+0.21 ms` (`205.7 us`) | Không đáng kể (`0.03%`) |

Bên cạnh đo đạc thứ hạng, đánh giá chất lượng sinh câu trả lời bằng bộ giám khảo `DeepEval` (từ [laya_pagerank_benchmark_report.md](../benchmarks/laya_pagerank_benchmark_report.md) và [cached_eval_master_k5_pagerank_local.json](../../logs/benchmarks/cached_eval_master_k5_pagerank_local.json)) phơi bày tác động sống còn của tính đầy đủ văn bản nguồn (**Hydration**) lên toàn bộ chất lượng RAG:

> **5W1H — Bảng đối chiếu DeepEval giữa Tập đã Hydrate đầy đủ ($N=105$) và Toàn bộ tập ($N=169$)**
> - **What**: So sánh 6 thước đo DeepEval giữa tập bài báo đã có toàn văn trong ChunkStore ($N=105$) với tập đầy đủ ($N=169$, gồm ~`38.9%` mẫu chưa hydrate được toàn văn).
> - **Why**: Định lượng tổn thất chất lượng RAG gây ra trực tiếp bởi việc thiếu dữ liệu toàn văn thay vì do lỗi thuật toán LLM.
> - **When**: Tháng `11/2026`.
> - **Where**: [laya_pagerank_benchmark_report.md](../benchmarks/laya_pagerank_benchmark_report.md) và [cached_eval_master_k5_pagerank_local.json](../../logs/benchmarks/cached_eval_master_k5_pagerank_local.json).
> - **Who**: Bộ đánh giá DeepEval (LLM Judge cục bộ).
> - **How**: Tính trung bình có điều kiện trên số mẫu hợp lệ được giám khảo chấm điểm (ghi rõ tỷ lệ đạt ngưỡng trong ngoặc).

| Thước đo DeepEval | Tập đã Hydrate (`N = 105`) | Toàn bộ tập (`N = 169`) | Chênh lệch ($\Delta$) |
| :--- | :---: | :---: | :---: |
| **`Context Recall`** | **`0.900`** (`92/103`) | `0.637` (`105/166`) | `-0.263` (`-29.2%`) |
| **`Context Precision`** | **`0.852`** (`86/103`) | `0.618` (`101/166`) | `-0.234` (`-27.5%`) |
| **`Citation Grounding`** | **`0.762`** (`94/104`) | `0.719` (`144/167`) | `-0.043` |
| **`Faithfulness`** | **`0.667`** (`55/96`) | `0.592` (`73/156`) | `-0.075` |
| **`Answer Relevancy`** | **`0.667`** (`50/98`) | `0.594` (`65/160`) | `-0.073` |
| **`Context Relevancy`** | **`0.520`** (`42/93`) | `0.444` (`45/123`) | `-0.076` |

Khi dữ liệu được hydrate đầy đủ từ `ChunkStore` ($N=105$), **`Context Recall` đạt `0.900` (`92/103`)** và **`Context Precision` đạt `0.852` (`86/103`)**. Ngược lại, khi gộp thêm ~38.9% mẫu bị khuyết đoạn văn toàn văn vào tập `N=169`, điểm `Context Recall` rơi thẳng xuống `0.637`. Kết quả này chứng minh nút thắt chất lượng nằm ở khâu **làm giàu & hydrate kho ChunkStore**, không phải ở thuật toán Hybrid Retrieval.

---

## 5.4. Thực nghiệm `EXP-05`: Tinh chỉnh Laya ONNX, Calibration & Đối sánh 3 Chiều (`150` mẫu)

### 5.4.1. Kết quả huấn luyện Laya `Soft-CE`, Temperature Scaling và khử sai số ECE

Mô hình tái xếp hạng `Laya` (`laya 0.4.27`) được tinh chỉnh bằng hàm mất mát `Soft-CE` có hiệu chỉnh nhiệt độ hậu huấn luyện trên hai cấu hình đối chứng: biến thể **1-epoch bảo toàn ONNX** ([RUN_INFO.json](../../notebooks/laya_onnx_20261108-2053_seed0/RUN_INFO.json), `175` nhóm kiểm chứng, $T = 1.0$) và biến thể **4-epoch tinh chỉnh sâu kèm Temperature Scaling** ([report_seed0.json](../../notebooks/laya_finetune/report_seed0.json), `3,432` mẫu huấn luyện / `381` mẫu calib / `820` mẫu kiểm thử độc lập thuộc `130` nhóm MRR, `micro_batch = 8`, `grad_accum = 8`, `max_len = 512`, `T^* = 3.0627`):

> **5W1H — Bảng kết quả trước và sau tinh chỉnh Laya Cross-Encoder ONNX (`EXP-05` Offline Evaluation)**
> - **What**: So sánh mô hình gốc (*Baseline Zero-shot*) và mô hình tinh chỉnh (*Fine-tuned*) qua `AUC`, `MRR`, Độ chính xác phân loại, `ECE`, `Brier Score` và tỷ lệ lọt mẫu bịa đặt ở ngưỡng `0.6`.
> - **Why**: Chứng minh hiệu quả của `Soft-CE` + `Temperature Scaling` trong việc triệt tiêu lỗi chấp nhận nhầm thông tin bịa đặt (`fabricated`) mà vẫn giữ nguyên khả năng trả lời câu hợp lệ.
> - **When**: Ngày `08/11/2026` (`20261108-2053_seed0`).
> - **Where**: [report_seed0.json](../../notebooks/laya_finetune/report_seed0.json) và [RUN_INFO.json](../../notebooks/laya_onnx_20261108-2053_seed0/RUN_INFO.json).
> - **Who**: Quy trình tinh chỉnh & xuất ONNX trong `benchmarks/laya_finetune/`.
> - **How**: Đo đạc trên tập `eval` (`820` cặp / `130` nhóm ở `report_seed0.json`) và `dev` (`175` nhóm ở `RUN_INFO.json`), kiểm chứng độ lệch xuất ONNX (`onnx_logit_gap = 5.14e-6`).

| Tập thử & Cấu hình | Giai đoạn | `AUC` | `MRR` | `Accuracy` | `ECE` ($\downarrow$) | `Brier` ($\downarrow$) | Tỷ lệ lọt `fabricated@0.6` ($\downarrow$) | Ghi chú nhóm lỗi khác (`@0.6`) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **`report_seed0.json`** (`4` epochs, $T = 3.0627$, `eval=820`) | Baseline | `0.6685` | `0.7615` | `0.5012` | `0.1900` | `0.5758` | `0.574` | Lệch xác suất nặng trước hiệu chỉnh |
| **`report_seed0.json`** (`4` epochs, $T = 3.0627$, `eval=820`) | **Fine-tuned** | **`0.9085`** | **`0.9590`** | **`0.8768`** | **`0.0332`** | **`0.1951`** | **`0.015`** | Giảm `97.4%` false-accept bịa đặt; `onnx_gap = 5.14e-6` |
| **`RUN_INFO.json`** (`1` epoch `soft-ce`, $T=1.0$, `175` nhóm) | Baseline | `0.6848` | `0.7070` | — | — | — | `0.588` | `missing_detail = 0.497`, `irrelevant = 0.424` |
| **`RUN_INFO.json`** (`1` epoch `soft-ce`, $T=1.0$, `175` nhóm) | **Fine-tuned** | **`0.8928`** | **`0.9546`** | — | — | — | **`0.023`** | `answerable` giữ nguyên **`0.730`**, `missing = 0.051`, `irrelevant = 0.030` |

Kết quả chỉ rõ điểm yếu chí mạng của Cross-Encoder pretrained khi dùng làm cổng lọc: mô hình gốc chấp nhận tới **`57.4%–58.8%`** các đoạn chứa chi tiết bịa đặt tại ngưỡng `0.6`. Sau khi tinh chỉnh `Soft-CE` và áp dụng `Temperature Scaling` ($T = 3.0627$), sai số hiệu chỉnh xác suất **`ECE` giảm `5.72x` (`0.1900 -> 0.0332`)**, **`MRR` tăng lên `0.9590`**, và tỷ lệ lọt thông tin bịa đặt rơi xuống chỉ còn **`1.5%–2.3%`** trong khi giữ nguyên **`0.730`** trên các đoạn trả lời được (*answerable*). Độ sai lệch số học khi chuyển từ PyTorch sang ONNX chỉ là **`5.14e-6`**.

### 5.4.2. Đánh giá 9 cấu hình Retrieval v1 trên tập `100` dương + `50` âm

Trên tập chuẩn v1 (`RAG_TS`: `100` câu hỏi có bằng chứng dương tính + `50` câu hỏi bẫy âm tính không có trong kho, ngưỡng Cổng Chứng cứ $\theta = 0.6$, chi tiết tại [table_retrieval_v1.tex](../../data-mining-latek/tables/table_retrieval_v1.tex) và `logs/benchmarks/rag_eval/report_retrieval.json`), 9 cấu hình truy hồi được đánh giá đồng thời về chất lượng xếp hạng (`100` câu dương) và khả năng chặn lọc (`50` câu âm):

> **5W1H — Bảng đối chứng 9 chế độ truy hồi Retrieval v1 (`100` câu dương + `50` câu âm, ngưỡng $\theta = 0.6$)**
> - **What**: Đo `Hit@1`, `Hit@5`, `Recall@5`, `MRR@10`, `nDCG@10`, `Gold@5` (trên 100 câu dương) cùng `AUROC` phân loại dương/âm toàn tập 150 câu.
> - **Why**: Khảo sát đóng góp cộng dồn từ Vector đơn thuần $\rightarrow$ Hybrid BM25+Vector $\rightarrow$ Tái xếp hạng Laya gốc vs Fine-tuned (1 epoch và 4 epochs).
> - **When**: Tháng `11/2026` (`EXP-05`).
> - **Where**: [table_retrieval_v1.tex](../../data-mining-latek/tables/table_retrieval_v1.tex), tập lệnh [score_retrieval.py](../../benchmarks/rag_eval/score_retrieval.py) và log `logs/benchmarks/rag_eval/report_retrieval.json`.
> - **Who**: Đánh giá tự động qua `benchmarks/rag_eval/`.
> - **How**: Truy xuất top ứng viên qua `RAG_TS` (Qdrant + SQLite BM25) rồi chấm điểm ngưỡng $\theta = 0.6$.

| Chế độ (`Mode`) | `Hit@1` | `Hit@5` | `Recall@5` | `MRR@10` | `nDCG@10` | `Gold@5` | `AUROC` (100+50) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `vector` (Dense thuần túy) | `0.440` | `0.720` | `0.515` | `0.553` | `0.698` | `0.620` | — |
| `hybrid` (Vector + BM25 RRF) | `0.530` | `0.910` | `0.691` | `0.690` | `0.810` | `0.780` | — |
| `laya` (Vector + Laya gốc) | `0.480` | `0.730` | `0.530` | `0.593` | `0.705` | `0.620` | `0.823` |
| `laya_hybrid` (Hybrid + Laya gốc) | `0.620` | `0.900` | `0.690` | `0.743` | `0.822` | `0.760` | `0.870` |
| `prod` (Hybrid + MS-MARCO MiniLM) | `0.440` | `0.690` | `0.485` | `0.561` | `0.652` | `0.560` | `0.838` |
| `laya_ft` (Vector + Laya FT 4-ep) | `0.570` | `0.740` | `0.550` | `0.649` | `0.725` | `0.630` | `0.952` |
| **`laya_ft_hybrid`** (Hybrid + Laya FT 4-ep) | **`0.740`** | **`0.940`** | `0.744` | **`0.827`** | **`0.852`** | **`0.830`** | `0.978` |
| `laya_ft1` (Vector + Laya FT 1-ep) | `0.590` | `0.740` | `0.559` | `0.659` | `0.728` | `0.650` | `0.960` |
| **`laya_ft1_hybrid`** (Hybrid + Laya FT 1-ep) | `0.730` | **`0.940`** | **`0.754`** | `0.824` | `0.850` | **`0.830`** | **`0.986`** |

Kết quả này khẳng định rõ ràng hai điều:
1. **Vai trò không thể thay thế của Hybrid BM25 + Vector trước Reranker**: Dù Laya được tinh chỉnh tốt đến đâu, nếu tầng ứng viên đầu vào chỉ dùng Vector (`laya_ft1`), `Hit@5` chỉ đạt `0.740`; ngược lại, khi tầng 1 chạy Hybrid (`laya_ft1_hybrid` / `laya_ft_hybrid`), `Hit@5` nhảy lên **`0.940`** (`+20.0` điểm phần trăm) và `MRR@10` đạt **`0.824`–`0.827`** (`+49.5%` so với `0.553` của `vector`).
2. **Sức mạnh của Laya Fine-tuned so với `prod` (`ms-marco-MiniLM-L-6-v2`)**: Cấu hình `prod` trên tập này tụt xuống `Hit@1 = 0.440` và `MRR@10 = 0.561` (thấp hơn cả `hybrid` thuần không rerank!), trong khi `laya_ft1_hybrid` đạt **`AUROC = 0.986`**, chặn sạch **`50/50` (`100%`)** câu hỏi âm tính và giữ lại **`86/100`** câu hỏi trả lời được với độ trễ trung bình `5,391 ms` trên pipeline đánh giá end-to-end.

### 5.4.3. Đối sánh 3 chiều cuối cùng trên 150 truy vấn và bối cảnh lịch sử PoC

Thử nghiệm cuối cùng ngày `09/11/2026` ([laya_ab_final_benchmark.json](../../logs/benchmarks/laya_ab_final_benchmark.json) và [vector_final_benchmark.json](../../logs/benchmarks/vector_final_benchmark.json)) đối sánh trực tiếp ba kiến trúc đại diện trên cùng tập `150` trường hợp (`100` dương + `50` âm) bằng cả chỉ số xếp hạng và giám khảo DeepEval:

> **5W1H — Bảng đối sánh 3 chiều cuối cùng (`09/11/2026`, `150` trường hợp)**
> - **What**: So sánh toàn diện Pure Vector (`nomic-embed`), Pretrained Laya (`baseline`), và Fine-Tuned Laya (`newModel`) trên `MRR`, `Hit@1/3/5`, `DeepEval`, `Neg Reject@0.5` và độ trễ trung bình.
> - **Why**: Xác nhận lợi ích đầu-cuối (end-to-end) của mô hình Laya đã tinh chỉnh trên cả xếp hạng, độ trung thực câu trả lời và tốc độ phục vụ.
> - **When**: `09/11/2026`.
> - **Where**: [vector_final_benchmark.json](../../logs/benchmarks/vector_final_benchmark.json) và [laya_ab_final_benchmark.json](../../logs/benchmarks/laya_ab_final_benchmark.json).
> - **Who**: Pipeline đánh giá tự động `EXP-05`.
> - **How**: Đo đồng nhất trên `100` truy vấn đích và `50` truy vấn âm tính bẫy ảo giác.

| Chỉ số đánh giá | `Pure Vector` | `Pretrained Laya` (`baseline`) | `Fine-Tuned Laya` (`newModel`) | Xu hướng cải thiện |
| :--- | :---: | :---: | :---: | :--- |
| **`MRR`** | `0.8623` | `0.8853` | **`0.8939`** | `+3.66%` vs Pure Vector |
| **`Hit@1`** | `0.79` (`79%`) | `0.81` (`81%`) | **`0.82`** (`82%`) | `+3.0` đpt vs Vector |
| **`Hit@3`** | `0.92` (`92%`) | **`0.97`** (`97%`) | `0.96` (`96%`) | Vượt trội ở Top-3 |
| **`Hit@5`** | `0.96` (`96%`) | `0.97` (`97%`) | **`0.98`** (`98%`) | Phủ `98/100` truy vấn dương |
| **`DeepEval Faithfulness`** | — | `0.7970` | **`0.7977`** | Ổn định ~`0.80` không ảo giác |
| **`DeepEval Answer Relevancy`** | — | `0.6291` | **`0.6341`** | Cải thiện mức bám câu hỏi |
| **`DeepEval Contextual Relevancy`** | — | `0.3100` | `0.3100` | Giới hạn do chiều dài đoạn văn `450` từ |
| **`Negative Reject @0.5`** | `0.92` (`@0.6 = 1.0`) | **`1.00`** | **`1.00`** | Lọc sạch `50/50` câu bẫy |
| **Độ trễ trung bình (`ms`)** | `4,686.8 ms` | **`2,312.2 ms`** | `2,643.5 ms` | Nhanh hơn `43.6%` vs luồng Pure Vector đầy đủ (`avgTargetCos=0.6601`, `avgNegCos=0.4497`) |

*Bối cảnh lịch sử PoC (`05/10/2026`)*: Trước kiến trúc MinIO + Qdrant hiện tại, thử nghiệm PoC ban đầu trên `21` mẫu với kho `143,523` đoạn trên LanceDB R2 ([RAG_EVALUATION_REPORT_21_SAMPLES.md](../benchmarks/RAG_EVALUATION_REPORT_21_SAMPLES.md)) đã sớm chứng minh bước nhảy khi thay thế Vector đơn thuần bằng Hybrid + Rerank: `Contextual Precision` tăng **`0.637 -> 0.860` (`+35.0%`)**, `Contextual Recall` tăng **`0.950 -> 1.000`**, `Faithfulness` tăng **`0.668 -> 0.699`**, `Answer Relevancy` tăng **`0.687 -> 0.752`**, và `Citation Grounding` đạt `0.757 -> 0.720`. Kết quả lịch sử này là tiền đề trực tiếp để nhóm đầu tư tinh chỉnh mô hình Reranker riêng (`Laya`) ở `EXP-05`.

---

## 5.5. Hồ sơ Hiệu năng Phần cứng RTX 4060 & Tối ưu Hóa (`19/10/2026`)

Quá trình đo kiểm hiệu năng thực tế trên GPU **NVIDIA GeForce RTX 4060 Laptop (`8 GB` VRAM)** ([PERFORMANCE_BENCHMARK_REPORT.md](../benchmarks/PERFORMANCE_BENCHMARK_REPORT.md), ngày `19/10/2026`) xử lý triệt để hai nút thắt hệ thống quan trọng:

1. **Quản trị kết nối Qdrant (`Persistent HTTP Pooling`)**: Khi mở kết nối HTTP mới cho mỗi truy vấn TLS tới Qdrant Cloud (`https://qdrant.minio-quangmanh.io.vn`), độ trễ lần đầu (*cold handshake*) vượt **`> 1,000 ms`**. Sau khi tái sử dụng phiên `requests.Session` và kết nối gRPC/HTTP thường trực trong `QdrantManager`, độ trễ truy vấn Top-5 giảm về **`269.46 ± 12.44 ms`** (`p50 = 268.10 ms`, `p95 = 291.50 ms`, thông lượng **`3.71 QPS`**); mở rộng lên Top-50 chỉ mất **`258.80 ms` (`3.86 QPS`)** chứng tỏ đường truyền mạng TLS chi phối toàn bộ thời gian truy xuất chứ không phải tìm kiếm HNSW nội tại trên Qdrant.
2. **Chuyển đổi Backend suy luận LLM từ Vulkan sang CUDA (`node-llama-cpp v3.15.5`)**:

> **5W1H — Bảng đối chiếu hiệu năng RAG End-to-End (Top-3 + `Qwen-2.5-7B-Instruct Q4_K_M`) giữa Vulkan và CUDA**
> - **What**: So sánh độ trễ Embed, Time-to-First-Token (`TTFT`), thời gian sinh 50 token, tốc độ giải mã (`tok/s`), tổng thời gian E2E và tiêu thụ VRAM giữa Vulkan fallback và CUDA native.
> - **Why**: Giải quyết lỗi tràn/treo driver đồ họa Vulkan `VK_ERROR_DEVICE_LOST` và tăng tốc thông lượng phản hồi thời gian thực.
> - **When**: Ngày `19/10/2026`.
> - **Where**: [PERFORMANCE_BENCHMARK_REPORT.md](../benchmarks/PERFORMANCE_BENCHMARK_REPORT.md).
> - **Who**: Thử nghiệm thực thi trên máy trạm RTX 4060 `8 GB` với `node-llama-cpp v3.15.5`.
> - **How**: Gửi chuỗi truy vấn Top-3 RAG có ngữ cảnh thực tế, đo trực tiếp thời gian từng giai đoạn và đọc bộ đếm VRAM GPU.

| Giai đoạn / Thông số đo | Vulkan Backend (Trước tối ưu) | CUDA Backend (Sau tối ưu) | Mức tăng tốc / Ghi chú |
| :--- | :---: | :---: | :--- |
| Nhúng câu hỏi (Query Embedding) | `~350 ms` | **`39.33 ms`** | Nhanh hơn **`8.9x`** |
| **Time to First Token (`TTFT`)** | `18,700 ms` (`18.7 s`) | **`609.77 ms`** (`0.61 s`) | Nhanh hơn **`30.7x`** (hấp thụ Prompt Eval siêu tốc trên Tensor Cores) |
| Sinh `50` token tiếp theo | `17,740 ms` | **`1,079.43 ms`** | Nhanh hơn `16.4x` |
| **Tốc độ sinh (`Throughput`)** | `3.64 tok/s` | **`46.33 tok/s`** | Nhanh hơn **`12.7x`** (vượt chuẩn đọc mượt thời gian thực) |
| **Tổng thời gian RAG End-to-End** | `37,310 ms` (`37.31 s`) | **`3,392.50 ms`** (`3.39 s`) | Tăng tốc tổng thể **`~11.0x`** |
| Đỉnh tiêu thụ VRAM / Khắc phục sự cố | `VK_ERROR_DEVICE_LOST` (sập khi ngữ cảnh dài) | **`~5.7 GB / 8.0 GB`** | Thiết lập `LLM_CONTEXT_SIZE = 4096`, `LLM_SEQUENCES = 1` khử crash Vulkan |

---

## 5.6. Bảng Tổng hợp KPI Hệ thống: Mục tiêu vs Thực đạt

> **5W1H — Bảng đối chiếu KPI toàn hệ thống: Mục tiêu thiết kế vs Kết quả thực nghiệm**
> - **What**: Tổng hợp đối chiếu 7 chỉ tiêu hiệu năng cốt lõi từ tầng Lakehouse, khai phá dữ liệu tới RAG và GPU inference.
> - **Why**: Đánh giá khách quan mức độ hoàn thành các mục tiêu đặt ra ở Chương 1 trên toàn bộ vòng đời hệ thống.
> - **When**: Tổng kết toàn kỳ tháng `10–11/2026`.
> - **Where**: [table_kpi.tex](../../data-mining-latek/tables/table_kpi.tex) và các bằng chứng liên kết trong mục 5.2–5.5.
> - **Who**: Hội đồng kiểm định nội bộ dự án UTH Data Mining.
> - **How**: Đối chiếu chỉ tiêu mục tiêu với giá trị tốt nhất đo được tại từng phân hệ kiểm định tương ứng.

| Hạng mục KPI | Mục tiêu thiết kế | Giá trị thực đạt | Bằng chứng & Điều kiện đo | Đạt chuẩn |
| :--- | :---: | :---: | :--- | :---: |
| Quy mô kho toàn văn & Vector Lakehouse | $\ge 50,000$ bài / $1\text{M}$ vectors | **`71,927` bài / `1,043,594` vectors** | `04/11/2026` (`logs/run/backend.log`, Qdrant `scientific_papers_gold`) | Đạt |
| Độ bao phủ làm giàu HTML LaTeXML | $\ge 80\%$ kho kiểm toán | **`89.38%`** (`11,619 / 13,000`) | Lát cắt S2 [eda_api.json](../../data-mining-latek/figures/captured_20261123_082337/evidence/eda_api.json) | Đạt |
| Thời gian hoàn tất 4 Trụ cột `MiningEngine` | $< 5$ phút (`300 s`) toàn hồ | **`234.57 s`** (`~3.91` phút) | `04/11/2026` (EDA `39.09s`, FP `36.26s`, Clus `39.94s`, Graph `116.39s`, Trend `2.89s`) | Đạt |
| Cải thiện `MRR` khi hợp nhất 4 tín hiệu (`EXP-04`) | $> +5\%$ vs Vector Baseline | **`+6.13%`** (`0.5725` $\rightarrow$ **`0.6076`**) | `N=120` câu hỏi ([laya_5_scenarios_comparison_120q.json](../../logs/benchmarks/laya_5_scenarios_comparison_120q.json)) | Đạt |
| Khả năng lọc ảo giác (`AUROC` & Chặn âm tính) | $\text{AUROC} \ge 0.90$, chặn $\ge 90\%$ | **`AUROC = 0.986`**, chặn **`50/50` (`100%`)** | `EXP-05` `laya_ft1_hybrid` (`100+50` mẫu, $\theta = 0.6$) | Vượt mức |
| Chất lượng Truy hồi (`Hit@5` & `Context Recall`) | `Hit@5` $\ge 0.90$, `Recall` $\ge 0.85$ | **`Hit@5 = 0.94–0.98`**, **`Recall = 0.900`** | `EXP-05` (`0.94` v1 / `0.98` 3-way) & DeepEval Hydrated `N=105` | Đạt |
| Tốc độ suy luận E2E trên GPU RTX 4060 `8 GB` | `< 5.0 s` E2E, `>= 30 tok/s` | **`3.39 s` E2E**, **`46.33 tok/s`** | `19/10/2026` CUDA `node-llama-cpp v3.15.5`, `TTFT = 609.77 ms` | Đạt |

---

## 5.7. Phân tích Lỗi Trọng yếu & Khoảng cách Triển khai Thực tế

Một báo cáo kỹ thuật trung thực cần trình bày rõ các lỗi vận hành nghiêm trọng đã phát hiện cùng các khoảng cách còn tồn tại giữa môi trường thử nghiệm và dịch vụ sản xuất:

1. **Lỗi `BUG-01`: Sập bộ tách từ Rust do ký tự Unicode Surrogate ([BUG_01_TOKENIZER_SURROGATE_CRASH.md](../bugs/BUG_01_TOKENIZER_SURROGATE_CRASH.md))**:
   - *Hiện tượng*: Quá trình nhúng toàn văn (`queue_consumer.py` / `nomic-embed-text-v1.5`) bất ngờ sập với lỗi `PyO3 PanicException: no low surrogate in string` khi gặp một số bài báo có công thức trích xuất từ HTML bị vỡ cặp ký tự UTF-16 (`\ud800–\udfff`).
   - *Nguyên nhân gốc*: Python `str` cho phép chứa surrogate đơn lẻ, nhưng thư viện `tokenizers` viết bằng Rust ép chuyển sang UTF-8 chuẩn nghiêm ngặt nên gây panic làm chết tiến trình worker.
   - *Biện pháp triệt để*: Bổ sung bộ lọc làm sạch hai tầng tại cả `EmbedderService` ([embedder_service.py](../../backend/app/services/embedder_service.py)) và `NomicEmbedder` ([embedder.py](../../src/indexing/embedder.py)) bằng biểu thức `re.sub(r"[\ud800-\udfff]", " ", text)` kết hợp `encode("utf-8", errors="ignore").decode("utf-8")` trước mọi lệnh gọi tokenizer.
2. **Lỗi `BUG-02` & Quyết định `D-058`: LLM từ chối sai khi thiếu từ khóa mục ([BUG_02_RAG_FALSE_METHODOLOGY_FALLBACK_AND_REFUSAL.md](../bugs/BUG_02_RAG_FALSE_METHODOLOGY_FALLBACK_AND_REFUSAL.md))**: Đã khắc phục bằng chuẩn hóa Prompt *Synthesis-First* và tăng `RERANKER_CANDIDATE_K = 8` như phân tích tại §4.8.1.
3. **Khoảng cách Serving giữa Python FastAPI và `RAG_TS` (`EXP-05`)**: Trong khi đường ống đánh giá `RAG_TS` (`EXP-05`) đã sử dụng **`Laya` ONNX tinh chỉnh + BM25 SQLite độc lập + Cổng Chứng cứ $\theta = 0.6$** đạt `AUROC = 0.986`, máy chủ API FastAPI hiện tại ([reranker_service.py](../../backend/app/services/reranker_service.py)) vẫn đang cấu hình mặc định `cross-encoder/ms-marco-MiniLM-L-6-v2` (`max_length = 256`) và chấm điểm Lexical trong tập ứng viên thay vì gọi trực tiếp trọng số `Laya` ONNX tinh chỉnh với $T = 3.0627$. Việc hợp nhất mô hình `Laya` ONNX vào `RerankerService` là bước ưu tiên số một trong lộ trình nâng cấp Chương 7.
4. **Điểm nghẽn Hydration (`N=105` vs `N=169`)**: Như Bảng 5.3.2 chỉ ra, khoảng `38.9%` bài báo trong tập kiểm thử mở rộng chưa có đoạn văn đầy đủ trong `ChunkStore` kéo `Context Recall` từ `0.900` xuống `0.637`, đòi hỏi hoàn tất các tác vụ bù đắp toàn văn (`backfill_missing_papers.py`).
