"""
backend/app/services/streaming_service.py
-----------------------------------------
Real-time pipeline monitor. It is the single source of truth the dashboard renders:

* The Airflow DAGs, the RabbitMQ queue consumer and this service all write into ONE ordered log buffer, so the log
  view and the numbers always agree (every log line and every counter come from the same event).
* A background loop polls Airflow (DAG runs), RabbitMQ (queue depth, consumers, dead letters), Qdrant (vector count)
  and MinIO (storage, per-tier row counts, dedup registry size) and publishes a full SNAPSHOT over SSE every few
  seconds. State transitions (DAG run started/finished/failed, queue filled/drained, consumer missing) are turned
  into log lines automatically.
* Harvest DAGs and the consumer POST events to /ingestion/broadcast (LOG, PAPER_INGESTED); those update the session
  counters and the log buffer immediately.

Nothing is simulated and nothing is written to local disk; session counters persist in MinIO (state/session_state.json).
"""

import asyncio
import collections
import datetime
import json
import logging
import time
from typing import Any, AsyncGenerator, Deque, Dict, List, Optional

import requests

from backend.app.core.config import settings
from backend.app.services.airflow_client import airflow
from backend.app.services.lake import lake

logger = logging.getLogger("streaming_service")

LOG_BUFFER_SIZE = 1000
STATE_KEY = f"{settings.STATE_PREFIX}/session_state.json"
FAST_TICK_SECONDS = 3.0
SLOW_REFRESH_SECONDS = 30.0
SPEED_WINDOW_SECONDS = 120.0
ACTIVE_GRACE_SECONDS = 15.0


def _now_hms() -> str:
    return datetime.datetime.now().strftime("%H:%M:%S")


class StreamingService:
    def __init__(self):
        self.subscribers: List[asyncio.Queue] = []
        self._loop_task: Optional[asyncio.Task] = None
        self._state_loaded = False

        # ordered, shared log buffer (monotonic seq -> stable ids for dedupe in the browser)
        self.log_buffer: Deque[Dict[str, Any]] = collections.deque(maxlen=LOG_BUFFER_SIZE)
        self._seq = 0

        # session counters
        self.session_ingested = 0
        self.session_by_tier: Dict[str, int] = {}
        self.session_by_origin: Dict[str, int] = {}
        self.accumulated_bytes_delta = 0
        self._paper_times: Deque[float] = collections.deque()
        self.last_paper: Optional[Dict[str, Any]] = None
        self._last_paper_at = 0.0
        self._dirty_state = False

        # polled state
        self.queue: Dict[str, Any] = {"status": "UNKNOWN", "ready": 0, "unacked": 0, "consumers": 0, "dead": 0}
        self.airflow_dags: List[Dict[str, Any]] = []
        self.airflow_ok = False
        self.scheduler_ok = False
        self.vectors = 0
        self.registry_total = 0
        self.slow: Dict[str, Any] = {}
        self._slow_at = 0.0
        self._slow_dirty = True

        # transition tracking
        self._run_states: Dict[str, str] = {}
        self._seeded = False
        self._prev_queue_total: Optional[int] = None
        self._prev_consumers: Optional[int] = None
        self._prev_airflow_ok: Optional[bool] = None
        self._prev_vectors = 0
        self._last_logged_rep: Dict[str, float] = {}

    # ------------------------------------------------------------ logs
    def add_log(self, level: str, tag: str, msg: str, tier: Optional[str] = None, ts: Optional[str] = None) -> Dict[str, Any]:
        self._seq += 1
        entry = {
            "id": self._seq,
            "time": ts or _now_hms(),
            "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "level": level,
            "tag": tag,
            "tier": tier,
            "msg": msg,
        }
        self.log_buffer.append(entry)
        self._publish({"type": "LOG", "log": entry})
        return entry

    def get_latest_pipeline_logs(self, limit: int = 150) -> List[Dict[str, Any]]:
        """Newest first, same ids/ordering as the LOG events pushed over SSE."""
        return list(reversed(list(self.log_buffer)[-limit:]))

    # ------------------------------------------------------------ state persistence (MinIO)
    def _load_persisted_state(self) -> None:
        if self._state_loaded:
            return
        self._state_loaded = True
        try:
            data = lake.get_json(STATE_KEY, ttl=0) or {}
            self.session_ingested = int(data.get("session_ingested", 0))
            self.session_by_tier = {k: int(v) for k, v in (data.get("by_tier") or {}).items()}
            self.session_by_origin = {k: int(v) for k, v in (data.get("by_origin") or {}).items()}
        except Exception as e:
            logger.warning("[MONITOR] Could not load session state: %s", e)

    def _save_persisted_state(self) -> None:
        try:
            lake.put_json(STATE_KEY, {
                "session_ingested": self.session_ingested,
                "by_tier": self.session_by_tier,
                "by_origin": self.session_by_origin,
                "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            })
            self._dirty_state = False
        except Exception as e:
            logger.warning("[MONITOR] Could not save session state: %s", e)

    def reset_session(self) -> None:
        self.session_ingested = 0
        self.session_by_tier = {}
        self.session_by_origin = {}
        self._paper_times.clear()
        self._save_persisted_state()
        self.add_log("INFO", "SESSION", "Session counters reset to zero.")

    # ------------------------------------------------------------ events pushed by DAGs / consumer
    async def broadcast_event(self, event: Dict[str, Any]) -> None:
        """Entry point of POST /ingestion/broadcast."""
        self._load_persisted_state()
        etype = event.get("type")
        if etype == "LOG":
            self.add_log(str(event.get("level", "INFO")), str(event.get("tag", "PIPELINE")), str(event.get("msg", "")), tier=event.get("tier"))
            if event.get("refresh"):
                self._slow_dirty = True
        elif etype == "PAPER_INGESTED":
            tier = str(event.get("tier") or "unknown")
            origin = str(event.get("content_origin") or "unknown")
            self.session_ingested += 1
            self.session_by_tier[tier] = self.session_by_tier.get(tier, 0) + 1
            self.session_by_origin[origin] = self.session_by_origin.get(origin, 0) + 1
            now = time.time()
            self._paper_times.append(now)
            self._last_paper_at = now
            self.last_paper = {
                "paper_id": event.get("paper_id"), "title": event.get("title"), "category": event.get("category"),
                "tier": tier, "content_origin": origin, "total_words": event.get("total_words"),
                "total_sections": event.get("total_sections"), "vectors_synced": event.get("vectors_synced"),
                "at": _now_hms(),
            }
            self._dirty_state = True
            self._slow_dirty = True
            self._publish({"type": "PAPER_INGESTED", **self.last_paper, "session_ingested": self.session_ingested})
        else:
            self.add_log(str(event.get("level", "INFO")), str(event.get("tag", "PIPELINE")), str(event.get("title") or event.get("msg") or json.dumps(event)[:200]))

    # ------------------------------------------------------------ polling
    def _poll_fast(self) -> None:
        """RabbitMQ + Qdrant + Airflow; each source fails independently."""
        try:
            u, p = settings.RABBITMQ_USER, settings.RABBITMQ_PASSWORD
            base = settings.RABBITMQ_MGMT_URL.rstrip("/")

            def q(name: str) -> Optional[Dict[str, Any]]:
                r = requests.get(f"{base}/api/queues/%2f/{name}", auth=(u, p), timeout=3)
                return r.json() if r.status_code == 200 else None

            main = q(settings.RABBITMQ_QUEUE_INGEST)
            dead = q(f"{settings.RABBITMQ_QUEUE_INGEST}.dead") or {}
            if main is None:
                self.queue = {"status": "QUEUE_MISSING", "ready": 0, "unacked": 0, "consumers": 0, "dead": 0}
            else:
                self.queue = {"status": "HEALTHY", "ready": main.get("messages_ready", 0), "unacked": main.get("messages_unacknowledged", 0),
                              "consumers": main.get("consumers", 0), "dead": dead.get("messages", 0)}
        except Exception:
            self.queue = {**self.queue, "status": "OFFLINE"}

        try:
            from src.indexing.qdrant_manager import QdrantManager

            self.vectors = int(QdrantManager().count())
        except Exception:
            pass

        self.airflow_ok = airflow.healthy()
        if self.airflow_ok:
            self.scheduler_ok = airflow.scheduler_ok()
            try:
                self.airflow_dags = airflow.overview()
            except Exception as e:
                logger.warning("[MONITOR] Airflow overview failed: %s", e)
        else:
            self.scheduler_ok = False

        reg = lake.get_json("manifests/lakehouse_abstract_hashes.count.json", ttl=2)
        if reg:
            self.registry_total = int(reg.get("total", 0))

    def _poll_slow(self) -> None:
        """MinIO scan + Parquet footers (cached by storage_service); forced when new data landed."""
        from backend.app.services.storage_service import storage_service

        snap = storage_service.snapshot(force=True)
        self.slow = {
            "storage_total_bytes": snap["total_bytes"],
            "storage_total_gb": round(snap["total_bytes"] / 1024**3, 3),
            "storage_used_pct": min(100.0, round(snap["total_bytes"] / 1024**3 / 10.0 * 100, 2)),
            "objects": snap["total_objects"],
            "rows": snap["rows"],
            "silver_papers_rows": snap["silver_papers_rows"],
            "last_synced": snap["last_synced"],
        }
        self._slow_at = time.time()
        self._slow_dirty = False

    def _detect_transitions(self) -> None:
        # Airflow DAG runs
        if self.airflow_ok != self._prev_airflow_ok:
            if self._prev_airflow_ok is not None:
                self.add_log("WARN" if not self.airflow_ok else "SUCCESS", "AIRFLOW", "Airflow API is reachable again." if self.airflow_ok else "Airflow API is unreachable.")
            self._prev_airflow_ok = self.airflow_ok
        for d in self.airflow_dags:
            lr = d.get("last_run")
            if not lr:
                continue
            key = f"{d['dag_id']}:{lr['run_id']}"
            prev = self._run_states.get(key)
            if prev != lr["state"]:
                self._run_states[key] = lr["state"]
                if self._seeded:  # do not replay history at startup
                    level = "SUCCESS" if lr["state"] == "success" else "ERROR" if lr["state"] == "failed" else "INFO"
                    detail = ""
                    if lr["state"] in ("success", "failed"):
                        res = airflow.task_return_value(d["dag_id"], lr["run_id"])
                        detail = f" -> {res}" if res else ""
                    self.add_log(level, "AIRFLOW", f"{d['name']}: run {lr['state'].upper()} ({lr['run_type']}){detail}", tier=d["key"])
        # RabbitMQ
        total = self.queue["ready"] + self.queue["unacked"]
        if self._prev_queue_total is not None and total != self._prev_queue_total:
            if self._prev_queue_total == 0 and total > 0:
                self.add_log("INFO", "RABBITMQ", f"Queue filled: {total} message(s) waiting for the consumer.")
            elif total == 0 and self._prev_queue_total > 0:
                self.add_log("SUCCESS", "RABBITMQ", "Queue drained: every message was processed.")
        self._prev_queue_total = total
        if self._prev_consumers is not None and self.queue["consumers"] != self._prev_consumers:
            if self.queue["consumers"] == 0:
                self.add_log("WARN", "RABBITMQ", "Queue consumer disconnected.")
            elif self._prev_consumers == 0:
                self.add_log("SUCCESS", "RABBITMQ", "Queue consumer connected.")
        self._prev_consumers = self.queue["consumers"]
        if total > 0 and self.queue["consumers"] == 0 and time.time() - self._last_logged_rep.get("noconsumer", 0) > 300:
            self._last_logged_rep["noconsumer"] = time.time()
            self.add_log("WARN", "RABBITMQ", f"{total} message(s) are queued but NO consumer is running: start the ingestion worker.")
        if self.queue.get("dead", 0) and self.queue["dead"] != self._last_logged_rep.get("dead", -1):
            self._last_logged_rep["dead"] = self.queue["dead"]
            self.add_log("ERROR", "RABBITMQ", f"{self.queue['dead']} message(s) in the dead-letter queue.")
        # Qdrant
        if self._seeded and self.vectors != self._prev_vectors and self._prev_vectors:
            self._slow_dirty = True
        self._prev_vectors = self.vectors
        self._seeded = True

    # ------------------------------------------------------------ snapshot
    def _speed_ppm(self) -> float:
        now = time.time()
        while self._paper_times and now - self._paper_times[0] > SPEED_WINDOW_SECONDS:
            self._paper_times.popleft()
        if len(self._paper_times) < 2:
            return 0.0
        span = max(now - self._paper_times[0], 5.0)
        return round(len(self._paper_times) / span * 60.0, 1)

    def snapshot(self) -> Dict[str, Any]:
        self._load_persisted_state()
        now = time.time()
        running = [d for d in self.airflow_dags if d.get("running") and d["kind"] == "harvest"]
        queue_active = (self.queue["ready"] + self.queue["unacked"]) > 0
        recent = now - self._last_paper_at < ACTIVE_GRACE_SECONDS
        if running:
            stage = "harvest"
        elif queue_active and self.queue["consumers"] > 0:
            stage = "embedding"
        elif queue_active:
            stage = "queued"
        elif recent:
            stage = "gold"
        else:
            stage = "idle"
        rows = self.slow.get("rows", {})
        tier3 = rows.get("tier3", 0)
        tier2 = rows.get("tier2", 0)
        tier1 = self.slow.get("silver_papers_rows", 0)
        return {
            "type": "SNAPSHOT",
            "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "time": _now_hms(),
            "status": "STREAMING" if stage != "idle" else "IDLE",
            "stage": stage,
            "queue": self.queue,
            "airflow": {"reachable": self.airflow_ok, "scheduler_healthy": self.scheduler_ok, "dags": self.airflow_dags},
            "corpus": {
                "vectors": self.vectors,
                "papers": self.registry_total,
                "tier1_rows": tier1, "tier2_rows": tier2, "tier3_rows": tier3,
                "sources": {k: rows.get(k, 0) for k in ("cvf", "openreview", "zenodo", "openalex")},
            },
            "storage": {k: self.slow.get(k) for k in ("storage_total_bytes", "storage_total_gb", "storage_used_pct", "objects", "last_synced")},
            "session": {
                "ingested": self.session_ingested, "by_tier": self.session_by_tier, "by_origin": self.session_by_origin,
                "speed_ppm": self._speed_ppm(), "last_paper": self.last_paper,
            },
            "last_log_id": self._seq,
        }

    # ------------------------------------------------------------ monitor loop
    async def _publish_snapshot(self) -> None:
        self._publish(self.snapshot())

    def _publish(self, event: Dict[str, Any]) -> None:
        for q in list(self.subscribers):
            try:
                q.put_nowait(event)
            except Exception:
                pass

    async def run_monitor(self) -> None:
        self._load_persisted_state()
        self.add_log("INFO", "MONITOR", "Pipeline monitor started (Airflow, RabbitMQ, Qdrant, MinIO).")
        tick = 0
        while True:
            try:
                await asyncio.to_thread(self._poll_fast)
                if self._slow_dirty and (time.time() - self._slow_at > 5) or time.time() - self._slow_at > SLOW_REFRESH_SECONDS:
                    await asyncio.to_thread(self._poll_slow)
                self._detect_transitions()
                if self._dirty_state and tick % 2 == 0:
                    await asyncio.to_thread(self._save_persisted_state)
                await self._publish_snapshot()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error("[MONITOR] tick failed: %s", e)
            tick += 1
            await asyncio.sleep(FAST_TICK_SECONDS)

    def start_monitor(self) -> None:
        if self._loop_task is None or self._loop_task.done():
            self._loop_task = asyncio.create_task(self.run_monitor())

    def stop_monitor(self) -> None:
        if self._loop_task:
            self._loop_task.cancel()

    # ------------------------------------------------------------ status / SSE
    def get_status(self) -> Dict[str, Any]:
        """Legacy keys (for older clients) plus the full snapshot."""
        s = self.snapshot()
        return {
            "status": s["status"], "target_papers": 0, "session_ingested": s["session"]["ingested"],
            "total_corpus": s["corpus"]["vectors"], "speed_ppm": s["session"]["speed_ppm"], "elapsed_seconds": 0,
            "subscribers_connected": len(self.subscribers),
            "storage_total_bytes": s["storage"]["storage_total_bytes"], "storage_total_gb": s["storage"]["storage_total_gb"],
            "storage_used_pct": s["storage"]["storage_used_pct"], "snapshot": s,
        }

    async def stream_events(self) -> AsyncGenerator[str, None]:
        """SSE: snapshot first, then every LOG / PAPER_INGESTED / SNAPSHOT as it happens."""
        self._load_persisted_state()
        q: asyncio.Queue = asyncio.Queue(maxsize=500)
        self.subscribers.append(q)
        try:
            yield json.dumps({**self.snapshot(), "type": "CONNECTION_ESTABLISHED"})
            while True:
                try:
                    yield json.dumps(await asyncio.wait_for(q.get(), timeout=10.0))
                except asyncio.TimeoutError:
                    yield json.dumps(self.snapshot())
        finally:
            if q in self.subscribers:
                self.subscribers.remove(q)

    # ------------------------------------------------------------ controls (real Airflow)
    async def start_streaming(self, target: int = 0, delay: float = 0.0) -> Dict[str, Any]:
        """Run the Tier 1 real-time DAG now (through Airflow)."""
        meta = airflow_dag("tier1")
        try:
            await asyncio.to_thread(airflow.set_paused, meta["dag_id"], False)
            run = await asyncio.to_thread(airflow.trigger, meta["dag_id"], {})
        except Exception as e:
            return {"status": "ERROR", "message": f"Airflow trigger failed: {e}"}
        self.add_log("INFO", "AIRFLOW", f"Manual trigger: {meta['name']} ({run.get('dag_run_id')}).", tier="tier1")
        return {"status": "STARTED", "message": f"{meta['dag_id']} triggered in Airflow.", "dag_run_id": run.get("dag_run_id")}

    async def stop_streaming(self) -> Dict[str, Any]:
        cancelled = await asyncio.to_thread(airflow.cancel_running)
        self.add_log("WARN", "AIRFLOW", f"Cancelled {len(cancelled)} running DAG run(s).")
        return {"status": "STOPPED", "message": f"Cancelled {len(cancelled)} running DAG run(s).", "cancelled": cancelled}


def airflow_dag(key: str) -> Dict[str, str]:
    from backend.app.services.airflow_client import DAGS

    return DAGS[key]


streaming_service = StreamingService()
