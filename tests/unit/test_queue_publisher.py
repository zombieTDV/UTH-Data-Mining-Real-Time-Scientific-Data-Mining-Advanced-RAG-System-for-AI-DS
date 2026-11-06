"""Unit tests for src/ingestion/queue_publisher.py verifying AMQP publishing,
HTTP management API fallback, and reconnection on closed channels.
"""
from unittest.mock import MagicMock, patch
import pika
import pytest

from src.ingestion.queue_publisher import RabbitMQPublisher


@pytest.fixture
def mock_pika_connection():
    mock_conn = MagicMock()
    mock_channel = MagicMock()
    mock_conn.channel.return_value = mock_channel
    mock_conn.is_open = True
    mock_channel.is_closed = False
    return mock_conn, mock_channel


# ==============================================================================
# AMQP Publishing Tests
# ==============================================================================

@pytest.mark.unit
def test_publish_paper_via_amqp_success(mock_pika_connection):
    mock_conn, mock_channel = mock_pika_connection

    with patch("pika.BlockingConnection", return_value=mock_conn):
        publisher = RabbitMQPublisher(amqp_url="amqp://guest:guest@localhost:5672/", queue_name="ingest_test")
        paper = {"paper_id": "2401.00001", "title": "Test Title", "abstract": "Test Abs"}
        success = publisher.publish_paper(paper)

    assert success is True
    mock_channel.basic_publish.assert_called_once()
    _, kwargs = mock_channel.basic_publish.call_args
    assert kwargs["routing_key"] == "ingest_test"
    assert kwargs["properties"].delivery_mode == 2


@pytest.mark.unit
def test_publish_paper_amqp_channel_reconnect_if_closed(mock_pika_connection):
    mock_conn, mock_channel = mock_pika_connection

    with patch("pika.BlockingConnection", return_value=mock_conn):
        publisher = RabbitMQPublisher(amqp_url="amqp://localhost", queue_name="ingest_test")
        publisher._channel.is_closed = True  # Simulating dropped channel

        paper = {"paper_id": "2401.00002", "title": "Reconnected Paper"}
        success = publisher.publish_paper(paper)

    assert success is True


# ==============================================================================
# HTTP Fallback Tests
# ==============================================================================

@pytest.mark.unit
def test_publish_paper_http_fallback_on_amqp_failure():
    # Make AMQP initialization fail
    with patch("pika.BlockingConnection", side_effect=Exception("AMQP port blocked")):
        publisher = RabbitMQPublisher(amqp_url="amqp://localhost", queue_name="ingest_test")
        assert publisher._channel is None

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"routed": True}

    with patch("requests.post", return_value=mock_resp) as mock_post:
        paper = {"paper_id": "2401.00003", "title": "HTTP Fallback Paper"}
        success = publisher.publish_paper(paper)

    assert success is True
    mock_post.assert_called_once()
    _, kwargs = mock_post.call_args
    payload = kwargs["json"]
    assert payload["routing_key"] == "ingest_test"
    assert "2401.00003" in payload["payload"]


@pytest.mark.unit
def test_publish_paper_http_failure_returns_false():
    with patch("pika.BlockingConnection", side_effect=Exception("AMQP unavailable")):
        publisher = RabbitMQPublisher(amqp_url="amqp://localhost", queue_name="ingest_test")

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"routed": False}  # Queue not found or message dropped

    with patch("requests.post", return_value=mock_resp):
        success = publisher.publish_paper({"paper_id": "2401.00004"})

    assert success is False


@pytest.mark.unit
def test_close_graceful(mock_pika_connection):
    mock_conn, _ = mock_pika_connection

    with patch("pika.BlockingConnection", return_value=mock_conn):
        publisher = RabbitMQPublisher(amqp_url="amqp://localhost")
        publisher.close()

    mock_conn.close.assert_called_once()
