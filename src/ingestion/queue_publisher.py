"""RabbitMQ Ingestion Queue Publisher.

Publishes harvested papers to the durable ingest queue for asynchronous
Bronze/Silver/Gold processing by the queue consumer. Uses native AMQP (pika)
and falls back to the HTTP management API; all endpoints and credentials come
from settings (.env).
"""

import json
import logging
from typing import Any, Dict, Optional

import requests

from src.config.settings import settings

logger = logging.getLogger(__name__)


class RabbitMQPublisher:
    """RabbitMQ Publisher for asynchronous paper ingestion tasks."""

    def __init__(self, amqp_url: Optional[str] = None, queue_name: Optional[str] = None):
        self.amqp_url = amqp_url or settings.RABBITMQ_URL
        self.queue_name = queue_name or settings.RABBITMQ_QUEUE_INGEST
        self._connection = None
        self._channel = None
        self._init_connection()

    def _init_connection(self) -> None:
        try:
            import pika

            self._connection = pika.BlockingConnection(pika.URLParameters(self.amqp_url))
            self._channel = self._connection.channel()
            self._channel.queue_declare(queue=self.queue_name, durable=True)
            logger.info("[RabbitMQ] Connected via AMQP to queue '%s'", self.queue_name)
        except Exception as e:
            self._connection = self._channel = None
            logger.warning("[RabbitMQ] AMQP unavailable (%s); will use HTTP management API", e)

    def _publish_amqp(self, body: bytes) -> bool:
        import pika

        if not self._channel or self._channel.is_closed:
            self._init_connection()
        if not self._channel:
            return False
        try:
            self._channel.basic_publish(
                exchange="",
                routing_key=self.queue_name,
                body=body,
                properties=pika.BasicProperties(delivery_mode=2, content_type="application/json"),
            )
            return True
        except Exception as e:
            logger.warning("[RabbitMQ] AMQP publish failed: %s", e)
            return False

    def _publish_http(self, body_str: str) -> bool:
        user, password = settings.rabbitmq_credentials()
        url = f"{settings.rabbitmq_mgmt_url()}/api/exchanges/%2f/amq.default/publish"
        payload = {
            "properties": {"delivery_mode": 2, "content_type": "application/json"},
            "routing_key": self.queue_name,
            "payload": body_str,
            "payload_encoding": "string",
        }
        try:
            resp = requests.post(url, json=payload, auth=(user, password), timeout=5)
            if resp.status_code == 200 and resp.json().get("routed", False):
                return True
            logger.warning("[RabbitMQ] HTTP publish rejected: %s", resp.text)
        except Exception as e:
            logger.error("[RabbitMQ] HTTP publish failed: %s", e)
        return False

    def publish_paper(self, paper: Dict[str, Any]) -> bool:
        """Publish one paper payload; returns True only when the broker accepted it."""
        body_str = json.dumps(paper, ensure_ascii=False)
        return self._publish_amqp(body_str.encode("utf-8")) or self._publish_http(body_str)

    def close(self) -> None:
        try:
            if self._connection and self._connection.is_open:
                self._connection.close()
        except Exception:
            pass


# Backward compatibility alias
QueuePublisher = RabbitMQPublisher
