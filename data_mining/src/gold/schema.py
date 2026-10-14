import pyarrow as pa


GOLD_TABLE_NAME = "scientific_papers_gold"
EMBEDDING_DIM = 768


def gold_arrow_schema(embedding_dim: int = EMBEDDING_DIM) -> pa.Schema:
    return pa.schema([
        pa.field("embedding_id", pa.string()),
        pa.field("chunk_id", pa.string()),
        pa.field("paper_id", pa.string()),
        pa.field("source", pa.string()),
        pa.field("title", pa.string()),
        pa.field("text", pa.string()),
        pa.field("doi", pa.string(), nullable=True),
        pa.field("authors_json", pa.string(), nullable=True),
        pa.field("publication_date", pa.string(), nullable=True),
        pa.field("updated_date", pa.string(), nullable=True),
        pa.field("primary_topic", pa.string(), nullable=True),
        pa.field("topics_json", pa.string(), nullable=True),
        pa.field("vector", pa.list_(pa.float32(), embedding_dim)),
        pa.field("word_count", pa.int32()),
        pa.field("token_count", pa.int32()),
        pa.field("source_content_hash", pa.string()),
        pa.field("silver_schema_version", pa.string()),
        pa.field("model_id", pa.string()),
        pa.field("model_revision", pa.string()),
        pa.field("model_fingerprint", pa.string()),
        pa.field("embedding_dim", pa.int32()),
        pa.field("max_length", pa.int32()),
        pa.field("pooling_version", pa.string()),
        pa.field("prefix_policy", pa.string()),
        pa.field("embedding_config_hash", pa.string()),
        pa.field("text_builder_version", pa.string()),
        pa.field("chunker_version", pa.string()),
        pa.field("gold_run_id", pa.string()),
        pa.field("embedded_at", pa.string()),
    ])
