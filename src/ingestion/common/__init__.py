"""Common foundation layer for the conference ingestion pipeline.

Modules in this package implement the engineering rules from
docs/progress/REFACTOR_STATUS.md and the project constitution:

    user_agent       # rule 11: transparent UA
    jitter           # rule 4:  jittered delay
    rate_limiter     # rule 3:  per-domain token bucket
    backoff          # rule 5+6: exponential backoff + Retry-After
    http_client      # rule 9+16: ETag/Last-Modified + timeouts
    circuit_breaker  # rule 17: open after N failures
    checkpoint       # rule 7:  atomic incremental checkpoint
    dead_letter      # rule 18: DLQ for failed records
    adaptive_throttle  # rule 15: back off when latency/errors rise
    robots_checker   # rule 2:  robots.txt policy
    content_hash     # rule 19: SHA-256 dedup
"""
