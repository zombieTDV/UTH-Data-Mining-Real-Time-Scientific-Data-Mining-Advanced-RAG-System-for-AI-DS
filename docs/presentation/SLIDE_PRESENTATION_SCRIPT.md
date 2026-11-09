# Kịch bản Thuyết trình Đồ án: Khai phá Dữ liệu Nghiên cứu Khoa học Thời gian thực & Hệ thống Grounded RAG

- **Học phần**: Khai phá Dữ liệu (Data Mining) — Trường Đại học Giao thông Vận tải TP.HCM (UTH)
- **Giảng viên hướng dẫn**: TS. Trần Thế Vinh
- **Tệp Slide PowerPoint Native**: [`presentation_UTH_Data_Mining_RAG.pptx`](../presentation_UTH_Data_Mining_RAG.pptx) (Tỷ lệ 16:9, Dark/Light Academic Theme, Đã nhúng Speaker Notes)
- **Công cụ sinh tự động**: [`generate_slides.py`](../generate_slides.py)

---

## Cấu trúc Tổng thể Bộ Slide (14 Slides)

| Slide # | Tiêu đề Slide | Nội dung Cốt lõi & Điểm nhấn Học thuật |
| :---: | :--- | :--- |
| **1** | **Trang Bìa Đồ án** | Tên đề tài, Giảng viên TS. Trần Thế Vinh, Sinh viên, Quy mô 13,000+ bài báo, 143k vectors. |
| **2** | **Bối cảnh & Thách thức** | Bùng nổ ấn phẩm AI/DS, Vấn đề ảo giác (Hallucination) của LLMs, Mục tiêu hệ thống. |
| **3** | **Kiến trúc Medallion Lakehouse** | Mô hình ELT phân tầng: Bronze (Cloudflare R2) -> Silver (Parquet) -> Gold (LanceDB) -> Serving. |
| **4** | **Thu thập & Chuẩn hóa Silver** | OAI-PMH, Ar5iv HTML, Trích xuất 2.76M công thức toán học LaTeX, 441k liên kết trích dẫn. |
| **5** | **Trụ cột 1: Luật kết hợp (FP-Growth)** | Mô hình hóa 11,404 giao dịch (chuyên mục + 25 khái niệm AI), Support, Confidence, Lift > 2.5x. |
| **6** | **Trụ cột 2: Phân cụm Ngữ nghĩa** | 768-D Embeddings, Centered PCA 2D, Đối chiếu MiniBatchKMeans (k=6) và DBSCAN mật độ. |
| **7** | **Trụ cột 3: Mạng Đồ thị Trích dẫn** | Đồ thị có hướng 86,295 cạnh, Directed PageRank tìm Landmark Papers, Louvain Modularity (92 cụm). |
| **8** | **Trụ cột 4: Dị biệt & Xu hướng** | Isolation Forest với log-scale feature transform, Trend Velocity (SURGING / STABLE / DECLINING). |
| **9** | **Tầng Vector LanceDB Gold** | Chỉ mục ANN LanceDB 143,523 vector 768-D, Hierarchical Chunking, Độ trễ truy vấn < 15ms. |
| **10** | **Hệ thống Grounded RAG** | Qwen2.5-7B offload Apple Metal GPU, Context 8192, Warmup server, Trích dẫn bảo chứng [Paper: ID]. |
| **11** | **Giao diện Dashboard Tương tác** | React 19 + TypeScript + Vite, KaTeX Math, ECharts Canvas, Telemetry & Dossier Drawer. |
| **12** | **Đánh giá Thực nghiệm** | Số liệu thực tế: Throughput 38 tok/s, Latency 18ms (DuckDB), 100% trích dẫn xác thực. |
| **13** | **Kết luận & Hướng Phát triển** | Đóng góp chính, Mở rộng đa nguồn IEEE/ACM, Nâng cấp Graph RAG, Auto-Slide Generator. |
| **14** | **Q&A & Chuyển sang Live Demo** | Cảm ơn Thầy Cô, mở trực tiếp Web Dashboard chạy thử nghiệm câu hỏi thực tế. |

---

## Kịch bản Chi tiết & Lời thoại Trình bày Trước Giảng viên (Speaker Notes)

### Slide 1: Trang Bìa (Title Slide)
- **Lời nói mở đầu**:
  > *"Em kính chào Thầy Trần Thế Vinh và các bạn! Hôm nay nhóm em xin phép được báo cáo đồ án môn học Khai phá Dữ liệu với đề tài: **Khai thác dữ liệu nghiên cứu khoa học thời gian thực hướng tới xây dựng hệ thống truy xuất tri thức nâng cao (RAG) cho miền AI/DS**.*
  >
  > *Điểm đặc biệt của đề tài này là nhóm em không dừng lại ở mức mô hình thuật toán trên một tệp CSV tĩnh, mà đã thiết kế và triển khai một nền tảng Data Lakehouse hoàn chỉnh, quản lý hơn 13,000 bài báo khoa học thực tế, bóc tách hơn 2.7 triệu công thức toán học và tích hợp mô hình ngôn ngữ lớn Qwen2.5-7B vận hành hoàn toàn cục bộ có đối soát trích dẫn xác thực."*

---

### Slide 2: Bối cảnh & Thách thức Cốt lõi
- **Trọng tâm cần nói**:
  1. **Tốc độ xuất bản vũ bão**: Mỗi tuần có hàng ngàn bài báo mới trên arXiv. Một nhà nghiên cứu không thể đọc xuể từng PDF. Các công cụ tìm kiếm từ khóa hiện nay chỉ tìm surface keywords, không hiểu mối quan hệ liên ngành.
  2. **Ảo giác của AI thương mại (ChatGPT / Claude)**: Khi hỏi về các công trình nghiên cứu chuyên sâu, các LLM này thường tự "bịa" ra tác giả, bịa ra bài báo và viết sai lệch các công thức toán học.
  3. **Mục tiêu của nhóm**: Tạo ra hệ thống "Grounded AI" – Mô hình chỉ được phép trả lời dựa trên những bằng chứng đã được lưu trữ và kiểm chứng từ kho tài liệu khoa học của hệ thống.

---

### Slide 3: Kiến trúc Medallion Data Lakehouse
- **Trọng tâm cần nói**:
  > *"Để xử lý khối lượng dữ liệu khoa học lớn một cách chuyên nghiệp, nhóm áp dụng kiến trúc **Medallion Lakehouse** chuẩn công nghiệp gồm 3 tầng dữ liệu rõ ràng:*
  > - ***Tầng Bronze (Vault bất biến)***: *Lưu trữ trên Cloudflare R2 với chi phí băng thông 0đ (Zero Egress Cost), chứa nguyên bản 9,022 bài báo HTML và metadata có mã băm SHA-256 bảo đảm tính toàn vẹn dữ liệu.*
  > - ***Tầng Silver (Dữ liệu dạng cột sạch)***: *Lưu trữ dưới dạng Apache Parquet, sử dụng công nghệ DuckDB in-memory SIMD để xử lý dữ liệu với tốc độ ánh sáng.*
  > - ***Tầng Gold (Kho dữ liệu phân tích & Vector)***: *Chứa 143,523 vector embedding trong LanceDB và kết quả tính toán của 4 trụ cột thuật toán khai phá.*
  > - ***Tầng Phục vụ (Serving)***: *FastAPI backend và React 19 dashboard thời gian thực."*

---

### Slide 4: Thu thập Dữ liệu & Chuẩn hóa Parquet
- **Trọng tâm cần nói**:
  - Nhấn mạnh bài toán **Công thức Toán học**: Dữ liệu PDF thông thường khi cào về rất dễ bị lỗi font phương trình. Nhóm đã xây dựng pipeline parser bóc tách chính xác **2.76 triệu công thức LaTeX** và MathML, lưu theo cấu trúc phân đoạn.
  - Phân tích mục References để trích xuất **441,445 liên kết trích dẫn**, trong đó có 86,295 liên kết nội bộ giữa các bài báo trong tập dữ liệu.

---

### Slide 5: Trụ cột 1 — Luật kết hợp (FP-Growth)
- **Trọng tâm cần nói**:
  - Nhóm mô hình hóa **11,404 giao dịch (transactions)**: Mỗi bài báo là một tập hợp gồm Phân loại arXiv chính + 25 khái niệm kỹ thuật AI cốt lõi (Transformer, Diffusion, LoRA, GNN, v.v.).
  - **Tại sao chọn FP-Growth thay vì Apriori?** FP-Growth dùng cấu trúc cây FP-Tree nén dữ liệu, chỉ quét cơ sở dữ liệu đúng 2 lần, tránh được hiện tượng bùng nổ tổ hợp ứng viên $O(2^k)$ của Apriori.
  - **Kết quả thực nghiệm**: Tìm ra các quy tắc vàng với chỉ số Lift > 2.5x, ví dụ:
    - $\text{Diffusion Distillation} \to \text{cs.CV}$ (Lift = 3.12x, Conf = 68.2%)
    - $\text{LoRA \& Parameter-Efficient} \to \text{cs.CL}$ (Lift = 2.85x, Conf = 61.5%)
    - Khử hoàn toàn các cặp luật đối xứng để giữ lại tri thức định hướng nguyên nhân - kết quả.

---

### Slide 6: Trụ cột 2 — Phân cụm Ngữ nghĩa & Đánh giá Mật độ
- **Trọng tâm cần nói**:
  - Mã hóa Abstract bằng vector 768 chiều (Nomic Embed v1.5), chiếu phẳng 2 chiều bằng **Centered PCA**.
  - **So sánh 2 trường phái học không giám sát (Unsupervised Learning)**:
    1. *MiniBatchKMeans (k=6)*: Phân chia không gian thành 6 cụm đề tài chính. Thầy có thể hỏi tại sao Silhouette Score = 0.0629? Giải thích: Trong khoa học AI hiện đại, các khái niệm giao thoa liên ngành cực kỳ mạnh (ví dụ một bài báo Multimodal vừa có Text vừa có Image), do đó các cụm không tách rời tuyệt đối.
    2. *DBSCAN (Mật độ)*: Bóc tách 4 lõi nghiên cứu siêu đậm đặc và chứng minh 53.5% bài báo nằm ở vùng ranh giới đa ngành (Boundary Noise).

---

### Slide 7: Trụ cột 3 — Mạng Đồ thị Trích dẫn & Đồng tác giả
- **Trọng tâm cần nói**:
  - Xây dựng đồ thị có hướng gồm **8,892 bài báo** và **86,295 cạnh trích dẫn**.
  - Áp dụng thuật toán **Directed PageRank ($\alpha=0.85$)**: Không chỉ đếm số trích dẫn thô sơ mà đo lường uy tín lan truyền. Hệ thống tự động xác định được các công trình bản lề như *Attention Is All You Need* (Transformer), *BERT*, *ResNet*.
  - Áp dụng thuật toán **Louvain Modularity** trên mạng lưới tác giả: Phân rã mạng lưới học thuật thành **92 cộng đồng nghiên cứu** độc lập, nhận diện các Lab nghiên cứu hàng đầu thế giới.

---

### Slide 8: Trụ cột 4 — Phát hiện Dị biệt & Động lượng Xu hướng
- **Trọng tâm cần nói**:
  - **Isolation Forest**: Áp dụng phép biến đổi $\log(1 + x)$ trên các thuộc tính cấu trúc (số trang, số công thức toán, số bảng biểu). Phát hiện ra **30 bài báo dị biệt cấu trúc** (như các chuyên khảo dày hàng trăm trang hoặc bài báo lý thuyết toán thuần túy). Điều này giúp làm sạch dữ liệu trước khi đẩy vào pipeline RAG.
  - **Trend Velocity ($\Delta \text{Share}$)**: Phân loại động lượng các chuyên ngành thành:
    - *SURGING (Tăng trưởng nóng)*: Diffusion Distillation, Multimodal Agents, LLM Reasoning.
    - *STABLE (Ổn định)*: Time-Series, Object Detection truyền thống.
    - *DECLINING (Bão hòa / Giảm dần)*: Các kiến trúc cũ bị thay thế bởi Transformer.

---

### Slide 9: Tầng Vector Embeddings & LanceDB Gold
- **Trọng tâm cần nói**:
  - Lưu trữ **143,523 vector 768 chiều** trực tiếp trên cơ sở dữ liệu vector LanceDB dạng Serverless in-memory.
  - Phân đoạn văn bản dạng **Hierarchical Chunking** theo cấu trúc mục (Section-aware) thay vì cắt vụn theo ký tự ngẫu nhiên.
  - Tốc độ truy vấn ANN Cosine Similarity đạt **dưới 15 mili-giây**, hỗ trợ lọc kết hợp metadata (năm xuất bản, chuyên mục, tác giả).

---

### Slide 10: Hệ thống Grounded RAG với Qwen2.5-7B
- **Trọng tâm cần nói**:
  - Sử dụng mô hình **Qwen2.5-7B-Instruct GGUF**, offload toàn bộ 33 layers lên **Apple Silicon Metal GPU (MPS)**.
  - Mở rộng cửa sổ ngữ cảnh (Context Window) lên **8,192 tokens** và warmup mô hình ngay khi bật server, triệt tiêu độ trễ khởi động.
  - **Cơ chế Strict Grounding**: Bắt buộc mọi câu trả lời phải trích dẫn theo cú pháp `[Paper: ID, Section: Title]`.
  - **Dossier Drawer**: Khi người dùng click vào trích dẫn trên Web, một ngăn kéo trượt ra hiển thị toàn văn abstract, tác giả và đoạn trích từ Lakehouse để đối chứng ngay lập tức.

---

### Slide 11: Giao diện Người dùng & Trải nghiệm Học thuật
- **Trọng tâm cần nói**:
  - Dashboard phát triển bằng **React 19 + TypeScript + Vite**, hỗ trợ Dark/Light Theme đồng bộ.
  - Hiển thị công thức toán học sắc nét với thư viện **KaTeX**.
  - Các công cụ học thuật: Copy citation BibTeX, xuất biểu đồ SVG, phóng to Theater Mode và đường ống giám sát thời gian thực.
  - Trạng thái phản hồi của AI được tối ưu thành **1 dòng duy nhất**: Hiển thị hiệu ứng 3 chấm nảy và quy trình suy luận bằng tiếng Anh chuyên ngành trước khi stream văn bản.

---

### Slide 12: Đánh giá Thực nghiệm
- **Trọng tâm cần nói**:
  - Nhấn mạnh: **Toàn bộ chỉ số đều từ hệ thống thật (Real-world Data Lakehouse), không sử dụng mock data**.
  - Tốc độ quét cột DuckDB: **~18ms**.
  - Tốc độ truy xuất LanceDB: **12 - 15ms**.
  - Tốc độ sinh token của LLM: **~38 tokens/giây** trên GPU Metal.
  - Tỷ lệ trích dẫn xác thực: **100% trích dẫn do Qwen2.5-7B sinh ra đều tồn tại thực tế trong kho lưu trữ**.

---

### Slide 13: Kết luận & Hướng Phát triển
- **Trọng tâm cần nói**:
  - Khẳng định đề tài đã giải quyết trọn vẹn yêu cầu môn học Khai phá Dữ liệu và mở rộng thành sản phẩm AI ứng dụng thực tế.
  - Lộ trình tương lai: Mở rộng nguồn dữ liệu IEEE/ACM, phát triển **Graph RAG** và tích hợp module tự động sinh slide bài báo khoa học.

---

### Slide 14: Lời cảm ơn & Chuyển sang Demo
- **Lời kết thúc**:
  > *"Em xin chân thành cảm ơn Thầy Trần Thế Vinh đã lắng nghe phần thuyết trình của nhóm. Sau đây, nhóm em xin phép được mở trực tiếp ứng dụng Web và thực hiện một số truy vấn khai phá cũng như đặt câu hỏi cho trợ lý RAG để Thầy cùng kiểm tra ạ!"*
