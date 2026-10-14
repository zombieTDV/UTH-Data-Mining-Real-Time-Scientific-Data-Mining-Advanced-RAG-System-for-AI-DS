import asyncio
import logging
import time

from backend.app.services.streaming.constants import (
    MAX_PAPER_DELAY,
    STATUS_COMPLETED,
    STATUS_ERROR,
    STATUS_PAUSED,
)
from backend.app.services.streaming.events import (
    build_paper_id,
    build_paper_ingested_event,
    build_paper_title,
)
from backend.app.services.streaming.metrics import compute_latency_ms, compute_speed_ppm
from backend.app.services.streaming.sample_data import get_sample_count, get_sample_paper
from backend.app.services.streaming.state import StreamingState

logger = logging.getLogger("streaming_service")


async def dispatch_event(state: StreamingState, event: dict) -> None:
    state.record_event(event)
    for q in list(state.subscribers):
        try:
            q.put_nowait(event)
        except Exception:
            pass


async def run_streaming_loop(state: StreamingState, target: int, delay: float) -> None:
    logger.info(f"[STREAMING] Ingestion worker started. Target: {target} papers.")

    sample_count = get_sample_count()
    try:
        while state.session_ingested < target and not state.stop_signal.is_set():
            started_at = time.time()
            idx = state.session_ingested
            title_template, cat, formulas, vectors = get_sample_paper(idx)
            paper_id = build_paper_id(idx)
            full_title = build_paper_title(title_template, idx, sample_count)

            await asyncio.sleep(min(delay, MAX_PAPER_DELAY))

            state.session_ingested += 1
            state.current_speed_ppm = compute_speed_ppm(state)
            latency_ms = compute_latency_ms(started_at)

            event = build_paper_ingested_event(
                state, paper_id, full_title, cat, formulas, vectors, latency_ms
            )
            await dispatch_event(state, event)

        state.status = STATUS_COMPLETED if state.session_ingested >= target else STATUS_PAUSED
        logger.info(
            f"[STREAMING] Ingestion finished. Total streamed: {state.session_ingested} papers."
        )
    except asyncio.CancelledError:
        state.status = STATUS_PAUSED
        logger.info("[STREAMING] Worker task cancelled.")
    except Exception as e:
        state.status = STATUS_ERROR
        logger.error(f"[STREAMING] Worker encountered error: {e}")
