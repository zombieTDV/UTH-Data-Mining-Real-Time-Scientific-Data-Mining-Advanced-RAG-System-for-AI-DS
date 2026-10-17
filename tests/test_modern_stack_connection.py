"""Diagnostic test suite to verify MinIO, Qdrant, and RabbitMQ connections.

Can be run via:
    python tests/test_modern_stack_connection.py
    pytest -v tests/test_modern_stack_connection.py
"""

import os
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config.settings import settings
from src.storage.minio_client import StorageClient
from src.indexing import get_vector_manager
from src.indexing.qdrant_manager import QdrantManager
from src.ingestion.queue_publisher import RabbitMQPublisher


def test_minio_connection():
    """Verify MinIO connection, write, read, and delete."""
    print("\n--- Testing MinIO Connection ---")
    client = StorageClient()
    test_key = "tests/health_check.json"

    payload = {"test": "ok", "timestamp": time.time()}

    # 1. Upload
    res = client.upload_json(payload, test_key)
    assert res["key"] == test_key
    print(f"✅ MinIO Upload OK: {res['uri']}")

    # 2. Exists
    assert client.object_exists(test_key) is True
    print("✅ MinIO object_exists OK")

    # 3. Read
    fetched = client.get_json(test_key)
    assert fetched["test"] == "ok"
    print("✅ MinIO Read JSON OK")

    # 4. Clean up
    deleted = client.delete_object(test_key)
    assert deleted is True
    print("✅ MinIO Delete OK")


def test_qdrant_connection():
    """Verify Qdrant connection and vector search."""
    print("\n--- Testing Qdrant Connection ---")
    qm = QdrantManager()
    count = qm.count()
    print(f"✅ Qdrant Collection '{qm.collection_name}' Points Count: {count}")
    assert count > 0, "Collection should contain migrated vectors"

    # Dummy vector search (768 zeros with small signal)
    dummy_vec = [0.01] * 768
    df = qm.vector_search(dummy_vec, limit=3)
    print(f"✅ Qdrant Search returned {len(df)} results")
    assert len(df) > 0
    assert "paper_id" in df.columns
    assert "_distance" in df.columns
    print(f"   Top result: Paper {df.iloc[0]['paper_id']} - {df.iloc[0]['title'][:50]}... (Dist: {df.iloc[0]['_distance']:.4f})")


def test_rabbitmq_publisher():
    """Verify RabbitMQ publishing."""
    print("\n--- Testing RabbitMQ Publisher ---")
    publisher = RabbitMQPublisher()
    test_paper = {
        "paper_id": "test.pytest.001",
        "title": "Automated Python Integration Test for RabbitMQ Ingestion Pipeline",
        "abstract": "Testing end-to-end event dispatching to RabbitMQ from Python.",
        "categories": ["cs.AI"],
        "authors": ["Test Bot"],
    }
    published = publisher.publish_paper(test_paper)
    print(f"✅ RabbitMQ Publish Result: {published}")
    assert published is True
    publisher.close()


def test_vector_manager_factory():
    """Verify get_vector_manager() factory resolves properly."""
    print("\n--- Testing Vector Manager Factory ---")
    vm = get_vector_manager()
    print(f"✅ Active Vector Manager: {type(vm).__name__}")
    assert isinstance(vm, (QdrantManager,))


if __name__ == "__main__":
    test_minio_connection()
    test_qdrant_connection()
    test_rabbitmq_publisher()
    test_vector_manager_factory()
    print("\n🎉 ALL MODERN STACK INTEGRATION TESTS PASSED!\n")
