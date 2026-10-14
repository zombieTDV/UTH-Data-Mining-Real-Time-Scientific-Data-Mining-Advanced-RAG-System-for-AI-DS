import asyncio
import time
from typing import Any, AsyncGenerator, Dict

from backend.app.services.streaming.constants import (
    DEFAULT_START_DELAY,
    DEFAULT_TARGET_PAPERS,
    MESSAGE_ALREADY_RUNNING,
    MESSAGE_NOT_RUNNING,
    MESSAGE_STARTED,
    MESSAGE_STOPPED,
    RESULT_ALREADY_RUNNING,
    RESULT_NOT_RUNNING,
    RESULT_STARTED,
    RESULT_STOPPED,
    STATUS_PAUSED,
    STATUS_STREAMING,
)
from backend.app.services.streaming.metrics import build_status_payload
from backend.app.services.streaming.state import StreamingState
from backend.app.services.streaming.subscriber import stream_events
from backend.app.services.streaming.worker import run_streaming_loop


class StreamingService:
    def __init__(self) -> None:
        self._state = StreamingState()

    def get_status(self) -> Dict[str, Any]:
        return build_status_payload(self._state)

    async def start_streaming(
        self, target: int = DEFAULT_TARGET_PAPERS, delay: float = DEFAULT_START_DELAY
    ) -> Dict[str, Any]:
        if self._state.is_streaming():
            return {
                "status": RESULT_ALREADY_RUNNING,
                "message": MESSAGE_ALREADY_RUNNING,
            }

        self._state.target_papers = target
        self._state.status = STATUS_STREAMING
        self._state.stop_signal.clear()
        self._state.start_time = time.time()

        self._state._task = asyncio.create_task(
            run_streaming_loop(self._state, target, delay)
        )
        return {
            "status": RESULT_STARTED,
            "target": target,
            "message": MESSAGE_STARTED.format(target=target),
        }

    async def stop_streaming(self) -> Dict[str, Any]:
        if not self._state.is_streaming():
            return {"status": RESULT_NOT_RUNNING, "message": MESSAGE_NOT_RUNNING}

        self._state.stop_signal.set()
        self._state.status = STATUS_PAUSED
        if self._state._task:
            self._state._task.cancel()
        return {"status": RESULT_STOPPED, "message": MESSAGE_STOPPED}

    async def stream_events(self) -> AsyncGenerator[str, None]:
        async for payload in stream_events(self._state):
            yield payload


streaming_service = StreamingService()
