# Bộ đánh giá RAG v1

Đánh giá `RAG_TS` trên tập đề đã khóa gồm 100 câu có đáp án và 50 câu không có đáp án.

## Tập đề: `data/test_set_v1.jsonl`
Mã SHA-256 nằm trong `data/test_set_v1.manifest.json`.

**Câu có đáp án (100 câu)**
- Lấy mẫu phân tầng từ 1,04 triệu chunk theo `sha256(seed + chunk_id)` (`sample_chunks.cjs`), mỗi bài tối đa một chunk.
- Loại toàn bộ bài có trong `laya-eval-set-200.json`, cùng các phần như Lời cảm ơn, Tài liệu tham khảo và chunk nhiều ký hiệu.
- Mỗi câu có đáp án mẫu, các ý bắt buộc và trích dẫn nguyên văn. `build_positives.py` từ chối câu có trích dẫn không nằm trong chunk.
- Có 15 câu từ các bài không có bản ghi trong `papers`, để đo riêng ảnh hưởng của việc thiếu metadata.

| Loại câu | Số câu |
|---|---|
| fact | 42 |
| explain | 29 |
| topical | 15 |
| paraphrase | 14 |

**Câu không có đáp án (50 câu)**

| Loại câu | Số câu | Cách kiểm tra với corpus |
|---|---|---|
| off_topic | 10 | Chấm pool kết quả tìm kiếm |
| fabricated | 12 | Tên bịa có 0 kết quả trong full-text, và chấm pool |
| absent_fact | 12 | Chấm pool kết quả tìm kiếm |
| missing_detail | 16 | Chấm pool và mọi chunk của bài được nhắc tên |

Câu có chunk được chấm là chứa đáp án sẽ bị loại; đã loại 10 câu, danh sách nằm trong manifest.

## Nhãn liên quan: `logs/benchmarks/rag_eval/qrels.jsonl`
Nhãn được làm theo cách pooling của TREC: gom top 10 của các chế độ và các nhánh vector, BM25, rồi để DeepSeek Flash chấm mức 0, 1 hoặc 2. Chunk mà tác giả dùng để viết câu hỏi luôn là mức 2. Vì người viết đề và judge là hai model khác nhau, độ đồng thuận giữa họ có thể đo được.

## Chạy lại (từ thư mục gốc của repo)
```bash
zsh benchmarks/rag_eval/run_modes.sh                         # xếp hạng 5 chế độ, chạy tiếp được nếu dừng giữa chừng
python3 benchmarks/rag_eval/build_qrels.py                   # tạo cặp cần chấm
# từ RAG_TS/backend_rag: node <repo>/benchmarks/rag_eval/fetch_chunks.cjs <repo>/logs/benchmarks/rag_eval/qrels_req.json <repo>/logs/benchmarks/rag_eval/qrels_chunks.json
.venv/bin/python benchmarks/rag_eval/judge_relevance.py --pairs logs/benchmarks/rag_eval/qrels_pairs.jsonl --chunks logs/benchmarks/rag_eval/qrels_chunks.json --out logs/benchmarks/rag_eval/qrels.jsonl
.venv/bin/python benchmarks/rag_eval/score_retrieval.py      # bảng chỉ số, CI 95%, kiểm định cặp
# câu trả lời, từ RAG_TS/backend_rag: node <repo>/benchmarks/rag_eval/run_answers.cjs --set <repo>/benchmarks/rag_eval/data/test_set_v1.jsonl --out A.jsonl --authority 0 --bm25 <repo>/logs/benchmarks/laya_vs_best/bm25.sqlite
.venv/bin/python benchmarks/rag_eval/score_answers.py --answers A.jsonl --out S.jsonl
.venv/bin/python -m pytest benchmarks/rag_eval/test_metrics.py
```

## Chỉ số
- **Tìm kiếm:** hit@k, recall@k, MRR@10, nDCG@10, precision@5, `gold_chunk@5`, `paper@5`, kèm CI bootstrap 95% và kiểm định hoán vị theo cặp.
- **Cổng bằng chứng:** AUROC và số câu giữ lại hoặc chặn ở ngưỡng production 0,6, tính riêng theo loại câu negative.
- **Câu trả lời:** tỷ lệ đúng đủ ý, độ phủ ý bắt buộc, mâu thuẫn, từ chối nhầm, từ chối đúng, precision/recall/F1 của quyết định trả lời, faithfulness, answer relevancy, độ hợp lệ của trích dẫn, độ trễ p50/p95.

## Quy tắc dùng
- **Không tinh chỉnh trên tập này.** Ngưỡng và tham số tinh chỉnh trên 52 câu trong `laya-eval-set.json` của `RAG_TS`; tập v1 chỉ dùng để đo cuối. Nếu dùng nó để chọn tham số thì phải tạo v2.
- **Không sửa từng câu sau khi đã xem kết quả câu trả lời.** Sửa thì tăng phiên bản.

## Giới hạn đã biết
- Câu hỏi có tên riêng chiếm 85/100, nên có lợi cho BM25. Câu topical chỉ có 15 câu, nên chưa kết luận chắc về nhóm này.
- Chấm negative dựa trên pool và judge, nên không chứng minh tuyệt đối rằng cả corpus không có đáp án.
- Judge hơi dễ dãi ở mức 2, nên cần đọc kèm `gold_chunk@5` là chỉ số không phụ thuộc judge.
- Mẫu chunk phân bố đều, ít bài nổi tiếng, nên có thể bất lợi cho authority boost.
