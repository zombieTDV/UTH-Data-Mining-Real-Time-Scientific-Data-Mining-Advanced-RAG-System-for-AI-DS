"""Adaptive Harvester Scheduler for Multi-Source Scientific Lakehouse.

Coordinates and schedules real-time & adaptive ingestion across 4 academic sources:
1. arXiv:       Daily at 07:30 VN (OAI-PMH preprint batch ingestion).
2. OpenReview:  Every 4 Hours (Conference peer reviews & rebuttal updates).
3. OpenAlex:    Daily at 02:00 VN (Global citation graph & concept enrichment).
4. CVF:         Weekly on Monday 09:00 VN (CVPR & ICCV conference proceedings).

Maintains persistent scheduler checkpoint in data/lakehouse/scheduler_state.json.
Provides full lifecycle controls:
- Turn ON / Turn OFF scheduler daemon globally.
- Toggle Enable / Disable individual data sources.
- Cancel / Abort active crawling subprocesses gracefully.

Usage:
    python -m src.scheduler.adaptive_scheduler --status
    python -m src.scheduler.adaptive_scheduler --toggle arxiv
    python -m src.scheduler.adaptive_scheduler --trigger arxiv
    python -m src.scheduler.adaptive_scheduler --trigger all --sync-r2
    python -m src.scheduler.adaptive_scheduler --daemon
"""

import argparse
import asyncio
import datetime
import json
import logging
import os
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from tabulate import tabulate

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config.settings import settings
from src.utils.logger import setup_pipeline_logging

logger, log_file = setup_pipeline_logging("adaptive_scheduler")


SCHEDULE_CONFIGS = {
    "arxiv": {
        "name": "arXiv Preprints (OAI-PMH)",
        "frequency": "Daily at 00:18 VN (17:18 UTC)",
        "cron_hour": 0,
        "cron_minute": 18,
        "default_limit": 200,
        "description": "Harvests daily preprint releases across cs.AI, cs.LG, cs.CV",
    },
    "openreview": {
        "name": "OpenReview Peer Reviews",
        "frequency": "Daily at 00:18 VN (17:18 UTC)",
        "cron_hour": 0,
        "cron_minute": 18,
        "default_limit": 100,
        "description": "Harvests conference review threads and rebuttal scores (ICLR, NeurIPS)",
    },
    "openalex": {
        "name": "OpenAlex Citation Graph",
        "frequency": "Daily at 00:18 VN (17:18 UTC)",
        "cron_hour": 0,
        "cron_minute": 18,
        "default_limit": 150,
        "description": "Harvests global metadata and citation graph with reconstructed abstracts",
    },
    "cvf": {
        "name": "CVF Open Access (CVPR / ICCV)",
        "frequency": "Daily at 00:18 VN (17:18 UTC)",
        "cron_hour": 0,
        "cron_minute": 18,
        "default_limit": 100,
        "description": "Harvests proceedings papers from CVPR & ICCV Open Access",
    },
}


class AdaptiveHarvesterScheduler:
    """Manages adaptive scheduling, controls (ON/OFF), state persistence, and subprocess execution."""

    def __init__(self, state_file: Optional[Path] = None):
        self.state_file = state_file or (settings.ROOT_DIR / "data" / "lakehouse" / "scheduler_state.json")
        self.state_file.parent.mkdir(parents=True, exist_ok=True)

        # In-memory runtime execution tracking
        self.is_daemon_running: bool = False
        self._stop_event = threading.Event()
        self._daemon_task: Optional[asyncio.Task] = None
        self._daemon_thread: Optional[threading.Thread] = None

        self.active_proc: Optional[subprocess.Popen] = None
        self.active_source: Optional[str] = None
        self._lock = threading.Lock()

        self.state: Dict[str, Any] = self._load_state()

    def _load_state(self) -> Dict[str, Any]:
        """Loads persistent scheduler state from JSON file or initializes defaults."""
        default_state: Dict[str, Any] = {
            "_meta": {
                "daemon_running": False,
                "current_running_source": None,
                "updated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            }
        }
        now = datetime.datetime.now()
        for key, cfg in SCHEDULE_CONFIGS.items():
            default_state[key] = {
                "key": key,
                "name": cfg["name"],
                "frequency": cfg["frequency"],
                "enabled": True,
                "status": "IDLE",
                "last_run": None,
                "next_run": self._calculate_next_run(key, now).strftime("%Y-%m-%d %H:%M:%S"),
                "last_duration_s": 0.0,
                "total_papers_harvested": 0,
                "last_error": None,
            }

        if self.state_file.exists():
            try:
                with open(self.state_file, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                    for key, cfg in SCHEDULE_CONFIGS.items():
                        if key in loaded and isinstance(loaded[key], dict):
                            default_state[key].update(loaded[key])
                            default_state[key]["frequency"] = cfg["frequency"]
                            default_state[key]["name"] = cfg["name"]
                            if "enabled" not in default_state[key]:
                                default_state[key]["enabled"] = True

                            # Check if saved next_run matches current cron schedule
                            next_run_str = default_state[key].get("next_run")
                            needs_recalc = False
                            if not next_run_str:
                                needs_recalc = True
                            else:
                                try:
                                    nr_dt = datetime.datetime.strptime(next_run_str, "%Y-%m-%d %H:%M:%S")
                                    if "cron_hour" in cfg and (nr_dt.hour != cfg["cron_hour"] or nr_dt.minute != cfg.get("cron_minute", 0)):
                                        needs_recalc = True
                                except ValueError:
                                    needs_recalc = True
                            if needs_recalc:
                                default_state[key]["next_run"] = self._calculate_next_run(key, now).strftime("%Y-%m-%d %H:%M:%S")

                    if "_meta" in loaded and isinstance(loaded["_meta"], dict):
                        default_state["_meta"].update(loaded["_meta"])
                    return default_state
            except Exception as e:
                logger.warning("[SCHEDULER] Error loading state file: %s. Re-initializing.", e)

        self._save_state(default_state)
        return default_state

    def _save_state(self, state: Optional[Dict[str, Any]] = None):
        """Persists scheduler state to disk."""
        target = state or self.state
        if "_meta" in target:
            target["_meta"]["daemon_running"] = self.is_daemon_running
            target["_meta"]["current_running_source"] = self.active_source
            target["_meta"]["updated_at"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        try:
            with open(self.state_file, "w", encoding="utf-8") as f:
                json.dump(target, f, indent=2)
        except Exception as e:
            logger.error("[SCHEDULER] Failed to save state to %s: %s", self.state_file, e)

    def _calculate_next_run(self, key: str, from_dt: datetime.datetime) -> datetime.datetime:
        """Calculates the next upcoming scheduled timestamp for a given source."""
        cfg = SCHEDULE_CONFIGS.get(key, {})
        if "interval_hours" in cfg:
            interval = cfg["interval_hours"]
            current_hour = from_dt.hour
            next_hour = ((current_hour // interval) + 1) * interval
            if next_hour >= 24:
                return from_dt.replace(hour=0, minute=0, second=0, microsecond=0) + datetime.timedelta(days=1)
            return from_dt.replace(hour=next_hour, minute=0, second=0, microsecond=0)

        elif "cron_weekday" in cfg:
            target_weekday = cfg["cron_weekday"]
            target_hour = cfg["cron_hour"]
            target_minute = cfg["cron_minute"]
            days_ahead = (target_weekday - from_dt.weekday()) % 7
            candidate = from_dt.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0) + datetime.timedelta(days=days_ahead)
            if candidate <= from_dt:
                candidate += datetime.timedelta(days=7)
            return candidate

        else:
            target_hour = cfg.get("cron_hour", 7)
            target_minute = cfg.get("cron_minute", 30)
            candidate = from_dt.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0)
            if candidate <= from_dt:
                candidate += datetime.timedelta(days=1)
            return candidate

    @property
    def is_running(self) -> bool:
        return self.active_proc is not None and self.active_proc.poll() is None

    def get_status(self) -> Dict[str, Any]:
        """Returns the current snapshot of all 4 scheduled ingestion sources and daemon state."""
        disk_state = self._load_state()
        for k in SCHEDULE_CONFIGS:
            if k in disk_state:
                if self.state.get(k, {}).get("status") != "RUNNING":
                    self.state[k] = disk_state[k]

        sources: Dict[str, Any] = {}
        now = datetime.datetime.now()
        for key in SCHEDULE_CONFIGS:
            if key not in self.state:
                cfg = SCHEDULE_CONFIGS[key]
                self.state[key] = {
                    "key": key,
                    "name": cfg["name"],
                    "frequency": cfg["frequency"],
                    "enabled": True,
                    "status": "IDLE",
                    "last_run": None,
                    "next_run": self._calculate_next_run(key, now).strftime("%Y-%m-%d %H:%M:%S"),
                    "last_duration_s": 0.0,
                    "total_papers_harvested": 0,
                    "last_error": None,
                }
            sources[key] = self.state[key]

        return {
            "daemon_running": self.is_daemon_running,
            "active_source": self.active_source,
            "active_pid": self.active_proc.pid if self.is_running else None,
            "sources": sources,
            "configs": SCHEDULE_CONFIGS,
        }

    def print_status_table(self):
        """Displays formatted CLI table of scheduler state and controls."""
        st = self.get_status()
        rows = []
        daemon_badge = "🟢 RUNNING" if st["daemon_running"] else "⚪ STOPPED"
        active_badge = f"🔵 {st['active_source']} (PID {st['active_pid']})" if st["active_source"] else "None (IDLE)"

        print("\n" + "=" * 85)
        print(f"  ADAPTIVE HARVESTER SCHEDULER CONTROLLER")
        print(f"  Daemon Loop: {daemon_badge} | Active Task: {active_badge}")
        print("=" * 85)

        for key, item in st["sources"].items():
            status_symbol = {
                "IDLE": "⚪ IDLE",
                "RUNNING": "🔵 RUNNING",
                "SUCCESS": "🟢 SUCCESS",
                "ERROR": "🔴 ERROR",
                "CANCELLED": "🟡 CANCELLED",
            }.get(item.get("status", "IDLE"), item.get("status"))

            enabled_badge = "🟢 ON" if item.get("enabled", True) else "🔴 OFF"

            rows.append([
                key.upper(),
                item.get("name"),
                item.get("frequency"),
                enabled_badge,
                status_symbol,
                item.get("last_run") or "Never",
                item.get("next_run") or "N/A",
                f"{item.get('total_papers_harvested', 0):,} papers",
            ])

        headers = ["Source", "Name", "Schedule Policy", "Switch", "Status", "Last Run", "Next Run", "Harvested"]
        print(tabulate(rows, headers=headers, tablefmt="fancy_grid") + "\n")

    def toggle_source(self, source: str, enabled: Optional[bool] = None) -> Dict[str, Any]:
        """Turns ON or OFF crawling for a specific source (or all sources)."""
        source_key = source.lower().strip()
        with self._lock:
            if source_key == "all":
                target_state = (not self.state["arxiv"].get("enabled", True)) if enabled is None else bool(enabled)
                for s in SCHEDULE_CONFIGS:
                    if s in self.state:
                        self.state[s]["enabled"] = target_state
                self._save_state()
                action_text = "ENABLED" if target_state else "DISABLED"
                logger.info("[SCHEDULER] Set ALL sources to %s", action_text)
                return {"source": "all", "enabled": target_state, "message": f"All sources are now {action_text}."}

            if source_key not in SCHEDULE_CONFIGS:
                raise ValueError(f"Unknown source '{source}'. Valid options: {list(SCHEDULE_CONFIGS.keys())} or 'all'")

            current = self.state.get(source_key, {}).get("enabled", True)
            target_state = (not current) if enabled is None else bool(enabled)
            self.state[source_key]["enabled"] = target_state
            self._save_state()

            action_text = "ENABLED (BẬT)" if target_state else "DISABLED (TẮT)"
            logger.info("[SCHEDULER] Source '%s' toggled to %s", source_key, action_text)
            return {
                "source": source_key,
                "enabled": target_state,
                "message": f"Crawling for '{source_key.upper()}' is now {action_text}.",
            }

    def cancel_current_task(self) -> Dict[str, Any]:
        """Immediately cancels and kills the currently executing crawling process."""
        with self._lock:
            if self.active_proc is not None and self.active_proc.poll() is None:
                source = self.active_source or "unknown"
                pid = self.active_proc.pid
                logger.warning(f"[SCHEDULER] Terminating crawling subprocess for {source.upper()} (PID: {pid})...")
                try:
                    self.active_proc.terminate()
                    try:
                        self.active_proc.wait(timeout=4)
                    except subprocess.TimeoutExpired:
                        logger.warning(f"[SCHEDULER] PID {pid} didn't stop in 4s. Forcing SIGKILL...")
                        self.active_proc.kill()
                        self.active_proc.wait()
                except Exception as e:
                    logger.error(f"[SCHEDULER] Error while cancelling process {pid}: {e}")

                if source in self.state:
                    self.state[source]["status"] = "CANCELLED"
                    self.state[source]["last_error"] = "Cancelled by user"
                    self._save_state()

                self.active_proc = None
                self.active_source = None
                return {
                    "status": "CANCELLED",
                    "source": source,
                    "pid": pid,
                    "message": f"Active crawling job for '{source.upper()}' has been terminated.",
                }

            return {
                "status": "NO_ACTIVE_TASK",
                "message": "No crawling pipeline is currently running.",
            }

    def start_daemon(self, interval_seconds: int = 30) -> Dict[str, Any]:
        """Starts the background automated scheduler daemon loop."""
        if self.is_daemon_running:
            return {
                "status": "ALREADY_RUNNING",
                "message": "Adaptive harvester scheduler daemon is already active.",
                "interval_seconds": interval_seconds,
            }

        self.is_daemon_running = True
        self._stop_event.clear()

        try:
            loop = asyncio.get_running_loop()
            self._daemon_task = loop.create_task(self.async_daemon_loop(interval_seconds))
            logger.info("[SCHEDULER] Daemon loop started as async background task.")
        except RuntimeError:
            self._daemon_thread = threading.Thread(
                target=self.run_daemon,
                kwargs={"check_interval_seconds": interval_seconds},
                daemon=True,
            )
            self._daemon_thread.start()
            logger.info("[SCHEDULER] Daemon loop started as background worker thread.")

        self._save_state()
        return {
            "status": "STARTED",
            "message": f"Adaptive Harvester Scheduler started (BẬT cào tự động). Interval: {interval_seconds}s.",
            "interval_seconds": interval_seconds,
        }

    def stop_daemon(self, cancel_running: bool = False) -> Dict[str, Any]:
        """Stops the automated scheduler daemon loop (TẮT cào tự động)."""
        was_running = self.is_daemon_running
        self.is_daemon_running = False
        self._stop_event.set()

        if self._daemon_task and not self._daemon_task.done():
            self._daemon_task.cancel()
            self._daemon_task = None

        cancelled_info = None
        if cancel_running and self.is_running:
            cancelled_info = self.cancel_current_task()

        self._save_state()
        return {
            "status": "STOPPED",
            "message": "Adaptive Harvester Scheduler stopped (TẮT cào tự động).",
            "was_active": was_running,
            "cancelled_running_task": cancelled_info,
        }

    async def async_daemon_loop(self, check_interval_seconds: int = 30):
        """Asynchronous daemon runner checking schedule triggers inside FastAPI."""
        logger.info("[DAEMON] Started async scheduler loop (interval=%ss)", check_interval_seconds)
        try:
            while self.is_daemon_running and not self._stop_event.is_set():
                now = datetime.datetime.now()
                now_str = now.strftime("%Y-%m-%d %H:%M:%S")

                disk_state = self._load_state()
                for k in SCHEDULE_CONFIGS:
                    if k in disk_state and self.state.get(k, {}).get("status") != "RUNNING":
                        self.state[k] = disk_state[k]

                for source_key in SCHEDULE_CONFIGS:
                    if not self.is_daemon_running or self._stop_event.is_set():
                        break

                    item = self.state.get(source_key, {})
                    if not item.get("enabled", True):
                        continue

                    next_run_str = item.get("next_run")
                    if next_run_str:
                        try:
                            next_run_dt = datetime.datetime.strptime(next_run_str, "%Y-%m-%d %H:%M:%S")
                        except ValueError:
                            next_run_dt = now

                        if now >= next_run_dt and item.get("status") != "RUNNING" and not self.is_running:
                            logger.info("[DAEMON] Schedule triggered for %s at %s. Launching pipeline...", source_key.upper(), now_str)
                            loop = asyncio.get_running_loop()
                            await loop.run_in_executor(None, self.trigger_source, source_key, None, True, False)
                            self.state[source_key]["next_run"] = self._calculate_next_run(source_key, datetime.datetime.now()).strftime("%Y-%m-%d %H:%M:%S")
                            self._save_state()

                for _ in range(max(1, check_interval_seconds)):
                    if not self.is_daemon_running or self._stop_event.is_set():
                        break
                    await asyncio.sleep(1)

        except asyncio.CancelledError:
            logger.info("[DAEMON] Scheduler async task received cancellation.")
        except Exception as e:
            logger.error("[DAEMON] Error in scheduler loop: %s", e, exc_info=True)
        finally:
            self.is_daemon_running = False
            self._save_state()
            logger.info("[DAEMON] Scheduler loop terminated.")

    def run_daemon(self, check_interval_seconds: int = 30):
        """Synchronous foreground daemon loop for CLI invocation."""
        self.is_daemon_running = True
        self._stop_event.clear()

        print("\n" + "=" * 80)
        print("ADAPTIVE HARVESTER DAEMON STARTED (FOREGROUND)")
        print("Watching 4 Academic Sources on Smart Adaptive Schedule:")
        for k, c in SCHEDULE_CONFIGS.items():
            en = "ON" if self.state.get(k, {}).get("enabled", True) else "OFF"
            print(f"  • {k.upper():<12} : {c['frequency']} [{en}]")
        print(f"Check Interval: every {check_interval_seconds}s | Press CTRL+C to stop.")
        print("=" * 80)

        try:
            while self.is_daemon_running and not self._stop_event.is_set():
                now = datetime.datetime.now()
                now_str = now.strftime("%Y-%m-%d %H:%M:%S")

                for source_key in SCHEDULE_CONFIGS:
                    if not self.is_daemon_running or self._stop_event.is_set():
                        break

                    item = self.state.get(source_key, {})
                    if not item.get("enabled", True):
                        continue

                    next_run_str = item.get("next_run")
                    if next_run_str:
                        try:
                            next_run_dt = datetime.datetime.strptime(next_run_str, "%Y-%m-%d %H:%M:%S")
                        except ValueError:
                            next_run_dt = now

                        if now >= next_run_dt and item.get("status") != "RUNNING" and not self.is_running:
                            print(f"\n[DAEMON] Scheduled time reached for {source_key.upper()} ({now_str}). Triggering...")
                            self.trigger_source(source_key, sync_r2=True)
                            self.state[source_key]["next_run"] = self._calculate_next_run(source_key, datetime.datetime.now()).strftime("%Y-%m-%d %H:%M:%S")
                            self._save_state()

                for _ in range(max(1, check_interval_seconds)):
                    if not self.is_daemon_running or self._stop_event.is_set():
                        break
                    time.sleep(1)

        except KeyboardInterrupt:
            print("\n[DAEMON] Stopping daemon cleanly.")
        finally:
            self.stop_daemon()

    def trigger_source(
        self,
        source: str,
        limit: Optional[int] = None,
        sync_r2: bool = True,
        force: bool = False,
    ) -> Dict[str, Any]:
        """Executes an ingestion pipeline for a given source, tracking subprocess lifecycle."""
        source_key = source.lower().strip()
        if source_key not in SCHEDULE_CONFIGS and source_key != "all":
            raise ValueError(f"Unknown source '{source}'. Available: {list(SCHEDULE_CONFIGS.keys())} or 'all'")

        if source_key == "all":
            results = {}
            for s in SCHEDULE_CONFIGS:
                results[s] = self.trigger_source(s, limit=limit, sync_r2=sync_r2, force=force)
            return results

        cfg = SCHEDULE_CONFIGS[source_key]
        target_limit = limit or cfg["default_limit"]

        # Check if source is enabled
        is_enabled = self.state.get(source_key, {}).get("enabled", True)
        if not is_enabled and not force:
            logger.warning("[SCHEDULER] Source %s is DISABLED. Skipping harvest.", source_key.upper())
            return {
                "status": "DISABLED",
                "source": source_key,
                "message": f"Source '{source_key.upper()}' is currently DISABLED (TẮT). Toggle it ON or pass force=True.",
            }

        # Check if already busy
        if self.is_running:
            return {
                "status": "BUSY",
                "source": source_key,
                "message": f"Another pipeline is currently executing: {self.active_source} (PID: {self.active_proc.pid}).",
            }

        start_time = time.time()
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        print("\n" + "=" * 80)
        print(f"[SCHEDULER TRIGGER] Launching: {cfg['name'].upper()} (Target: {target_limit} papers)")
        print("=" * 80)

        with self._lock:
            self.state[source_key]["status"] = "RUNNING"
            self.state[source_key]["last_run"] = now_str
            self.state[source_key]["last_error"] = None
            self.active_source = source_key
            self._save_state()

        cmd = [sys.executable, "-m"]
        if source_key == "arxiv":
            cmd.extend(["src.pipelines.run_master_pipeline", "--target-papers", str(target_limit), "--enrich-html-limit", "20", "--gold-limit", "50"])
        elif source_key == "openreview":
            cmd.extend(["src.pipelines.run_openreview_end_to_end", "--limit", str(target_limit), "--venue", "ALL"])
            if sync_r2:
                cmd.append("--sync-r2")
        elif source_key == "openalex":
            cmd.extend(["src.pipelines.run_openalex_end_to_end", "--limit", str(target_limit)])
            if sync_r2:
                cmd.append("--sync-r2")
        elif source_key == "cvf":
            cmd.extend(["src.pipelines.run_cvf_end_to_end", "--limit", str(target_limit), "--venue", "cvpr2024"])
            if sync_r2:
                cmd.append("--sync-r2")

        logger.info("[SCHEDULER] Spawning command: %s", " ".join(cmd))
        try:
            self.active_proc = subprocess.Popen(cmd, cwd=str(settings.ROOT_DIR), text=True)
            ret_code = self.active_proc.wait()
            duration = round(time.time() - start_time, 2)

            with self._lock:
                self.active_proc = None
                self.active_source = None

                # Check if process was cancelled
                if self.state[source_key].get("status") == "CANCELLED":
                    logger.warning("[SCHEDULER] Pipeline for %s was CANCELLED after %ss.", source_key, duration)
                    return {"status": "CANCELLED", "source": source_key, "duration_s": duration}

                if ret_code == 0:
                    print(f"[SCHEDULER] [SUCCESS] Pipeline for {source_key.upper()} completed in {duration}s!")
                    self.state[source_key]["status"] = "SUCCESS"
                    self.state[source_key]["last_duration_s"] = duration
                    self.state[source_key]["total_papers_harvested"] += target_limit
                    self.state[source_key]["last_error"] = None
                    self.state[source_key]["next_run"] = self._calculate_next_run(source_key, datetime.datetime.now()).strftime("%Y-%m-%d %H:%M:%S")
                    self._save_state()
                    return {"status": "SUCCESS", "source": source_key, "duration_s": duration, "papers": target_limit}
                else:
                    err_msg = f"Process exited with non-zero code {ret_code}"
                    logger.error("[SCHEDULER] Pipeline failed for %s: %s", source_key, err_msg)
                    self.state[source_key]["status"] = "ERROR"
                    self.state[source_key]["last_error"] = err_msg
                    self._save_state()
                    return {"status": "ERROR", "source": source_key, "error": err_msg}

        except Exception as e:
            duration = round(time.time() - start_time, 2)
            err_msg = str(e)
            logger.error("[SCHEDULER] Exception during %s: %s", source_key, err_msg)
            with self._lock:
                self.active_proc = None
                self.active_source = None
                self.state[source_key]["status"] = "ERROR"
                self.state[source_key]["last_error"] = err_msg
                self._save_state()
            return {"status": "ERROR", "source": source_key, "error": err_msg}


# Global singleton instance
scheduler_instance = AdaptiveHarvesterScheduler()


def main():
    parser = argparse.ArgumentParser(description="Adaptive Multi-Source Harvester Orchestrator & Scheduler.")
    parser.add_argument("--status", action="store_true", help="Print status and schedule of all 4 sources.")
    parser.add_argument("--trigger", type=str, default=None, help="Trigger immediate harvest for a source (arxiv, openreview, openalex, cvf, all).")
    parser.add_argument("--limit", type=int, default=None, help="Override target paper count for triggered job.")
    parser.add_argument("--sync-r2", action="store_true", default=True, help="Synchronize results to Cloudflare R2.")
    parser.add_argument("--daemon", action="store_true", help="Run foreground daemon scheduler loop.")
    parser.add_argument("--interval", type=int, default=30, help="Daemon loop check interval in seconds (default: 30s).")
    parser.add_argument("--toggle", type=str, default=None, help="Toggle ON/OFF for a source (arxiv, openreview, openalex, cvf, all).")
    parser.add_argument("--enable", action="store_true", help="Explicitly enable the toggled source.")
    parser.add_argument("--disable", action="store_true", help="Explicitly disable the toggled source.")
    parser.add_argument("--start", action="store_true", help="Start the scheduler daemon in background.")
    parser.add_argument("--stop", action="store_true", help="Stop the scheduler daemon.")
    parser.add_argument("--cancel", action="store_true", help="Cancel any currently active harvesting task.")
    args = parser.parse_args()

    scheduler = scheduler_instance

    if args.toggle:
        desired_state = True if args.enable else (False if args.disable else None)
        res = scheduler.toggle_source(args.toggle, enabled=desired_state)
        print(f"[TOGGLE] {res['message']}")
        scheduler.print_status_table()
        return

    if args.cancel:
        res = scheduler.cancel_current_task()
        print(f"[CANCEL] {res['message']}")
        return

    if args.start:
        res = scheduler.start_daemon(interval_seconds=args.interval)
        print(f"[START] {res['message']}")
        scheduler.print_status_table()
        return

    if args.stop:
        res = scheduler.stop_daemon(cancel_running=True)
        print(f"[STOP] {res['message']}")
        scheduler.print_status_table()
        return

    if args.trigger:
        scheduler.trigger_source(args.trigger, limit=args.limit, sync_r2=args.sync_r2, force=True)
        scheduler.print_status_table()
        return

    if args.daemon:
        scheduler.run_daemon(check_interval_seconds=args.interval)
        return

    # Default action: show status table
    scheduler.print_status_table()


if __name__ == "__main__":
    main()
