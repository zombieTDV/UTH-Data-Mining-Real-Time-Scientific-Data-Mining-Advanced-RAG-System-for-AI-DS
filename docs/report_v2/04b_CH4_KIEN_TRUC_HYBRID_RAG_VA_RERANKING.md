# Chương 4 (Phần 2): Kiến Trúc Hybrid RAG, Reranking & Cổng Chứng Cứ

- **Motivation/Background**: Dù tìm kiếm vector dày đặc (`nomic-embed-text-v1.5`, 768 chiều) xử lý tốt ngữ nghĩa khái quát, nó thường suy giảm độ chính xác với truy vấn chứa từ viết tắt học thuật, mã hiệu bài báo, hoặc những câu hỏi không có bằng chứng trong kho (*out-of-scope / unanswerable*). Ngược lại, chỉ dùng một luồng truy hồi hoặc tin tưởng tuyệt đối vào độ tương đồng Cosine thô dễ dẫn tới lỗi chọn sai bài nguồn và hiện tượng mô hình ngôn ngữ lớn (LLM) tự bịa thông tin (*hallucination*).
- **Purpose**: Trình bày đầy đủ kiến trúc truy hồi lai phân tầng (Tiered Hybrid RAG), cơ chế hợp nhất hạng nghịch đảo RRF ($k=60$) kết hợp gia cố uy tín PageRank, mô-đun Hydration tự động từ `ChunkStore` nhằm giữ tải trọng Qdrant nhẹ, kiến trúc tái xếp hạng Cross-Encoder + điều chỉnh ngưỡng tin cậy (Temperature Scaling & Evidence Gate), và quy trình sinh câu trả lời có ràng buộc trích dẫn kèm sửa lỗi `BUG-02`.
- **Overview Pipeline**: Truy vấn người dùng $\rightarrow$ Khớp định danh/tiêu đề trực tiếp (`arXiv`/`OpenAlex`) $\rightarrow$ Tìm kiếm song song Dense (Qdrant + `ChunkStore` Hydration) và Lexical In-Pool Scoring + Mở rộng luật FP-Growth $\rightarrow$ Hợp nhất RRF ($k=60$) & Gia cố PageRank (`+25%`) $\rightarrow$ Cross-Encoder Reranking & Cổng Chứng cứ (Evidence Gate $\theta = 0.6$) $\rightarrow$ Prompt ép trích dẫn toàn bộ chứng cứ sang LLM (`Qwen-2.5-7B-Instruct Q4_K_M` / Groq / Ollama) $\rightarrow$ SSE Stream tới giao diện KaTeX.
- **Detailed Plan**: Phân tích 4 khối kỹ thuật cốt lõi: (4.5) Kiến trúc phân tầng tách biệt trách nhiệm giữa Qdrant, ChunkStore Parquet và Mining Signals; (4.6) Đường ống Hybrid Retrieval, RRF, PageRank và quy tắc Lexical Scoring; (4.7) Cross-Encoder Reranker & Tinh chỉnh Laya ONNX với Calibration + Evidence Gate; (4.8) Quản trị Prompt LLM, khắc phục `BUG-02` và cơ chế Fallback an toàn.
- **References**: [04a_CH4_BON_TRU_COT_KHAI_PHA_DU_LIEU.md](./04a_CH4_BON_TRU_COT_KHAI_PHA_DU_LIEU.md), [EXP_04_HYDRATED_5_SCENARIO_LAYA_PAGERANK.md](../experiments/EXP_04_HYDRATED_5_SCENARIO_LAYA_PAGERANK.md), [EXP_05_LAYA_SOFT_CE_FINETUNING_AND_EVIDENCE_GATE.md](../experiments/EXP_05_LAYA_SOFT_CE_FINETUNING_AND_EVIDENCE_GATE.md), [retrieval_service.py](../../backend/app/services/retrieval_service.py), [reranker_service.py](../../backend/app/services/reranker_service.py), [rag_service.py](../../backend/app/services/rag_service.py), [llm_client.py](../../backend/app/services/llm_client.py), [embedder_service.py](../../backend/app/services/embedder_service.py), [chunk_store.py](../../src/storage/chunk_store.py), [config.py](../../backend/app/core/config.py), [score_retrieval.py](../../benchmarks/rag_eval/score_retrieval.py), [evaluate_120_ranking_5_scenarios.py](../../benchmarks/evaluate_120_ranking_5_scenarios.py), [BUG_02_RAG_FALSE_METHODOLOGY_FALLBACK_AND_REFUSAL.md](../bugs/BUG_02_RAG_FALSE_METHODOLOGY_FALLBACK_AND_REFUSAL.md), [Vuong_DECISION_LOG.md](../agent_logs/Vuong_DECISION_LOG.md).
- **Created**: 2026-11-25T12:55:00+07:00
- **Last Updated**: 2026-11-25T12:55:00+07:00

[STATUS: ACTIVE]

---

## Mục lục

- [4.5. Kiến trúc Phân tầng Tách biệt Trách nhiệm (Tiered Separation of Concerns)](#45-kiến-trúc-phân-tầng-tách-biệt-trách-nhiệm-tiered-separation-of-concerns)
  - [4.5.1. Ranh giới bất biến giữa Qdrant Vector Index và `ChunkStore` Parquet](#451-ranh-giới-bất-biến-giữa-qdrant-vector-index-và-chunkstore-parquet)
  - [4.5.2. Cơ chế Hydration theo dãy `row-group min/max` và LRU RAM Cache](#452-cơ-chế-hydration-theo-dãy-row-group-minmax-và-lru-ram-cache)
- [4.6. Đường ống Hybrid Retrieval, RRF ($k=60$) & Gia cố PageRank](#46-đường-ống-hybrid-retrieval-rrf-k60--gia-cố-pagerank)
  - [4.6.1. Đường nhánh định danh trực tiếp (`arXiv` / `OpenAlex` ID) và khớp tiêu đề](#461-đường-nhánh-định-danh-trực-tiếp-arxiv--openalex-id-và-khớp-tiêu-đề)
  - [4.6.2. Nhánh Dense (`nomic-embed-text-v1.5`) và cơ chế tiền xử lý an toàn](#462-nhánh-dense-nomic-embed-text-v15-và-cơ-chế-tiền-xử-lý-an-toàn)
  - [4.6.3. Nhánh Lexical Scoring và chú thích mở rộng luật FP-Growth](#463-nhánh-lexical-scoring-và-chú-thích-mở-rộng-luật-fp-growth)
  - [4.6.4. Reciprocal Rank Fusion (RRF) và công thức gia cố PageRank](#464-reciprocal-rank-fusion-rrf-và-công-thức-gia-cố-pagerank)
- [4.7. Cross-Encoder Reranking, Temperature Scaling & Evidence Gate](#47-cross-encoder-reranking-temperature-scaling--evidence-gate)
  - [4.7.1. Bi-Encoder vs Cross-Encoder và kiến trúc chấm điểm kép](#471-bi-encoder-vs-cross-encoder-và-kiến-trúc-chấm-điểm-kép)
  - [4.7.2. Huấn luyện `Laya` Cross-Encoder ONNX (`Soft-CE`), Temperature Scaling & Ngưỡng tin cậy `0.6`](#472-huấn-luyện-laya-cross-encoder-onnx-soft-ce-temperature-scaling--ngưỡng-tin-cậy-06)
- [4.8. Tổng hợp Sinh câu trả lời, Bảo toàn Grounding (`BUG-02`) & Multi-Backend LLM](#48-tổng-hợp-sinh-câu-trả-lời-bảo-toàn-grounding-bug-02--multi-backend-llm)
  - [4.8.1. Giao thức Prompt ép trích dẫn và phân tích lỗi `BUG-02` (`D-058`)](#481-giao-thức-prompt-ép-trích-dẫn-và-phân-tích-lỗi-bug-02-d-058)
  - [4.8.2. Phân cấp chuỗi cung cấp LLM và chặn tràn cửa sổ ngữ cảnh](#482-phân-cấp-chuỗi-cung-cấp-llm-và-chặn-tràn-cửa-sổ-ngữ-cảnh)

---

## 4.5. Kiến trúc Phân tầng Tách biệt Trách nhiệm (Tiered Separation of Concerns)

Hệ thống truy hồi và hỏi đáp học thuật phải giải quyết bài toán cân bằng giữa tốc độ tìm kiếm dưới giây trên hơn **`1.04` triệu vector** và yêu cầu tiết kiệm bộ nhớ RAM trên hạ tầng Qdrant/S3 chi phí tối ưu. Để đạt được điều đó, toàn bộ pipeline được chia thành 3 tầng trách nhiệm độc lập trong [retrieval_service.py](../../backend/app/services/retrieval_service.py) và [chunk_store.py](../../src/storage/chunk_store.py):

| Tầng trách nhiệm | Thành phần lưu trữ / tính toán | Nội dung nắm giữ | Mục tiêu thiết kế |
| :--- | :--- | :--- | :--- |
| **Tầng 1: Vector Index gọn nhẹ** | Qdrant Cloud (`scientific_papers_gold`) | Vector 768D + **chỉ 5 trường payload** (`chunk_id`, `paper_id`, `year`, `primary_category`, `section_type`) | Tối thiểu hóa dấu chân RAM của chỉ mục HNSW trên Qdrant (giảm 80–90% dung lượng payload so với nhét full-text) |
| **Tầng 2: Kho Đoạn văn bền vững** | MinIO S3 `gold/chunks/` (`ChunkStore`) | Toàn văn chunk nén ZSTD (`ROW_GROUP_SIZE = 512`), `section_title`, `word_count`, metadata danh mục & tác giả | Cung cấp truy cập ngẫu nhiên theo lô song song cho top $K$ ứng viên sau tìm kiếm vector |
| **Tầng 3: Tín hiệu Tri thức Offline** | MinIO `gold/mining/*.json` + RAM Backend | Điểm PageRank chuẩn hóa (`max_pagerank = 0.012632`) và bản đồ luật kết hợp FP-Growth | Nâng hạng bài báo nền tảng và mở rộng từ khóa truy vấn không tốn chi phí quét đồ thị lúc runtime |

### 4.5.1. Ranh giới bất biến giữa Qdrant Vector Index và `ChunkStore` Parquet

Trong các thiết kế RAG sơ khai trước đây (giai đoạn LanceDB `143,523` đoạn), việc nhồi toàn bộ chuỗi văn bản, danh sách tác giả và siêu dữ liệu vào payload của cơ sở dữ liệu vector khiến dung lượng chỉ mục tăng tuyến tính theo số từ, đẩy chi phí RAM lên cao và làm chậm mạng khi trả kết quả Top-40. Tách biệt kiến trúc hiện tại quy định trong [chunk_store.py](../../src/storage/chunk_store.py) hằng số bất biến `QDRANT_PAYLOAD_FIELDS = ("chunk_id", "paper_id", "year", "primary_category", "section_type")`. Mỗi điểm vector trong Qdrant chỉ dùng khóa định danh UUIDv5 deterministically suy ra từ `chunk_id` qua không gian `NAMESPACE_DNS` ([qdrant_manager.py](../../src/indexing/qdrant_manager.py)), tuyệt đối không lưu văn bản thô dài dòng trong bộ nhớ chỉ mục Qdrant.

### 4.5.2. Cơ chế Hydration theo dãy `row-group min/max` và LRU RAM Cache

Khi `RetrievalService` truy vấn `candidate_limit = min(max(k * 2, 25), 40)` ứng viên từ Qdrant, các vector có payload rút gọn thiếu `text` hoặc `title`/`authors` được đi qua bước **Hydration** tự động thông qua `ChunkStore.fetch_chunks(chunk_ids)`:

1. **Bộ đệm LRU 20,000 đoạn trong RAM (`cache_size = 20000`)**: Những đoạn thuộc các bài báo nền tảng hay được hỏi đi hỏi lại được phục vụ ngay trong bộ nhớ RAM ở mức dưới mili-giây mà không cần chạm vào MinIO S3.
2. **Đọc chọn lọc theo thống kê `row-group min/max` trên Parquet ZSTD**: Thay vì đọc toàn bộ các tệp phân mảnh (`gold/chunks/parts/` và các bảng hợp nhất `gold/chunks/chunk_store_*.parquet`), `ChunkStore` kiểm tra siêu dữ liệu `min/max` của cột `chunk_id` trong từng nhóm hàng (`ROW_GROUP_SIZE = 512`). Với mỗi khóa `chunk_id` có tiền tố `paper_id`, chỉ các row-group chứa khoảng `[min, max]` bao phủ `chunk_id` đích mới được tải song song bằng `ThreadPoolExecutor(max_workers=16)` (hoặc tối đa 4 luồng dự phòng tại `retrieval_service.py` cho metadata tác giả từ `lake_service.lookup_paper`).
3. **Cơ chế `latest_only`**: Tự động lọc bỏ các phân mảnh `part-*.parquet` có dấu thời gian cũ hơn tệp hợp nhất chính (`chunk_store_*.parquet`) để tránh đọc trùng lặp khi tác vụ hợp nhất chạy nền.

---

## 4.6. Đường ống Hybrid Retrieval, RRF ($k=60$) & Gia cố PageRank

Hàm `RetrievalService.retrieve()` điều phối quá trình truy xuất theo chế độ `retrieval_mode` (`"hybrid"` mặc định, `"vector"` hoặc `"graph"`), kết hợp linh hoạt giữa khớp định danh chính xác, tìm kiếm ngữ nghĩa dày đặc, chấm điểm từ vựng tại chỗ và hợp nhất thứ hạng.

### 4.6.1. Đường nhánh định danh trực tiếp (`arXiv` / `OpenAlex` ID) và khớp tiêu đề

Trước khi nhúng câu hỏi thành vector, dịch vụ kiểm tra hai mẫu trích xuất tức thời:
- **`_extract_paper_id_from_query(query)`**: Bắt chính xác mã định danh OpenAlex (`\b(W\d{8,11})\b`) hoặc mã arXiv (`\b(\d{4}\.\d{4,5}(?:v\d+)?)\b`) không phân biệt hoa thường. Nếu khớp, `lake_service.lookup_paper(paper_id)` đọc thẳng toàn bộ các đoạn của bài báo đó từ hồ và gán điểm khởi đầu `0.98`, bảo đảm **tỷ lệ bỏ sót bằng 0** với các truy vấn hỏi đích danh bài báo (như *"Explain paper 1706.03762"*).
- **`_search_title_matches(query)`**: Nếu truy vấn chứa cụm nằm trong dấu ngoặc kép hoặc là cụm ngắn `<= 6` từ không phải từ để hỏi (`what`, `how`, `explain`, `summarize`...), dịch vụ đối chiếu tiêu đề trên bộ nhớ `lake_service.search_titles(query)` và tiêm tối đa `5` bài khớp vào tập ứng viên với điểm nền `0.95`.

### 4.6.2. Nhánh Dense (`nomic-embed-text-v1.5`) và cơ chế tiền xử lý an toàn

`EmbedderService` ([embedder_service.py](../../backend/app/services/embedder_service.py)) nạp mô hình `nomic-ai/nomic-embed-text-v1.5` (`trust_remote_code=True`), áp dụng bản vá `_patch_extended_mask` tương thích `transformers` mới để hỗ trợ nội suy vị trí RoPE lên tối đa **`max_length = 2,048` token**. Mọi truy vấn trước khi đưa vào mô hình đều được gắn tiền tố bắt buộc **`"search_query: "`** (đối xứng với tiền tố `"search_document: "` lúc lập chỉ mục), băm kết quả vào **bộ đệm LRU `1,024` câu truy vấn gần nhất** và chuẩn hóa $L_2$. Điểm đặc biệt quan trọng là hàm khử ký tự Unicode surrogate (`re.sub(r"[\ud800-\udfff]", " ", text)`) nhằm chặn đứng lỗi sập bộ tách từ Rust (`BUG-01` sẽ phân tích chi tiết ở Chương 5).

### 4.6.3. Nhánh Lexical Scoring và chú thích mở rộng luật FP-Growth

Trong phiên bản FastAPI sản xuất (`retrieval_service.py`), nhánh từ vựng thực hiện chấm điểm đa tầng (`_compute_lexical_score()`) trực tiếp trên tập ứng viên thu được (Qdrant + tra cứu trực tiếp) kết hợp ánh xạ mở rộng từ luật kết hợp FP-Growth (`_expand_rules()`):

```python
# In-pool lexical scoring weighting exact phrases, titles, acronyms and sections
if phrase_present:
    score += 5.0
if exact_title_match:
    score += 8.0
if term_count >= 2 and all_terms_in_title:
    score += 10.0
for t in terms:
    is_acronym = len(t) >= 2 and len(t) <= 6 and t.isupper()
    if t in body_lower:
        score += 3.0 if is_acronym else 1.0
    if t in title_lower:
        score += 4.0 if is_acronym else 2.0
    if t in section_lower:
        score += 1.5
score += (matched_terms / max(1, len(terms))) * 3.0
norm_lexical = min(1.0, score / max(1.0, len(terms) * 5.0))
```

Thiết kế này ưu tiên rõ ràng các thuật ngữ viết tắt in hoa học thuật (như `RRF`, `PPO`, `VAE`, `LoRA` — thưởng `+3.0` trong thân bài và `+4.0` trong tiêu đề thay vì `+1.0` như từ thường), đồng thời cộng thêm hệ số bao phủ toàn bộ từ khóa (`coverage * 3.0`). Song song đó, trong đường ống đánh giá chuyên sâu `RAG_TS` (`EXP-05`, [README.md](../../benchmarks/rag_eval/README.md)), nhánh từ vựng được tách thành **chỉ mục BM25 toàn văn độc lập trên SQLite FTS5** trên tập đoạn văn trước khi hợp nhất với kết quả Dense.

### 4.6.4. Reciprocal Rank Fusion (RRF) và công thức gia cố PageRank

Khi cả hai danh sách xếp hạng Dense (`dense_ranked`) và Lexical (`lexical_ranked`) đã hoàn tất trong `RetrievalService` (`retrieval_mode == "hybrid"`), hệ thống hợp nhất bằng thuật toán **Reciprocal Rank Fusion (RRF)** với hằng số làm trơn $k_{\text{RRF}} = 60$:

$$
\mathrm{RRF}(d) = \frac{1}{k_{\text{RRF}} + r_{\text{dense}}(d)} + \frac{1}{k_{\text{RRF}} + r_{\text{lexical}}(d)}, \qquad k_{\text{RRF}} = 60
$$

Trong đó: $r_{\text{dense}}(d)$ và $r_{\text{lexical}}(d)$ là thứ hạng đánh số từ `1` của đoạn văn $d$ trong danh sách xếp hạng ngữ nghĩa dày đặc và xếp hạng từ vựng tương ứng. Để chuẩn hóa điểm RRF thô (có cực đại lý thuyết là $2 / (60 + 1) = 2/61 \approx 0.032787$) về dải xác suất thân thiện với giao diện và cổng ngưỡng, `retrieval_service.py` ánh xạ tuyến tính về khoảng **`[0.70, 0.95]`**:

$$
S_{\text{base}}(d) = 0.70 + \left(\frac{\mathrm{RRF}(d)}{2 / 61}\right) \times 0.25
$$

Tiếp theo, uy tín học thuật được tích hợp thông qua **hệ số gia cố nhân tính PageRank** (khi `use_pagerank = True`):

$$
\widetilde{\mathrm{PR}}(d) = \min\!\left(1.0,\; \frac{\max_{a \in \text{Authors}(d)} \mathrm{PR}(a)}{\max(10^{-6},\; \mathrm{PR}_{\max})}\right), \qquad S_{\text{final}}(d) = \min\!\left(0.9999,\; S_{\text{base}}(d) \cdot \left(1 + 0.25\,\widetilde{\mathrm{PR}}(d)\right)\right)
$$

Trong đó: $\mathrm{PR}(a)$ là điểm PageRank của tác giả hoặc bài báo trích xuất từ đồ thị Trụ cột 3 (`_match_authority()` đối chiếu bảng băm thường hóa họ tên tác giả); $\mathrm{PR}_{\max} = 0.012632$ là giá trị PageRank trần mặc định của đồ thị trích dẫn; hệ số `0.25` giới hạn mức thưởng uy tín tối đa là **`+25%`** và `0.9999` ngăn vượt quá biên `1.0`.

*Ghi nhận thiết kế thực nghiệm đối sánh*: Cần phân biệt rõ hai biến thể công thức hợp nhất tồn tại trong kho mã nguồn:
1. **Trong `backend/app/services/retrieval_service.py` (Production API)**: Hệ số PageRank $(1 + 0.25\,\widetilde{\mathrm{PR}})$ được nhân trực tiếp vào điểm ứng viên vector/title trước khi sắp xếp tạo danh sách `dense_ranked`, và sau khi tính `RRF(k=60)` chuẩn hóa `[0.70, 0.95]` lại được nhân thêm một lần nữa trước khi chuyển sang Reranker.
2. **Trong `benchmarks/evaluate_120_ranking_5_scenarios.py` (`EXP-04`)**: Để tách bạch đóng góp độc lập của 5 kịch bản (Vector, Cross-Encoder, RRF, PageRank, Full), kịch bản kiểm định dùng công thức **Weighted RRF có cộng biên PageRank logarit**:
   $$
   S_{\text{EXP04}}(d) = \frac{0.65}{60 + r_{\text{vec}}(d)} + \frac{1.35}{60 + r_{\text{ce}}(d)} + 0.0001\,S_{\text{lex}}(d) + 0.025\,\widetilde{\mathrm{PR}}_{\log}(d)
   $$
   Trong đó: trọng số Cross-Encoder (`1.35`) lớn hơn gấp đôi Vector (`0.65`) và điểm PageRank lấy từ [citation_metrics.parquet](../../data/gold/graphs/citation_metrics.parquet) được nén bằng $\ln(1 + \text{PR} \cdot 10^4)$ rồi chuẩn hóa min-max trong nhóm ứng viên nhằm tránh một bài báo kinh điển áp đảo các bài mới nhưng khớp câu hỏi hơn.

---

## 4.7. Cross-Encoder Reranking, Temperature Scaling & Evidence Gate

### 4.7.1. Bi-Encoder vs Cross-Encoder và kiến trúc chấm điểm kép

Mô hình Bi-Encoder (`nomic-embed-text-v1.5`) mã hóa câu hỏi $q$ và đoạn văn $d$ **độc lập thành hai vector tách biệt** trước khi lấy tích vô hướng, nên mất toàn bộ tương tác chú ý chéo (*token-level cross-attention*) giữa từng từ khóa kỹ thuật trong câu hỏi và từng biểu thức/con số trong đoạn văn. Ngược lại, **Cross-Encoder** nối cặp `[CLS] q [SEP] d [SEP]` vào cùng một bộ mã hóa Transformer, cho phép mọi token của câu hỏi tương tác trực tiếp với mọi token của ngữ cảnh ứng viên trước khi đi qua lớp tuyến tính cho ra điểm hợp chuẩn (*relevance logit* $z$). Vì độ phức tạp là $\mathcal{O}(C \cdot L^2)$ theo số lượng ứng viên $C$, Cross-Encoder chỉ áp dụng ở tầng tinh chỉnh trên **`RERANKER_CANDIDATE_K = 8`** (hoặc `10`–`40` tùy cấu hình benchmark) ứng viên hàng đầu từ Hybrid Retrieval.

Trong dịch vụ Python sản xuất ([reranker_service.py](../../backend/app/services/reranker_service.py)), lớp `RerankerService` nạp `AutoModelForSequenceClassification` với mô hình mặc định `cross-encoder/ms-marco-MiniLM-L-6-v2` (hoặc dự phòng `BAAI/bge-reranker-base`, `max_length = 256`), định dạng văn bản ứng viên kèm tiêu đề và tên mục (`"Title: {title}. Section: {section_title}.\n{text[:1500]}"`) rồi cộng thêm phần thưởng đối sánh tiêu đề và từ viết tắt trước khi qua hàm sigmoid:

$$
z' = z_{\text{CE}} + 3.0 \cdot \text{title\_ratio}(q, d) + 2.0 \cdot \text{acronym\_hits}(q, d), \qquad p_{\text{rerank}} = \frac{1}{1 + e^{-z'}}
$$

Trong đó: $z_{\text{CE}}$ là logit thô của Cross-Encoder; $\text{title\_ratio} \in [0, 1]$ là tỷ lệ từ khóa câu hỏi xuất hiện trong tiêu đề bài báo; $\text{acronym\_hits}$ là số lượng từ viết tắt in hoa (`>= 2` ký tự) khớp trong văn bản.

### 4.7.2. Huấn luyện `Laya` Cross-Encoder ONNX (`Soft-CE`), Temperature Scaling & Ngưỡng tin cậy `0.6`

Nhằm khắc phục hai nhược điểm của Cross-Encoder mã nguồn mở chung chung (*zero-shot MS MARCO*) là (i) không hiểu cấu trúc bằng chứng học thuật dẫn tới tỷ lệ chấp nhận nhầm thông tin bịa đặt cao (`57.4%–58.8%` False Acceptance ở ngưỡng `0.6`) và (ii) điểm xác suất chưa hiệu chỉnh (*miscalibration*), nhánh nghiên cứu tinh chỉnh `Laya` (`laya 0.4.27` ONNX INT8/FP32, `max_len = 512`, `4` epochs, `lr = 2.5e-5` backbone / `1e-4` classification head, thông số đầy đủ trong [report_seed0.json](../../notebooks/laya_finetune/report_seed0.json) và [RUN_INFO.json](../../notebooks/laya_onnx_20261108-2053_seed0/RUN_INFO.json)) áp dụng quy trình 3 bước:

1. **Hàm mất mát Soft-Cross-Entropy có cân bằng nhóm (`Soft-CE`)**: Huấn luyện trên cặp dữ liệu gồm `3,432` mẫu (`381` mẫu hiệu chỉnh calib, `820` mẫu kiểm thử độc lập ở `report_seed0.json`) chứa cả mẫu dương thật, mẫu thiếu chi tiết (*missing detail*), mẫu nhiễu ngoài chủ đề (*retrieved irrelevant*) và mẫu bịa đặt (*fabricated*).
2. **Hiệu chỉnh nhiệt độ hậu huấn luyện (Post-hoc Temperature Scaling)**: Tìm vô hướng nhiệt độ $T^*$ trên tập `calib` (`T = 3.0627` trong `report_seed0.json`, và `T = 1.0` trong biến thể `RUN_INFO.json` 1 epoch) sao cho tối thiểu hóa NLL và **Expected Calibration Error (ECE)**:
   $$
   \hat{p}(q, d) = \sigma\!\left(\frac{z_{\text{Laya}}(q, d)}{T^*}\right) = \frac{1}{1 + \exp(-z_{\text{Laya}}(q, d) / T^*)}
   $$
   Trong đó: $z_{\text{Laya}}(q, d)$ là logit đầu ra trước lớp kích hoạt của mạng `Laya`; $T^*$ là tham số nhiệt độ tối ưu giúp làm phẳng logit quá tự tin mà không làm thay đổi thứ tự xếp hạng (*rank-preserving*), đưa sai số hiệu chỉnh **ECE giảm gần `6x` từ `0.1900` xuống còn `0.0332`**.
3. **Cổng Chứng cứ (Evidence Gate $\theta = 0.6$)**: Trong pipeline đánh giá `RAG_TS` ([score_retrieval.py](../../benchmarks/rag_eval/score_retrieval.py)), một truy vấn chỉ được phép chuyển sang bước sinh câu trả lời khi đoạn văn đứng hạng cao nhất có xác suất hiệu chỉnh vượt ngưỡng tin cậy:
   $$
   \text{Gate}(q) = \mathbb{I}\!\left[\max_{d \in \mathcal{C}_q} \hat{p}(q, d) \ge \theta\right], \qquad \theta = 0.60
   $$
   Trong đó: $\mathbb{I}[\cdot]$ là hàm chỉ thị nhận giá trị $1$ khi điều kiện bên trong thỏa mãn và $0$ nếu ngược lại; $\mathcal{C}_q$ là tập đoạn văn ứng viên sau bước tái xếp hạng cho truy vấn $q$; $\hat{p}(q, d)$ là xác suất liên quan đã hiệu chỉnh nhiệt độ của cặp $(q, d)$; $\theta = 0.60$ là ngưỡng chấp nhận của Cổng Chứng cứ. Nếu toàn bộ ứng viên đều có $\hat{p} < 0.60$, hệ thống xác định đây là truy vấn không có bằng chứng hỗ trợ trong kho (*Unanswerable / Negative Reject*) và từ chối trả lời ngay lập tức thay vì ép LLM sinh ra câu trả lời giả mạo. Nhờ mô hình tinh chỉnh `laya_ft1_hybrid`, Cổng Chứng cứ chặn đứng **`50/50` (`100%`)** câu hỏi âm tính giả mạo trong khi giữ lại **`86/100`** câu trả lời được (`table_retrieval_v1.tex`).

---

## 4.8. Tổng hợp Sinh câu trả lời, Bảo toàn Grounding (`BUG-02`) & Multi-Backend LLM

### 4.8.1. Giao thức Prompt ép trích dẫn và phân tích lỗi `BUG-02` (`D-058`)

Ngay sau khi Reranker trả về `top_k = 5` đoạn văn tinh tuyển, `RagService` ([rag_service.py](../../backend/app/services/rag_service.py)) cắt an toàn mỗi đoạn tối đa **`3,000` ký tự**, gán thẻ định danh chuẩn `[Paper: {paper_id}, Section: {section_title}]` và lắp ráp vào mẫu Prompt hệ thống bắt buộc 5 quy tắc ràng buộc nghiêm ngặt:
1. Chỉ dựa trên các đoạn văn được cung cấp; nếu bằng chứng thực sự không đề cập, nêu rõ những gì không tìm thấy.
2. **Tổng hợp cân bằng toàn bộ nguồn (Quy tắc 2)**: Chủ động tổng hợp thông tin từ **tất cả các đoạn liên quan** thay vì chỉ dừng ở đoạn đầu tiên, bảo đảm mọi phát biểu thực nghiệm đều gắn trích dẫn nguồn ngay tại câu đó.
3. Định dạng trích dẫn chuẩn xác `[Paper: {paper_id}, Section: {section_title}]`.
4. Trình bày câu trả lời súc tích, rõ ràng theo đúng ngôn ngữ câu hỏi.
5. **Bảo toàn công thức toán học (Quy tắc 5)**: Giữ nguyên vẹn mọi phương trình LaTeX (`$...$`, `$$...$$`) từ văn bản nguồn sang câu trả lời để frontend React 19 + KaTeX kết xuất trực tiếp.

**Nghiên cứu điển hình khắc phục lỗi `BUG-02` ([BUG_02_RAG_FALSE_METHODOLOGY_FALLBACK_AND_REFUSAL.md](../bugs/BUG_02_RAG_FALSE_METHODOLOGY_FALLBACK_AND_REFUSAL.md), Quyết định `D-058` trong [Vuong_DECISION_LOG.md](../agent_logs/Vuong_DECISION_LOG.md))**: Trong phiên bản đầu của hệ thống hỏi đáp, người dùng quan sát thấy hiện tượng nghiêm trọng khi hỏi câu hỏi tổng hợp (*"What methodology does Attention Is All You Need propose?"*): dù Qdrant đã truy xuất được đoạn văn chứa câu trả lời, LLM vẫn từ chối hoặc trả lời bằng khối văn bản cứng nhắc. Phân tích log cho thấy ba nguyên nhân đồng thời:
1. Trong Prompt cũ chứa lệnh cấm cứng nhắc *"DO NOT extrapolate beyond the text"* đi kèm câu mặc định *"If none of the chunks contain the answer, respond: 'I could not find relevant information...'"*, khiến LLM `Qwen-2.5-7B` quá nhạy cảm từ chối trả lời khi thiếu đúng một từ khóa *"methodology"* trong tiêu đề mục.
2. Khi đoạn văn mục *Introduction* hoặc *Model Architecture* bị gán nhãn sai thành `Section: Methodology` trong quá trình tách section, LLM hiểu nhầm thiếu phần phương pháp thật và kích hoạt từ chối.
3. Trong một số truy vấn không có ngữ cảnh, hàm `_synthesize_grounded_fallback()` chưa xuất trình nguồn bằng chứng chi tiết.

Khắc phục triển khai trực tiếp trong [rag_service.py](../../backend/app/services/rag_service.py) đã viết lại thông điệp hệ thống theo hướng **Synthesis-First Grounded Answering** (ép tổng hợp cân bằng mọi chi tiết hiện hữu từ nhiều đoạn trước khi kết luận phần thiếu sót), mở rộng số lượng ứng viên qua Reranker từ `top_k` đơn lên `CANDIDATE_K = 8`, và giữ fallback có trích dẫn nguồn rõ ràng khi LLM ngoại tuyến.

### 4.8.2. Phân cấp chuỗi cung cấp LLM và chặn tràn cửa sổ ngữ cảnh

Lớp `LlmClient` ([llm_client.py](../../backend/app/services/llm_client.py)) vận hành theo cơ chế phát hiện dịch vụ tự động 4 tầng (Multi-Backend Discovery) bảo đảm hệ thống vẫn hoạt động trơn tru trên nhiều môi trường GPU khác nhau mà không cần sửa mã nguồn:

```
Query Prompt --> (1) Probe Local HTTP Server (:9001 node-llama-cpp / llama-server)
                      | (offline)
                      v
                 (2) Probe Ollama Service (:11434)
                      | (offline)
                      v
                 (3) Groq Cloud API (llama-3.3-70b-versatile, if GROQ_API_KEY set)
                      | (offline)
                      v
                 (4) In-Process llama_cpp.Llama (GGUF Qwen-2.5-7B-Instruct Q4_K_M, n_gpu_layers=-1)
```

Cửa sổ ngữ cảnh của mô hình được cấu hình mặc định **`LLM_CONTEXT_WINDOW = 16,384` token** (`LLM_MAX_TOKENS = 1,536`, `temperature = 0.1` trong schema `ChatRequest` nhằm giữ câu trả lời khoa học ổn định, ít ngẫu nhiên). Để ngăn tuyệt đối lỗi tràn bộ nhớ đệm KV Cache (`Context Overflow` trên `llama.cpp`) khi 5 đoạn ngữ cảnh cộng prompt vượt quá phần dư thông thường, phương thức `_clamp_max_tokens()` tính toán động giới hạn token sinh ra cho từng yêu cầu:

$$
T_{\text{gen}}^{\max} = \max\!\left(64,\; \min\!\left(T_{\text{req}},\; N_{\text{ctx}} - \hat{T}_{\text{prompt}} - 32\right)\right)
$$

Trong đó: $T_{\text{req}}$ là số token mong muốn (`1,536`); $N_{\text{ctx}} = 16,384$ là kích thước cửa sổ ngữ cảnh; $\hat{T}_{\text{prompt}}$ là số token thực đếm của toàn bộ thông điệp đầu vào; `32` là khoảng đệm an toàn; và `64` là sàn tối thiểu để LLM kịp hoàn tất thông báo có trích dẫn. Quá trình sinh văn bản sau đó được đẩy liên tục qua giao thức **Server-Sent Events (SSE)** gồm sự kiện `metadata` (danh sách `citations` có đầy đủ điểm Vector, Lexical, Rerank, PageRank và đường dẫn arXiv) đi trước các gói `token` văn bản theo thời gian thực tới frontend.
