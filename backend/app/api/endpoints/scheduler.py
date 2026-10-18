"""Scheduler endpoints backed by the real Apache Airflow instance.

The dashboard's "scheduler" panel reads DAG state from Airflow and controls it through Airflow's REST API:
status = DAG pause flags + latest run, toggle = pause/unpause, trigger = new DAG run, cancel = fail running runs.
Queue numbers come from the monitor (RabbitMQ management API).
"""

import asyncio
import logging
from typing import Any, Dict, Optional

import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.app.services.airflow_client import DAGS, airflow
from backend.app.services.streaming_service import streaming_service

logger = logging.getLogger("scheduler")

router = APIRouter(prefix="/scheduler", tags=["Ingestion Scheduler (Airflow)"])

HARVEST_KEYS = [k for k, v in DAGS.items() if v["kind"] == "harvest"]


class TriggerRequest(BaseModel):
    limit: Optional[int] = Field(None, description="Tier 2 only: number of papers for this run (default: the DAG's target)")
    sync_r2: bool = True  # legacy field, ignored
    force: bool = False


class StartDaemonRequest(BaseModel):
    interval_seconds: int = Field(30, ge=5, le=3600)  # legacy field, ignored


class StopDaemonRequest(BaseModel):
    cancel_running: bool = False


class ToggleSourceRequest(BaseModel):
    enabled: Optional[bool] = Field(None, description="True = unpaused (scheduled), False = paused")


def _iso_duration(start: Optional[str], end: Optional[str]) -> float:
    from datetime import datetime

    if not start or not end:
        return 0.0
    try:
        return round((datetime.fromisoformat(end) - datetime.fromisoformat(start)).total_seconds(), 1)
    except Exception:
        return 0.0


def _source_item(row: Dict[str, Any], session_by_tier: Dict[str, int]) -> Dict[str, Any]:
    lr = row.get("last_run") or {}
    state = lr.get("state")
    status = "running" if row.get("running") else (state or "never_run")
    return {
        "key": row["key"], "name": row["name"], "dag_id": row["dag_id"], "frequency": row["frequency"], "kind": row["kind"],
        "enabled": not row.get("paused", True),
        "status": status,
        "last_run": lr.get("start"),
        "next_run": row.get("next_run"),
        "last_duration_s": _iso_duration(lr.get("start"), lr.get("end")),
        "total_papers_harvested": session_by_tier.get(row["key"], 0),
        "last_error": "Last Airflow run failed (open the Airflow task log)" if state == "failed" else None,
    }


@router.get("/status")
async def get_scheduler_status() -> Dict[str, Any]:
    if not streaming_service.airflow_dags:  # monitor has not polled yet (e.g. right after startup): poll once now
        await asyncio.to_thread(streaming_service._poll_fast)
    snap = streaming_service.snapshot()
    rows = snap["airflow"]["dags"]
    sources = {r["key"]: _source_item(r, snap["session"]["by_tier"]) for r in rows}
    active = next((r for r in rows if r.get("running")), None)
    return {
        "status": "ONLINE" if snap["airflow"]["reachable"] else "AIRFLOW_UNREACHABLE",
        "orchestrator": "Apache Airflow & RabbitMQ",
        "daemon_running": bool(snap["airflow"]["scheduler_healthy"]) and any(not r.get("paused", True) for r in rows if r["kind"] == "harvest"),
        "active_source": active["key"] if active else None,
        "active_pid": None,
        "sources": sources,
        "queue_status": {
            "status": snap["queue"]["status"], "messages_ready": snap["queue"]["ready"],
            "messages_unacknowledged": snap["queue"]["unacked"], "consumers": snap["queue"]["consumers"],
            "dead_letter_messages": snap["queue"]["dead"],
        },
    }


def _dag(source: str) -> Dict[str, str]:
    key = source.lower().strip()
    if key not in DAGS:
        raise HTTPException(status_code=400, detail=f"Unknown source: {source}")
    return {**DAGS[key], "key": key}


@router.post("/start")
async def start_scheduler(body: Optional[StartDaemonRequest] = None) -> Dict[str, Any]:
    """Unpauses the harvest DAGs so Airflow runs them on schedule."""
    for k in HARVEST_KEYS:
        await asyncio.to_thread(airflow.set_paused, DAGS[k]["dag_id"], False)
    streaming_service.add_log("INFO", "AIRFLOW", "Harvest DAGs unpaused: scheduled runs are active.")
    return {"status": "SUCCESS", "message": "Harvest DAGs are scheduled in Airflow."}


@router.post("/stop")
async def stop_scheduler(body: Optional[StopDaemonRequest] = None) -> Dict[str, Any]:
    """Pauses the harvest DAGs (optionally cancels running runs)."""
    for k in HARVEST_KEYS:
        await asyncio.to_thread(airflow.set_paused, DAGS[k]["dag_id"], True)
    cancelled = await asyncio.to_thread(airflow.cancel_running) if body and body.cancel_running else []
    streaming_service.add_log("WARN", "AIRFLOW", f"Harvest DAGs paused (cancelled {len(cancelled)} running run(s)).")
    return {"status": "SUCCESS", "message": "Harvest DAGs are paused in Airflow."}


@router.post("/toggle/{source}")
async def toggle_source(source: str, body: Optional[ToggleSourceRequest] = None) -> Dict[str, Any]:
    d = _dag(source)
    row = next((r for r in streaming_service.airflow_dags if r["key"] == d["key"]), None)
    enabled = body.enabled if (body and body.enabled is not None) else bool(row and row.get("paused", True))
    await asyncio.to_thread(airflow.set_paused, d["dag_id"], not enabled)
    streaming_service.add_log("INFO", "AIRFLOW", f"{d['name']}: {'unpaused' if enabled else 'paused'}.", tier=d["key"])
    return {"status": "SUCCESS", "source": d["key"], "message": f"{d['dag_id']} {'unpaused' if enabled else 'paused'}.", "enabled": enabled}


@router.post("/trigger/{source}")
async def trigger_source_harvest(source: str, body: Optional[TriggerRequest] = None) -> Dict[str, Any]:
    d = _dag(source)
    conf: Dict[str, Any] = {}
    if body and body.limit and d["key"] == "tier2":
        conf["target"] = int(body.limit)
    try:
        run = await asyncio.to_thread(airflow.trigger, d["dag_id"], conf)
    except requests.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Airflow rejected the trigger: {e}")
    streaming_service.add_log("INFO", "AIRFLOW", f"Manual trigger: {d['name']} {conf or ''} ({run.get('dag_run_id')}).", tier=d["key"])
    return {"status": "TRIGGERED", "source": d["key"], "dag_run_id": run.get("dag_run_id"), "message": f"{d['dag_id']} triggered in Airflow."}


@router.post("/cancel")
async def cancel_running_harvest() -> Dict[str, Any]:
    cancelled = await asyncio.to_thread(airflow.cancel_running)
    streaming_service.add_log("WARN", "AIRFLOW", f"Cancelled {len(cancelled)} running DAG run(s).")
    return {"status": "SUCCESS", "message": f"Cancelled {len(cancelled)} running DAG run(s).", "cancelled": cancelled}
