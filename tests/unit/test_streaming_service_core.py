"""Unit tests for backend/app/services/streaming_service.py verifying
event-loop state management, monotonic log sequence IDs, sliding window speed calculation,
dynamic stage derivation, and SSE subscriber broadcast lifecycle.
"""
import asyncio
import json
import time
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from backend.app.services.streaming_service import StreamingService


@pytest.fixture
def streaming_svc():
    with patch("backend.app.services.streaming_service.lake") as mock_lake:
        mock_lake.get_json.return_value = None
        mock_lake.put_json.return_value = None
        svc = object.__new__(StreamingService)
        svc.subscribers = []
        svc._loop_task = None
        svc._state_loaded = True
        import collections
        svc.log_buffer = collections.deque(maxlen=1000)
        svc._seq = 0
        svc.session_ingested = 0
        svc.session_by_tier = {}
        svc.session_by_origin = {}
        svc.accumulated_bytes_delta = 0
        svc._paper_times = collections.deque()
        svc.last_paper = None
        svc._last_paper_at = 0.0
        svc._dirty_state = False
        svc.queue = {"status": "HEALTHY", "ready": 0, "unacked": 0, "consumers": 1, "dead": 0}
        svc.airflow_dags = []
        svc.airflow_ok = True
        svc.scheduler_ok = True
        svc.vectors = 50000
        svc.slow = {
            "storage_total_bytes": 10737418240,
            "silver_papers_rows": 15000,
            "formulas": 250000,
            "rows": {"tier1": 5000, "tier2": 5000, "tier3": 5000},
        }
        svc._slow_at = time.time()
        svc._slow_dirty = False
        svc._run_states = {}
        svc._seeded = True
        svc._prev_queue_total = None
        svc._prev_consumers = None
        svc._prev_airflow_ok = True
        svc._prev_vectors = 50000
        svc._last_logged_rep = {}
        return svc


# ==============================================================================
# 1. Monotonic Log Sequence IDs & Buffer Bounds
# ==============================================================================

@pytest.mark.unit
def test_add_log_monotonic_ids(streaming_svc):
    streaming_svc._publish = MagicMock()

    e1 = streaming_svc.add_log("INFO", "INGEST", "First event")
    e2 = streaming_svc.add_log("SUCCESS", "INGEST", "Second event")
    e3 = streaming_svc.add_log("ERROR", "DATABASE", "Third event")

    assert e1["id"] == 1
    assert e2["id"] == 2
    assert e3["id"] == 3
    assert len(streaming_svc.log_buffer) == 3
    assert streaming_svc.get_latest_pipeline_logs(limit=2) == [e3, e2]


# ==============================================================================
# 2. Ingestion Event Broadcasting & Session State
# ==============================================================================

@pytest.mark.asyncio
async def test_broadcast_event_paper_ingested(streaming_svc):
    streaming_svc._publish = MagicMock()

    event = {
        "type": "PAPER_INGESTED",
        "paper_id": "2401.00001",
        "title": "Diffusion Transformers",
        "category": "cs.CV",
        "tier": "tier1",
        "content_origin": "arxiv_html5",
        "total_words": 4500,
        "total_sections": 5,
        "vectors_synced": 12,
    }

    await streaming_svc.broadcast_event(event)

    assert streaming_svc.session_ingested == 1
    assert streaming_svc.session_by_tier["tier1"] == 1
    assert streaming_svc.session_by_origin["arxiv_html5"] == 1
    assert streaming_svc.last_paper["paper_id"] == "2401.00001"
    assert streaming_svc._dirty_state is True
    assert streaming_svc._slow_dirty is True
    streaming_svc._publish.assert_called_once()


# ==============================================================================
# 3. Sliding Window Speed Calculation (PPM)
# ==============================================================================

@pytest.mark.unit
def test_speed_ppm_calculation(streaming_svc):
    # Under 2 papers -> returns 0.0
    assert streaming_svc._speed_ppm() == 0.0

    now = time.time()
    # Add 10 papers across 30 seconds
    streaming_svc._paper_times.extend([now - 30.0 + (i * 3.0) for i in range(10)])

    ppm = streaming_svc._speed_ppm()
    # 10 papers in 30s -> ~20 papers per minute
    assert 18.0 <= ppm <= 22.0


# ==============================================================================
# 4. Dynamic Pipeline Stage Derivation
# ==============================================================================

@pytest.mark.unit
def test_snapshot_stage_derivation_harvest_vs_embedding_vs_idle(streaming_svc):
    # Case 1: Harvesting DAG is running -> stage = 'harvest'
    streaming_svc.airflow_dags = [
        {"dag_id": "dag_tier1_realtime_stream", "running": True, "kind": "harvest"}
    ]
    assert streaming_svc.snapshot()["stage"] == "harvest"

    # Case 2: No DAG running, but queue has messages and consumer active -> stage = 'embedding'
    streaming_svc.airflow_dags = []
    streaming_svc.queue = {"ready": 50, "unacked": 0, "consumers": 1, "dead": 0}
    assert streaming_svc.snapshot()["stage"] == "embedding"

    # Case 3: Queue has messages but 0 consumers -> stage = 'queued'
    streaming_svc.queue = {"ready": 50, "unacked": 0, "consumers": 0, "dead": 0}
    assert streaming_svc.snapshot()["stage"] == "queued"

    # Case 4: Queue empty, no DAG running, no recent paper -> stage = 'idle'
    streaming_svc.queue = {"ready": 0, "unacked": 0, "consumers": 1, "dead": 0}
    streaming_svc._last_paper_at = 0.0
    assert streaming_svc.snapshot()["stage"] == "idle"


# ==============================================================================
# 5. SSE Subscriber Lifecycle & Clean Disconnect
# ==============================================================================

@pytest.mark.asyncio
async def test_stream_events_connects_and_disconnects(streaming_svc):
    gen = streaming_svc.stream_events()

    # First event yielded must be CONNECTION_ESTABLISHED
    first_chunk = await gen.asend(None)
    first_data = json.loads(first_chunk)
    assert first_data["type"] == "CONNECTION_ESTABLISHED"
    assert len(streaming_svc.subscribers) == 1

    # Close generator and verify subscriber was cleanly removed
    await gen.aclose()
    assert len(streaming_svc.subscribers) == 0
