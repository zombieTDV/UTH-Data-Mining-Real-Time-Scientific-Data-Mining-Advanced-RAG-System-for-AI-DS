from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def test_gold_packages_importable():
    import src.gold.contracts
    import src.gold.text_builder
    import src.gold.schema
    import src.gold.openalex_adapter
    import src.gold.checkpoint
    import src.gold.registry
    import src.gold.vector_writer
    import src.gold.manifest
    import src.gold.lancedb_manager
    import src.gold.publisher
    import src.gold.snapshot
    import src.gold.writer


def test_gold_barrel_exports():
    from src.gold import (
        GoldDocument,
        GoldCheckpoint,
        GoldRegistry,
        VectorWriter,
        GoldRunManifest,
        GoldLanceDBManager,
        GoldSnapshotPublisher,
        GoldSnapshotManager,
        LatestPointer,
        PublishResult,
        GoldPipelineWriter,
        PipelineStats,
        GOLD_SCHEMA_VERSION,
        TEXT_BUILDER_VERSION,
        GOLD_TABLE_NAME,
        EMBEDDING_DIM,
        gold_arrow_schema,
    )
    assert GOLD_SCHEMA_VERSION == "openalex-gold-v1"
    assert GOLD_TABLE_NAME == "scientific_papers_gold"
    assert EMBEDDING_DIM == 768
    assert len(gold_arrow_schema()) == 29


def test_gold_adapter_real_data():
    import pyarrow.parquet as pq
    from src.gold.openalex_adapter import OpenAlexAdapter

    silver_path = PROJECT_ROOT / "data" / "silver" / "year=2026" / "papers.parquet"
    if not silver_path.exists():
        return

    table = pq.read_table(str(silver_path))
    rows = [{c: table.column(c)[i].as_py() for c in table.schema.names} for i in range(table.num_rows)]

    adapter = OpenAlexAdapter(allow_title_only=False)
    docs = adapter.adapt_batch(rows)
    assert len(docs) > 0
    assert all(hasattr(d, "chunk_id") for d in docs)
    assert all(hasattr(d, "source_content_hash") for d in docs)


def test_gold_schema_consistency():
    import pyarrow as pa
    from src.gold.schema import gold_arrow_schema

    schema = gold_arrow_schema()
    assert isinstance(schema, pa.Schema)
    assert len(schema) == 29

    field_names = [f.name for f in schema]
    assert "embedding_id" in field_names
    assert "chunk_id" in field_names
    assert "paper_id" in field_names
    assert "vector" in field_names
    assert "source_content_hash" in field_names
    assert "model_fingerprint" in field_names


def test_gold_checkpoint_roundtrip(tmp_path):
    from src.gold.checkpoint import GoldCheckpoint, PIPELINE_STATE_RUNNING
    from src.models.embeddings.nomic_v15 import NomicV15Spec

    spec = NomicV15Spec()
    ckpt = GoldCheckpoint(
        pipeline_id="test-ckpt",
        silver_scope_id="test-scope",
        silver_version="v2",
        spec=spec,
        checkpoint_path=tmp_path / "ckpt.json",
    )
    assert ckpt.state == PIPELINE_STATE_RUNNING

    ckpt.advance_batch("year=2026", 1, 10, 8, 2, 8)
    ckpt.save()

    loaded = GoldCheckpoint.load(tmp_path / "ckpt.json")
    assert loaded.pipeline_id == "test-ckpt"
    assert loaded.last_partition == "year=2026"
    assert loaded.documents_embedded == 8


def test_gold_registry_idempotency(tmp_path):
    from src.gold.registry import GoldRegistry

    reg = GoldRegistry(registry_path=tmp_path)
    reg.register("W1", "chunk1", "eid1", "hash1", "confighash1")
    assert reg.is_indexed("W1", "hash1", "confighash1") is True
    assert reg.is_indexed("W2", "hash1", "confighash1") is False

    reg.register("W1", "chunk1", "eid2", "hash1", "confighash1")
    assert reg.is_indexed("W1", "hash1", "confighash1") is True
    reg.close()


def test_gold_vector_writer_parquet(tmp_path):
    import numpy as np
    from src.gold.vector_writer import VectorWriter
    from src.gold.openalex_adapter import OpenAlexAdapter
    from src.models.embeddings.nomic_v15 import NomicV15Spec

    spec = NomicV15Spec()
    writer = VectorWriter(output_dir=tmp_path, spec=spec, embedding_dim=768)

    adapter = OpenAlexAdapter()
    doc = adapter.adapt_row({
        "paper_id": "W1",
        "title": "Test",
        "abstract": "Abstract.",
        "authors": ["A"],
        "published_date": "2025",
    })

    vec = np.random.randn(768).astype(np.float32)
    result = writer.write_batch([doc], [vec], [10], "run1", partition="year=2025")

    assert result.rows_written == 1
    assert result.parquet_path.exists()

    import pyarrow.parquet as pq
    loaded = pq.read_table(str(result.parquet_path))
    assert loaded.num_rows == 1
    assert len(loaded.schema) == 29


def test_gold_snapshot_pointer_roundtrip(tmp_path, monkeypatch):
    import sys
    import src.config.settings as settings_module

    tmp_root = tmp_path / "root"
    tmp_root.mkdir()
    monkeypatch.setattr(settings_module.settings, "ROOT_DIR", tmp_root)

    from src.gold.snapshot import GoldSnapshotManager
    from src.models.embeddings.nomic_v15 import NomicV15Spec

    spec = NomicV15Spec()
    mgr = GoldSnapshotManager(spec=spec)

    ptr = mgr.write_latest(
        snapshot_id="test-snap",
        table_name="scientific_papers_gold_218b0c98",
        r2_prefix="gold/openalex/v1/snapshots/test-snap/",
    )
    assert ptr.snapshot_id == "test-snap"
    assert ptr.embedding_dim == 768

    loaded = mgr.read_latest()
    assert loaded.snapshot_id == "test-snap"
    assert loaded.model_fingerprint == spec.fingerprint()
