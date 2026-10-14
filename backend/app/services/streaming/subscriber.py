import asyncio
import json
from typing import AsyncGenerator

from backend.app.services.streaming.constants import HEARTBEAT_TIMEOUT
from backend.app.services.streaming.events import (
    build_connection_established_event,
    build_heartbeat_event,
)
from backend.app.services.streaming.state import StreamingState


async def stream_events(state: StreamingState) -> AsyncGenerator[str, None]:
    q: asyncio.Queue = asyncio.Queue()
    state.subscribers.append(q)

    yield json.dumps(build_connection_established_event(state))

    try:
        while True:
            try:
                event = await asyncio.wait_for(q.get(), timeout=HEARTBEAT_TIMEOUT)
                yield json.dumps(event)
            except asyncio.TimeoutError:
                yield json.dumps(build_heartbeat_event(state))
    finally:
        if q in state.subscribers:
            state.subscribers.remove(q)
