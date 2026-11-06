"""Unit tests for src/ingestion/queue_consumer.py verifying AMQP reconnect loops,
heartbeat configuration (commit 5702e469), stage isolation (fetch vs embed),
deduplication invariants, and dead-letter queue routing.
"""
import json
from unittest.mock import MagicMock, patch
import pika
from pika.exceptions import AMQPChannelError, AMQPConnectionError
import pytest

from src.ingestion.queue_consumer import (
    HEARTBEAT_SECONDS,
    QueueConsumer,
    _year_of,
)


@pytest.fixture
def mock_storage():
    storage = MagicMock()
    storage.bucket_name = "test-lakehouse"
    storage.object_exists.return_value = False
    return storage


@pytest.fixture
def mock_qdrant():
    qdrant = MagicMock()
    qdrant.insert_chunks.return_value = 5
    return qdrant


@pytest.fixture
def consumer(mock_storage, mock_qdrant):
    with patch("src.ingestion.queue_consumer.load_known_paper_ids", return_value={"known_001"}):
        c = QueueConsumer(
            storage_client=mock_storage,
            qdrant_client=mock_qdrant,
            batch_size=4,
            idle_flush_seconds=1.0,
            stage="all",
        )
        return c


# ==============================================================================
# Commit 5702e469: Heartbeat & Reconnection Tests
# ==============================================================================

@pytest.mark.unit
def test_heartbeat_constant_and_parameter_setting(consumer):
    """Verify commit 5702e469: 600s heartbeat prevents broker disconnects during heavy embedding."""
    assert HEARTBEAT_SECONDS == 600

    mock_conn = MagicMock()
    mock_channel = MagicMock()
    mock_conn.channel.return_value = mock_channel
    mock_channel.consume.return_value = []
    mock_conn.is_open = True

    with patch("pika.BlockingConnection", return_value=mock_conn) as mock_pika_conn:
        with patch.object(consumer, "_handle_all", return_value=[]):
            consumer._running = False  # Exit immediately
            consumer.run_pika()

    mock_pika_conn.assert_called_once()
    params = mock_pika_conn.call_args[0][0]
    assert isinstance(params, pika.URLParameters)
    assert params.heartbeat == 600


@pytest.mark.unit
def test_reconnect_resilience_on_amqp_connection_error(consumer):
    """Verify commit 5702e469: Worker reconnects when connection is dropped rather than crashing."""
    attempts = 0

    def mock_run_pika():
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise AMQPConnectionError("Connection reset by peer")
        consumer._running = False
        return

    with patch.object(consumer, "run_pika", side_effect=mock_run_pika):
        with patch("time.sleep", return_value=None) as mock_sleep:
            consumer.run()

    assert attempts == 2
    mock_sleep.assert_called_once_with(5)


@pytest.mark.unit
def test_reconnect_resilience_on_amqp_channel_error(consumer):
    """Verify commit 5702e469: Channel errors trigger graceful 5s reconnect."""
    attempts = 0

    def mock_run_pika():
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise AMQPChannelError("Channel closed abruptly")
        consumer._running = False
        return

    with patch.object(consumer, "run_pika", side_effect=mock_run_pika):
        with patch("time.sleep", return_value=None) as mock_sleep:
            consumer.run()

    assert attempts == 2
    mock_sleep.assert_called_once_with(5)


@pytest.mark.unit
def test_safe_flush_guard_when_connection_closed(consumer):
    """Verify commit 5702e469: When connection is lost, unacked batch is NOT flushed locally."""
    mock_conn = MagicMock()
    mock_channel = MagicMock()
    mock_conn.channel.return_value = mock_channel
    mock_conn.is_open = False  # Connection closed mid-flight

    # Simulate an error inside the consume loop
    mock_channel.consume.side_effect = AMQPConnectionError("Lost connection")

    flush_called = False
    original_prepare = consumer.prepare_batch

    def spy_prepare(*args, **kwargs):
        nonlocal flush_called
        flush_called = True
        return original_prepare(*args, **kwargs)

    consumer.prepare_batch = spy_prepare

    with patch("pika.BlockingConnection", return_value=mock_conn):
        with pytest.raises(AMQPConnectionError):
            consumer.run_pika()

    # Flush should be aborted because conn.is_open was False
    assert not flush_called


# ==============================================================================
# Stage Isolation Tests (fetch vs embed vs all)
# ==============================================================================

@pytest.mark.unit
def test_stage_fetch_initialization(mock_storage, mock_qdrant):
    with patch("src.ingestion.queue_consumer.load_known_paper_ids", return_value={"paper_x"}):
        c = QueueConsumer(storage_client=mock_storage, qdrant_client=mock_qdrant, stage="fetch")
        assert c.stage == "fetch"
        assert "paper_x" in c.known


@pytest.mark.unit
def test_stage_embed_initialization(mock_storage, mock_qdrant):
    with patch("src.ingestion.queue_consumer.load_known_paper_ids", return_value={"paper_x"}):
        c = QueueConsumer(storage_client=mock_storage, qdrant_client=mock_qdrant, stage="embed")
        assert c.stage == "embed"
        # Embed stage must not load known IDs into memory
        assert c.known == set()


# ==============================================================================
# Deduplication Invariants in Batch Preparation
# ==============================================================================

@pytest.mark.unit
def test_prepare_batch_deduplication(consumer):
    consumer.known = {"known_001"}
    consumer.resolver = MagicMock()
    consumer.resolver.resolve_batch_concurrent.return_value = []
    consumer.silver_writer = MagicMock()
    consumer.silver_writer.prepare_record.side_effect = lambda raw_meta, parsed_html: {
        "paper_id": raw_meta["paper_id"],
        "abstract": raw_meta.get("abstract"),
    }
    consumer.silver_writer.append_part.return_value = {"key": "silver/part.parquet", "size_bytes": 1024}

    batch = [
        {"paper_id": "known_001", "title": "Already in Lakehouse", "abstract": "Abs 1"},
        {"paper_id": "new_002", "title": "Brand New Paper", "abstract": "Abs 2"},
        {"paper_id": "new_002", "title": "Duplicate in same batch", "abstract": "Abs 2"},
    ]

    ok, failed, good = consumer.prepare_batch(batch, remember_on_silver=True)

    # 1 duplicate from known + 1 in-batch duplicate = 2 skipped
    assert len(ok) == 2
    assert len(failed) == 0
    assert len(good) == 1
    assert good[0][0]["paper_id"] == "new_002"
    assert "new_002" in consumer.known


@pytest.mark.unit
def test_prepare_batch_refresh_flag_bypasses_known(consumer):
    consumer.known = {"classic_001"}
    consumer.resolver = MagicMock()
    consumer.resolver.resolve_batch_concurrent.return_value = []
    consumer.silver_writer = MagicMock()
    consumer.silver_writer.append_part.return_value = {"key": "silver/part.parquet", "size_bytes": 1024}

    # Paper exists in known, but has refresh=True
    batch = [
        {"paper_id": "classic_001", "title": "Re-index with full text", "abstract": "Abs", "refresh": True}
    ]

    ok, failed, good = consumer.prepare_batch(batch, remember_on_silver=False)
    assert len(ok) == 0
    assert len(good) == 1
    assert good[0][0]["paper_id"] == "classic_001"


# ==============================================================================
# Year Extraction Helper
# ==============================================================================

@pytest.mark.unit
def test_year_of_helper():
    assert _year_of({"published_date": "2024-03-15T00:00:00Z"}) == "2024"
    assert _year_of({"published_date": "1999-12-31"}) == "1999"
    assert len(_year_of({})) == 4  # defaults to current year
