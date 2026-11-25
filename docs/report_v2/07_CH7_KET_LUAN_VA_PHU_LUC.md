# Chương 7: Kết Luận, Hạn Chế & Phụ Lục Tái Lập

- **Motivation/Background**: Sau toàn bộ quá trình xây dựng từ lớp lưu trữ Lakehouse Bronze–Silver–Gold (`71,927` bài báo, `1,043,594` vector), triển khai phân tích khám phá và bốn trụ cột khai phá dữ liệu, tích hợp đường ống Hybrid RAG có Reranking & Cổng Chứng cứ cho tới đánh giá thực nghiệm trên RTX 4060 `8 GB`, cần tổng hợp khách quan những đóng góp đạt được, chỉ rõ không né tránh các giới hạn kỹ thuật (*Threats to Validity*), đề xuất lộ trình nâng cấp tiếp theo và đóng gói đầy đủ phụ lục siêu tham số cùng danh mục bằng chứng phục vụ kiểm chứng tái lập.
- **Purpose**: (1) Tổng kết các đóng góp khoa học và kỹ thuật cốt lõi theo mục tiêu đề tài; (2) Phân tích trung thực 5 mối đe dọa tính hợp lệ và khoảng cách vận hành hiện tại; (3) Đề xuất 4 hướng phát triển khả thi; (4) Cung cấp Phụ lục A (Bảng Siêu tham số Toàn hệ thống) và Phụ lục B (Danh mục Mã nguồn, Dữ liệu Gold & Tệp Bằng chứng Kiểm toán).
- **Overview Pipeline**: Tổng kết chuỗi giá trị Lakehouse (`MinIO S3 + DuckDB + Qdrant`) $\rightarrow$ 4 Trụ cột Khai phá (`FP-Growth`, `EM GMM 2-sigma`, `PageRank/Louvain`, `Delta-Share + Isolation Forest`) $\rightarrow$ `Hybrid RRF + Laya ONNX + Temperature Scaling + Evidence Gate` $\rightarrow$ Đánh giá & Kế hoạch đồng bộ hóa sản xuất.
- **Detailed Plan**: (7.1) Tổng kết đóng góp; (7.2) Đánh giá giới hạn và *Threats to Validity*; (7.3) Hướng phát triển tương lai; (7.4) Phụ lục A: Siêu tham số hợp nhất; (7.5) Phụ lục B: Danh mục tài sản mã nguồn & bằng chứng.
- **References**: [00_MASTER_OUTLINE_AND_LATEX_MAPPING.md](./00_MASTER_OUTLINE_AND_LATEX_MAPPING.md), [EXP_01_LAKEHOUSE_SCALING_AND_CHUNKSTORE_HYDRATION.md](../experiments/EXP_01_LAKEHOUSE_SCALING_AND_CHUNKSTORE_HYDRATION.md), [EXP_02_DOMAIN_AWARE_CHUNKING_AB.md](../experiments/EXP_02_DOMAIN_AWARE_CHUNKING_AB.md), [EXP_03_FOUR_PILLARS_MINING_72K_SCALE.md](../experiments/EXP_03_FOUR_PILLARS_MINING_72K_SCALE.md), [EXP_04_HYDRATED_5_SCENARIO_LAYA_PAGERANK.md](../experiments/EXP_04_HYDRATED_5_SCENARIO_LAYA_PAGERANK.md), [EXP_05_LAYA_SOFT_CE_FINETUNING_AND_EVIDENCE_GATE.md](../experiments/EXP_05_LAYA_SOFT_CE_FINETUNING_AND_EVIDENCE_GATE.md), [settings.py](../../src/config/settings.py), [config.py](../../backend/app/core/config.py), [mining_engine.py](../../src/mining/mining_engine.py), [retrieval_service.py](../../backend/app/services/retrieval_service.py), [reranker_service.py](../../backend/app/services/reranker_service.py), [rag_service.py](../../backend/app/services/rag_service.py), [chunker.py](../../src/indexing/chunker.py), [chunk_store.py](../../src/storage/chunk_store.py), [report_seed0.json](../../notebooks/laya_finetune/report_seed0.json), [table_hyperparameters.tex](../../data-mining-latek/tables/table_hyperparameters.tex), [Vuong_DECISION_LOG.md](../agent_logs/Vuong_DECISION_LOG.md), [README.md](../../benchmarks/rag_eval/README.md).
- **Created**: 2026-11-25T12:55:00+07:00
- **Last Updated**: 2026-11-25T12:55:00+07:00

[STATUS: ACTIVE]

---

## Mục lục

- [7.1. Tổng kết Đóng góp Khoa học & Kỹ thuật](#71-tổng-kết-đóng-góp-khoa-học--kỹ-thuật)
- [7.2. Đe dọa Tính hợp lệ (*Threats to Validity*) & Hạn chế Hiện tại](#72-đe-dọa-tính-hợp-lệ-threats-to-validity--hạn-chế-hiện-tại)
- [7.3. Hướng Phát triển Tương lai](#73-hướng-phát-triển-tương-lai)
- [7.4. Phụ lục A: Bảng Siêu tham số Hợp nhất Toàn hệ thống](#74-phụ-lục-a-bảng-siêu-tham-số-hợp-nhất-toàn-hệ-thống)
- [7.5. Phụ lục B: Danh mục Mã nguồn, Bằng chứng & Tài sản Kiểm toán](#75-phụ-lục-b-danh-mục-mã-nguồn-bằng-chứng--tài-sản-kiểm-toán)

---

## 7.1. Tổng kết Đóng góp Khoa học & Kỹ thuật

Hệ thống **UTH Scientific Lakehouse, Data Mining & Hybrid RAG** đã hoàn thành mục tiêu xây dựng một nền tảng hợp nhất từ thu hoạch tài liệu học thuật quy mô lớn đến suy luận hỏi đáp có kiểm soát trích dẫn, thể hiện qua bốn nhóm đóng góp cụ thể:

1. **Kiến trúc Lakehouse HTML-First & Tách tầng lưu trữ hiệu năng cao**: Xây dựng thành công kho dữ liệu trên `71,927` bài báo (`1,043,594` vector 768 chiều trên Qdrant tại ngày `04/11/2026`), giữ tỷ lệ làm giàu LaTeXML HTML đạt **`89.38%`** (`2,825,871` công thức toán ở lát cắt kiểm toán 13,000 bài), đồng thời cô lập văn bản dài khỏi bộ nhớ HNSW nhờ cặp **Qdrant 5-field payload** + **`ChunkStore` ZSTD Row-Group Min/Max** kèm bộ đệm LRU `20,000` đoạn.
2. **Định lượng 4 Quy luật Miền Dữ liệu Khoa học qua OLAP DuckDB không máy chủ**: Phẫu thuật ma trận `11,659 x 6` bằng kiểm định D'Agostino $K^2$ ($p < 0.001$) và khung 3 Lăng kính đã chứng minh tính lệch đuôi dài cực đoan (*Heavy Right Tail*, `words` $S = +49.92, K = +3,879.80$), chênh lệch `7.0x` mật độ công thức giữa `stat.ML` (`687.0` eq/bài) và `cs.CL` (`98.3` eq/bài), bất đối xứng `cs.AI` đa nhãn và đường cong chữ U ngược của `words_x_math_density` ($r = +0.012$ vs $\rho = +0.143^{***}$), làm tiền đề toán học cho mọi bước chuẩn hóa $\ln(1+x)$, chia đoạn cân bằng và phân cụm mềm.
3. **Vận hành đồng bộ Bốn Trụ cột Khai phá Dữ liệu (`234.57 s` toàn hồ)**:
   - *Trụ cột 1*: Khai phá **`45` luật kết hợp không trùng lặp** trên `61,319` giỏ giao dịch (`max Lift = 34.940`) nhờ bộ lọc `min_abs_transactions = 25` và khử đối xứng `_lift_key`.
   - *Trụ cột 2*: Triển khai **EM GMM Full-Covariance** kết hợp elip $2\sigma$ trên không gian chiếu PCA 2D, giải thích hiện tượng đa tạp liên thông (`Silhouette = 0.0490` trên `70,539` bài vs `0.3528` và `25.62%` bài liên ngành trên tập kiểm toán `800` bài).
   - *Trụ cột 3*: Hỗ trợ **đồ thị chế độ kép** (Citation DiGraph `8,892` nút / `86,295` cạnh vs Co-authorship trọng số phân đoạn `1/(N_p - 1)`) tính Damped PageRank ($\alpha = 0.85$) và Louvain modularity.
   - *Trụ cột 4*: Theo dõi **`48` chuyên ngành** bằng động lượng thị phần $\Delta\text{Share}$ qua `dense_rank()` và cô lập **`1,000` bài báo dị thường** bằng Isolation Forest 5 chiều trên thang $\ln(1+x)$ chỉ trong `2.89 s`.
4. **Đường ống Hybrid RAG có Gia cố PageRank & Cổng Chứng cứ Hiệu chỉnh (`Evidence Gate`)**: Khảo nghiệm cắt bỏ chứng minh sự cộng hưởng vượt trội khi kết hợp Vector + Laya + RRF ($k=60$) + PageRank (`MRR` tăng `+6.13%` lên `0.6076` và `Hit@1` lên `55.0%` trên `120` câu hỏi). Đặc biệt, mô hình tinh chỉnh `Laya` ONNX với hàm mất mát `Soft-CE` và `Temperature Scaling` ($T = 3.0627$) đã kéo sai số hiệu chỉnh `ECE` giảm `5.72x` (`0.1900 -> 0.0332`), giảm tỷ lệ chấp nhận nhầm bịa đặt từ `57.4%` xuống `1.5%`, đạt **`AUROC = 0.986`** (chặn **`50/50`** bẫy âm tính trong `Retrieval v1`) và đạt **`Hit@5 = 0.98`**, **`MRR = 0.8939`** ở thử nghiệm đối sánh 3 chiều `150` mẫu; đồng thời chuyển đổi CUDA `node-llama-cpp` đạt `46.33 tok/s` (`3.39 s` E2E, tăng tốc `11.0x`) trên RTX 4060 `8 GB`.

---

## 7.2. Đe dọa Tính hợp lệ (*Threats to Validity*) & Hạn chế Hiện tại

Nhằm giữ trọn vẹn chuẩn mực khoa học, năm hạn chế và rủi ro mất tính tương đồng thực nghiệm (*Threats to Validity*) dưới đây cần được nhận diện rõ:

1. **Khoảng cách Serving giữa Nhánh Thử nghiệm `RAG_TS` (`EXP-05`) và Backend FastAPI (`Internal/External Validity`)**:
   - Như đã đối chiếu tại §5.7, các kết quả đỉnh cao ở `EXP-05` (`AUROC = 0.986`, `Hit@5 = 0.94–0.98`, chặn `50/50` câu âm tính) được thực thi trên bộ chạy `RAG_TS` với mô hình **`Laya 0.4.27` ONNX tinh chỉnh** kết hợp chỉ mục **SQLite FTS5 BM25 độc lập** và ngưỡng cứng Cổng Chứng cứ `0.6`.
   - Trong khi đó, dịch vụ sản xuất FastAPI hiện tại ([reranker_service.py](../../backend/app/services/reranker_service.py) và [retrieval_service.py](../../backend/app/services/retrieval_service.py)) vẫn đang cấu hình mặc định `cross-encoder/ms-marco-MiniLM-L-6-v2` (`max_length = 256`), chấm điểm Lexical nội tập thay vì BM25 toàn cục, và chưa tự động từ chối ở ngưỡng `0.6`. Do đó, hiệu năng `prod` trên tập v1 chỉ đạt `MRR@10 = 0.561`, thấp hơn cấu hình `laya_ft1_hybrid` (`0.824`).
2. **Sự khác biệt công thức PageRank & RRF giữa `retrieval_service.py` và `EXP-04`**:
   - Dịch vụ FastAPI tính `RRF(k=60)` chuẩn hóa về `[0.70, 0.95]` và nhân hệ số uy tín tuyến tính `(1 + 0.25 * norm_pr)` ở cả bước tiền RRF lẫn hậu RRF. Ngược lại, kịch bản `EXP-04` ([evaluate_120_ranking_5_scenarios.py](../../benchmarks/evaluate_120_ranking_5_scenarios.py)) sử dụng Weighted RRF (`0.65` Vector / `1.35` Laya) kết hợp cộng biên `+0.025` cho điểm PageRank đã nén logarit. Hai biến thể này cần được hợp nhất về một công thức tham số hóa thống nhất trước khi mở rộng benchmark quy mô lớn.
3. **Thiếu hụt Hydration trên một phần kho bài báo cũ (`Construct Validity`)**:
   - Đánh giá DeepEval ở §5.3.2 cho thấy khi đưa thêm ~38.9% mẫu chưa hydrate được toàn văn (`N=169` so với `N=105`), `Context Recall` giảm từ `0.900` xuống `0.637`. Đây là rào cản về độ phủ dữ liệu cần xử lý qua chạy bù đắp toàn hồ trước khi đánh giá lại toàn diện.
4. **Nút thắt thời gian Đồ thị & Giới hạn Từ vựng Luật Kết hợp**:
   - Thuật toán Louvain + PageRank thuần Python (`NetworkX`) tiêu tốn **`116.39` giây (`49.6%` thời gian `MiningEngine`)** cho `71,927` bài; khi kho mở rộng lên `500,000` bài báo, độ phức tạp tính toán đồ thị đơn luồng sẽ vượt quá cửa sổ bảo trì ngắn.
   - Bộ phân tích giỏ giao dịch FP-Growth dựa trên danh sách tĩnh **`25` cụm từ khóa `KEYWORD_VOCAB`** nên chưa tự động phát hiện các thuật ngữ kỹ thuật hoàn toàn mới (ví dụ *Test-Time Compute*, *MoE Routing*, *State Space Models*) nếu không cập nhật từ điển thủ công.
5. **Tư thế Bảo mật Khóa Mặc định**: Dù [config.py](../../backend/app/core/config.py) và [settings.py](../../src/config/settings.py) dùng khóa đọc công khai cho Qdrant demo (`uth_guest_readonly_key_4b71a8e9d2c`), việc tồn tại bất kỳ chuỗi khóa mặc định nào trong mã nguồn đều đòi hỏi quy trình tách biệt hoàn toàn cấu hình sản xuất và cấu hình trình diễn.

---

## 7.3. Hướng Phát triển Tương lai

Từ năm hạn chế thực tế nêu trên, bốn hướng nâng cấp trực tiếp và khả thi cao được xác định cho giai đoạn tiếp theo:

1. **Hợp nhất `Laya` ONNX Tinh chỉnh ($T = 3.0627$) và Cổng Chứng cứ $\theta = 0.6$ vào FastAPI**: Đưa tệp ONNX xuất ra từ `notebooks/laya_onnx_20261108-2053_seed0/` vào thẳng `RerankerService` qua `onnxruntime` (kèm tùy chọn GPU CUDA Execution Provider), kết hợp triển khai chỉ mục BM25 toàn cục (SQLite FTS5 hoặc Qdrant Sparse Vectors `SPLADE`/BM25) để thu hẹp hoàn toàn khoảng cách giữa bản FastAPI hiện tại và mốc **`AUROC = 0.986` / `MRR@10 = 0.827`** đã kiểm chứng ở `EXP-05`.
2. **Hoàn thiện Hydration Toàn phần & Đồng bộ Hợp nhất Dữ liệu**: Kích hoạt định kỳ [backfill_missing_papers.py](../../scripts/backfill_missing_papers.py) và [dag_tier3_pdf_backfill.py](../../dags/dag_tier3_pdf_backfill.py) để đưa tỷ lệ bài báo được hydrate toàn văn trong `ChunkStore` tiệm cận `100%`, loại bỏ nguyên nhân sụt giảm `Context Recall`.
3. **Tăng tốc Khai phá Đồ thị & Trích xuất Khái niệm Động**: Chuyển đổi `ScientificGraphMiner` từ `NetworkX` thuần Python sang **`python-igraph`** (C backend) hoặc **`cuGraph`** (RAPIDS GPU) để cắt thời gian tính PageRank và Louvain xuống dưới `5` giây; đồng thời nâng cấp `AssociationRuleMiner` từ `KEYWORD_VOCAB` cố định sang trích xuất thực thể học thuật tự động bằng KeyBERT hoặc LLM batch tagging định kỳ.
4. **Cơ chế Từ chối Minh bạch và Suy luận Đa bước (Agentic Multi-Hop RAG)**: Kết nối trực tiếp đầu ra `Evidence Gate < 0.6` từ `RerankerService` vào `RagService` để kích hoạt luồng từ chối có cấu trúc (hiển thị top các bài liên quan gần nhất kèm xác suất hiệu chỉnh thấp thay vì ép LLM sinh văn bản), đồng thời tận dụng các cạnh trích dẫn trong đồ thị để suy luận tổng hợp qua 2 bước (*1-hop citation follow-up*) với các câu hỏi so sánh chuyên sâu.

---

## 7.4. Phụ lục A: Bảng Siêu tham số Hợp nhất Toàn hệ thống

> **5W1H — Phụ lục A: Bảng Siêu tham số Đã Kiểm chứng Trong Mã nguồn**
> - **What**: Tập hợp đầy đủ giá trị mặc định và thông số cấu hình chuẩn của tất cả mô-đun thu hoạch, chia đoạn, nhúng, lưu trữ, khai phá, RAG và huấn luyện Laya.
> - **Why**: Bảo đảm khả năng tái lập chính xác mọi thí nghiệm và cấu hình triển khai không sai lệch thông số.
> - **When**: Đồng bộ theo trạng thái mã nguồn hiện hành tại ngày `25/11/2026`.
> - **Where**: [settings.py](../../src/config/settings.py), [config.py](../../backend/app/core/config.py), [chunker.py](../../src/indexing/chunker.py), [chunk_store.py](../../src/storage/chunk_store.py), [src/mining/*.py](../../src/mining/mining_engine.py), [report_seed0.json](../../notebooks/laya_finetune/report_seed0.json).
> - **Who**: Kiểm toán trực tiếp từ tệp cấu hình nguồn và file JSON log huấn luyện.
> - **How**: Đối chiếu từng hằng số trong mã nguồn Python và trường cấu hình trong tệp JSON.

| Phân hệ | Tên Siêu tham số (`Symbol / Env`) | Giá trị Mặc định / Dùng Thực nghiệm | Tệp nguồn xác thực |
| :--- | :--- | :--- | :--- |
| **Lakehouse Storage** | `MINIO_BUCKET_NAME` / `LAKEHOUSE_BUDGET_GB` | `"uth-scientific-lakehouse"` / `20.0 GB` | [config.py](../../backend/app/core/config.py) |
| **DuckDB S3 OLAP** | `http_retries` / `http_retry_wait_ms` / `backoff` | `8` lần / `500 ms` / hệ số `2` | [lake_access.py](../../src/mining/lake_access.py) |
| **RabbitMQ & Harvest** | `EMBED_QUEUE_MAX` / `HEARTBEAT_SECONDS` / `HARVEST_BATCH` | `500` / `600 s` / `1,000` (`LOW_WATER=200`) | [settings.py](../../src/config/settings.py), [queue_consumer.py](../../src/ingestion/queue_consumer.py), [_common.py](../../dags/_common.py) |
| **Chunking & Store** | `max_chunk_words` / `overlap_ratio` / `min_tail_ratio` | `300` (`450` worker) / `0.15` (`[20,80]`) / `0.4` | [chunker.py](../../src/indexing/chunker.py), [queue_consumer.py](../../src/ingestion/queue_consumer.py) |
| **ChunkStore Cache** | `ROW_GROUP_SIZE` / `cache_size` / `max_workers` | `512` dòng (ZSTD) / `20,000` đoạn / `16` luồng | [chunk_store.py](../../src/storage/chunk_store.py) |
| **Embedding Model** | `nomic-embed-text-v1.5` / `max_length` / Vector Dim | `2,048` token (RoPE) / `768` chiều ($L_2$-norm) | [embedder_service.py](../../backend/app/services/embedder_service.py), [embedder.py](../../src/indexing/embedder.py) |
| **FP-Growth (Pillar 1)** | `min_support` / `min_lift` / `min_abs_tx` / `top_k` | `0.02` (fallback `0.01`) / `1.2` (`1.0`) / `25` / `50` | [association_rules.py](../../src/mining/association_rules.py) |
| **Clustering (Pillar 2)** | `n_clusters` / `batch_size` / `GMM covariance` / `cross_thr` | `6` / `2,048` / `"full"` (`max_iter=200`) / `< 0.65` | [cluster_analysis.py](../../src/mining/cluster_analysis.py) |
| **DBSCAN (Pillar 2)** | `eps` / `min_samples` / `metric` / `dbscan_sample` | `0.28` / `10` / `"cosine"` / `3,000` | [cluster_analysis.py](../../src/mining/cluster_analysis.py) |
| **Graph (Pillar 3)** | `pagerank alpha` / `louvain seed` / `top_hubs_limit` | `0.85` / `42` / `100` | [graph_mining.py](../../src/mining/graph_mining.py), [mining_engine.py](../../src/mining/mining_engine.py) |
| **Trend & IF (Pillar 4)** | `all_time_total` / `SURGING` / `contamination` / `n_est` | `>= 40` / `>15%` or `>+1.5pp` / `0.02` / `100` | [trend_anomaly_mining.py](../../src/mining/trend_anomaly_mining.py) |
| **Hybrid RAG & RRF** | `k_RRF` / `candidate_limit` / `PageRank boost` / `_MAX_PR` | `60` / `min(max(k*2,25),40)` / `+25%` / `0.012632` | [retrieval_service.py](../../backend/app/services/retrieval_service.py) |
| **Reranker & Gate** | `RERANKER_CANDIDATE_K` / `max_len` (FastAPI vs Laya) / $\theta$ | `8` / `256` (FastAPI) vs `512` (Laya) / `0.60` | [reranker_service.py](../../backend/app/services/reranker_service.py), [report_seed0.json](../../notebooks/laya_finetune/report_seed0.json) |
| **Laya Fine-Tune** | `epochs` / `micro_batch x accum` / `lr` / `T*` | `4` (`1` ONNX v1) / `8 x 8` / `2.5e-5` (head `1e-4`) / `3.0627` | [report_seed0.json](../../notebooks/laya_finetune/report_seed0.json), [RUN_INFO.json](../../notebooks/laya_onnx_20261108-2053_seed0/RUN_INFO.json) |
| **LLM Generation** | `Qwen-2.5-7B Q4_K_M` / `N_ctx` / `max_tokens` / `temp` | `16,384` (Vulkan `4,096`) / `1,536` / `0.1` (`ChatRequest`) | [config.py](../../backend/app/core/config.py), [chat.py](../../backend/app/schemas/chat.py), [llm_client.py](../../backend/app/services/llm_client.py) |

---

## 7.5. Phụ lục B: Danh mục Mã nguồn, Bằng chứng & Tài sản Kiểm toán

Bảng dưới đây lập chỉ mục toàn bộ các tệp thực thi, tệp bằng chứng JSON, nhật ký lỗi và bộ đánh giá phục vụ việc đối chiếu trực tiếp từ Chương 3 đến Chương 7:

| Phân nhóm Tài sản | Đường dẫn tương đối xác thực | Vai trò kiểm chứng trong báo cáo |
| :--- | :--- | :--- |
| **Lõi Khai phá Dữ liệu** | [eda_engine.py](../../src/mining/eda_engine.py), [association_rules.py](../../src/mining/association_rules.py), [cluster_analysis.py](../../src/mining/cluster_analysis.py), [graph_mining.py](../../src/mining/graph_mining.py), [trend_anomaly_mining.py](../../src/mining/trend_anomaly_mining.py), [lake_access.py](../../src/mining/lake_access.py), [mining_engine.py](../../src/mining/mining_engine.py) | Cài đặt DuckDB S3 OLAP, 3 Lăng kính và 4 Trụ cột khai phá (Ch. 3, Ch. 4a) |
| **Lõi Lưu trữ & Lập chỉ mục** | [chunk_store.py](../../src/storage/chunk_store.py), [minio_client.py](../../src/storage/minio_client.py), [silver_writer.py](../../src/transformation/silver_writer.py), [chunker.py](../../src/indexing/chunker.py), [embedder.py](../../src/indexing/embedder.py), [qdrant_manager.py](../../src/indexing/qdrant_manager.py), [hasher.py](../../src/utils/hasher.py) | Bất biến SHA-256, chia đoạn cân bằng, Row-Group Hydration và Qdrant 5 trường (Ch. 4b, Ch. 6) |
| **Dịch vụ FastAPI & RAG** | [main.py](../../backend/app/main.py), [config.py](../../backend/app/core/config.py), [retrieval_service.py](../../backend/app/services/retrieval_service.py), [reranker_service.py](../../backend/app/services/reranker_service.py), [rag_service.py](../../backend/app/services/rag_service.py), [llm_client.py](../../backend/app/services/llm_client.py), [embedder_service.py](../../backend/app/services/embedder_service.py), [streaming_service.py](../../backend/app/services/streaming_service.py), [storage_service.py](../../backend/app/services/storage_service.py) | Truy hồi lai RRF, PageRank, Rerank, Prompt Grounding & SSE hai nhịp độ (Ch. 4b, Ch. 6) |
| **Giao diện Web React 19** | [package.json](../../frontend/package.json), [eda.screen.tsx](../../frontend/src/screens/eda.screen.tsx), [pillars.screen.tsx](../../frontend/src/screens/pillars.screen.tsx), [rag.screen.tsx](../../frontend/src/screens/rag.screen.tsx), [logs.screen.tsx](../../frontend/src/screens/logs.screen.tsx) | Kết xuất KaTeX LaTeX, biểu đồ 3 Lăng kính, GMM 2-sigma và theo dõi SSE (Ch. 6) |
| **Điều phối Airflow & Queue** | [queue_consumer.py](../../src/ingestion/queue_consumer.py), [dag_tier1_realtime_stream.py](../../dags/dag_tier1_realtime_stream.py), [dag_tier2_near_past_harvest.py](../../dags/dag_tier2_near_past_harvest.py), [dag_compact_silver.py](../../dags/dag_compact_silver.py), [dag_recompute_mining.py](../../dags/dag_recompute_mining.py) | Hàng đợi AMQP 2 tầng `EMBED_QUEUE_MAX=500` và lịch trình DAG ICT (Ch. 6) |
| **Bằng chứng Khai phá JSON** | [eda_api.json](../../data-mining-latek/figures/captured_20261123_082337/evidence/eda_api.json), [clusters_api.json](../../data-mining-latek/figures/captured_20261123_082337/evidence/clusters_api.json), [eda_summary.json](../../data/gold/mining/eda_summary.json), [association_rules.json](../../data/gold/mining/association_rules.json), [clusters.json](../../data/gold/mining/clusters.json), [graph_coauthorship.json](../../data/gold/mining/graph_coauthorship.json), [trends_anomalies.json](../../data/gold/mining/trends_anomalies.json), [citation_metrics.parquet](../../data/gold/graphs/citation_metrics.parquet) | Dữ liệu kiểm toán thống kê 3 Lăng kính, luật kết hợp, GMM và đồ thị (Ch. 3, Ch. 4a) |
| **Bằng chứng Benchmark & Huấn luyện** | [chunking_ab.py](../../benchmarks/chunking_ab.py), [evaluate_120_ranking_5_scenarios.py](../../benchmarks/evaluate_120_ranking_5_scenarios.py), [laya_5_scenarios_comparison_120q.json](../../logs/benchmarks/laya_5_scenarios_comparison_120q.json), [cached_eval_master_k5_pagerank_local.json](../../logs/benchmarks/cached_eval_master_k5_pagerank_local.json), [RUN_INFO.json](../../notebooks/laya_onnx_20261108-2053_seed0/RUN_INFO.json), [report_seed0.json](../../notebooks/laya_finetune/report_seed0.json), [laya_ab_final_benchmark.json](../../logs/benchmarks/laya_ab_final_benchmark.json), [vector_final_benchmark.json](../../logs/benchmarks/vector_final_benchmark.json) | Bằng chứng định lượng gốc cho `EXP-02`, `EXP-04`, `EXP-05` (Ch. 5) |
| **Báo cáo Lịch sử & Sửa lỗi** | [laya_pagerank_benchmark_report.md](../benchmarks/laya_pagerank_benchmark_report.md), [PERFORMANCE_BENCHMARK_REPORT.md](../benchmarks/PERFORMANCE_BENCHMARK_REPORT.md), [RAG_EVALUATION_REPORT_21_SAMPLES.md](../benchmarks/RAG_EVALUATION_REPORT_21_SAMPLES.md), [Vuong_DECISION_LOG.md](../agent_logs/Vuong_DECISION_LOG.md), [BUG_01_TOKENIZER_SURROGATE_CRASH.md](../bugs/BUG_01_TOKENIZER_SURROGATE_CRASH.md), [BUG_02_RAG_FALSE_METHODOLOGY_FALLBACK_AND_REFUSAL.md](../bugs/BUG_02_RAG_FALSE_METHODOLOGY_FALLBACK_AND_REFUSAL.md), [conftest.py](../../tests/conftest.py) | Hồ sơ RTX 4060, PoC 21 mẫu, nhật ký quyết định `D-001`–`D-058` và rào chắn kiểm thử (Ch. 4b, Ch. 5, Ch. 6) |

*Lưu ý về nhật ký ngoại tuyến*: Ba tài nguyên đường dẫn `logs/run/backend.log`, `logs/benchmarks/chunking_ab/summary.json`, `logs/benchmarks/rag_eval/report_retrieval.json` và tiền tố kho đối tượng `s3://uth-scientific-lakehouse/...` được tham chiếu ở dạng chuỗi định danh kỹ thuật trong báo cáo này vì không đóng gói trực tiếp trong kho Git tĩnh mà lưu trên môi trường chạy/S3 hoặc tổng hợp qua các bảng kết xuất `.tex` tương ứng (`table_chunking_ab.tex`, `table_retrieval_v1.tex`).
