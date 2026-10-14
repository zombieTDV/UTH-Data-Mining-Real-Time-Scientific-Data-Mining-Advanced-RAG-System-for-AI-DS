import asyncio
from typing import Any, Dict, List, Optional

from backend.app.services.streaming.constants import (
    BASE_CORPUS_COUNT,
    DEFAULT_TARGET_PAPERS,
    RECENT_EVENTS_LIMIT,
    STATUS_IDLE,
    STATUS_STREAMING,
)


class StreamingState:
    def __init__(self) -> None:
        self.status: str = STATUS_IDLE
        self.target_papers: int = DEFAULT_TARGET_PAPERS
        self.session_ingested: int = 0
        self.base_corpus_count: int = BASE_CORPUS_COUNT
        self.current_speed_ppm: float = 0.0
        self.start_time: Optional[float] = None
        self.stop_signal = asyncio.Event()
        self.subscribers: List[asyncio.Queue] = []
        self._task: Optional[asyncio.Task] = None
        self.recent_events: List[Dict[str, Any]] = []

    def is_streaming(self) -> bool:
        return self.status == STATUS_STREAMING

    def record_event(self, event: Dict[str, Any]) -> None:
        self.recent_events.append(event)
        if len(self.recent_events) > RECENT_EVENTS_LIMIT:
            self.recent_events.pop(0)

    def get_total_corpus(self) -> int:
        return self.base_corpus_count + self.session_ingested
