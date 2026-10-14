import datetime
from typing import Any, Dict

from backend.app.services.streaming.constants import (
    EVENT_CONNECTION_ESTABLISHED,
    EVENT_HEARTBEAT,
    EVENT_PAPER_INGESTED,
    PAPER_ID_PREFIX,
    PAPER_ID_START,
    PUBLISHED_DATE,
    TIME_FORMAT,
)
from backend.app.services.streaming.state import StreamingState


def build_paper_id(index: int) -> str:
    return f"{PAPER_ID_PREFIX}{PAPER_ID_START + index:05d}"


def build_paper_title(title_template: str, index: int, sample_count: int) -> str:
    if index >= sample_count:
        return f"{title_template} [Part {index + 1}]"
    return title_template


def build_paper_ingested_event(
    state: StreamingState,
    paper_id: str,
    full_title: str,
    category: str,
    math_count: int,
    vectors_synced: int,
    latency_ms: float,
) -> Dict[str, Any]:
    return {
        "type": EVENT_PAPER_INGESTED,
        "paper_id": paper_id,
        "title": full_title,
        "category": category,
        "published_date": PUBLISHED_DATE,
        "math_count": math_count,
        "vectors_synced": vectors_synced,
        "latency_ms": latency_ms,
        "session_ingested": state.session_ingested,
        "total_corpus": state.get_total_corpus(),
        "speed_ppm": state.current_speed_ppm,
        "timestamp": datetime.datetime.now().strftime(TIME_FORMAT),
    }


def build_connection_established_event(state: StreamingState) -> Dict[str, Any]:
    return {
        "type": EVENT_CONNECTION_ESTABLISHED,
        "status": state.status,
        "session_ingested": state.session_ingested,
        "total_corpus": state.get_total_corpus(),
        "timestamp": datetime.datetime.now().strftime(TIME_FORMAT),
    }


def build_heartbeat_event(state: StreamingState) -> Dict[str, Any]:
    return {
        "type": EVENT_HEARTBEAT,
        "status": state.status,
        "session_ingested": state.session_ingested,
        "total_corpus": state.get_total_corpus(),
        "speed_ppm": state.current_speed_ppm,
        "timestamp": datetime.datetime.now().strftime(TIME_FORMAT),
    }
