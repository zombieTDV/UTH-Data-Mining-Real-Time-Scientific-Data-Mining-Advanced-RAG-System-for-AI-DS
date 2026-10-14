import time
from typing import Any, Dict

from backend.app.services.streaming.constants import (
    ELAPSED_ROUND_DIGITS,
    LATENCY_ROUND_DIGITS,
    MIN_ELAPSED,
    PPM_WINDOW,
)
from backend.app.services.streaming.state import StreamingState


def compute_elapsed(state: StreamingState) -> float:
    if not state.start_time:
        return 0
    return time.time() - state.start_time


def compute_speed_ppm(state: StreamingState) -> float:
    elapsed = max(time.time() - state.start_time, MIN_ELAPSED)
    return round((state.session_ingested / elapsed) * PPM_WINDOW, LATENCY_ROUND_DIGITS)


def compute_latency_ms(started_at: float) -> float:
    return round((time.time() - started_at) * 1000, LATENCY_ROUND_DIGITS)


def build_status_payload(state: StreamingState) -> Dict[str, Any]:
    return {
        "status": state.status,
        "target_papers": state.target_papers,
        "session_ingested": state.session_ingested,
        "total_corpus": state.get_total_corpus(),
        "speed_ppm": state.current_speed_ppm,
        "elapsed_seconds": round(compute_elapsed(state), ELAPSED_ROUND_DIGITS),
        "subscribers_connected": len(state.subscribers),
    }
