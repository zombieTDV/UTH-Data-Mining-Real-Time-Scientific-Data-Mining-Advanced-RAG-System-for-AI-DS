from sse_starlette.sse import EventSourceResponse

from backend.app.services.mining import mining_service


def build_telemetry_response() -> EventSourceResponse:
    return EventSourceResponse(mining_service.stream_telemetry())
