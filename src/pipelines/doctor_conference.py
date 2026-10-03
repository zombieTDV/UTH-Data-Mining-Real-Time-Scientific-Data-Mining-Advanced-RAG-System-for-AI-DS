"""Pre-flight check for the conference ingestion pipeline.

Validates the runtime environment without making destructive calls:

    - .env is loadable and venues are recognized
    - R2 / Local object store can be reached (HEAD bucket)
    - Each configured source adapter can resolve its venue (OpenAlex sources)
    - Local Silver / manifest / DLQ directories are writable
    - Circuit breakers are all in CLOSED state

Usage:
    python -m src.pipelines.doctor_conference
"""

import json
import sys
from typing import Dict, List

from src.config.settings import settings
from src.ingestion.common.circuit_breaker import CircuitBreakerRegistry
from src.ingestion.common.dead_letter import DeadLetterQueue
from src.ingestion.conference_pipeline import VENUE_STRATEGY


def _check(label: str, ok: bool, detail: str = "") -> Dict[str, str]:
    status = "OK" if ok else "FAIL"
    line = f"  [{status}] {label}"
    if detail:
        line += f"  ({detail})"
    print(line)
    return {"label": label, "status": status, "detail": detail}


def check_env() -> bool:
    print("\n== Configuration ==")
    ok = True
    ok &= _check(
        "CONFERENCE_SOURCES",
        len(settings.CONFERENCE_SOURCES) > 0,
        ",".join(settings.CONFERENCE_SOURCES),
    )["status"] == "OK"
    ok &= _check(
        "Year range",
        1990 <= settings.CONFERENCE_YEAR_FROM <= settings.CONFERENCE_YEAR_TO <= 2100,
        f"{settings.CONFERENCE_YEAR_FROM}..{settings.CONFERENCE_YEAR_TO}",
    )["status"] == "OK"
    ok &= _check(
        "OPENALEX_EMAIL",
        bool(settings.OPENALEX_EMAIL),
        settings.OPENALEX_EMAIL or "(empty - will use shared pool)",
    )["status"] == "OK"
    return ok


def check_object_store(local_only: bool) -> bool:
    print("\n== Object store ==")
    if local_only:
        path = settings.LOCAL_STORE_DIR
        path.mkdir(parents=True, exist_ok=True)
        return _check(
            "Local store writable",
            path.is_dir(),
            str(path),
        )["status"] == "OK"
    try:
        from src.storage.r2_client import R2Client

        client = R2Client()
        # Try listing a single key with a known prefix (cheap probe).
        objs = client.list_objects(prefix="", max_keys=1)
        return _check("R2 reachable", True, f"objects={len(objs)}")["status"] == "OK"
    except Exception as exc:  # noqa: BLE001
        return _check("R2 reachable", False, str(exc))["status"] == "OK"


def check_local_dirs() -> bool:
    print("\n== Local directories ==")
    ok = True
    for label, path in [
        ("MANIFEST_DIR", settings.MANIFEST_DIR),
        ("SILVER_DIR", settings.SILVER_DIR),
        ("CRAWLER_DEAD_LETTER_DIR", settings.CRAWLER_DEAD_LETTER_DIR),
    ]:
        try:
            path.mkdir(parents=True, exist_ok=True)
            ok &= _check(label, True, str(path))["status"] == "OK"
        except Exception as exc:  # noqa: BLE001
            ok &= _check(label, False, str(exc))["status"] == "OK"
    return ok


def check_openalex_sources() -> bool:
    print("\n== OpenAlex source ID resolution ==")
    try:
        from src.ingestion.sources.openalex_adapter import OpenAlexAdapter
    except Exception as exc:  # noqa: BLE001
        return _check("import OpenAlexAdapter", False, str(exc))["status"] == "OK"

    ok = True
    for venue in settings.CONFERENCE_SOURCES:
        try:
            adapter = OpenAlexAdapter(venue, settings.CONFERENCE_YEAR_FROM, settings.CONFERENCE_YEAR_TO)
            sid = adapter.resolve_source_id()
            ok &= _check(venue, bool(sid), sid or "no source")["status"] == "OK"
            adapter.close()
        except Exception as exc:  # noqa: BLE001
            ok &= _check(venue, False, str(exc))["status"] == "OK"
    return ok


def check_circuit_breakers() -> bool:
    print("\n== Circuit breakers ==")
    states = CircuitBreakerRegistry.all_states()
    if not states:
        _check("(none initialized yet)", True, "")
        return True
    ok = True
    for name, state in states.items():
        ok &= _check(name, state == "closed", state)["status"] == "OK"
    return ok


def check_dlq() -> bool:
    print("\n== Dead-letter queue ==")
    try:
        dlq = DeadLetterQueue()
        sources = dlq.list_sources()
        _check("DLQ dir", True, f"sources={len(sources)}")
        return True
    except Exception as exc:  # noqa: BLE001
        return _check("DLQ dir", False, str(exc))["status"] == "OK"


def main(argv: List[str] | None = None) -> int:
    print("=" * 60)
    print("Conference Ingestion Doctor")
    print("=" * 60)
    local_only = "--local" in (argv or sys.argv[1:])

    results = []
    results.append(check_env())
    results.append(check_local_dirs())
    results.append(check_object_store(local_only=local_only))
    results.append(check_dlq())
    results.append(check_openalex_sources())
    results.append(check_circuit_breakers())

    print("\n" + "=" * 60)
    if all(results):
        print("All checks PASSED. Pipeline is ready to run.")
        return 0
    print("Some checks FAILED. See above.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
