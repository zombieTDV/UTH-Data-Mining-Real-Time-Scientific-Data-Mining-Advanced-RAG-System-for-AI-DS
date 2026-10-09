"""Integration tests for AdaptiveHarvesterScheduler lifecycle & state management."""
import pytest
from src.scheduler.adaptive_scheduler import (
    AdaptiveHarvesterScheduler,
    SCHEDULE_CONFIGS,
)


@pytest.fixture
def scheduler(tmp_path):
    state_file = tmp_path / "test_scheduler_state.json"
    sched = AdaptiveHarvesterScheduler(state_file=state_file)
    yield sched
    sched.stop_daemon(cancel_running=True)


@pytest.mark.integration
def test_scheduler_initial_status(scheduler):
    status = scheduler.get_status()
    assert "daemon_running" in status
    assert status["daemon_running"] is False
    assert status["active_source"] is None
    assert "sources" in status
    for s in ["arxiv", "openreview", "openalex", "cvf"]:
        assert s in status["sources"]
        assert "enabled" in status["sources"][s]
        assert "next_run" in status["sources"][s]


@pytest.mark.integration
def test_scheduler_toggle_source(scheduler):
    # Toggle single source to False
    res = scheduler.toggle_source("arxiv", enabled=False)
    assert res["source"] == "arxiv"
    assert res["enabled"] is False

    st = scheduler.get_status()
    assert st["sources"]["arxiv"]["enabled"] is False

    # Toggle back to True
    res2 = scheduler.toggle_source("arxiv", enabled=True)
    assert res2["enabled"] is True
    st2 = scheduler.get_status()
    assert st2["sources"]["arxiv"]["enabled"] is True

    # Invert toggle (None)
    res3 = scheduler.toggle_source("arxiv", enabled=None)
    assert res3["enabled"] is False


@pytest.mark.integration
def test_scheduler_toggle_all_sources(scheduler):
    res = scheduler.toggle_source("all", enabled=False)
    assert res["source"] == "all"
    assert res["enabled"] is False

    st = scheduler.get_status()
    for s in SCHEDULE_CONFIGS:
        assert st["sources"][s]["enabled"] is False

    # Toggle all back to True
    res2 = scheduler.toggle_source("all", enabled=True)
    assert res2["enabled"] is True
    st2 = scheduler.get_status()
    for s in SCHEDULE_CONFIGS:
        assert st2["sources"][s]["enabled"] is True


@pytest.mark.integration
def test_scheduler_invalid_source_toggle(scheduler):
    with pytest.raises(ValueError, match="Unknown source"):
        scheduler.toggle_source("invalid_source")


@pytest.mark.integration
def test_scheduler_daemon_lifecycle(scheduler):
    # Start daemon
    res_start = scheduler.start_daemon(interval_seconds=10)
    assert res_start["status"] == "STARTED"
    assert scheduler.is_daemon_running is True

    # Starting again should report ALREADY_RUNNING
    res_start2 = scheduler.start_daemon(interval_seconds=10)
    assert res_start2["status"] == "ALREADY_RUNNING"

    # Stop daemon
    res_stop = scheduler.stop_daemon(cancel_running=False)
    assert res_stop["status"] == "STOPPED"
    assert scheduler.is_daemon_running is False

    # Stopping again should report was_active=False
    res_stop2 = scheduler.stop_daemon(cancel_running=False)
    assert res_stop2["status"] == "STOPPED"
    assert res_stop2["was_active"] is False


@pytest.mark.integration
def test_scheduler_cancel_without_active_proc(scheduler):
    res = scheduler.cancel_current_task()
    assert res["status"] in ["NOT_RUNNING", "NO_ACTIVE_TASK"]
