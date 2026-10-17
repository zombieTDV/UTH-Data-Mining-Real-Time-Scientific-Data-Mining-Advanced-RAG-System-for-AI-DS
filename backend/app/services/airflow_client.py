"""Thin client for the Apache Airflow REST API (DAG state, pause/unpause, trigger, cancel).

Credentials and URL come from the backend settings (.env). Calls are synchronous with a short timeout; run them in
a worker thread from async code.
"""

import logging
from typing import Any, Dict, List, Optional

import requests

from backend.app.core.config import settings

logger = logging.getLogger("airflow_client")

# key (used by the dashboard) -> DAG metadata
DAGS: Dict[str, Dict[str, str]] = {
    "tier1": {"dag_id": "dag_tier1_realtime_stream", "name": "Tier 1: Live Real-Time Stream (arXiv)", "frequency": "Daily 04:50 ICT", "kind": "harvest"},
    "tier2": {"dag_id": "dag_tier2_near_past_harvest", "name": "Tier 2: Near-Past, newest to oldest (arXiv)", "frequency": "Daily 05:00 ICT (10 min after Tier 1)", "kind": "harvest"},
    "compact_silver": {"dag_id": "dag_compact_silver", "name": "Silver compaction", "frequency": "Daily 03:00 ICT", "kind": "maintenance"},
    "mining": {"dag_id": "dag_recompute_mining", "name": "Mining recompute", "frequency": "Weekly Sun 00:00 UTC", "kind": "maintenance"},
}


class AirflowClient:
    def __init__(self):
        self.base = settings.AIRFLOW_API_URL.rstrip("/")
        self.auth = (settings.AIRFLOW_USER, settings.AIRFLOW_PASSWORD)

    def _req(self, method: str, path: str, **kw) -> Any:
        r = requests.request(method, f"{self.base}{path}", auth=self.auth, timeout=kw.pop("timeout", 4), **kw)
        r.raise_for_status()
        return r.json() if r.content else {}

    def healthy(self) -> bool:
        try:
            self._req("GET", "/health")
            return True
        except Exception:
            return False

    def scheduler_ok(self) -> bool:
        try:
            return self._req("GET", "/health").get("scheduler", {}).get("status") == "healthy"
        except Exception:
            return False

    def overview(self) -> List[Dict[str, Any]]:
        """One row per dashboard DAG: pause flag, schedule, next run, and the latest run."""
        rows = []
        for key, meta in DAGS.items():
            dag_id = meta["dag_id"]
            row: Dict[str, Any] = {"key": key, "dag_id": dag_id, "name": meta["name"], "frequency": meta["frequency"], "kind": meta["kind"], "present": True}
            try:
                dag = self._req("GET", f"/dags/{dag_id}")
                runs = self._req("GET", f"/dags/{dag_id}/dagRuns", params={"order_by": "-start_date", "limit": 2}).get("dag_runs", [])
                last = runs[0] if runs else None
                row.update({
                    "paused": bool(dag.get("is_paused")),
                    "next_run": dag.get("next_dagrun"),
                    "last_run": ({
                        "run_id": last["dag_run_id"], "state": last["state"], "run_type": last["run_type"],
                        "start": last.get("start_date"), "end": last.get("end_date"),
                    } if last else None),
                    "running": any(r["state"] in ("running", "queued") for r in runs),
                })
            except requests.HTTPError as e:
                row.update({"present": e.response is None or e.response.status_code != 404, "paused": True, "last_run": None, "running": False, "error": str(e)})
            rows.append(row)
        return rows

    def task_return_value(self, dag_id: str, run_id: str) -> Optional[Any]:
        try:
            tis = self._req("GET", f"/dags/{dag_id}/dagRuns/{run_id}/taskInstances").get("task_instances", [])
            for ti in tis:
                if ti["task_id"].startswith("harvest") or ti["task_id"].startswith("compact") or ti["task_id"].startswith("trigger"):
                    x = self._req("GET", f"/dags/{dag_id}/dagRuns/{run_id}/taskInstances/{ti['task_id']}/xcomEntries/return_value")
                    return x.get("value")
        except Exception:
            return None
        return None

    def set_paused(self, dag_id: str, paused: bool) -> None:
        self._req("PATCH", f"/dags/{dag_id}", json={"is_paused": paused})

    def trigger(self, dag_id: str, conf: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return self._req("POST", f"/dags/{dag_id}/dagRuns", json={"conf": conf or {}})

    def cancel_running(self) -> List[str]:
        cancelled = []
        for meta in DAGS.values():
            for r in self._req("GET", f"/dags/{meta['dag_id']}/dagRuns", params={"state": "running", "limit": 10}).get("dag_runs", []):
                self._req("PATCH", f"/dags/{meta['dag_id']}/dagRuns/{r['dag_run_id']}", json={"state": "failed"})
                cancelled.append(f"{meta['dag_id']}:{r['dag_run_id']}")
        return cancelled


airflow = AirflowClient()
