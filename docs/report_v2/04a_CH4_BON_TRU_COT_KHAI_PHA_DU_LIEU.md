# Chương 4 (Phần 1): Bốn Trụ Cột Khai Phá Dữ Liệu Trên Lakehouse

- **Motivation/Background**: Sau khi kiểm toán tính chất thống kê phi chuẩn và cấu trúc đa nhãn ở [Chương 3](./03_CH3_PHAN_TICH_KHAM_PHA_EDA.md), hệ thống cần trích xuất tri thức ẩn từ toàn bộ `71,927` bài báo và `1,043,594` vector để vừa cung cấp bức tranh khoa học cho người dùng, vừa tạo ra tín hiệu cấu trúc (luật kết hợp mở rộng truy vấn, điểm uy tín PageRank, phân cụm chủ đề mềm, cờ bất thường) phục vụ trực tiếp cho đường ống Hybrid RAG.
- **Purpose**: Trình bày nền tảng thuật toán, công thức toán học chuẩn, quyết định lựa chọn siêu tham số và kết quả thực nghiệm của 4 trụ cột khai phá dữ liệu trong `src/mining/`: (1) Luật kết hợp FP-Growth và cơ chế khử trùng lặp đối xứng, (2) Phân cụm ngữ nghĩa kết hợp không gian $L_2$-Hypersphere, PCA, EM GMM ($2\sigma$) và DBSCAN, (3) Khai phá mạng lưới khoa học chế độ kép (Citation DiGraph / Co-authorship) với PageRank và Louvain, (4) Động lượng thị phần $\Delta\text{Share}$ kết hợp Isolation Forest 5 chiều trên thang $\ln(1 + x)$.
- **Overview Pipeline**: `MiningEngine.run_all()` ([mining_engine.py](../../src/mining/mining_engine.py)) điều phối tuần tự 5 điểm kiểm tra trên DuckDB Silver + Qdrant Gold (`234.57` giây tổng cộng ở lần chạy `04/11/2026`): `EdaEngine` (`39.09 s`) $\rightarrow$ `AssociationRuleMiner` (`36.26 s`) $\rightarrow$ `SemanticClusterAnalyzer` (`39.94 s`) $\rightarrow$ `ScientificGraphMiner` (`116.39 s`) $\rightarrow$ `TrendAnomalyMiner` (`2.89 s`), xuất 5 tệp JSON Gold và `mining_manifest.json` lên MinIO S3 (`gold/mining/`).
- **Detailed Plan**: Lần lượt đi sâu từng trụ cột (4.1 đến 4.4) theo cấu trúc: Bài toán $\rightarrow$ Cơ sở toán học & lý giải chọn thuật toán $\rightarrow$ Thiết kế triển khai thực tế kèm mã nguồn sạch comment ASCII $\rightarrow$ Bảng kết quả thực nghiệm kèm khung 5W1H trên cả lần chạy `04/11/2026` và các lát cắt kiểm chứng cục bộ.
- **References**: [03_CH3_PHAN_TICH_KHAM_PHA_EDA.md](./03_CH3_PHAN_TICH_KHAM_PHA_EDA.md), [EXP_03_FOUR_PILLARS_MINING_72K_SCALE.md](../experiments/EXP_03_FOUR_PILLARS_MINING_72K_SCALE.md), [mining_engine.py](../../src/mining/mining_engine.py), [association_rules.py](../../src/mining/association_rules.py), [cluster_analysis.py](../../src/mining/cluster_analysis.py), [graph_mining.py](../../src/mining/graph_mining.py), [trend_anomaly_mining.py](../../src/mining/trend_anomaly_mining.py), [association_rules.json](../../data/gold/mining/association_rules.json), [clusters.json](../../data/gold/mining/clusters.json), [clusters_api.json](../../data-mining-latek/figures/captured_20261123_082337/evidence/clusters_api.json), [graph_coauthorship.json](../../data/gold/mining/graph_coauthorship.json), [trends_anomalies.json](../../data/gold/mining/trends_anomalies.json), [citation_metrics.parquet](../../data/gold/graphs/citation_metrics.parquet).
- **Created**: 2026-11-25T12:55:00+07:00
- **Last Updated**: 2026-11-25T12:55:00+07:00

[STATUS: ACTIVE]

---

## Mục lục

- [4.1. Trụ cột 1: Khai phá Luật Kết hợp bằng FP-Growth & Khử Luật Đối xứng](#41-trụ-cột-1-khai-phá-luật-kết-hợp-bằng-fp-growth--khử-luật-đối-xứng)
  - [4.1.1. Xây dựng giỏ giao dịch đa nguồn (`cat:*` + `tag:*`)](#411-xây-dựng-giỏ-giao-dịch-đa-nguồn-cat--tag)
  - [4.1.2. Tại sao chọn FP-Growth thay Apriori và năm độ đo đánh giá luật](#412-tại-sao-chọn-fp-growth-thay-apriori-và-năm-độ-đo-đánh-giá-luật)
  - [4.1.3. Khử luật đối xứng bằng `_lift_key` và bộ lọc hỗ trợ tuyệt đối](#413-khử-luật-đối-xứng-bằng-_lift_key-và-bộ-lọc-hỗ-trợ-tuyệt-đối)
  - [4.1.4. Kết quả thực nghiệm khai phá luật kết hợp](#414-kết-quả-thực-nghiệm-khai-phá-luật-kết-hợp)
- [4.2. Trụ cột 2: Phân cụm Ngữ nghĩa & Mô hình Hỗn hợp Gaussian (EM GMM)](#42-trụ-cột-2-phân-cụm-ngữ-nghĩa--mô-hình-hỗn-hợp-gaussian-em-gmm)
  - [4.2.1. Tương đương hình học giữa Khoảng cách Euclid trên mặt cầu $L_2$ và Cosine](#421-tương-đương-hình-học-giữa-khoảng-cách-euclid-trên-mặt-cầu-l_2-và-cosine)
  - [4.2.2. Kiến trúc đa mô hình: MiniBatchKMeans, PCA 2D, Full-Covariance EM GMM và DBSCAN](#422-kiến-trúc-đa-mô-hình-minibatchkmeans-pca-2d-full-covariance-em-gmm-và-dbscan)
  - [4.2.3. Ma trận hiệp phương sai đầy đủ, Elip tin cậy $2\sigma$ và phát hiện bài liên ngành](#423-ma-trận-hiệp-phương-sai-đầy-đủ-elip-tin-cậy-2sigma-và-phát-hiện-bài-liên-ngành)
  - [4.2.4. Kết quả thực nghiệm phân cụm đa tầng](#424-kết-quả-thực-nghiệm-phân-cụm-đa-tầng)
- [4.3. Trụ cột 3: Khai phá Mạng lưới Khoa học Chế độ Kép (PageRank & Louvain)](#43-trụ-cột-3-khai-phá-mạng-lưới-khoa-học-chế-độ-kép-pagerank--louvain)
  - [4.3.1. Mô hình hóa đồ thị: Citation DiGraph vs Co-authorship Fractional Weight](#431-mô-hình-hóa-đồ-thị-citation-digraph-vs-co-authorship-fractional-weight)
  - [4.3.2. Thuật toán Damped PageRank và tối ưu Modularity Louvain](#432-thuật-toán-damped-pagerank-và-tối-ưu-modularity-louvain)
  - [4.3.3. Kết quả thực nghiệm mạng lưới và chi phí thời gian](#433-kết-quả-thực-nghiệm-mạng-lưới-và-chi-phí-thời-gian)
- [4.4. Trụ cột 4: Động lượng Thị phần $\Delta\text{Share}$ & Phát hiện Bất thường Isolation Forest](#44-trụ-cột-4-động-lượng-thị-phần-deltatextshare--phát-hiện-bất-thường-isolation-forest)
  - [4.4.1. Cửa sổ thứ tự thời gian `dense_rank()` và Động lượng Thị phần](#441-cửa-sổ-thứ-tự-thời-gian-dense_rank-và-động-lượng-thị-phần)
  - [4.4.2. Isolation Forest 5 chiều trên thang $\ln(1+x)$ và gán nhãn giải thích tự động](#442-isolation-forest-5-chiều-trên-thang-ln1x-và-gán-nhãn-giải-thích-tự-động)
  - [4.4.3. Kết quả thực nghiệm xu hướng và ngoại lai](#443-kết-quả-thực-nghiệm-xu-hướng-và-ngoại-lai)

---

## 4.1. Trụ cột 1: Khai phá Luật Kết hợp bằng FP-Growth & Khử Luật Đối xứng

### 4.1.1. Xây dựng giỏ giao dịch đa nguồn (`cat:*` + `tag:*`)

Trong [association_rules.py](../../src/mining/association_rules.py), lớp `AssociationRuleMiner` chuyển đổi mỗi bài báo từ `fulltext_view` (trên DuckDB S3) thành một giỏ giao dịch (transaction basket) gồm hai họ hạng mục có tiền tố phân biệt rõ ràng:

1. **Nhãn phân ngành arXiv (`cat:<label>`)**: Trích xuất toàn bộ danh sách `categories` của bài báo.
2. **Thẻ từ khóa phương pháp (`tag:<concept>`)**: Quét biểu thức chính quy chuẩn hóa chữ thường trên ghép nối `title + abstract` theo từ điển cố định `KEYWORD_VOCAB` gồm **`25` nhóm khái niệm AI trọng yếu** (như `transformer`, `attention-mech`, `diffusion-models`, `reinforcement-learning`, `large-language-models`, `graph-neural-networks`, `contrastive-learning`, `vision-transformer`, `retrieval-systems`, `neural-radiance-fields`, `multimodal-ai`, `ai-alignment`, `ai-safety`, `knowledge-graphs`, v.v.).

Chỉ những bài báo tạo được giỏ có tối thiểu `2` hạng mục (`len(basket) >= 2`) mới được đưa vào ma trận thưa `TransactionEncoder` của thư viện `mlxtend`. Trên lần chạy toàn hồ `04/11/2026`, quy tắc lọc này giữ lại **`61,319` giỏ giao dịch hợp lệ trên tổng số `71,927` bài báo (`85.3%`)**.

### 4.1.2. Tại sao chọn FP-Growth thay Apriori và năm độ đo đánh giá luật

Với quy mô $N = 61,319$ giao dịch và hơn $160$ hạng mục riêng biệt (`cat:*` + `tag:*`), thuật toán Apriori cổ điển đòi hỏi sinh tập ứng viên $C_k$ ở mỗi bước lặp và quét lại bảng giao dịch $\mathcal{O}(L \cdot N)$ lần (với $L$ là độ dài tập phổ biến lớn nhất), dẫn tới bùng nổ không gian ứng viên $2^{|\mathcal{I}|}$ trong bộ nhớ. Ngược lại, **FP-Growth** (*Frequent Pattern Growth*) chỉ quét dữ liệu **đúng 2 lần** để nén toàn bộ giỏ giao dịch vào cấu trúc cây tiền tố có chia sẻ nhánh (FP-Tree) kèm bảng tiêu đề (Header Table), sau đó khai phá đệ quy trên các cây điều kiện (*conditional pattern bases*) mà không cần sinh ứng viên.

Mỗi luật kết hợp $A \Rightarrow B$ (với $A, B \subset \mathcal{I}$ và $A \cap B = \emptyset$) được lượng hóa bằng 5 độ đo chuẩn hóa trong `mlxtend.frequent_patterns.association_rules`:

$$
\operatorname{Support}(A \Rightarrow B) = P(A \cup B), \qquad \operatorname{Confidence}(A \Rightarrow B) = P(B \mid A) = \frac{P(A \cup B)}{P(A)}
$$

$$
\operatorname{Lift}(A \Rightarrow B) = \frac{P(A \cup B)}{P(A)\,P(B)}, \qquad \operatorname{Leverage}(A \Rightarrow B) = P(A \cup B) - P(A)\,P(B)
$$

$$
\operatorname{Conviction}(A \Rightarrow B) = \frac{1 - P(B)}{1 - \operatorname{Confidence}(A \Rightarrow B)}
$$

Trong đó: $P(X) = \operatorname{count}(X)/N$ là xác suất xuất hiện thực nghiệm của tập hạng mục $X$ trên tổng $N$ giao dịch hợp lệ; $\operatorname{Lift} > 1$ cho biết $A$ và $B$ có xu hướng đồng xuất hiện cao hơn mức độc lập thống kê; $\operatorname{Leverage} \in [-1, 1]$ đo phần dư xác suất đồng xuất hiện tuyệt đối so với giả thuyết độc lập; $\operatorname{Conviction} \in (0, \infty)$ đo độ nhạy sai lệch kéo theo nếu $A$ và $B$ độc lập (trong mã nguồn, khi $\operatorname{Confidence} = 1.0$, giá trị vô cùng của `conviction` được giới hạn an toàn về `999.0` để tránh lỗi tuần tự hóa JSON chuẩn RFC 8259).

Hệ thống thiết lập ngưỡng mặc định `min_support = 0.02`, `min_lift = 1.2`, kèm cơ chế tự động hạ ngưỡng xuống `(min_support = 0.01, min_lift = 1.0)` nếu tập dữ liệu nhỏ không đủ quy tắc đạt ngưỡng.

### 4.1.3. Khử luật đối xứng bằng `_lift_key` và bộ lọc hỗ trợ tuyệt đối

Trong thực tế khai phá luật kết hợp trên hạng mục có tỷ trọng nhỏ, hai điểm yếu phổ biến xảy ra: (i) tập cực hiếm nhưng độ hỗ trợ tương đối vượt ngưỡng khi $N$ nhỏ, và (ii) **hiện tượng trùng lặp đối xứng**, tức cặp `{cat:cs.SY} => {cat:eess.SY}` và `{cat:eess.SY} => {cat:cs.SY}` có cùng giá trị `Lift` (vì công thức Lift đối xứng theo $A$ và $B$), chiếm gấp đôi dung lượng danh sách kết quả Top-$K$ mà không thêm tri thức mới. `AssociationRuleMiner` giải quyết triệt để qua ba bước hậu xử lý:

1. **Ngưỡng số lượng giao dịch tuyệt đối (`min_abs_transactions = 25`)**: Buộc số bài thực tế chứa cả $A \cup B$ ($\operatorname{int}(\operatorname{round}(\operatorname{support} \times N))$) phải đạt tối thiểu `25` bài báo.
2. **Khóa `_lift_key` làm tròn 6 chữ số thập phân**: Tránh sai số dấu phẩy động IEEE-754 khi sắp xếp giảm dần theo `["_lift_key", "confidence"]`, đảm bảo ở hai luật đối xứng có cùng `Lift`, **chiều có `Confidence` cao hơn luôn thắng** (ví dụ giữ `cat:cs.SD => cat:eess.AS` với $\text{Conf} = 0.9920$ và loại chiều đảo có $\text{Conf}$ thấp hơn).
3. **Khử đối xứng bằng `frozenset`**: Dùng cặp bất biến `frozenset([tuple(antecedents), tuple(consequents)])` để giữ duy nhất một đại diện có hướng tin cậy nhất cho mỗi cặp tập hạng mục.

```python
# Post-processing: threshold absolute support and deduplicate symmetric rules
rules_df["abs_count"] = (rules_df["support"] * len(baskets)).round().astype(int)
rules_df = rules_df[rules_df["abs_count"] >= self.min_abs_transactions].copy()
rules_df["_lift_key"] = rules_df["lift"].round(6)
rules_df = rules_df.sort_values(by=["_lift_key", "confidence"], ascending=[False, False])

seen_pairs = set()
deduped = []
for _, row in rules_df.iterrows():
    ant = tuple(sorted(list(row["antecedents"])))
    con = tuple(sorted(list(row["consequents"])))
    sym_key = frozenset([ant, con])
    if sym_key in seen_pairs:
        continue
    seen_pairs.add(sym_key)
    deduped.append(row)
```

### 4.1.4. Kết quả thực nghiệm khai phá luật kết hợp

Trên lần chạy Production toàn hồ ngày `04/11/2026` (`71,927` bài báo), mô-đun hoàn tất trong **`36.26` giây**, thu được **`61,319` giao dịch hợp lệ** (`85.3%`), **`96` tập hạng mục phổ biến** và **`45` luật kết hợp không trùng lặp**, với chỉ số Lift cao nhất đạt **`34.940`** (`logs/run/backend.log`). Nhằm minh họa đầy đủ 5 độ đo chi tiết ở mức từng luật, bảng dưới đây trình bày các luật tiêu biểu từ tệp kết xuất cục bộ [association_rules.json](../../data/gold/mining/association_rules.json) (`11,404` giao dịch, `162` hạng mục, `80` tập phổ biến, `30` luật sau khử đối xứng):

> **5W1H — Bảng các luật kết hợp tiêu biểu đã khử đối xứng (`data/gold/mining/association_rules.json`)**
> - **What**: Liệt kê các luật kết hợp đại diện có Support, Confidence, Lift, Leverage và Conviction cao nhất từ kết xuất Gold cục bộ.
> - **Why**: Minh họa cấu trúc tri thức phát hiện được (đồng mã kỹ thuật arXiv và liên kết phương pháp-lĩnh vực) làm cơ sở mở rộng từ khóa trong `RetrievalService`.
> - **When**: Lát cắt S1 (`06/10/2026`), đối chiếu quy mô `04/11/2026` (`45` luật, max Lift `34.940`).
> - **Where**: [association_rules.json](../../data/gold/mining/association_rules.json) và [association_rules.py](../../src/mining/association_rules.py).
> - **Who**: `AssociationRuleMiner.run()`.
> - **How**: `fpgrowth(min_support=0.02)` $\rightarrow$ `association_rules(metric="lift", min_threshold=1.2)` $\rightarrow$ lọc `abs_count >= 25` và khử đối xứng `_lift_key`.

| Luật kết hợp ($A \Rightarrow B$) | Support | Confidence | Lift | Leverage | Conviction | Ý nghĩa ngữ nghĩa & Ứng dụng RAG |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| `cat:cs.SY` $\Rightarrow$ `cat:eess.SY` | `0.0287` | `1.0000` | `34.8746` | `0.0279` | `999.0` | Mã đồng danh Hệ thống Điều khiển CS & EE |
| `cat:cs.SD` $\Rightarrow$ `cat:eess.AS` | `0.0328` | `0.9920` | `27.0652` | `0.0316` | `121.0605` | Âm học máy tính liên thông Xử lý âm thanh |
| `tag:reinforcement-learning` $\Rightarrow$ `tag:autonomous-agents` | `0.0208` | `0.3273` | `6.3272` | `0.0175` | `1.4097` | Tự động mở rộng truy vấn RL sang Autonomous Agents |
| `cat:cs.CL + cat:cs.AI` $\Rightarrow$ `tag:large-language-models` | `0.0358` | `0.3901` | `3.7317` | `0.0262` | `1.4681` | Hội tụ Xử lý ngôn ngữ & Trí tuệ nhân tạo tại LLM |
| `cat:eess.IV` $\Rightarrow$ `cat:cs.CV` | `0.0481` | `0.8941` | `2.9999` | `0.0321` | `6.6258` | Giao thoa xử lý ảnh và thị giác máy tính |
| `tag:transformer` $\Rightarrow$ `tag:attention-mech` | `0.0246` | `0.3143` | `2.6945` | `0.0155` | `1.2882` | Liên kết kiến trúc Transformer với cơ chế Attention |
| `tag:diffusion-models` $\Rightarrow$ `cat:cs.CV` | `0.0382` | `0.6708` | `2.2505` | `0.0212` | `2.1322` | Mô hình khuếch tán gắn chặt nhánh Thị giác |
| `cat:stat.ML` $\Rightarrow$ `cat:cs.LG` | `0.0714` | `0.9554` | `1.8682` | `0.0332` | `10.9464` | `95.54%` bài `stat.ML` đồng thời thuộc `cs.LG` |

Ở tầng phục vụ truy vấn (`RetrievalService._expand_rules()` trong [retrieval_service.py](../../backend/app/services/retrieval_service.py)), các luật đã khai phá được nạp vào bộ nhớ RAM dưới dạng bản đồ ánh xạ khái niệm $\rightarrow$ tối đa `3` hệ quả tin cậy nhất để hiển thị thông tin mở rộng ngữ cảnh (`rule_expansions`) cho câu hỏi người dùng mà không gây nhiễu vector tìm kiếm gốc.

---

## 4.2. Trụ cột 2: Phân cụm Ngữ nghĩa & Mô hình Hỗn hợp Gaussian (EM GMM)

### 4.2.1. Tương đương hình học giữa Khoảng cách Euclid trên mặt cầu $L_2$ và Cosine

Thay vì phân cụm trên các biểu diễn từ khóa thưa TF-IDF, lớp `SemanticClusterAnalyzer` trong [cluster_analysis.py](../../src/mining/cluster_analysis.py) lấy đúng **một vector đại diện phần Tóm tắt (`section_type='abstract'`) cho mỗi bài báo duy nhất** từ Qdrant (mỗi vector có $d = 768$ chiều từ mô hình `nomic-embed-text-v1.5`). Toàn bộ ma trận vector $U \in \mathbb{R}^{M \times 768}$ được chuẩn hóa đơn vị bậc hai ($\tilde{\mathbf{u}}_i = \mathbf{u}_i / \|\mathbf{u}_i\|_2$). Trên mặt cầu đơn vị $\mathbb{S}^{d-1}$, bình phương khoảng cách Euclid giữa hai vector $\tilde{\mathbf{u}}$ và $\tilde{\mathbf{v}}$ liên hệ tuyến tính chặt chẽ với độ tương đồng Cosine:

$$
\|\tilde{\mathbf{u}} - \tilde{\mathbf{v}}\|_2^2 = \|\tilde{\mathbf{u}}\|_2^2 + \|\tilde{\mathbf{v}}\|_2^2 - 2\langle \tilde{\mathbf{u}}, \tilde{\mathbf{v}} \rangle = 2 - 2 \cos(\tilde{\mathbf{u}}, \tilde{\mathbf{v}})
$$

Trong đó: $\tilde{\mathbf{u}}, \tilde{\mathbf{v}} \in \mathbb{R}^{768}$ là hai vector đã chuẩn hóa $L_2$ ($\|\tilde{\mathbf{u}}\|_2 = \|\tilde{\mathbf{v}}\|_2 = 1$); $\langle \tilde{\mathbf{u}}, \tilde{\mathbf{v}} \rangle$ là tích vô hướng Euclid; $\cos(\tilde{\mathbf{u}}, \tilde{\mathbf{v}})$ là độ tương đồng Cosine. Hệ thức này là cơ sở toán học cho phép thuật toán `MiniBatchKMeans` tối ưu khoảng cách Euclid tương đương trực tiếp với **Spherical K-Means** tối ưu độ tương đồng Cosine.

### 4.2.2. Kiến trúc đa mô hình: MiniBatchKMeans, PCA 2D, Full-Covariance EM GMM và DBSCAN

Hệ thống không chỉ sử dụng một thuật toán đơn lẻ mà vận hành song song quy trình 4 tầng:
1. **Phân hoạch khởi đầu quy mô lớn (`MiniBatchKMeans`)**: Chia $K = 6$ cụm với `batch_size = 2048`, `n_init = 3`, `random_state = 42` trực tiếp trên không gian $768$ chiều đã chuẩn hóa $L_2$ để sinh nhãn cụm tham chiếu và đo các chỉ số hợp lệ nội bộ trên mẫu `silhouette_sample = 5,000`: **Silhouette Score** (khoảng $[-1, 1]$, đo mức độ gắn kết nội cụm so với tách biệt cụm kế cận theo `metric="cosine"`), **Davies-Bouldin Index** (càng nhỏ càng tốt, đo tỷ số phân tán nội cụm trên khoảng cách tâm cụm), và **Calinski-Harabasz Index** (càng lớn càng tốt, tỷ số phương sai liên cụm trên nội cụm).
2. **Chiếu giảm chiều PCA 2D có căn tâm (`Centered PCA`)**: Tính vector trung bình $\bar{\mathbf{u}}$ trên mẫu đã chuẩn hóa, trừ tâm ($\mathbf{U}_c = \mathbf{U}_{\text{norm}} - \bar{\mathbf{u}}$) rồi áp dụng `PCA(n_components=2)` nhân hệ số khuếch đại `* 5.0` để trải đều đám mây điểm lên mặt phẳng trực quan $\mathbf{z}_i \in \mathbb{R}^2$.
3. **Phân cụm mềm EM GMM trên mặt phẳng 2D (`Full-Covariance GaussianMixture`)**: Mô hình hóa mật độ xác suất các bài báo như hỗn hợp $K = 6$ phân phối chuẩn hai chiều có ma trận hiệp phương sai đầy đủ (`covariance_type="full"`, `max_iter=200`, `n_init=3`), kèm ước lượng mật độ nền trên lưới $96 \times 72$ điểm (cắt phân vị ngoại lai $[0.2\%, 99.8\%]$) cho bản đồ nhiệt trực quan hóa.
4. **Kiểm chứng mật độ phi tham số (`DBSCAN`)**: Chạy `DBSCAN(eps=0.28, min_samples=10, metric="cosine")` trên `dbscan_sample = 3,000` vector gốc 768 chiều để đối chiếu xem dữ liệu bài báo có tách thành các cụm mật độ rời rạc hay liên kết thành một đa tạp (manifold) liên tục trong không gian nhúng cao chiều.

### 4.2.3. Ma trận hiệp phương sai đầy đủ, Elip tin cậy $2\sigma$ và phát hiện bài liên ngành

Trên mặt phẳng biểu diễn $\mathbf{z} \in \mathbb{R}^2$, mô hình Hỗn hợp Gaussian định nghĩa xác suất biên của mỗi điểm dữ liệu thông qua tổng trọng số các thành phần:

$$
p(\mathbf{z}) = \sum_{k=1}^{K} \pi_k \, \mathcal{N}(\mathbf{z} \mid \boldsymbol{\mu}_k, \boldsymbol{\Sigma}_k), \qquad \gamma_{ik} = \frac{\pi_k \, \mathcal{N}(\mathbf{z}_i \mid \boldsymbol{\mu}_k, \boldsymbol{\Sigma}_k)}{\sum_{j=1}^{K} \pi_j \, \mathcal{N}(\mathbf{z}_i \mid \boldsymbol{\mu}_j, \boldsymbol{\Sigma}_j)}
$$

Trong đó: $K = 6$ là số thành phần Gaussian; $\pi_k \in [0, 1]$ là trọng số tiên nghiệm ($\sum_{k=1}^K \pi_k = 1$); $\boldsymbol{\mu}_k \in \mathbb{R}^2$ và $\boldsymbol{\Sigma}_k \in \mathbb{R}^{2 \times 2}$ lần lượt là vector kỳ vọng và ma trận hiệp phương sai đầy đủ (cho phép elip xoay nghiêng và giãn nở bất đẳng hướng); $\gamma_{ik} = P(\text{cụm } k \mid \mathbf{z}_i)$ là **trách nhiệm hậu nghiệm** (posterior responsibility) tính ở bước E của thuật toán EM.

Để vẽ ranh giới hình học $2\sigma$ cho từng cụm trên giao diện phân tích, hệ thống phân rã trị riêng ma trận hiệp phương sai đối xứng $\boldsymbol{\Sigma}_k \mathbf{v}_j = \lambda_j \mathbf{v}_j$ bằng `np.linalg.eigh` (sắp xếp giảm dần $\lambda_1 \ge \lambda_2$):

$$
r_x = 2\sqrt{\lambda_1}, \qquad r_y = 2\sqrt{\lambda_2}, \qquad \theta_{\deg} = \frac{180}{\pi} \operatorname{atan2}(v_{1,y},\, v_{1,x})
$$

Trong đó: $r_x, r_y$ là bán trục lớn và bán trục nhỏ tương ứng độ tin cậy $2\sigma$; $\mathbf{v}_1 = [v_{1,x}, v_{1,y}]^\top$ là vector riêng ứng với trị riêng lớn nhất $\lambda_1$; $\theta_{\deg}$ là góc xoay định hướng của cụm chủ đề theo độ. Tiêu chuẩn đánh giá chất lượng mô hình GMM sử dụng chỉ số **BIC** và **AIC**:

$$
\mathrm{BIC} = -2 \ln \hat{L} + p_{\text{params}} \ln N_s, \qquad \mathrm{AIC} = -2 \ln \hat{L} + 2 p_{\text{params}}
$$

Trong đó: $\ln \hat{L}$ là giá trị hợp lý logarit cực đại của mô hình GMM; $p_{\text{params}}$ là số lượng tham số tự do của $K$ thành phần Gaussian hai chiều; $N_s$ là kích thước mẫu phân tích. Đặc biệt, tận dụng đặc trưng xác suất mềm $\gamma_{ik}$, hệ thống xác định **bài báo liên ngành (Cross-Disciplinary Paper)** khi xác suất lớn nhất rơi dưới ngưỡng $\max_k \gamma_{ik} < 0.65$ — tức bài báo nằm ở vùng giao thoa giữa ít nhất hai hướng nghiên cứu lớn.

### 4.2.4. Kết quả thực nghiệm phân cụm đa tầng

> **5W1H — Bảng đối chiếu chỉ số hợp lệ phân cụm trên ba quy mô dữ liệu**
> - **What**: So sánh chất lượng phân cụm qua Silhouette, Davies-Bouldin, Calinski-Harabasz và chỉ số GMM (BIC, AIC, Log-Likelihood, tỷ lệ liên ngành) trên lần chạy Production toàn hồ (`70,539` vector) so với lát cắt kiểm toán 800 bài đa hội nghị và kết quả Baseline 5,000 vector.
> - **Why**: Phân tích nghịch lý đa tạp mật độ cao trong không gian 768 chiều so với không gian chiếu 2D của tập bài báo đa lĩnh vực.
> - **When**: Tổng hợp từ các mốc chạy `06/10/2026`, `20/10/2026` ([clusters_api.json](../../data-mining-latek/figures/captured_20261123_082337/evidence/clusters_api.json)) và `04/11/2026` (`logs/run/backend.log`).
> - **Where**: [cluster_analysis.py](../../src/mining/cluster_analysis.py), [clusters_api.json](../../data-mining-latek/figures/captured_20261123_082337/evidence/clusters_api.json), [table_clustering_metrics.tex](../../data-mining-latek/tables/table_clustering_metrics.tex).
> - **Who**: Lớp `SemanticClusterAnalyzer`.
> - **How**: `MiniBatchKMeans(K=6)` trên 768D + `GaussianMixture(K=6, full)` trên PCA 2D + `DBSCAN(eps=0.28, metric="cosine")`.

| Thử nghiệm / Lát cắt | Quy mô vector ($M$) | Silhouette ($\uparrow$) | Davies-Bouldin ($\downarrow$) | Calinski-Harabasz ($\uparrow$) | GMM BIC / AIC | Tỷ lệ liên ngành ($\max_k \gamma_{ik} < 0.65$) | Kết quả DBSCAN |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Lần chạy toàn hồ (`04/11/2026`)** | `70,539` | `0.0490` (mẫu 5k) | — | — | `246,306.5` / `245,985.8` ($\text{LL} = -1.7431$) | — | Chạy trên 3,000 mẫu |
| **Tập kiểm toán 800 bài (`clusters_api.json`)** | `800` | `0.3528` | `0.8771` | `702.7` | `2,889.41` / `2,725.45` ($\text{LL} = -1.6597$) | `25.62%` (`205 / 800`) | `1` cụm chính, nhiễu `0.5%` |
| **Lát cắt Gold cục bộ (`06/10/2026`)** | `29,911` (mẫu `3,000`) | `0.0728` | `3.9775` | `84.1` | — | — | — |
| **Baseline KMeans/DBSCAN (`table_clustering_metrics`)** | `5,000` | `0.0210` | `5.3739` | `88.0` | — | — | `1` cụm duy nhất, nhiễu `0.0` |

*Giải thích khoa học về chênh lệch Silhouette (`0.0490` trên `70,539` bài vs `0.3528` trên `800` bài)*: Trong kho nhúng `768` chiều ở quy mô hơn $70,000$ bài báo trải đều liên tục khắp các nhánh AI (`cs.LG`, `cs.CV`, `cs.CL`, `cs.AI`, `stat.ML`), các bài báo giao thoa dày đặc tạo thành một **đa tạp liên tục không có khoảng trống biên cứng** (*continuous semantic manifold*) — điều được khẳng định trực tiếp bởi DBSCAN khi gom phần lớn điểm thành `1` siêu cụm liên thông ở ngưỡng `eps = 0.28`. Hệ quả là điểm Silhouette trung bình trên không gian 768 chiều ở quy mô lớn ở mức thấp (`0.0490`–`0.0728`), phản ánh đúng bản chất chuyển tiếp mượt giữa các lĩnh vực thay vì lỗi thuật toán; trong khi trên tập `800` bài phân tách rõ hơn trong `clusters_api.json`, mô hình EM GMM đạt chỉ số tách cụm rất rõ (`Silhouette = 0.3528`, `DB = 0.8771`, `CH = 702.7`), nhận diện chính xác `6` elip chủ đề định hướng và cô lập được **`25.62%` (`205/800`) bài báo giao thoa liên ngành**.

---

## 4.3. Trụ cột 3: Khai phá Mạng lưới Khoa học Chế độ Kép (PageRank & Louvain)

### 4.3.1. Mô hình hóa đồ thị: Citation DiGraph vs Co-authorship Fractional Weight

Trong [graph_mining.py](../../src/mining/graph_mining.py), lớp `ScientificGraphMiner` (giữ bí danh `CoauthorshipGraphMiner` cho tương thích ngược) tự động vận hành ở một trong hai chế độ topo tùy theo dữ liệu sẵn có trên MinIO:

1. **Chế độ ưu tiên — Đồ thị Trích dẫn Có hướng (`silver/citations.parquet`, Directed Citation Network)**: Khi tồn tại các cạnh trích dẫn nội bộ (`WHERE is_internal = true`), đồ thị có hướng $G_{\text{cite}} = (V, E)$ được dựng lên với mỗi nút $v \in V$ là một bài báo (`citing_paper_id` / `cited_paper_id`) và cạnh có hướng $(u \to v) \in E$ biểu diễn $u$ trích dẫn công trình nền tảng $v$. Trong mạng lưới này, chỉ số `degree` xuất ra biểu thị bậc vào (`in_degree`, số bài nội bộ trích dẫn tới $v$) và `paper_count` mang thông tin lượt trích dẫn toàn cục (`citation_count`).
2. **Chế độ dự phòng — Đồ thị Đồng tác giả Vô hướng Có trọng số Phân đoạn (Fractional-Weighted Co-authorship Network)**: Khi không có bảng cạnh trích dẫn, mỗi bài báo $p$ có $N_p > 1$ tác giả đóng góp một cạnh vô hướng giữa từng cặp đồng tác giả $(u, v)$ với trọng số chia đều nghịch đảo số đồng tác giả còn lại để chống lạm phát uy tín từ các bài báo "siêu tác giả" (*hyper-authorship*, như đã phát hiện bài có tới `144–147` tác giả trong Chương 3):
   $$
   W(u, v) = \sum_{p \in P_{uv}} \frac{1}{N_p - 1}, \qquad N_p > 1
   $$
   Trong đó: $P_{uv}$ là tập các bài báo mà hai tác giả $u$ và $v$ cùng đứng tên; $N_p$ là tổng số tác giả của bài báo $p$. Cách đánh trọng số phân đoạn $1/(N_p - 1)$ đảm bảo tổng trọng số đóng góp của một bài báo vào mỗi tác giả luôn cân bằng theo quy mô đóng góp cá nhân.

### 4.3.2. Thuật toán Damped PageRank và tối ưu Modularity Louvain

Để đo lường uy tín lan truyền trên đồ thị $G$ thay vì chỉ đếm bậc cục bộ (`in_degree`), hệ thống tính **Damped PageRank** qua `nx.pagerank(G, alpha=0.85)`:

$$
\mathrm{PR}(v) = \frac{1 - \alpha}{|V|} + \alpha \sum_{u \in \mathcal{N}_{\text{in}}(v)} \frac{w(u, v)}{\sum_{z \in \mathcal{N}_{\text{out}}(u)} w(u, z)} \, \mathrm{PR}(u)
$$

Trong đó: $\alpha = 0.85$ là hệ số giảm chấn (damping factor); $|V|$ là tổng số nút trong đồ thị; $\mathcal{N}_{\text{in}}(v)$ là tập các nút trỏ (trích dẫn) tới $v$; $\mathcal{N}_{\text{out}}(u)$ là tập các nút mà $u$ trỏ tới; $w(u, v)$ là trọng số cạnh $(u, v)$ (bằng $1$ trên đồ thị trích dẫn nhị phân hoặc $W(u, v)$ trên đồ thị đồng tác giả). Song song đó, cấu trúc cộng đồng nghiên cứu được phân tách tự động bằng thuật toán tham lam đa cấp **Louvain** (`nx.algorithms.community.louvain_communities(G_undir, seed=42)`) nhằm cực đại hóa chỉ số mô-đun **Modularity $Q$**:

$$
Q = \frac{1}{2m} \sum_{i, j} \left[ A_{ij} - \frac{k_i k_j}{2m} \right] \delta(c_i, c_j)
$$

Trong đó: $A_{ij}$ là trọng số cạnh nối giữa nút $i$ và nút $j$; $k_i = \sum_j A_{ij}$ là tổng trọng số bậc của nút $i$; $m = \frac{1}{2}\sum_{i,j} A_{ij}$ là tổng trọng số toàn mạng; $\delta(c_i, c_j) = 1$ nếu nút $i$ và $j$ thuộc cùng cộng đồng $c_i = c_j$, ngược lại bằng $0$.

### 4.3.3. Kết quả thực nghiệm mạng lưới và chi phí thời gian

Ở lần chạy toàn hồ ngày `04/11/2026`, `ScientificGraphMiner` tiêu tốn **`116.39` giây — chiếm tới `49.6%` tổng thời gian (`234.57` giây)** của toàn bộ `MiningEngine`, đánh dấu nút thắt cổ chai CPU lớn nhất do giải thuật lặp Louvain và lặp PageRank trên đồ thị hàng chục nghìn nút (`logs/run/backend.log`). Bảng dưới đây đối chiếu hai cấu hình đồ thị thực tế thu được từ hồ Gold (`citation` vs `coauthorship`) kèm kết quả thực chứng từ [graph_coauthorship.json](../../data/gold/mining/graph_coauthorship.json) và [table_graph_influencers.tex](../../data-mining-latek/tables/table_graph_influencers.tex):

> **5W1H — Bảng tổng hợp cấu trúc mạng lưới và Top nút uy tín PageRank**
> - **What**: So sánh quy mô mạng trích dẫn có hướng (`8,892` nút / `86,295` cạnh, `92` cộng đồng) với mạng đồng tác giả (`35,117` tác giả / `130,082` cạnh, `3,740` cộng đồng) và bảng trích xuất thực tế nút uy tín đỉnh.
> - **Why**: Tạo từ điển điểm chuẩn uy tín (`author_pagerank` / `paper_pagerank`) phục vụ gia cố xếp hạng trong `RetrievalService` và thử nghiệm `EXP-04`.
> - **When**: Đồ thị trích dẫn Gold ghi nhận tại [graph_coauthorship.json](../../data/gold/mining/graph_coauthorship.json) (`06/10/2026`); dữ liệu tác giả mở rộng trong [citation_metrics.parquet](../../data/gold/graphs/citation_metrics.parquet) (`29,523` tác giả) và [table_graph_influencers.tex](../../data-mining-latek/tables/table_graph_influencers.tex).
> - **Where**: [graph_mining.py](../../src/mining/graph_mining.py), [graph_coauthorship.json](../../data/gold/mining/graph_coauthorship.json), [citation_metrics.parquet](../../data/gold/graphs/citation_metrics.parquet).
> - **Who**: Lớp `ScientificGraphMiner`.
> - **How**: `nx.pagerank(G, alpha=0.85)` kết hợp phân cộng đồng Louvain (`seed=42`).

| Chế độ đồ thị | Nút ($\|V\|$) | Cạnh ($\|E\|$) | Cộng đồng Louvain | Top nút tiêu biểu (`PageRank`) | Chỉ số chi tiết (`degree` / quy mô) |
| :--- | :---: | :---: | :---: | :--- | :--- |
| **Đồ thị Trích dẫn Có hướng** (`graph_coauthorship.json`) | `8,892` | `86,295` | `92` (`density = 0.001092`) | **Vaswani et al.** (*Attention Is All You Need*): **`0.012632`** | `in_degree = 1,213`, `cites = 26,678` |
| **Đồ thị Trích dẫn Có hướng** (hạng 2) | `8,892` | `86,295` | `92` | **Matthew E. Peters et al.** (*ELMo*): **`0.008603`** | `in_degree = 900`, `cites = 12,264` |
| **Đồ thị Trích dẫn Có hướng** (hạng 3) | `8,892` | `86,295` | `92` | **Jakubův, Jan et al.** (*Exploiting GenAI...*): **`0.007782`** | `in_degree = 1,145`, `cites = 78,459` |
| **Mạng Đồng tác giả** (`table_graph_influencers.tex`) | `35,117` | `130,082` | `3,740` | **Yang Liu**: **`0.000509`** | `degree = 237`, `papers = 38` |
| **Chỉ số hợp nhất mở rộng** (`citation_metrics.parquet`) | `29,523` tác giả | `10,000` bài trích dẫn nền | — | Dùng làm từ điển PageRank ở Chương 5 (`EXP-04`) | Kết hợp từ đồ thị bài báo + tác giả |

Chú ý rằng điểm PageRank trần mặc định của `RetrievalService` (`_MAX_PAGERANK = 0.012632`) bắt nguồn trực tiếp từ nút uy tín cực đại (*Attention Is All You Need*, `0.012632`) thu được từ đồ thị trích dẫn có hướng ở bảng trên.

---

## 4.4. Trụ cột 4: Động lượng Thị phần $\Delta\text{Share}$ & Phát hiện Bất thường Isolation Forest

### 4.4.1. Cửa sổ thứ tự thời gian `dense_rank()` và Động lượng Thị phần

Nhằm khắc phục hiện tượng lệch khối lượng thu hoạch theo tháng đã chỉ ra ở Phát hiện 3 (§3.3.3), lớp `TrendAnomalyMiner` ([trend_anomaly_mining.py](../../src/mining/trend_anomaly_mining.py)) không dùng mốc ngày dương lịch cố định mà sắp xếp các tháng thực tế có dữ liệu giảm dần thông qua hàm cửa sổ SQL:

```sql
-- Order observed publication months sequentially without fixed calendar bias
WITH ym_ranked AS (
    SELECT
        SUBSTR(published_date, 1, 7) AS ym,
        DENSE_RANK() OVER (ORDER BY SUBSTR(published_date, 1, 7) DESC) AS m_rank
    FROM fulltext_view
    WHERE published_date >= '2020-01-01'
    GROUP BY SUBSTR(published_date, 1, 7)
)
```

Cửa sổ `recent` lấy `3` tháng quan sát gần nhất (`m_rank <= 3`), cửa sổ `previous` lấy `3` tháng kề trước (`m_rank BETWEEN 4 AND 6`), và chỉ đánh giá các chuyên ngành có tổng lũy kế toàn thời gian `all_time_total >= 40`. Động lượng của chuyên ngành $c$ được chuẩn hóa theo **thị phần tương đối (Share-Normalized Momentum)**:

$$
s_{\text{rec}}(c) = \frac{\operatorname{Count}_{\text{rec}}(c)}{\sum_{k} \operatorname{Count}_{\text{rec}}(k)}, \qquad s_{\text{prev}}(c) = \frac{\operatorname{Count}_{\text{prev}}(c)}{\sum_{k} \operatorname{Count}_{\text{prev}}(k)}
$$

$$
\Delta s(c) = 100 \times \left(s_{\text{rec}}(c) - s_{\text{prev}}(c)\right) \, [\%], \qquad g(c) = 100 \times \frac{s_{\text{rec}}(c) - s_{\text{prev}}(c)}{s_{\text{prev}}(c)} \, [\%]
$$

Trong đó: $\operatorname{Count}_{\text{rec}}(c)$ và $\operatorname{Count}_{\text{prev}}(c)$ là số bài báo của chuyên ngành $c$ trong 3 tháng quan sát mới nhất và 3 tháng trước đó; $s_{\text{rec}}(c), s_{\text{prev}}(c)$ là thị phần tương ứng trên toàn tập bài trong cửa sổ; $\Delta s(c)$ là biến thiên thị phần tính theo điểm phần trăm; $g(c)$ là tốc độ tăng trưởng thị phần tương đối (khi $s_{\text{prev}}(c) = 0$ và $s_{\text{rec}}(c) > 0$, $g(c) = 100.0\%$). Nhãn phân loại động lượng được gán theo quy tắc:
- **`SURGING`**: nếu $g(c) > 15.0\%$ hoặc $\Delta s(c) > 1.5$ điểm phần trăm.
- **`DECLINING`**: nếu $g(c) < -15.0\%$ hoặc $\Delta s(c) < -1.5$ điểm phần trăm.
- **`STABLE`**: các trường hợp còn lại.

### 4.4.2. Isolation Forest 5 chiều trên thang $\ln(1+x)$ và gán nhãn giải thích tự động

Từ Phát hiện 4 (§3.3.4) về bản chất đuôi dài của các biến cấu trúc bài báo, `TrendAnomalyMiner` trích xuất vectơ đặc trưng 5 chiều $\mathbf{x}_i = [\text{math}, \text{words}, \text{sections}, \text{authors}, \text{categories}]^\top$ cho từng bài báo, sau đó áp dụng phép nén phi tuyến $\tilde{\mathbf{x}}_i = \ln(1 + \mathbf{x}_i)$ (`np.log1p`) trước khi huấn luyện **`IsolationForest(contamination=0.02, random_state=42, n_estimators=100)`**.

Nguyên lý của Isolation Forest dựa trên nhận định rằng điểm ngoại lai vừa **ít về số lượng**, vừa có **giá trị đặc trưng khác biệt sâu** so với phần lõi phân bố, nên đòi hỏi ít phép phân chia ngẫu nhiên (độ sâu đường đi $h(x)$ ngắn hơn) để cô lập từ gốc cây nhị phân ngẫu nhiên (*iTree*). Điểm bất thường chuẩn hóa gốc của thuật toán là:

$$
s(x, n) = 2^{-\frac{\mathbb{E}[h(x)]}{c(n)}}, \qquad c(n) = 2 H(n - 1) - \frac{2(n - 1)}{n}
$$

Trong đó: $\mathbb{E}[h(x)]$ là độ sâu đường đi trung bình của điểm $x$ qua $100$ cây phân lập; $c(n)$ là độ dài đường đi trung bình của một tìm kiếm không thành công trên cây tìm kiếm nhị phân có $n$ điểm mẫu; $H(i) \approx \ln(i) + \gamma_{\text{Euler}}$ là số điều hòa thứ $i$. Lưu ý trong triển khai Scikit-learn (`clf.score_samples(X_scaled)`), giá trị trả về là **số âm** (`-0.7035`, `-0.6906`...), với **giá trị càng âm tương ứng đường đi $\mathbb{E}[h(x)]$ càng ngắn và mức độ bất thường càng cao**.

Để chuyển điểm số toán học thành báo cáo giải thích cho chuyên gia, hệ thống tự động sinh danh sách `anomaly_reasons` đa nhãn theo các ngưỡng định lượng:
- Tổng công thức toán $> 1,000$ (`Math-Heavy Theory`).
- Độ dài toàn văn $> 25,000$ từ (`Monograph / Mega-Survey`).
- Số lượng đồng tác giả $> 15$ (`Hyper-Authorship Collaboration`).
- Số chuyên ngành gán đồng thời $\ge 4$ (`Extreme Multidisciplinary Overlap`).
- Hoặc ngoại lệ tổng hợp khi rơi vào ngưỡng bất thường của đa biến không gian 5 chiều nhưng không vượt ngưỡng đơn biến riêng lẻ.

### 4.4.3. Kết quả thực nghiệm xu hướng và ngoại lai

Ở lần chạy Production `04/11/2026`, `TrendAnomalyMiner` chỉ tiêu tốn **`2.89` giây** để xử lý toàn bộ **`71,927` bài báo**, phát hiện **`1,000` bài báo ngoại lai hàng đầu** (`top_anomalies = 1000`, `contamination = 0.02`) và theo dõi động lượng trên **`48` chuyên ngành** đủ ngưỡng tối thiểu `all_time >= 40` (`logs/run/backend.log`). Để minh họa chi tiết ở cấp từng bản ghi và từng chuyên ngành, bảng dưới đây trình bày các chuyên ngành có biến thiên động lượng nổi bật và các bài báo bất thường điển hình trích xuất từ [trends_anomalies.json](../../data/gold/mining/trends_anomalies.json) (trên tập Gold cục bộ `29,911` bài / `260` ngoại lai / `26` chuyên ngành):

> **5W1H — Bảng kết quả Động lượng Thị phần và Bất thường Cấu trúc (`data/gold/mining/trends_anomalies.json`)**
> - **What**: Tổng hợp phân loại động lượng thị phần của 8 chuyên ngành tiêu biểu cùng 5 bài báo ngoại lai tiêu biểu có điểm `score_samples` âm sâu nhất.
> - **Why**: Kiểm chứng cơ chế chuẩn hóa thị phần $\Delta\text{Share}$ chống lệch đợt thu thập và khả năng cô lập bài báo dị thường đa chiều của Isolation Forest.
> - **When**: Lát cắt S1 ([trends_anomalies.json](../../data/gold/mining/trends_anomalies.json)), kèm đối chiếu quy mô vận hành S3 (`04/11/2026`: `71,927` bài, `1,000` ngoại lai, `48` chuyên ngành, `2.89 s`).
> - **Where**: [trend_anomaly_mining.py](../../src/mining/trend_anomaly_mining.py), [trends_anomalies.json](../../data/gold/mining/trends_anomalies.json).
> - **Who**: Lớp `TrendAnomalyMiner`.
> - **How**: `dense_rank()` 3 tháng gần nhất vs 3 tháng trước + `IsolationForest(n_estimators=100, contamination=0.02)` trên $\ln(1 + \mathbf{x})$.

| Chuyên ngành / Mã arXiv | Loại kết quả | Giá trị định lượng (`growth` / `anomaly_score`) | Đặc trưng nổi bật | Trạng thái / Nhãn lý giải |
| :--- | :--- | :---: | :--- | :--- |
| `cs.CV` (Thị giác máy tính) | Động lượng xu hướng | `growth = +123.43%` | `recent = 722`, `prev = 6`, `all_time = 3,021` | `SURGING` |
| `cs.AI` (Trí tuệ nhân tạo) | Động lượng xu hướng | `growth = +198.94%` | `recent = 161`, `prev = 1`, `all_time = 625` | `SURGING` |
| `cs.CL` (Xử lý ngôn ngữ) | Động lượng xu hướng | `growth = +69.89%` | `recent = 366`, `prev = 4`, `all_time = 1,858` | `SURGING` |
| `cs.LG` (Học máy) | Động lượng xu hướng | `growth = +38.64%` | `recent = 672`, `prev = 9`, `all_time = 3,093` | `SURGING` |
| `cs.RO` (Robot học) | Động lượng xu hướng | `growth = -81.43%` | `recent = 160`, `prev = 16`, `all_time = 879` | `DECLINING` |
| `cs.IR` (Truy hồi thông tin) | Động lượng xu hướng | `growth = -3.45%` | `recent = 52`, `prev = 1`, `all_time = 310` | `STABLE` |
| `arXiv:2206.08756` | Bất thường IF (`rank #1`) | `score = -0.7035` | `1,600` công thức, `15,279` từ, `6` nhãn ngành | Math-Heavy + Extreme Multidisciplinary |
| `arXiv:2501.05498` | Bất thường IF (`rank #2`) | `score = -0.6906` | `5,470` công thức, `74,303` từ | Extreme Math + Mega-Survey Monograph |
| `arXiv:2401.13216` | Bất thường IF (`rank #3`) | `score = -0.6865` | `3,732` công thức, `26,576` từ, `4` nhãn ngành | Math-Heavy + Mega-Survey + 4 Categories |
| `arXiv:2411.15221` | Bất thường đa tác giả | Bất thường quy mô nhóm | `144` đồng tác giả trên cùng công trình | Hyper-Authorship Collaboration |

Bốn trụ cột khai phá dữ liệu ở trên không vận hành cô lập dưới dạng đồ thị báo cáo tĩnh: các tập luật từ `AssociationRuleMiner` và từ điển điểm PageRank từ `ScientificGraphMiner` được nạp trực tiếp vào RAM của dịch vụ truy hồi thời gian thực, tạo thành cầu nối trực tiếp sang kiến trúc Hybrid RAG và Reranking trình bày ở [Chương 4 — Phần 2](./04b_CH4_KIEN_TRUC_HYBRID_RAG_VA_RERANKING.md).
