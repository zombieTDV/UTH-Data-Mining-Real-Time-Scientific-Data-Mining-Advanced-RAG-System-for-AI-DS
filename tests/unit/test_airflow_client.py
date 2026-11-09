"""Unit tests for backend/app/services/airflow_client.py verifying REST client operations,
health checks, DAG overview assembly, task XCom extraction, and pause/trigger commands.
"""
from unittest.mock import MagicMock, patch
import pytest
import requests

from backend.app.services.airflow_client import AirflowClient, DAGS


@pytest.fixture
def airflow_client():
    with patch("backend.app.services.airflow_client.settings") as mock_settings:
        mock_settings.AIRFLOW_API_URL = "http://localhost:8080/api/v1"
        mock_settings.AIRFLOW_USER = "admin"
        mock_settings.AIRFLOW_PASSWORD = "admin"
        return AirflowClient()


# ==============================================================================
# 1. Health Checks
# ==============================================================================

@pytest.mark.unit
def test_healthy_success_and_failure(airflow_client):
    with patch.object(airflow_client, "_req", return_value={"metadatabase": {"status": "healthy"}}):
        assert airflow_client.healthy() is True

    with patch.object(airflow_client, "_req", side_effect=requests.ConnectionError("Connection refused")):
        assert airflow_client.healthy() is False


@pytest.mark.unit
def test_scheduler_ok_healthy_and_unhealthy(airflow_client):
    with patch.object(airflow_client, "_req", return_value={"scheduler": {"status": "healthy"}}):
        assert airflow_client.scheduler_ok() is True

    with patch.object(airflow_client, "_req", return_value={"scheduler": {"status": "unhealthy"}}):
        assert airflow_client.scheduler_ok() is False

    with patch.object(airflow_client, "_req", side_effect=Exception("Timeout")):
        assert airflow_client.scheduler_ok() is False


# ==============================================================================
# 2. DAG Overview Assembly & 404 Handling
# ==============================================================================

@pytest.mark.unit
def test_overview_assembling_runs_and_status(airflow_client):
    def fake_req(method, path, **kwargs):
        if path == "/dags/dag_tier1_realtime_stream":
            return {"is_paused": False, "next_dagrun": "2026-10-20T12:00:00Z"}
        if path == "/dags/dag_tier1_realtime_stream/dagRuns":
            return {
                "dag_runs": [
                    {
                        "dag_run_id": "manual__2026-10-19T10:00:00",
                        "state": "running",
                        "run_type": "scheduled",
                        "start_date": "2026-10-19T10:00:00Z",
                        "end_date": None,
                    }
                ]
            }
        # For other DAGs, return empty runs
        if "/dagRuns" in path:
            return {"dag_runs": []}
        return {"is_paused": True, "next_dagrun": None}

    with patch.object(airflow_client, "_req", side_effect=fake_req):
        overview = airflow_client.overview()
        assert len(overview) == len(DAGS)
        tier1_row = next(r for r in overview if r["key"] == "tier1")
        assert tier1_row["present"] is True
        assert tier1_row["paused"] is False
        assert tier1_row["running"] is True
        assert tier1_row["last_run"]["state"] == "running"
        assert tier1_row["last_run"]["run_id"] == "manual__2026-10-19T10:00:00"


@pytest.mark.unit
def test_overview_handles_404_not_found(airflow_client):
    err_resp = MagicMock()
    err_resp.status_code = 404
    http_err = requests.HTTPError(response=err_resp)

    with patch.object(airflow_client, "_req", side_effect=http_err):
        overview = airflow_client.overview()
        assert len(overview) == len(DAGS)
        for row in overview:
            assert row["present"] is False
            assert row["paused"] is True
            assert row["running"] is False
            assert row["last_run"] is None


# ==============================================================================
# 3. Task XCom Extraction
# ==============================================================================

@pytest.mark.unit
def test_task_return_value_matching_prefix(airflow_client):
    def fake_req(method, path, **kwargs):
        if "taskInstances" in path and "xcomEntries" not in path:
            return {
                "task_instances": [
                    {"task_id": "setup_dirs"},
                    {"task_id": "harvest_papers_task"},
                ]
            }
        if "xcomEntries/return_value" in path:
            return {"value": {"papers_harvested": 42, "bytes_saved": 1048576}}
        return {}

    with patch.object(airflow_client, "_req", side_effect=fake_req):
        val = airflow_client.task_return_value("dag_tier1_realtime_stream", "run_1")
        assert val == {"papers_harvested": 42, "bytes_saved": 1048576}


# ==============================================================================
# 4. Mutations: Pause, Trigger, and Cancel
# ==============================================================================

@pytest.mark.unit
def test_set_paused_sends_patch(airflow_client):
    with patch.object(airflow_client, "_req") as mock_req:
        airflow_client.set_paused("dag_tier1_realtime_stream", paused=True)
        mock_req.assert_called_once_with(
            "PATCH",
            "/dags/dag_tier1_realtime_stream",
            json={"is_paused": True},
        )


@pytest.mark.unit
def test_trigger_sends_post_with_conf(airflow_client):
    with patch.object(airflow_client, "_req", return_value={"dag_run_id": "run_triggered"}) as mock_req:
        res = airflow_client.trigger("dag_tier2_near_past_harvest", conf={"batch_limit": 50})
        assert res["dag_run_id"] == "run_triggered"
        mock_req.assert_called_once_with(
            "POST",
            "/dags/dag_tier2_near_past_harvest/dagRuns",
            json={"conf": {"batch_limit": 50}},
        )


@pytest.mark.unit
def test_cancel_running_cancels_all_active_runs(airflow_client):
    def fake_req(method, path, **kwargs):
        if method == "GET" and "/dagRuns" in path:
            return {
                "dag_runs": [
                    {"dag_run_id": "run_to_cancel_1"},
                ]
            }
        return {}

    with patch.object(airflow_client, "_req", side_effect=fake_req) as mock_req:
        cancelled = airflow_client.cancel_running()
        assert len(cancelled) == len(DAGS)
        assert any("run_to_cancel_1" in c for c in cancelled)
