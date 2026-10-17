"""RabbitMQ Ingestion Queue Publisher.

Publishes newly harvested academic papers into the RabbitMQ queue
for asynchronous chunking, embedding, and vector indexing.
Supports both native AMQP (via pika) and HTTP Management API fallback.
"""

import json
import logging
from typing import Any, Dict, Optional
import requests

from src.config.settings import settings

logger = logging.getLogger(__name__)


class RabbitMQPublisher:
    """RabbitMQ Publisher for asynchronous paper ingestion tasks."""

    def __init__(
        self,
        amqp_url: Optional[str] = None,
        queue_name: Optional[str] = None,
    ):
        self.amqp_url = amqp_url or settings.RABBITMQ_URL
        self.queue_name = queue_name or settings.RABBITMQ_QUEUE_INGEST
        self._connection = None
        self._channel = None
        self._use_pika = False

        self._init_connection()

    def _init_connection(self):
        """Attempts native AMQP connection using pika; falls back to HTTP API."""
        try:
            import pika
            params = pika.URLParameters(self.amqp_url)
            self._connection = pika.BlockingConnection(params)
            self._channel = self._connection.channel()
            self._channel.queue_declare(queue=self.queue_name, durable=True)
            self._use_pika = True
            logger.info("[RabbitMQ] Connected via native AMQP to queue '%s'", self.queue_name)
        except Exception as e:
            logger.info("[RabbitMQ] pika not available or connection error (%s); using HTTP management API fallback", e)
            self._use_pika = False

    def publish_paper(self, paper: Dict[str, Any]) -> bool:
        """Publishes a harvested paper payload to RabbitMQ."""
        body_str = json.dumps(paper, ensure_ascii=False)

        # 1. Native AMQP via pika
        if self._use_pika and self._channel and not self._channel.is_closed:
            try:
                import pika
                self._channel.basic_publish(
                    exchange="",
                    routing_key=self.queue_name,
                    body=body_str.encode("utf-8"),
                    properties=pika.BasicProperties(
                        delivery_mode=2,  # make message persistent
                        content_type="application/json",
                    ),
                )
                logger.debug("[RabbitMQ] Published paper %s via AMQP", paper.get("paper_id"))
                return True
            except Exception as e:
                logger.warning("[RabbitMQ] AMQP publish failed: %s; trying HTTP fallback", e)

        # 2. HTTP Management API Fallback (port 15672)
        try:
            # Parse user:pass from amqp_url e.g. amqp://admin:password123@localhost:5672
            http_url = "http://localhost:15672/api/exchanges/%2f/amq.default/publish"
            auth = ("admin", "password123")
            payload = {
                "properties": {"delivery_mode": 2, "content_type": "application/json"},
                "routing_key": self.queue_name,
                "payload": body_str,
                "payload_encoding": "string",
            }
            resp = requests.post(http_url, json=payload, auth=auth, timeout=5)
            if resp.status_code == 200 and resp.json().get("routed", False):
                logger.debug("[RabbitMQ] Published paper %s via HTTP API", paper.get("paper_id"))
                return True
            else:
                logger.warning("[RabbitMQ] HTTP API publish response: %s", resp.text)
                return False
        except Exception as e:
            logger.error("[RabbitMQ] All publish methods failed: %s", e)
            return False

    def close(self):
        """Closes AMQP connection."""
        try:
            if self._connection and self._connection.is_open:
                self._connection.close()
        except Exception:
            pass
