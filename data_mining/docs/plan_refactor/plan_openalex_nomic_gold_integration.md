# PLAN — OpenAlex Silver → Nomic Embed Text v1.5 → Gold Vector Lakehouse on Cloudflare R2

> **Project:** UTH Data Mining — Real-Time Scientific Data Mining & Advanced RAG for AI/DS  
> **Phase:** Gold Integration for OpenAlex  
> **Scope:** tích hợp `nomic-ai/nomic-embed-text-v1.5`, xây dựng Gold vector layer, lưu/publish lên Cloudflare R2, quản lý model artifact, weights/state_dict, checkpoint, model/index versioning, kiểm thử và incremental indexing.  
> **Không nằm trong scope hiện tại:** crawl HTML/PDF publisher, reranker, hybrid BM25+dense hoàn chỉnh, citation graph, GraphRAG, LLM generation, fine-tuning embedding model.
>
> **Nguyên tắc:** không phá OpenAlex V2 crawler đang chạy ổn. Bronze/Silver giữ nguyên; Gold là downstream pipeline độc lập, resumable và versioned.

---



# 0. Executive Summary

OpenAlex V2 hiện đã được refactor theo hướng modular và transaction-safe. Bước tiếp theo không nên nhét embedding vào `collector.py`. Crawler chỉ nên chịu trách nhiệm:

```text
OpenAlex API
   ↓
Bronze
   ↓
Silver
```

Gold cần là một **downstream indexing pipeline** riêng:

```text
Silver OpenAlex
      ↓
Silver Contract Validation
      ↓
Scientific Text Builder / Chunk Builder
      ↓
Nomic Embed Text v1.5
      ↓
Gold Row Builder
      ↓
LanceDB Local Staging
      ↓
Gold Verification
      ↓
Immutable R2 Snapshot
      ↓
Gold Manifest
      ↓
_latest.json
```

Model cũng **không được lưu trong** `gold/`. Model weights là artifact của hệ thống ML, nên đặt trong:

```text
models/
```

ở local và, nếu cần reproducibility/offline recovery:

```text
artifacts/models/
```

trên R2.

Gold chỉ lưu:

- embedding/vector;
- metadata truy xuất;
- model fingerprint/revision;
- chunk/text fingerprint;
- LanceDB snapshot;
- manifest/checkpoint/index metadata.

---



# 1. Audit source hiện tại



## 1.1. OpenAlex V2 đã tách module tốt

Source hiện có:

```text
src/ingestion/openalex_v2/
├── checkpoint_v2.py
├── client.py
├── collector.py
├── commit_manifest.py
├── cursor_invariant.py
├── paths.py
├── preflight.py
├── r2_client.py
├── rate_limit.py
├── recovery.py
├── request.py
├── retry.py
├── schema.py
├── scope.py
├── scope_fingerprint.py
└── writer.py
```

Đây là pattern tốt và Gold nên tiếp tục cùng triết lý:

> **mỗi concern một module, pipeline chỉ orchestration.**

Không đưa model download, model load, pooling, Gold schema, R2 publish, checkpoint vào cùng một file `run_indexing.py`.

---



## 1.2. Codebase đã có embedding prototype

Hiện có:

```text
src/indexing/
├── chunker.py
├── embedder.py
└── lancedb_manager.py
```

`NomicEmbedder` hiện:

- đọc model từ `settings.EMBEDDING_MODEL_PATH`;
- dùng `AutoTokenizer`;
- dùng `AutoModel.from_pretrained(..., trust_remote_code=True)`;
- device auto: MPS → CUDA → CPU;
- thêm:
  - `search_document:`
  - `search_query:`
- mean pooling;
- L2 normalize;
- output 768 chiều.

Đây là baseline có thể tái sử dụng **về ý tưởng**, nhưng chưa đủ production-grade.

---



## 1.3. `run_indexing.py` hiện là arXiv-oriented, không phải OpenAlex-oriented

Pipeline hiện query:

```text
data/silver/**/*.parquet
```

và giả định các column như:

```text
total_sections
published_date
sections_json
primary_category
paper_id
abstract
```

Sau đó dùng `AcademicChunker`.

Đây là contract của pipeline arXiv/full-text trước đây.

Không được dùng trực tiếp cho OpenAlex nếu Silver OpenAlex không có đúng schema đó.

### Quyết định

Tạo **source-neutral Gold contract**.

Sau đó:

```text
OpenAlex Silver → OpenAlexGoldAdapter → GoldDocument
arXiv Silver    → ArxivGoldAdapter    → GoldDocument
```

Gold pipeline chỉ biết `GoldDocument`, không biết source upstream cụ thể.

---



# 2. Những vấn đề cần sửa trước khi dùng Nomic production



## 2.1. Model chưa có bootstrap/downloader

Current code:

```text
models/nomic-embed-text-v1.5/
```

không tồn tại → `FileNotFoundError`.

Cần có:

```text
prepare_embedding_model
```

để:

1. download model;
2. pin revision;
3. verify files;
4. build manifest;
5. optional mirror R2;
6. test load offline.

---



## 2.2. Không pin model revision

Không nên:

```text
repo = nomic-ai/nomic-embed-text-v1.5
revision = main
```

trong production.

`main` có thể thay đổi:

- config;
- remote modeling code;
- tokenizer;
- weight;
- Transformers compatibility.

Cần:

```text
MODEL_REPO_ID=nomic-ai/nomic-embed-text-v1.5
MODEL_REVISION=<full Hugging Face commit SHA>
```

Gold index phải lưu revision này.

---



## 2.3. `max_length=1024` đang hard-code

Current embedder mô tả model hỗ trợ 8192 token nhưng thực tế tokenizer:

```python
max_length=1024
```

Điều này không nhất thiết sai cho abstract/chunks ngắn, nhưng phải **config-driven**.

Phân biệt:

```text
MODEL_MAX_CONTEXT
vs
PIPELINE_MAX_INPUT_TOKENS
```

Recommended V1:

```text
MODEL_MAX_CONTEXT = 8192
PIPELINE_MAX_INPUT_TOKENS = 1024 hoặc 2048
```

Sau khi chạy token-length EDA mới quyết định.

Không cần đẩy mọi input lên 8192 token vì sẽ giảm throughput rất mạnh.

---



## 2.4. Pooling pipeline chưa hoàn toàn khớp hướng dẫn hiện hành của Nomic

Current:

```text
mean pooling
→ L2 normalize
```

Nomic v1.5 hỗ trợ Matryoshka embedding và hướng dẫn hiện hành dùng:

```text
mean pooling
→ layer norm
→ optional truncate dimension
→ L2 normalize
```

V1 của project nên implement chính xác và version hóa:

```text
pooling_version=nomic_mean_layernorm_l2_v1
```

---



## 2.5. Current R2 Gold sync chưa transaction-safe

Hiện:

```python
for file in db_path.rglob("*"):
    r2.upload_file(...)
```

vào:

```text
gold/lancedb/
```

Rủi ro:

- upload dở giữa chừng;
- remote có mixture giữa snapshot cũ và mới;
- không có manifest;
- không biết version model/index;
- không có `_latest` pointer;
- rollback khó.



### Quyết định

Không sync mutable folder trực tiếp.

Dùng:

```text
immutable snapshot
→ verify
→ manifest
→ publish latest pointer
```

---



# 3. Kiến trúc mục tiêu

```text
┌────────────────────────────────────────────────────────────┐
│                     OPENALEX V2 PIPELINE                   │
│                                                            │
│ API → Bronze → Silver                                      │
└────────────────────────────┬───────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────┐
│                 GOLD SOURCE ADAPTER                        │
│                                                            │
│ Validate Silver schema                                     │
│ Normalize OpenAlex → GoldDocument                          │
│ Build content hash                                         │
└────────────────────────────┬───────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────┐
│                TEXT / CHUNK BUILDER                        │
│                                                            │
│ title + abstract                                           │
│ optional metadata context                                  │
│ deterministic chunk_id                                     │
│ token statistics                                           │
└────────────────────────────┬───────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────┐
│                  MODEL REGISTRY                            │
│                                                            │
│ Local model snapshot                                       │
│ R2 artifact cache (optional)                               │
│ HF download fallback                                       │
│ pinned revision + file hashes                              │
└────────────────────────────┬───────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────┐
│                NOMIC EMBEDDING ENGINE                      │
│                                                            │
│ search_document prefix                                     │
│ tokenize                                                   │
│ forward                                                    │
│ mean pooling                                               │
│ layer norm                                                 │
│ optional Matryoshka truncate                               │
│ L2 normalize                                               │
│ vector QC                                                  │
└────────────────────────────┬───────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────┐
│                   GOLD ROW BUILDER                         │
│                                                            │
│ text + metadata + vector                                   │
│ model revision                                             │
│ embed config hash                                          │
│ content hash                                               │
│ provenance                                                 │
└────────────────────────────┬───────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────┐
│               LOCAL LANCEDB STAGING                        │
│                                                            │
│ explicit schema                                            │
│ merge/upsert                                               │
│ search verification                                        │
│ close/flush                                                │
└────────────────────────────┬───────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────┐
│                GOLD SNAPSHOT PUBLISHER                     │
│                                                            │
│ SHA-256 every file                                         │
│ upload immutable R2 prefix                                 │
│ remote verify                                              │
│ run manifest                                               │
│ _latest.json atomic pointer                                │
└────────────────────────────┬───────────────────────────────┘
                             │
                             ▼
                     ADVANCED RAG
```

---



# 4. Monorepo folder architecture đề xuất



## 4.1. Source code

```text
src/
├── config/
│   └── settings.py
│
├── ingestion/
│   └── openalex_v2/
│       └── ...                   # giữ nguyên
│
├── models/
│   └── embeddings/
│       └── nomic_v15/
│           ├── __init__.py
│           ├── spec.py
│           ├── artifact_manager.py
│           ├── loader.py
│           ├── encoder.py
│           └── verifier.py
│
├── gold/
│   ├── __init__.py
│   ├── contracts.py
│   ├── openalex_adapter.py
│   ├── schema.py
│   ├── checkpoint.py
│   ├── manifest.py
│   └── publisher.py
│
├── indexing/
│   ├── __init__.py
│   ├── chunker.py
│   └── lancedb_manager.py
│
├── storage/
│   ├── r2_client.py
│   └── duckdb_engine.py
│
└── pipelines/
    ├── prepare_embedding_model.py
    ├── run_openalex_gold_indexing.py
    └── verify_openalex_gold.py
```



### Vì sao chia như vậy?

`src/models/...`

- chịu trách nhiệm model lifecycle;
- không biết OpenAlex;
- không biết R2 Gold index logic.

`src/gold/...`

- chịu trách nhiệm Silver → Gold contract;
- checkpoint;
- manifest;
- publish.

`src/indexing/...`

- chịu trách nhiệm chunk/index/vector store;
- không download model.

`src/pipelines/...`

- chỉ orchestration;
- CLI argument;
- gọi các module;
- không nhét business logic.

---



# 5. Model artifact layout

Local:

```text
models/
└── nomic-embed-text-v1.5/
    └── <revision_sha>/
        ├── model.safetensors
        ├── config.json
        ├── tokenizer.json
        ├── tokenizer_config.json
        ├── special_tokens_map.json
        ├── vocab.txt
        ├── modules.json
        ├── sentence_bert_config.json
        ├── config_sentence_transformers.json
        ├── <remote modeling/config files if required>
        └── model_manifest.json
```

`models/` đã nên tiếp tục nằm trong `.gitignore`.

Không commit 500MB+ model weights vào Git.

---



# 6. Optional R2 model artifact registry

Nếu muốn reproducibility/offline restore giữa các máy:

```text
artifacts/models/
└── nomic-embed-text-v1.5/
    └── <revision_sha>/
        ├── snapshot/
        │   └── ...
        └── model_manifest.json
```

Model không nằm ở:

```text
gold/
```

vì Gold là data product, không phải model repository.

---



# 7. Model manifest

Ví dụ:

```json
{
  "model_id": "nomic-ai/nomic-embed-text-v1.5",
  "revision": "<full commit sha>",
  "license": "apache-2.0",
  "weight_format": "safetensors",

  "base_dimension": 768,
  "selected_dimension": 768,

  "document_prefix": "search_document: ",
  "query_prefix": "search_query: ",

  "pooling": "mean",
  "post_pooling_layer_norm": true,
  "l2_normalize": true,

  "pipeline_max_length": 1024,

  "files": {
    "model.safetensors": {
      "sha256": "..."
    },
    "config.json": {
      "sha256": "..."
    },
    "tokenizer.json": {
      "sha256": "..."
    }
  },

  "torch_version": "...",
  "transformers_version": "...",
  "huggingface_hub_version": "...",

  "prepared_at": "..."
}
```



### `model_fingerprint`

```text
SHA256(
  repo_id
  + revision
  + model.safetensors hash
  + tokenizer hash
  + selected_dimension
  + max_length
  + pooling_version
  + prefix policy
)
```

Gold index phải reference fingerprint này.

---



# 8. Download model chuẩn



## 8.1. Không download ngầm trong mỗi indexing run

Không nên:

```python
NomicEmbedder()
→ internet download nếu thiếu
```

vì:

- pipeline không deterministic;
- CI/offline khó debug;
- model có thể thay đổi;
- indexing run bị phụ thuộc internet.



### Tách command

```bash
python -m src.pipelines.prepare_embedding_model \
  --model nomic-ai/nomic-embed-text-v1.5 \
  --revision <sha>
```

---



## 8.2. Dùng Hugging Face snapshot download

Flow:

```text
repo_id + pinned revision
      ↓
snapshot_download()
      ↓
models/nomic-embed-text-v1.5/<revision>/
      ↓
hash files
      ↓
write model_manifest.json
      ↓
offline smoke load
```

Không download unpinned `main` trong production indexing.

---



# 9. Loading model: lựa chọn đúng cho Nomic



## 9.1. Production default

Đối với pretrained Nomic model:

```text
AutoTokenizer.from_pretrained(local_snapshot, local_files_only=True)
AutoModel.from_pretrained(local_snapshot, local_files_only=True, ...)
model.eval()
```

`from_pretrained()` đã làm đúng nhiệm vụ:

```text
config
→ construct architecture
→ read safetensors
→ populate weights/biases
```

Không cần tự load từng weight/bias bằng tay ở normal inference path.

---



## 9.2. `state_dict` thực chất chứa gì?

Trong PyTorch:

```text
state_dict
=
{
  layer.weight: tensor,
  layer.bias: tensor,
  ...
  registered buffers...
}
```

Vì vậy:

> `load_state_dict()` chính là load weights/bias/buffers vào architecture đã được tạo.

Không cần viết riêng:

```text
load_weight()
load_bias()
```

cho từng layer.

---



# 10. Manual `load_state_dict` mode

Cần có nhưng dùng cho:

- audit;
- custom fine-tuned checkpoint;
- migration;
- strict compatibility test.

Không dùng làm default cho base HF snapshot.

Pseudo flow:

```text
load config
    ↓
instantiate architecture
    ↓
load safetensors state dict
    ↓
model.load_state_dict(..., strict=True)
    ↓
missing_keys == []
unexpected_keys == []
    ↓
model.eval()
```

---



# 11. Safe weight loading



## Base Nomic

Ưu tiên:

```text
model.safetensors
```

vì không dùng Python pickle để deserialize weights.

## Custom `.pt/.pth`

Nếu sau này fine-tune và dùng PyTorch checkpoint:

```python
checkpoint = torch.load(
    path,
    map_location=device,
    weights_only=True,
)
model.load_state_dict(
    checkpoint["model_state_dict"],
    strict=True,
)
```

Đúng với rule hiện có của repository.

---



# 12. `loader.py` responsibilities

`loader.py` chỉ chịu trách nhiệm:

```text
resolve model path
verify manifest
verify revision
verify file SHA
load tokenizer
load config
load model
move model to device
eval()
return LoadedEmbeddingModel
```

Không tokenize batch.

Không pooling.

Không write Gold.

---



# 13. `encoder.py` responsibilities

`encoder.py`:

```text
text formatting
tokenization
batching
forward pass
pooling
Matryoshka truncation
normalization
OOM fallback
embedding QC
```

Không download model.

---



# 14. Device architecture

Priority phù hợp team:

```text
CUDA
  ↓
MPS
  ↓
CPU
```

Hoặc giữ MPS-first trên Mac nếu user chủ yếu chạy Mac.

Quan trọng hơn: policy phải explicit.

```text
--device auto|cuda|mps|cpu
```

`auto`:

```python
if cuda:
    cuda
elif mps:
    mps
else:
    cpu
```

Nếu project hiện ưu tiên Mac local thì có thể đảo `mps → cuda`.

Không hard-code.

---



# 15. Precision policy

V1:

```text
CPU → float32
MPS → float32 mặc định
CUDA → float32 mặc định
```

Chưa bật FP16/BF16 mặc định.

Lý do:

- correctness trước;
- embedding parity;
- MPS compatibility.

Sau benchmark:

```text
--dtype float32|float16|bfloat16
```

mới được thêm.

---



# 16. Inference mode

Thay:

```python
with torch.no_grad():
```

bằng:

```python
with torch.inference_mode():
```

cho inference-only embedding path.

Giữ:

```python
model.eval()
```

bắt buộc.

---



# 17. Prefix policy

Nomic yêu cầu task prefix.

Document:

```text
search_document: <text>
```

Query:

```text
search_query: <text>
```

Không embed document/query cùng một prefix.

Gold manifest lưu:

```text
document_prefix_policy=search_document_v1
```

RAG query loader phải check:

```text
model_fingerprint match
+
query_prefix match
+
embedding_dim match
```

---



# 18. Pooling & Matryoshka policy

Official-compatible pipeline:

```text
token embeddings
       ↓
attention-mask mean pooling
       ↓
layer norm
       ↓
truncate [:embedding_dim]
       ↓
L2 normalize
```

Initial:

```text
embedding_dim=768
```

Sau này benchmark:

```text
768
512
256
```

Không đổi dimension trên cùng Gold table.

Mỗi dimension là một index namespace riêng.

---



# 19. Long-context policy

Model hỗ trợ tới 8192 context theo model documentation.

Nhưng current Gold input không nhất thiết cần 8192.

### OpenAlex title+abstract

Thường:

```text
< 1024 tokens
```

Nên:

```text
max_length=1024
```

có thể là lựa chọn throughput tốt.

### Full-text chunks sau này

Có thể:

```text
max_length=2048
```

hoặc cao hơn.

Nếu thực sự chạy >2048 bằng Transformers raw path, phải cấu hình long-context/RoPE theo hướng dẫn model và test numerical parity.

---



# 20. Token-length EDA trước khi khóa max_length

Trước full indexing, lấy sample Silver:

```text
10k–100k papers
```

đo:

```text
p50
p90
p95
p99
max
```

token count.

Quyết định:

```text
max_length ≈ p99 hoặc policy-specific
```

Không chọn 8192 chỉ vì model hỗ trợ.

---



# 21. Dynamic batch sizing

CLI:

```text
--batch-size 32
```

nhưng embedding engine cần OOM recovery:

```text
batch=32
   ↓ OOM
batch=16
   ↓ OOM
batch=8
   ↓
...
```

Không chuyển toàn model MPS→CPU giữa mỗi exception rồi chuyển lại ngay như prototype.

Tốt hơn:

```text
reduce batch first
→ clear cache
→ retry
→ final device fallback nếu cần
```

---



# 22. Embedding Quality Control

Mỗi batch check:

```text
shape == [N, D]
D == configured dimension
all finite
no NaN
no Inf
norm ≈ 1
```

Ví dụ:

```text
0.999 <= L2 norm <= 1.001
```

với tolerance phù hợp dtype.

Nếu batch fail QC:

```text
do not commit Gold
→ save failure manifest
→ retry/quarantine
```

---



# 23. Silver → Gold contract

Gold pipeline không đọc arbitrary columns.

Tạo:

```python
@dataclass
class GoldDocument:
    paper_id: str
    source: str
    title: str
    abstract: str | None
    text: str
    doi: str | None
    authors_json: str | None
    publication_date: str | None
    updated_date: str | None
    primary_topic: str | None
    topics_json: str | None
    source_content_hash: str
    silver_schema_version: str
```

---



# 24. OpenAlex Silver Adapter

`openalex_adapter.py`:

```text
OpenAlex Silver row
       ↓
validate
       ↓
parse nested JSON
       ↓
normalize IDs
       ↓
build text
       ↓
build hash
       ↓
GoldDocument
```

Không nhét OpenAlex parsing vào encoder.

---



# 25. Abstract là bắt buộc để Gold có giá trị tốt

OpenAlex Bronze V2 hiện exclude:

```text
abstract_inverted_index
```

khỏi Parquet projection.

Raw JSON vẫn giữ field này.

Nếu OpenAlex Silver hiện đã reconstruct abstract thì Gold dùng Silver abstract.

Nếu Silver chưa có abstract:

> **Gold phase phải dừng ở preflight, không âm thầm embed title-only cho toàn corpus.**

Policy:

```text
abstract exists
→ index normal

abstract missing
→ title-only fallback only if explicitly enabled

otherwise
→ skip + metric
```

CLI:

```text
--allow-title-only
```

mặc định:

```text
False
```

---



# 26. Text representation V1 cho OpenAlex

Không nhồi mọi metadata vào semantic text.

Recommended:

```text
Title: <title>

Abstract:
<abstract>
```

Context metadata như:

```text
author
venue
year
citation_count
topics
```

lưu thành scalar columns để filter/rerank.

Không để citation count làm thay đổi semantic embedding.

---



# 27. OpenAlex chunking policy

Nếu hiện mới có title + abstract:

```text
1 paper
→ 1 semantic document
```

Không cần section chunker arXiv.

ID:

```text
chunk_id = openalex:<work_id>:abstract:v1
```

Sau này khi có full text:

```text
paper
├── abstract chunk
├── introduction chunks
├── method chunks
└── ...
```

nhưng phải namespace content type:

```text
openalex:<id>:metadata_abstract:...
openalex:<id>:fulltext:...
```

---



# 28. Deterministic content hash

```text
source_content_hash =
SHA256(
  normalized_title
  + "\n"
  + normalized_abstract
)
```

Không dùng ingestion timestamp trong hash.

Nếu metadata không đổi:

```text
hash không đổi
→ skip re-embedding
```

---



# 29. Embed config hash

```text
embedding_config_hash =
SHA256({
  model_fingerprint,
  embedding_dim,
  max_length,
  pooling_version,
  prefix_policy,
  text_builder_version
})
```

Gold freshness key:

```text
(source_content_hash, embedding_config_hash)
```

Nếu một trong hai đổi:

```text
re-embed
```

---



# 30. Gold row schema

Recommended V1:

```text
embedding_id            STRING
chunk_id                STRING
paper_id                STRING
source                  STRING

title                   STRING
text                    STRING
doi                     STRING?
authors_json             STRING?

publication_date         STRING?
updated_date             STRING?
primary_topic            STRING?
topics_json              STRING?

vector                   FIXED_SIZE_LIST<FLOAT32>[768]

word_count               INT32
token_count              INT32

source_content_hash      STRING
silver_schema_version    STRING

model_id                 STRING
model_revision           STRING
model_fingerprint        STRING
embedding_dim            INT32
max_length               INT32
pooling_version          STRING
prefix_policy            STRING

embedding_config_hash    STRING
text_builder_version     STRING
chunker_version          STRING

gold_run_id              STRING
embedded_at              TIMESTAMP/ISO STRING
```

---



# 31. `embedding_id`

Deterministic:

```text
SHA256(
  paper_id
  + chunk_id
  + source_content_hash
  + embedding_config_hash
)
```

Dùng làm idempotency/upsert key.

---



# 32. Gold storage architecture trên R2

Đề xuất:

```text
gold/openalex/v1/
├── vectors/
│   └── model=nomic-embed-text-v1.5/
│       └── revision=<sha>/
│           └── dim=768/
│               └── year=YYYY/
│                   └── part-xxxxx.parquet
│
├── lancedb/
│   └── snapshots/
│       └── <gold_snapshot_id>/
│           └── scientific_papers_gold.lance/
│               └── ...
│
├── manifests/
│   └── runs/
│       └── <run_id>.json
│
├── checkpoints/
│   └── <pipeline_id>.json
│
└── _latest.json
```

---



# 33. Có nên lưu vector Parquet ngoài LanceDB?

**Khuyến nghị: Có.**

LanceDB:

```text
serving/index artifact
```

Vector Parquet:

```text
portable Gold data product
```

Lợi ích:

- query bằng DuckDB;
- rebuild LanceDB không cần re-embed;
- model audit;
- export;
- test;
- migration sang vector DB khác.

Flow tốt hơn:

```text
Silver
→ embeddings
→ Gold Vector Parquet
→ LanceDB
```

Không:

```text
Silver
→ LanceDB only
```

---



# 34. Gold Vector Parquet partition

Không one-vector-per-file.

Batch:

```text
5k–50k vectors/file
```

tùy memory.

Partition:

```text
model revision
embedding dimension
publication year
```

Không partition quá nhỏ theo paper/topic.

---



# 35. LanceDB explicit schema

Không để:

```python
pd.DataFrame(...)
→ infer schema
```

làm canonical Gold schema.

Tạo explicit Arrow schema.

Vector:

```text
pa.list_(pa.float32(), 768)
```

hoặc equivalent fixed-size representation compatible với LanceDB version đang dùng.

Schema fingerprint phải nằm trong run manifest.

---



# 36. LanceDB upsert

Current:

```text
merge_insert(chunk_id)
```

V2:

```text
merge_insert(embedding_id)
```

hoặc stable `chunk_id` + explicit version policy.

Recommended:

```text
embedding_id
```

vì model/config change tạo vector version mới.

---



# 37. Không mix nhiều model fingerprint trong một table serving

Một table serving phải có:

```text
ONE model_fingerprint
ONE embedding_dim
ONE metric policy
```

Nếu model đổi:

```text
build new table/snapshot
→ validate
→ switch _latest
```

Không update nửa corpus bằng model mới trong table cũ.

---



# 38. R2 Gold snapshot publishing

Current file-by-file mutable sync phải được thay.

Correct flow:

```text
build local LanceDB
       ↓
close DB writers
       ↓
enumerate files
       ↓
SHA-256 each file
       ↓
snapshot manifest
       ↓
upload to:
gold/.../snapshots/<id>/
       ↓
HEAD verify each object
       ↓
upload snapshot_manifest.json
       ↓
run verification
       ↓
update _latest.json
```

`_latest.json` là commit pointer.

---



# 39. `_latest.json`

Ví dụ:

```json
{
  "snapshot_id": "gold_20261005T120000Z_ab12cd34",
  "table_name": "scientific_papers_gold",
  "r2_prefix": "gold/openalex/v1/lancedb/snapshots/.../",
  "model_id": "nomic-ai/nomic-embed-text-v1.5",
  "model_revision": "...",
  "model_fingerprint": "...",
  "embedding_dim": 768,
  "gold_schema_version": "openalex-gold-v1",
  "run_manifest": "...",
  "published_at": "..."
}
```

Reader/RAG đọc pointer này.

---



# 40. Atomic publish semantics

Không có transaction thật giữa hàng nghìn R2 object.

Ta mô phỏng atomic release:

```text
upload snapshot
→ verify all
→ manifest
→ update _latest
```

Nếu crash trước `_latest`:

```text
snapshot orphan
```

nhưng production vẫn dùng old snapshot.

Đây là hành vi an toàn.

---



# 41. Gold indexing checkpoint

Không gắn checkpoint Gold với OpenAlex API cursor.

Gold có checkpoint riêng:

```json
{
  "pipeline": "openalex_gold_v1",
  "silver_scope_id": "...",
  "silver_version": "...",

  "model_fingerprint": "...",
  "embedding_config_hash": "...",

  "last_partition": "...",
  "last_batch_id": "...",

  "documents_seen": 0,
  "documents_embedded": 0,
  "documents_skipped": 0,
  "chunks_written": 0,

  "state": "RUNNING"
}
```

---



# 42. Incremental Gold indexing

Input:

```text
Silver rows
```

For each document:

```text
compute source_content_hash
       ↓
lookup Gold registry
       ↓
same content hash
AND same embedding_config_hash?
       │
       ├── YES → SKIP
       │
       └── NO  → EMBED
```

Không re-embed toàn corpus mỗi sync.

---



# 43. Gold registry

Store lightweight registry:

```text
paper_id
chunk_id
source_content_hash
embedding_config_hash
embedding_id
gold_snapshot_id
embedded_at
```

Format:

```text
Parquet / DuckDB state
```

không giant JSON.

---



# 44. Model revision change

Nếu:

```text
revision A → revision B
```

thì `model_fingerprint` đổi.

Policy:

```text
new Gold namespace
→ full re-embed
→ validate
→ publish
→ switch _latest
```

Không incremental mix A/B.

---



# 45. Query compatibility guard

RAG startup:

```text
load _latest
       ↓
read model fingerprint
       ↓
load exact model revision
       ↓
verify dim
       ↓
verify pooling version
       ↓
verify query prefix
       ↓
search
```

Mismatch:

```text
FAIL FAST
```

Không search với model khác.

---



# 46. Model bootstrap resolution order

Recommended:

```text
1. exact local model snapshot
        ↓
2. R2 artifact registry
        ↓
3. Hugging Face Hub
        ↓
4. fail
```

Production mode có thể:

```text
--offline
```

khi đó:

```text
local → R2 → fail
```

không internet.

---



# 47. `artifact_manager.py`

Responsibilities:

```text
resolve revision
download snapshot
sync from R2
sync to R2
hash files
write manifest
validate manifest
```

Không instantiate PyTorch model.

---



# 48. `spec.py`

Immutable spec:

```python
@dataclass(frozen=True)
class NomicV15Spec:
    repo_id: str
    revision: str
    embedding_dim: int
    max_length: int
    document_prefix: str
    query_prefix: str
    pooling_version: str
```

Config hash sinh từ spec.

---



# 49. `verifier.py`

Model verification:

```text
manifest exists
required files exist
hashes match
config readable
tokenizer readable
weights readable
model load succeeds
parameter count > 0
no missing/unexpected keys in manual audit
test vector dimension
test vector finite
test norm
```

---



# 50. Weight/bias audit

Optional command:

```bash
python -m src.pipelines.prepare_embedding_model \
  --verify-state-dict
```

Report:

```text
parameter tensors
total parameters
weight tensors
bias tensors
buffers
missing keys
unexpected keys
non-finite tensors
dtype summary
```

Không dump actual tensor values vào log.

---



# 51. Manual state_dict verification implementation concept

For `model.safetensors`:

```text
safetensors.torch.load_file()
        ↓
state_dict
        ↓
instantiate model architecture
        ↓
load_state_dict(strict=True)
        ↓
assert:
missing_keys == []
unexpected_keys == []
```

Nếu custom model architecture từ remote code:

- code phải nằm trong pinned snapshot;
- revision phải được verify;
- không chạy unpinned code từ Hub.

---



# 52. Fine-tuning checkpoint policy tương lai

Nếu sau này fine-tune Nomic:

```text
experiments/runs/<run>/
├── checkpoints/
│   ├── best.pt
│   └── last.pt
├── logs/
└── metrics/
```

Full checkpoint:

```text
model_state_dict
optimizer_state_dict
scheduler_state_dict
epoch
global_step
rng
config
model_base_revision
```

Load:

```text
torch.load(..., weights_only=True)
→ model.load_state_dict(...)
```

Nhưng phase Gold hiện tại **không cần optimizer/scheduler** vì chỉ inference.

---



# 53. Pipeline CLI V1



## Prepare model

```bash
python -m src.pipelines.prepare_embedding_model \
  --revision <commit-sha> \
  --verify \
  --mirror-r2
```



## Smoke Gold

```bash
python -m src.pipelines.run_openalex_gold_indexing \
  --limit 100 \
  --batch-size 16 \
  --embedding-dim 768 \
  --device auto \
  --smoke
```



## Full Gold

```bash
python -m src.pipelines.run_openalex_gold_indexing \
  --batch-size 32 \
  --embedding-dim 768 \
  --resume \
  --publish-r2
```



## Verify

```bash
python -m src.pipelines.verify_openalex_gold \
  --latest \
  --queries 20
```

---



# 54. Recommended CLI arguments

```text
--model-id
--model-revision
--model-dir

--embedding-dim
--max-length
--batch-size
--device
--dtype

--silver-prefix
--silver-scope-id

--limit
--resume
--force-reembed

--local-only
--mirror-model-r2

--write-vector-parquet
--publish-r2
--skip-lancedb

--smoke
```

---



# 55. Gold preflight

Trước load 500MB model:

```text
R2 credentials valid?
Silver exists?
Silver row count?
Required columns?
Abstract coverage?
Duplicate paper_id?
Model snapshot exists?
Model hashes valid?
Enough disk?
Enough memory?
Gold checkpoint compatible?
```

Output:

```text
PRECHECK PASS
```

mới chạy.

---



# 56. Silver data quality gate

Metrics:

```text
total records
title coverage
abstract coverage
doi coverage
publication date coverage
duplicate paper_id
invalid source ID
average abstract tokens
p95 tokens
p99 tokens
```

Abort conditions, ví dụ:

```text
duplicate paper_id > threshold
abstract coverage < configured threshold
```

Không embed dirty Silver silently.

---



# 57. Embedding telemetry

Per run:

```text
documents_total
documents_skipped
documents_embedded
chunks_total

tokens_total
tokens/sec
chunks/sec

embedding_latency_p50
embedding_latency_p95

batch_size_initial
batch_size_effective

oom_retries
device_fallbacks

vector_nan_count
vector_inf_count
vector_norm_failures
```

---



# 58. Gold storage telemetry

```text
parquet_rows
parquet_bytes
lance_rows

r2_files_uploaded
r2_bytes_uploaded

snapshot_build_seconds
snapshot_publish_seconds

upsert_count
skip_count
replace_count
```

---



# 59. Structured run manifest

```json
{
  "run_id": "...",
  "pipeline": "openalex_gold_v1",

  "source": {
    "silver_prefix": "...",
    "silver_scope_id": "...",
    "silver_schema_version": "..."
  },

  "model": {
    "id": "nomic-ai/nomic-embed-text-v1.5",
    "revision": "...",
    "fingerprint": "...",
    "dimension": 768
  },

  "embedding": {
    "max_length": 1024,
    "pooling_version": "...",
    "prefix_policy": "..."
  },

  "output": {
    "gold_schema_version": "openalex-gold-v1",
    "vector_parquet_prefix": "...",
    "lancedb_snapshot": "..."
  },

  "statistics": {},
  "started_at": "...",
  "completed_at": "..."
}
```

---



# 60. Testing strategy



## 60.1. Unit tests — Model Spec

- revision required;
- invalid dimension rejected;
- only supported Matryoshka dimension/policy accepted;
- model fingerprint deterministic;
- config change changes fingerprint.

---



## 60.2. Unit tests — Artifact Manager

- local snapshot found;
- hash mismatch rejected;
- missing required file rejected;
- R2 restore;
- HF download only when allowed;
- offline mode never calls internet.

---



## 60.3. Unit tests — Loader

- CPU load;
- `model.eval()`;
- correct parameter count;
- state dict strict verification;
- missing key causes fail;
- unexpected key causes fail.

---



## 60.4. Unit tests — Encoder

Three fixed texts:

```text
search document 1
search document 2
search query
```

Assert:

```text
shape
finite
normalized
deterministic within tolerance
```

---



## 60.5. Device parity

Compare:

```text
CPU vs MPS
CPU vs CUDA
```

Không cần bitwise identical.

Use cosine similarity threshold:

```text
> 0.999 or benchmarked tolerance
```

phụ thuộc dtype/backend.

---



## 60.6. Prefix test

Expected:

```text
embed_documents("X")
!=
embed_query("X")
```

vì task prefix khác.

---



## 60.7. Silver adapter test

Input fixture OpenAlex Silver.

Verify:

```text
paper_id
title
abstract
text
hash
metadata
```

Không phụ thuộc arXiv fields.

---



## 60.8. Gold schema test

Verify vector:

```text
length = D
float32
non-null
finite
```

Metadata contract correct.

---



## 60.9. Incremental idempotency test

Run same Silver twice:

```text
run 1 → embeds N
run 2 → embeds 0, skips N
```

---



## 60.10. Content update test

Change abstract for one paper:

```text
run 2
→ re-embed exactly affected row/chunks
```

---



## 60.11. Model revision test

Change model revision:

```text
must not append vectors into old serving snapshot
```

Expected:

```text
new namespace/snapshot
```

---



## 60.12. Crash recovery

Inject crash:

```text
after embedding
after vector Parquet write
after LanceDB build
during R2 upload
before _latest
```

Expected:

- old `_latest` remains valid;
- resume works;
- incomplete snapshot never becomes production.

---



# 61. Semantic quality verification

Prepare benchmark questions related to AI/DS:

```text
What is retrieval augmented generation?
How does contrastive learning work?
Methods for long-context language models?
How is domain adaptation used in NLP?
```

For each:

```text
query embedding
→ top-k
→ manual relevance / weak labels
```

Smoke requirement:

```text
relevant paper/abstract appears in top-k
```

---



# 62. Retrieval metrics after Gold exists

Later use:

```text
Recall@k
MRR@k
nDCG@k
Precision@k
```

Embedding integration không nên được coi thành công chỉ vì LanceDB search không crash.

---



# 63. Performance benchmark matrix

Test:

```text
device:
CPU
MPS
CUDA

batch:
8
16
32
64

max_length:
512
1024
2048

dimension:
768
512
256
```

Collect:

```text
chunks/sec
tokens/sec
memory
R2 footprint
Recall@k
```

Chỉ sau benchmark mới giảm dimension.

---



# 64. Matryoshka recommendation

V1:

```text
768
```

để baseline dễ kiểm chứng.

Sau đó:

```text
768 vs 512 vs 256
```

Nomic v1.5 được thiết kế cho reduced dimensionality.

Có thể tiết kiệm đáng kể vector storage.

Nhưng:

> Không chọn 256 chỉ vì nhỏ hơn; phải benchmark retrieval quality trên corpus AI/DS của nhóm.

---



# 65. Model size and artifact policy

Current official HF repository cung cấp `model.safetensors` khoảng hàng trăm MB.

Do đó:

- local disk cache hợp lý;
- R2 mirror hợp lý;
- Git không hợp lý;
- download mỗi run không hợp lý.

---



# 66. `trust_remote_code` policy

Current environment có thể vẫn cần remote code tùy Transformers version.

Nếu dùng:

```python
trust_remote_code=True
```

thì **chỉ dùng với pinned revision**.

Không:

```text
trust_remote_code=True + revision=main
```

trong production.

---



# 67. Dependency lock

Current requirements dùng lower bounds:

```text
torch>=...
transformers>=...
lancedb>=...
```

Điều này tốt cho development nhưng không đủ reproducibility.

Gold production run nên lưu exact versions:

```text
torch
transformers
tokenizers
safetensors
huggingface_hub
lancedb
pyarrow
duckdb
```

Trong run manifest.

Sau smoke ổn, tạo lock/constraints file.

---



# 68. New dependencies recommended

Thêm explicit:

```text
huggingface-hub
safetensors
```

Không nên chỉ phụ thuộc transitively qua `transformers`.

Nếu dùng SentenceTransformers path:

```text
sentence-transformers
```

nhưng V1 có thể giữ raw Transformers để kiểm soát pooling chính xác.

---



# 69. Transformers vs SentenceTransformers



## V1 recommendation

Giữ:

```text
Transformers
```

vì code hiện tại đã dùng và nhóm muốn hiểu rõ:

```text
tokenizer
model forward
pooling
state_dict
weights/bias
```

SentenceTransformers có thể là **reference implementation** để parity test.

---



# 70. Parity test với SentenceTransformers

Trong test/dev only:

```text
our encoder
vs
SentenceTransformer official path
```

Cùng:

```text
model revision
text
prefix
dimension
```

Compare cosine similarity.

Nếu sai lớn → pooling/config đang sai.

Đây là test rất giá trị.

---



# 71. Gold model/index compatibility

Gold manifest phải có:

```text
model_id
revision
model_fingerprint
embedding_dim
max_length
pooling_version
text_builder_version
gold_schema_version
```

RAG không được mở index nếu local embedder không match.

---



# 72. Refactor `NomicEmbedder`

Current class nên được thay bằng facade mỏng hoặc deprecated.

Ví dụ:

```python
class NomicEmbedder:
    def __init__(...):
        self.runtime = NomicV15Encoder(...)
```

Giữ backward compatibility trong thời gian migration.

Sau đó `run_indexing.py` cũ vẫn chạy trong khi Gold OpenAlex mới dùng architecture mới.

---



# 73. Refactor `AcademicChunker`

Không sửa nó thành OpenAlex-specific.

Giữ arXiv logic.

Tạo generic interface:

```python
class ChunkBuilder(Protocol):
    def build(document: GoldDocument) -> list[GoldChunk]:
        ...
```

Implement:

```text
OpenAlexAbstractChunkBuilder
ArxivSectionChunkBuilder
```

---



# 74. Refactor `LanceDBManager`

Current issues:

- table schema inferred;
- mutable local path;
- mutable R2 sync;
- no index metadata contract.

V2 responsibilities:

```text
create/open local staging table
explicit schema
upsert
delete/rebuild selected documents
vector search
close
```

R2 publishing chuyển sang `src/gold/publisher.py`.

---



# 75. R2 publisher responsibilities

`publisher.py`:

```text
walk snapshot
hash files
upload immutable
verify remote
write snapshot manifest
write run manifest
switch latest pointer
```

Không embed.

Không query LanceDB.

---



# 76. Model artifacts vs Gold artifacts

Phải giữ ranh giới:

```text
R2
├── artifacts/
│   └── models/
│       └── Nomic weights/tokenizer/config
│
└── gold/
    └── openalex/
        ├── embeddings
        ├── LanceDB
        ├── manifests
        └── checkpoints
```

---



# 77. Pipeline state machine

```text
PRECHECK
  ↓
MODEL_READY
  ↓
SILVER_READY
  ↓
READING
  ↓
EMBEDDING
  ↓
GOLD_WRITING
  ↓
INDEX_BUILDING
  ↓
VERIFYING
  ↓
UPLOADING
  ↓
PUBLISHED
```

Failure:

```text
FAILED_<STAGE>
```

Resume based on checkpoint.

---



# 78. Batch transaction

For every batch:

```text
read N docs
→ adapt
→ build chunks
→ embed
→ QC
→ write vector part
→ upsert local index
→ persist checkpoint
```

Checkpoint chỉ advance sau batch durable locally.

R2 snapshot publication diễn ra ở release boundary.

---



# 79. Không upload LanceDB đang bị write

Rule:

```text
finish writes
→ close/flush
→ freeze snapshot dir
→ hash
→ upload
```

Không iterate folder upload trong khi writer còn hoạt động.

---



# 80. Gold release strategy



## Initial

```text
build all
→ release snapshot #1
```



## Incremental

Có hai options:

### Option A — rebuild serving snapshot from canonical Gold vectors

Đơn giản, reproducible, phù hợp NCKH corpus vừa.

### Option B — mutate LanceDB incrementally rồi snapshot version mới

Nhanh hơn nhưng lifecycle phức tạp hơn.

V1 recommendation:

> **Canonical vector Parquet + rebuild/publish LanceDB snapshot** cho mỗi release.

Sau khi scale lớn mới optimize.

---



# 81. Why canonical vector Parquet matters

Nếu LanceDB bị:

```text
corrupt
version incompatibility
schema migration
```

ta:

```text
Gold Vector Parquet
→ rebuild
```

không phải chạy Nomic lại toàn bộ.

---



# 82. Gold checksum hierarchy

```text
document content hash
embedding config hash
embedding id

vector part SHA
LanceDB file SHA

snapshot manifest hash
run manifest hash
```

Đủ lineage:

```text
OpenAlex
→ Silver
→ text
→ vector
→ index
```

---



# 83. Lineage fields

Mỗi vector row cần biết:

```text
Silver source
Silver scope
Silver row/hash
Gold run
Model revision
Embedding config
Chunk builder version
```

Sau này hội đồng hỏi:

> Vector này sinh từ paper nào, model nào, config nào?

trả lời được.

---



# 84. Security checklist

- [ ] Không commit model weights.
- [ ] Không commit HF token.
- [ ] Không commit R2 credentials.
- [ ] Pinned model revision.
- [ ] Safetensors preferred.
- [ ] `.pt` uses `weights_only=True`.
- [ ] Hash verify model files.
- [ ] Gold index rejects fingerprint mismatch.
- [ ] No unpinned arbitrary remote code.
- [ ] Model manifest stores license.

---



# 85. Observability

Log example:

```text
GOLD | RUN=... | BATCH=0042 | DOCS=256 | TOKENS=148233
     | MODEL=nomic-v1.5@abc123 | DIM=768 | DEVICE=mps
     | EMBED=38.2 docs/s | VEC_QC=OK | CHECKPOINT=OK
```

Publish:

```text
GOLD | SNAPSHOT=... | FILES=... | SHA=OK | R2=OK | LATEST=UPDATED
```

---



# 86. Phase plan



## Phase G0 — Freeze & Audit

Tasks:

- freeze current OpenAlex V2 code;
- record current Silver schema;
- run Silver profile;
- identify exact Silver R2 prefix;
- confirm abstract availability;
- freeze current embedding prototype as reference.

DoD:

```text
Silver contract documented
```

---



## Phase G1 — Model Artifact System

Create:

```text
src/models/embeddings/nomic_v15/
```

Implement:

- `spec.py`;
- `artifact_manager.py`;
- `loader.py`;
- `verifier.py`;
- model prepare CLI.

DoD:

```text
fresh machine
→ prepare
→ offline load
→ verify hashes
```

---



## Phase G2 — Encoder Refactor

Implement:

- prefix policy;
- tokenizer;
- batching;
- inference mode;
- mean pooling;
- layer norm;
- dimension truncate;
- L2;
- device/OOM policy.

DoD:

```text
parity test with official reference
```

---



## Phase G3 — Gold Contract + OpenAlex Adapter

Implement:

- `GoldDocument`;
- Silver validator;
- OpenAlex adapter;
- text builder;
- hash;
- title-only policy.

DoD:

```text
100 Silver records → deterministic GoldDocument
```

---



## Phase G4 — Gold Schema + Vector Writer

Implement:

- explicit Arrow schema;
- vector Parquet;
- batch commits;
- registry/checkpoint.

DoD:

```text
100 papers → vector parquet
→ reload vectors
→ same values/schema
```

---



## Phase G5 — LanceDB Serving Index

Refactor:

- explicit schema;
- upsert;
- table metadata;
- semantic smoke search.

DoD:

```text
vectors → LanceDB → query
```

---



## Phase G6 — Immutable R2 Publish

Implement:

- snapshot ID;
- hash;
- upload;
- remote verify;
- snapshot manifest;
- `_latest`.

DoD:

```text
crash before latest
→ old snapshot still valid
```

---



## Phase G7 — Incremental Indexing

Implement:

- Gold registry;
- content hash check;
- skip unchanged;
- re-embed changed;
- model-version namespace.

DoD:

```text
same Silver → 0 re-embed
1 update → 1 affected paper re-embedded
```

---



## Phase G8 — Integration Verification

Run:

```text
100
1,000
10,000
```

papers.

Check:

- correctness;
- performance;
- R2 recovery;
- semantic retrieval;
- model/index compatibility.

---



# 87. Acceptance Criteria



## Model

- [ ] pinned revision;
- [ ] local snapshot;
- [ ] manifest;
- [ ] SHA verification;
- [ ] safetensors;
- [ ] offline load;
- [ ] strict state-dict audit;
- [ ] `eval()`;
- [ ] inference mode;
- [ ] device auto.



## Embedding

- [ ] correct prefixes;
- [ ] layer norm;
- [ ] L2 normalize;
- [ ] configurable dimension;
- [ ] configurable max length;
- [ ] finite vectors;
- [ ] norm QC;
- [ ] official parity test.



## Silver

- [ ] exact OpenAlex Silver contract known;
- [ ] abstract availability measured;
- [ ] no implicit arXiv schema dependency;
- [ ] deterministic content hash.



## Gold

- [ ] explicit schema;
- [ ] vector Parquet;
- [ ] LanceDB serving snapshot;
- [ ] model fingerprint stored;
- [ ] idempotent indexing;
- [ ] checkpoint;
- [ ] registry;
- [ ] R2 immutable snapshot;
- [ ] `_latest` pointer.



## Recovery

- [ ] resume after batch failure;
- [ ] resume after process kill;
- [ ] incomplete R2 snapshot not published;
- [ ] old production snapshot unaffected.



## Verification

- [ ] semantic search smoke;
- [ ] retrieval sanity dataset;
- [ ] CPU path;
- [ ] MPS path if available;
- [ ] CUDA path if available;
- [ ] CI can run CPU tests without model full download where mocked.

---



# 88. Hidden risks cần tránh



## Risk 1 — OpenAlex Gold dùng `AcademicChunker` trực tiếp

Sai nếu OpenAlex Silver không có `sections_json`.

### Fix

OpenAlex-specific adapter/chunk builder.

---



## Risk 2 — Silver không có abstract

Embedding title-only sẽ làm retrieval yếu nhưng pipeline vẫn “chạy thành công”.

### Fix

Abstract coverage gate.

---



## Risk 3 — Model `main` thay đổi

Index hôm nay và ngày mai khác embedding space.

### Fix

Pinned revision + fingerprint.

---



## Risk 4 — Query model khác index model

Search không crash nhưng kết quả vô nghĩa.

### Fix

Compatibility guard.

---



## Risk 5 — R2 sync dở

Remote Gold trông như tồn tại nhưng snapshot incomplete.

### Fix

Immutable snapshot + manifest + latest pointer.

---



## Risk 6 — Model weights nằm trong Git

Repo phình và khó clone.

### Fix

`models/` ignored + artifact registry.

---



## Risk 7 — Dùng `.pt` untrusted

Pickle risk.

### Fix

Safetensors; custom `.pt` → `weights_only=True`.

---



## Risk 8 — MPS OOM fallback làm model liên tục chuyển CPU↔MPS

Latency rất lớn và dễ fragmentation.

### Fix

adaptive batch first; device fallback only as last resort.

---



## Risk 9 — Hard-code vector dimension 768 khắp code

Sau khi thử Matryoshka sẽ sửa hàng loạt.

### Fix

dimension ở model spec + Gold schema factory.

---



## Risk 10 — Re-embed tất cả sau mỗi crawl sync

Waste compute.

### Fix

content hash + embed config hash registry.

---



# 89. Những thứ chưa làm trong phase này

Không thêm:

```text
BM25
RRF
CrossEncoder rerank
citation graph
freshness ranking
HyDE
query decomposition
LLM answer generation
```

Gold dense index phải chạy chuẩn trước.

---



# 90. Recommended first implementation order

```text
1. Verify exact OpenAlex Silver schema
2. Add Model Spec + pinned revision
3. Add Model Artifact Manager
4. Add Loader + strict verifier
5. Refactor Nomic Encoder
6. Add OpenAlex Gold Adapter
7. Add explicit Gold schema
8. Write canonical vector Parquet
9. Build local LanceDB
10. Verify semantic search
11. Add immutable R2 snapshot publisher
12. Add Gold checkpoint/registry
13. Add incremental update
14. Benchmark
```

---



# 91. Immediate checklist trước khi code

```text
[ ] Current OpenAlex V2 crawl stopped at durable point / safe to read Silver
[ ] Silver prefix documented
[ ] Silver schema dumped
[ ] abstract coverage calculated
[ ] Git baseline committed/tagged
[ ] existing run_indexing preserved
[ ] exact model revision selected
[ ] model license recorded
[ ] disk space checked
[ ] R2 Gold prefix reserved
```

---



# 92. Recommended R2 naming

Model:

```text
artifacts/models/nomic-embed-text-v1.5/<revision>/
```

Gold vectors:

```text
gold/openalex/v1/vectors/model=nomic-embed-text-v1.5/revision=<short_sha>/dim=768/
```

Serving snapshot:

```text
gold/openalex/v1/lancedb/snapshots/<snapshot_id>/
```

Current:

```text
gold/openalex/v1/_latest.json
```

---



# 93. Model revision / environment manifest

Example:

```json
{
  "python": "3.x",
  "torch": "...",
  "transformers": "...",
  "tokenizers": "...",
  "safetensors": "...",
  "huggingface_hub": "...",
  "lancedb": "...",
  "pyarrow": "...",
  "duckdb": "...",
  "platform": "...",
  "device": "mps"
}
```

Đính kèm run manifest.

---



# 94. Model weight validation report

Store lightweight JSON:

```text
data/manifests/models/nomic_v15/<revision>/verification.json
```

Contents:

```text
files verified
state dict key count
parameter count
weight tensor count
bias tensor count
missing keys
unexpected keys
non-finite count
test embedding hash
dimension
norm
```

Không lưu full state dict duplicate vào `data/`.

---



# 95. Golden embedding test

Chọn vài text cố định.

Lưu:

```text
input
model revision
config hash
expected vector checksum / compact expected values
```

Mục đích:

- detect accidental pooling change;
- detect tokenizer mismatch;
- detect wrong model revision.

Không nên assert bitwise identical giữa CPU/MPS/CUDA.

---



# 96. Query side preparation

Sau Gold, query embedding phải dùng cùng code:

```python
encoder.embed_query(...)
```

Không copy-paste query embedding code sang `rag_engine.py`.

RAG import một shared embedding service.

---



# 97. Final target architecture

```text
                         ┌──────────────────┐
                         │ OpenAlex API V2  │
                         └────────┬─────────┘
                                  ↓
                          ┌──────────────┐
                          │    Bronze    │
                          └──────┬───────┘
                                 ↓
                          ┌──────────────┐
                          │    Silver    │
                          └──────┬───────┘
                                 ↓
                     ┌───────────────────────┐
                     │ OpenAlex Gold Adapter│
                     └──────────┬────────────┘
                                ↓
                     ┌───────────────────────┐
                     │ Text / Chunk Builder │
                     └──────────┬────────────┘
                                ↓
             ┌──────────────────────────────────────┐
             │  Nomic Model Artifact Registry      │
             │  pinned revision / safetensors      │
             │  local ↔ R2 artifacts/models        │
             └─────────────────┬────────────────────┘
                               ↓
                     ┌───────────────────────┐
                     │ NomicV15Encoder       │
                     │ prefix                │
                     │ tokenize              │
                     │ forward               │
                     │ pool                  │
                     │ layer norm            │
                     │ truncate              │
                     │ L2                    │
                     └──────────┬────────────┘
                                ↓
                   ┌──────────────────────────┐
                   │ Gold Vector Parquet     │
                   │ canonical vector product│
                   └───────────┬──────────────┘
                               ↓
                     ┌───────────────────────┐
                     │ LanceDB Serving Index│
                     └──────────┬────────────┘
                                ↓
                 ┌─────────────────────────────┐
                 │ Immutable R2 Gold Snapshot │
                 └─────────────┬───────────────┘
                               ↓
                    ┌──────────────────────┐
                    │ _latest.json         │
                    │ + run manifest       │
                    └─────────┬────────────┘
                              ↓
                         Advanced RAG
```

---



# 98. External technical verification used for this plan

Plan đã được đối chiếu với:

1. **Nomic Embed Text v1.5 official model card**
  - task instruction prefixes;
  - 768-dimensional base embedding;
  - Matryoshka dimensionality;
  - mean pooling;
  - layer normalization before truncation;
  - L2 normalization;
  - long-context capability.
2. **Nomic official Matryoshka documentation**
  - configurable dimensions 64–768;
  - dimension/storage trade-off.
3. **Hugging Face Hub official download documentation**
  - `snapshot_download`;
  - pinned `revision`;
  - local cache/local directory;
  - file filtering.
4. **PyTorch official save/load documentation**
  - parameters including weights and biases live in `state_dict`;
  - recommended `load_state_dict`;
  - `.eval()` for inference;
  - `weights_only=True` for safe `.pt` load.
5. **Repository PyTorch governance**
  - device-agnostic operation;
  - CPU compatibility;
  - `weights_only=True`;
  - `.eval()` + no-grad/inference evaluation.

---



# 99. Final recommendation

Không chỉ sửa:

```text
embedder.py
```

rồi gọi:

```text
NomicEmbedder()
→ LanceDB
→ R2
```

Cách đó chạy được demo nhưng sẽ tạo technical debt ngay khi:

- model revision đổi;
- model chưa download;
- máy offline;
- Silver schema đổi;
- MPS OOM;
- Gold upload crash;
- model dimension đổi;
- re-crawl tạo paper mới;
- cần resume;
- cần audit vector.

Kiến trúc nên được khóa theo:

```text
Model Artifact Layer
        +
Embedding Runtime Layer
        +
Gold Data Contract
        +
Gold Vector Product
        +
Serving Index
        +
Immutable R2 Release
```

Tức:

```text
Silver
→ deterministic text
→ reproducible embedding
→ portable vector dataset
→ versioned serving index
→ atomic-ish R2 publication
```

Đây là kiến trúc phù hợp nhất với mono-repo hiện tại và cho phép sau này mở rộng:

```text
OpenAlex
arXiv
Semantic Scholar
CORE
OpenReview
```

mà không cần viết lại model/indexing stack.

---



# 100. Definition of Done cuối cùng

Phase này chỉ DONE khi có thể thực hiện flow sau trên một máy mới:

```text
git clone
→ setup environment
→ restore/download pinned Nomic snapshot
→ verify model
→ read OpenAlex Silver
→ embed
→ write Gold vector Parquet
→ build LanceDB
→ semantic search works
→ publish immutable R2 snapshot
→ read _latest
→ restart process
→ resume incremental indexing
→ query using exactly matching model fingerprint
```

và mọi artifact đều trả lời được:

```text
Data từ đâu?
Silver version nào?
Text builder version nào?
Model nào?
Revision nào?
Weight hash nào?
Embedding config nào?
Vector dimension nào?
Run nào tạo?
Snapshot nào đang serving?
```

Nếu trả lời được toàn bộ câu hỏi trên thì Gold layer mới thực sự đạt mức **reproducible, auditable, resumable và RAG-ready**.