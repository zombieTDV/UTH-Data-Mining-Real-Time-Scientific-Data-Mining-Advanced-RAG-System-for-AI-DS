"""ChunkStore: Silver chunk table writes, compaction and chunk_id lookups, against an in-memory fake MinIO."""

import io
from unittest.mock import patch

import pyarrow.fs as pafs
import pytest

from src.storage.chunk_store import ChunkStore, QDRANT_PAYLOAD_FIELDS


class FakeStorage:
    bucket_name = "lake"

    def __init__(self):
        self.objects = {}

    def upload_bytes(self, data, key, content_type="", metadata=None):
        self.objects[key] = data
        return {"uri": f"s3://lake/{key}", "size_bytes": len(data), "sha256": ""}

    def get_bytes(self, key):
        if key not in self.objects:
            raise KeyError(f"NoSuchKey {key}")
        return self.objects[key]

    def list_objects(self, prefix="", max_keys=1000):
        return [{"key": k, "size": len(v), "last_modified": "t"} for k, v in sorted(self.objects.items()) if k.startswith(prefix)]

    def delete_objects_batch(self, keys):
        for k in keys:
            self.objects.pop(k, None)
        return len(keys)


@pytest.fixture
def store(tmp_path):
    fake = FakeStorage()
    s = ChunkStore(storage=fake)
    local = pafs.LocalFileSystem()

    class FS:  # serve open_input_file from the fake object map
        def open_input_file(self, path):
            key = path.split("/", 1)[1]
            f = tmp_path / key.replace("/", "_")
            f.write_bytes(fake.objects[key])
            return local.open_input_file(str(f))

    s._fs = FS()
    return s


def chunk(cid, pid, text, **kw):
    return {"chunk_id": cid, "paper_id": pid, "title": f"T {pid}", "authors": ["A"], "text": text, "year": 2025, **kw}


def test_parts_are_visible_before_compaction(store):
    store.append_part([chunk("p1_abs", "p1", "hello")], year="2025")
    got = store.get(["p1_abs", "nope"])
    assert got["p1_abs"]["text"] == "hello" and got["p1_abs"]["title"] == "T p1"
    assert "nope" not in got


def test_compaction_keeps_latest_indexing_per_paper(store):
    store.append_part([chunk("p1_abs", "p1", "old"), chunk("p1_sec0", "p1", "old body")], year="2025", indexed_at="2026-01-01")
    store.append_part([chunk("p1_abs", "p1", "new")], year="2025", indexed_at="2026-02-01")  # refresh
    res = store.compact_year("2025")
    assert res["rows"] == 1 and res["parts"] == 2
    assert not [k for k in store.storage.objects if "/parts/" in k]
    store._cache.clear()
    assert store.get(["p1_abs", "p1_sec0"]) == {"p1_abs": store.get(["p1_abs"])["p1_abs"]}
    assert store.get(["p1_abs"])["p1_abs"]["text"] == "new"


def test_lookup_reads_only_matching_row_groups(store):
    with patch("src.storage.chunk_store.ROW_GROUP_SIZE", 10):
        store.append_part([chunk(f"p{i:03d}_abs", f"p{i:03d}", f"t{i}") for i in range(100)], year="2025")
        store.compact_year("2025")
    meta, ranges = store._file_meta(store._list_files(force=True)[0])
    assert meta.num_row_groups == 10
    assert store.get(["p042_abs"])["p042_abs"]["text"] == "t42"


def test_hydrate_merges_payload_over_row(store):
    store.append_part([chunk("p1_abs", "p1", "hello", section_type="abstract")], year="2025")
    out = store.hydrate([{"chunk_id": "p1_abs", "paper_id": "p1", "score": 0.9}, {"chunk_id": "gone", "score": 0.1}])
    assert out[0]["text"] == "hello" and out[0]["score"] == 0.9
    assert out[1] == {"chunk_id": "gone", "score": 0.1}


def test_payload_fields_are_identity_and_filters_only():
    assert set(QDRANT_PAYLOAD_FIELDS) == {"chunk_id", "paper_id", "year", "primary_category", "section_type"}
