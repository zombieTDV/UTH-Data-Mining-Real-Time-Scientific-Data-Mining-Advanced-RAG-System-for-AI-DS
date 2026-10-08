"""Adaptive Harvester Scheduler for Multi-Source Scientific Lakehouse.

Coordinates and schedules real-time & adaptive ingestion across 4 academic sources:
1. arXiv:       Daily at 07:30 VN (OAI-PMH preprint batch ingestion).
2. OpenReview:  Every 4 Hours (Conference peer reviews & rebuttal updates).
3. OpenAlex:    Daily at 02:00 VN (Global citation graph & concept enrichment).
4. CVF:         Weekly on Monday 09:00 VN (CVPR & ICCV conference proceedings).

Maintains persistent scheduler checkpoint in data/lakehouse/scheduler_state.json.
Emits live telemetry pulses to Frontend Flow Canvas & Storage Inspector.

Usage:
    python -m src.scheduler.adaptive_scheduler --status
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
import subprocess
import sys
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
        "frequency": "Daily at 07:30 VN (00:30 UTC)",
        "cron_hour": 7,
        "cron_minute": 30,
        "default_limit": 200,
        "description": "Harvests daily preprint releases across cs.AI, cs.LG, cs.CV",
    },
    "openreview": {
        "name": "OpenReview Peer Reviews",
        "frequency": "Every 4 Hours (00:00, 04:00, 08:00, 12:00, 16:00, 20:00)",
        "interval_hours": 4,
        "default_limit": 100,
        "description": "Harvests conference review threads and rebuttal scores (ICLR, NeurIPS)",
    },
    "openalex": {
        "name": "OpenAlex Citation Graph",
        "frequency": "Daily at 02:00 VN (19:00 UTC)",
        "cron_hour": 2,
        "cron_minute": 0,
        "default_limit": 150,
        "description": "Harvests global metadata and citation graph with reconstructed abstracts",
    },
    "cvf": {
        "name": "CVF Open Access (CVPR / ICCV)",
        "frequency": "Weekly on Monday at 09:00 VN",
        "cron_weekday": 0,  # Monday
        "cron_hour": 9,
        "cron_minute": 0,
        "default_limit": 100,
        "description": "Harvests proceedings papers from CVPR & ICCV Open Access",
    },
}


class AdaptiveHarvesterScheduler:
    """Manages adaptive scheduling, state persistence, and execution across 4 sources."""

    def __init__(self, state_file: Optional[Path] = None):
        self.state_file = state_file or (settings.ROOT_DIR / "data" / "lakehouse" / "scheduler_state.json")
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        self.state: Dict[str, Any] = self._load_state()

    def _load_state(self) -> Dict[str, Any]:
        """Loads persistent scheduler state from JSON file or initializes defaults."""
        if self.state_file.exists():
            try:
                with open(self.state_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.warning("[SCHEDULER] Error loading state file: %s. Re-initializing.", e)

        default_state: Dict[str, Any] = {}
        now = datetime.datetime.now()
        for key, cfg in SCHEDULE_CONFIGS.items():
            default_state[key] = {
                "key": key,
                "name": cfg["name"],
                "frequency": cfg["frequency"],
                "status": "IDLE",
                "last_run": None,
                "next_run": self._calculate_next_run(key, now).strftime("%Y-%m-%d %H:%M:%S"),
                "last_duration_s": 0.0,
                "total_papers_harvested": 0,
                "last_error": None,
            }
        self._save_state(default_state)
        return default_state

    def _save_state(self, state: Optional[Dict[str, Any]] = None):
        """Persists scheduler state to disk."""
        target = state or self.state
        try:
            with open(self.state_file, "w", encoding="utf-8") as f:
                json.dump(target, f, indent=2)
        except Exception as e:
            logger.error("[SCHEDULER] Failed to save state to %s: %s", self.state_file, e)

    def _calculate_next_run(self, key: str, from_dt: datetime.datetime) -> datetime.datetime:
        """Calculates the next upcoming scheduled timestamp for a given source."""
        cfg = SCHEDULE_CONFIGS.get(key, {})
        if "interval_hours" in cfg:
            # Step forward in fixed hour intervals (00:00, 04:00, 08:00, etc.)
            interval = cfg["interval_hours"]
            current_hour = from_dt.hour
            next_hour = ((current_hour // interval) + 1) * interval
            if next_hour >= 24:
                return from_dt.replace(hour=0, minute=0, second=0, microsecond=0) + datetime.timedelta(days=1)
            return from_dt.replace(hour=next_hour, minute=0, second=0, microsecond=0)

        elif "cron_weekday" in cfg:
            # Weekly schedule
            target_weekday = cfg["cron_weekday"]
            target_hour = cfg["cron_hour"]
            target_minute = cfg["cron_minute"]
            days_ahead = (target_weekday - from_dt.weekday()) % 7
            candidate = from_dt.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0) + datetime.timedelta(days=days_ahead)
            if candidate <= from_dt:
                candidate += datetime.timedelta(days=7)
            return candidate

        else:
            # Daily schedule
            target_hour = cfg.get("cron_hour", 7)
            target_minute = cfg.get("cron_minute", 30)
            candidate = from_dt.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0)
            if candidate <= from_dt:
                candidate += datetime.timedelta(days=1)
            return candidate

    def get_status(self) -> Dict[str, Any]:
        """Returns the current snapshot of all 4 scheduled ingestion sources."""
        now = datetime.datetime.now()
        for key in SCHEDULE_CONFIGS:
            if key not in self.state:
                cfg = SCHEDULE_CONFIGS[key]
                self.state[key] = {
                    "key": key,
                    "name": cfg["name"],
                    "frequency": cfg["frequency"],
                    "status": "IDLE",
                    "last_run": None,
                    "next_run": self._calculate_next_run(key, now).strftime("%Y-%m-%d %H:%M:%S"),
                    "last_duration_s": 0.0,
                    "total_papers_harvested": 0,
                    "last_error": None,
                }
        return self.state

    def print_status_table(self):
        """Displays formatted CLI table of scheduler state."""
        st = self.get_status()
        rows = []
        for key, item in st.items():
            status_symbol = {
                "IDLE": "⚪ IDLE",
                "RUNNING": "🔵 RUNNING",
                "SUCCESS": "🟢 SUCCESS",
                "ERROR": "🔴 ERROR",
            }.get(item.get("status", "IDLE"), item.get("status"))

            rows.append([
                key.upper(),
                item.get("name"),
                item.get("frequency"),
                status_symbol,
                item.get("last_run") or "Never",
                item.get("next_run") or "N/A",
                f"{item.get('total_papers_harvested', 0):,} papers",
            ])

        headers = ["Source", "Name", "Schedule Policy", "Status", "Last Run", "Next Run", "Harvested"]
        print("\n" + tabulate(rows, headers=headers, tablefmt="fancy_grid"))

    def trigger_source(
        self,
        source: str,
        limit: Optional[int] = None,
        sync_r2: bool = True,
    ) -> Dict[str, Any]:
        """Synchronously triggers an ingestion pipeline for a given source."""
        source_key = source.lower().strip()
        if source_key not in SCHEDULE_CONFIGS and source_key != "all":
            raise ValueError(f"Unknown source '{source}'. Available: {list(SCHEDULE_CONFIGS.keys())} or 'all'")

        if source_key == "all":
            results = {}
            for s in SCHEDULE_CONFIGS:
                results[s] = self.trigger_source(s, limit=limit, sync_r2=sync_r2)
            return results

        cfg = SCHEDULE_CONFIGS[source_key]
        target_limit = limit or cfg["default_limit"]
        start_time = time.time()
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        print("\n" + "=" * 80)
        print(f"[SCHEDULER TRIGGER] Running pipeline for: {cfg['name'].upper()} (Target: {target_limit} papers)")
        print("=" * 80)

        # Update state to RUNNING
        if source_key in self.state:
            self.state[source_key]["status"] = "RUNNING"
            self.state[source_key]["last_run"] = now_str
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

        logger.info("[SCHEDULER] Executing command: %s", " ".join(cmd))
        try:
            proc = subprocess.run(cmd, cwd=str(settings.ROOT_DIR), text=True)
            duration = round(time.time() - start_time, 2)
            if proc.returncode == 0:
                print(f"[SCHEDULER] [SUCCESS] Pipeline for {source_key.upper()} completed in {duration}s!")
                self.state[source_key]["status"] = "SUCCESS"
                self.state[source_key]["last_duration_s"] = duration
                self.state[source_key]["total_papers_harvested"] += target_limit
                self.state[source_key]["last_error"] = None
                self.state[source_key]["next_run"] = self._calculate_next_run(source_key, datetime.datetime.now()).strftime("%Y-%m-%d %H:%M:%S")
                self._save_state()
                return {"status": "SUCCESS", "source": source_key, "duration_s": duration, "papers": target_limit}
            else:
                err_msg = f"Process exited with non-zero code {proc.returncode}"
                logger.error("[SCHEDULER] Pipeline failed for %s: %s", source_key, err_msg)
                self.state[source_key]["status"] = "ERROR"
                self.state[source_key]["last_error"] = err_msg
                self._save_state()
                return {"status": "ERROR", "source": source_key, "error": err_msg}

        except Exception as e:
            duration = round(time.time() - start_time, 2)
            err_msg = str(e)
            logger.error("[SCHEDULER] Exception during %s: %s", source_key, err_msg)
            self.state[source_key]["status"] = "ERROR"
            self.state[source_key]["last_error"] = err_msg
            self._save_state()
            return {"status": "ERROR", "source": source_key, "error": err_msg}

    def run_daemon(self, check_interval_seconds: int = 30):
        """Runs the continuous daemon loop, checking schedule times and triggering jobs."""
        print("\n" + "=" * 80)
        print("ADAPTIVE HARVESTER DAEMON STARTED")
        print("Watching 4 Academic Sources on Smart Adaptive Schedule:")
        for k, c in SCHEDULE_CONFIGS.items():
            print(f"  • {k.upper():<12} : {c['frequency']}")
        print(f"Check Interval: every {check_interval_seconds}s | Press CTRL+C to stop.")
        print("=" * 80)

        while True:
            try:
                now = datetime.datetime.now()
                now_str = now.strftime("%Y-%m-%d %H:%M:%S")

                for source_key in SCHEDULE_CONFIGS:
                    item = self.state.get(source_key, {})
                    next_run_str = item.get("next_run")
                    if next_run_str:
                        try:
                            next_run_dt = datetime.datetime.strptime(next_run_str, "%Y-%m-%d %H:%M:%S")
                        except ValueError:
                            next_run_dt = now

                        # Trigger if scheduled time has arrived and not currently running
                        if now >= next_run_dt and item.get("status") != "RUNNING":
                            print(f"\n[DAEMON] Scheduled time reached for {source_key.upper()} ({now_str}). Triggering...")
                            self.trigger_source(source_key, sync_r2=True)
                            self.state[source_key]["next_run"] = self._calculate_next_run(source_key, now).strftime("%Y-%m-%d %H:%M:%S")
                            self._save_state()

                time.sleep(check_interval_seconds)

            except KeyboardInterrupt:
                print("\n[DAEMON] Stopping daemon cleanly.")
                break
            except Exception as e:
                logger.error("[DAEMON] Error in scheduler loop: %s", e)
                time.sleep(5)


# Global singleton instance
scheduler_instance = AdaptiveHarvesterScheduler()


def main():
    parser = argparse.ArgumentParser(description="Adaptive Multi-Source Harvester Orchestrator & Scheduler.")
    parser.add_argument("--status", action="store_true", help="Print status and schedule of all 4 sources.")
    parser.add_argument("--trigger", type=str, default=None, help="Trigger immediate harvest for a source (arxiv, openreview, openalex, cvf, all).")
    parser.add_argument("--limit", type=int, default=None, help="Override target paper count for triggered job.")
    parser.add_argument("--sync-r2", action="store_true", default=True, help="Synchronize results to Cloudflare R2.")
    parser.add_argument("--daemon", action="store_true", help="Run background daemon scheduler loop.")
    parser.add_argument("--interval", type=int, default=30, help="Daemon loop check interval in seconds (default: 30s).")
    args = parser.parse_args()

    scheduler = AdaptiveHarvesterScheduler()

    if args.status:
        scheduler.print_status_table()
        return

    if args.trigger:
        scheduler.trigger_source(args.trigger, limit=args.limit, sync_r2=args.sync_r2)
        scheduler.print_status_table()
        return

    if args.daemon:
        scheduler.run_daemon(check_interval_seconds=args.interval)
        return

    # Default action: show status table
    scheduler.print_status_table()


if __name__ == "__main__":
    main()
