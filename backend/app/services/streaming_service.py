"""
backend/app/services/streaming_service.py
-----------------------------------------
Real-time ingestion monitor. Broadcasts the pulses that the harvesters and the queue consumer POST to
/ingestion/broadcast to every connected SSE client. Nothing here is simulated: "start" runs the real
Tier 3 harvest (arXiv RSS -> RabbitMQ), and the consumer reports each paper it lands in the lakehouse.
Session counters are persisted in MinIO (state/session_state.json); there are no local files.
"""

import asyncio
import collections
import datetime
import json
import logging
import time
from typing import Any, AsyncGenerator, Deque, Dict, List, Optional

from backend.app.core.config import settings
from backend.app.services.lake import lake

logger = logging.getLogger("streaming_service")

LOG_BUFFER_SIZE = 500
STATE_KEY = f"{settings.STATE_PREFIX}/session_state.json"


def _now_hms() -> str:
    return datetime.datetime.now().strftime("%H:%M:%S")


class StreamingService:
    def __init__(self):
        self.status: str = "IDLE"  # IDLE | STREAMING | PAUSED | COMPLETED | ERROR
        self.target_papers: int = 0
        self.session_ingested: int = 0
        self.accumulated_bytes_delta: int = 0
        self.current_speed_ppm: float = 0.0
        self.start_time: Optional[float] = None
        self.stop_signal = asyncio.Event()
        self.subscribers: List[asyncio.Queue] = []
        self._task: Optional[asyncio.Task] = None
        self.recent_events: List[Dict[str, Any]] = []
        self.log_buffer: Deque[Dict[str, Any]] = collections.deque(maxlen=LOG_BUFFER_SIZE)
        self._state_loaded = False

    # ------------------------------------------------------------ state (MinIO)
    def _load_persisted_state(self) -> None:
        if self._state_loaded:
            return
        self._state_loaded = True
        try:
            data = lake.get_json(STATE_KEY, ttl=0) or {}
            self.session_ingested = int(data.get("session_ingested", 0))
            self.accumulated_bytes_delta = int(data.get("accumulated_bytes_delta", 0))
        except Exception as e:
            logger.warning("[STREAMING] Could not load session state from MinIO: %s", e)

    def _save_persisted_state(self) -> None:
        try:
            lake.put_json(STATE_KEY, {
                "session_ingested": self.session_ingested,
                "accumulated_bytes_delta": self.accumulated_bytes_delta,
                "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            })
        except Exception as e:
            logger.warning("[STREAMING] Could not save session state to MinIO: %s", e)

    def reset_session(self) -> None:
        self.session_ingested = 0
        self.accumulated_bytes_delta = 0
        self._save_persisted_state()

    # ------------------------------------------------------------ status
    def get_current_storage(self) -> Dict[str, Any]:
        from backend.app.services.storage_service import storage_service

        try:
            return storage_service.get_current_totals()
        except Exception as e:
            logger.warning("[STREAMING] Storage totals unavailable: %s", e)
            return {"total_bytes": 0, "total_gb": 0.0, "used_pct": 0.0}

    def _corpus_count(self) -> int:
        try:
            from src.indexing.qdrant_manager import QdrantManager

            return int(QdrantManager().count())
        except Exception:
            return 0

    def get_status(self) -> Dict[str, Any]:
        self._load_persisted_state()
        elapsed = time.time() - self.start_time if self.start_time else 0
        storage = self.get_current_storage()
        return {
            "status": self.status,
            "target_papers": self.target_papers,
            "session_ingested": self.session_ingested,
            "total_corpus": self._corpus_count(),
            "speed_ppm": self.current_speed_ppm,
            "elapsed_seconds": round(elapsed, 1),
            "subscribers_connected": len(self.subscribers),
            "storage_total_bytes": storage["total_bytes"],
            "storage_total_gb": storage["total_gb"],
            "storage_used_pct": storage["used_pct"],
        }

    def get_latest_pipeline_logs(self, limit: int = 150) -> List[Dict[str, Any]]:
        """Most recent pipeline events seen by this process (in-memory ring buffer)."""
        return list(self.log_buffer)[-limit:]

    # ------------------------------------------------------------ events
    def _log(self, event: Dict[str, Any]) -> None:
        stage = str(event.get("stage", event.get("type", ""))).lower()
        tag = {"harvest": "HARVEST", "bronze": "BRONZE-VAULT", "silver": "SILVER-VAULT", "gold": "GOLD-VECTOR"}.get(stage, "PIPELINE")
        level = "WARN" if event.get("error") else "SUCCESS" if stage in ("gold", "completed") else "INFO"
        msg = event.get("title") or event.get("message") or json.dumps({k: v for k, v in event.items() if k != "timestamp"})[:200]
        self.log_buffer.append({
            "id": f"log-{int(time.time() * 1000)}-{len(self.log_buffer)}",
            "time": event.get("timestamp") or _now_hms(),
            "level": level,
            "tag": tag,
            "msg": str(msg),
        })

    async def broadcast_event(self, event: Dict[str, Any]) -> None:
        """Dispatch an event to all SSE subscribers and update session counters."""
        self._load_persisted_state()
        stage = event.get("stage", "")
        if stage in ("harvest", "bronze", "duckdb", "silver", "embedding", "parallel", "gold", "r2_sync", "completed"):
            self.status = "STREAMING" if stage != "completed" else "IDLE"
            event.setdefault("type", "STAGE_CHANGE")
        if event.get("type") == "PAPER_INGESTED":
            self.session_ingested += 1
            if event.get("speed_ppm"):
                self.current_speed_ppm = float(event["speed_ppm"])
            if event.get("bronze_bytes_delta"):
                self.accumulated_bytes_delta += int(event["bronze_bytes_delta"])
            self._save_persisted_state()
        event["timestamp"] = _now_hms()

        self._log(event)
        self.recent_events.append(event)
        if len(self.recent_events) > 50:
            self.recent_events.pop(0)
        for q in list(self.subscribers):
            try:
                q.put_nowait(event)
            except Exception:
                pass

    # ------------------------------------------------------------ real harvest
    async def start_streaming(self, target: int = 100, delay: float = 60.0):
        """Run the real Tier 3 harvest (arXiv RSS -> RabbitMQ) until `target` new papers are enqueued."""
        if self.status == "STREAMING":
            return {"status": "ALREADY_RUNNING", "message": "Streaming ingestion is already active."}
        self._load_persisted_state()
        self.target_papers = target
        self.status = "STREAMING"
        self.stop_signal.clear()
        self.start_time = time.time()
        self._task = asyncio.create_task(self._run_streaming_loop(target, delay))
        return {"status": "STARTED", "target": target, "message": f"Tier 3 harvest started for up to {target} new preprints."}

    async def stop_streaming(self):
        if self.status != "STREAMING":
            return {"status": "NOT_RUNNING", "message": "Streaming ingestion is not running."}
        self.stop_signal.set()
        self.status = "PAUSED"
        if self._task:
            self._task.cancel()
        return {"status": "STOPPED", "message": "Streaming ingestion stopped."}

    async def _run_streaming_loop(self, target: int, delay: float):
        """Poll arXiv RSS via the Tier 3 streamer in a worker thread; stop when the target is met or the feed is dry."""
        from src.pipelines.run_tier3_realtime_stream import Tier3RealtimeStreamer

        enqueued_total = 0
        dry_rounds = 0
        try:
            streamer = await asyncio.to_thread(Tier3RealtimeStreamer)
            while enqueued_total < target and not self.stop_signal.is_set():
                remaining = target - enqueued_total
                summary = await asyncio.to_thread(streamer.process_batch, min(remaining, 50))
                got = int(summary.get("newly_ingested", 0))
                enqueued_total += got
                dry_rounds = dry_rounds + 1 if got == 0 else 0
                elapsed = max(time.time() - (self.start_time or time.time()), 1)
                self.current_speed_ppm = round(enqueued_total / elapsed * 60, 1)
                await self.broadcast_event({
                    "type": "STAGE_CHANGE",
                    "stage": "harvest",
                    "title": f"Tier 3 harvest: {got} enqueued, {summary.get('dedup_skipped', 0)} duplicates",
                    "enqueued_total": enqueued_total,
                    "speed_ppm": self.current_speed_ppm,
                })
                if dry_rounds >= 2:
                    break  # the feed has nothing new right now
                await asyncio.sleep(delay)
            self.status = "COMPLETED" if enqueued_total >= target or dry_rounds >= 2 else "PAUSED"
            await self.broadcast_event({"type": "STAGE_CHANGE", "stage": "completed", "title": f"Tier 3 harvest finished: {enqueued_total} enqueued"})
        except asyncio.CancelledError:
            self.status = "PAUSED"
        except Exception as e:
            self.status = "ERROR"
            logger.error("[STREAMING] Harvest worker failed: %s", e)
            await self.broadcast_event({"type": "STAGE_CHANGE", "stage": "harvest", "title": f"Harvest error: {e}", "error": True})

    # ------------------------------------------------------------ SSE
    def _snapshot_payload(self, kind: str) -> Dict[str, Any]:
        storage = self.get_current_storage()
        return {
            "type": kind,
            "status": self.status,
            "session_ingested": self.session_ingested,
            "total_corpus": self._corpus_count(),
            "speed_ppm": self.current_speed_ppm,
            "storage_total_bytes": storage["total_bytes"],
            "storage_total_gb": storage["total_gb"],
            "storage_used_pct": storage["used_pct"],
            "timestamp": _now_hms(),
        }

    async def stream_events(self) -> AsyncGenerator[str, None]:
        """SSE generator: an initial snapshot, then events with a 5 s heartbeat."""
        self._load_persisted_state()
        q: asyncio.Queue = asyncio.Queue()
        self.subscribers.append(q)
        yield json.dumps(await asyncio.to_thread(self._snapshot_payload, "CONNECTION_ESTABLISHED"))
        try:
            while True:
                try:
                    yield json.dumps(await asyncio.wait_for(q.get(), timeout=5.0))
                except asyncio.TimeoutError:
                    yield json.dumps(await asyncio.to_thread(self._snapshot_payload, "HEARTBEAT"))
        finally:
            if q in self.subscribers:
                self.subscribers.remove(q)


streaming_service = StreamingService()
