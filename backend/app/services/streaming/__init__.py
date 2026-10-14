from backend.app.services.streaming.service import StreamingService, streaming_service
from backend.app.services.streaming.state import StreamingState
from backend.app.services.streaming.events import (
    build_connection_established_event,
    build_heartbeat_event,
    build_paper_id,
    build_paper_ingested_event,
    build_paper_title,
)
from backend.app.services.streaming.metrics import (
    build_status_payload,
    compute_elapsed,
    compute_latency_ms,
    compute_speed_ppm,
)
from backend.app.services.streaming.sample_data import (
    SAMPLE_PAPERS,
    get_sample_count,
    get_sample_paper,
)
from backend.app.services.streaming.subscriber import stream_events
from backend.app.services.streaming.worker import dispatch_event, run_streaming_loop
