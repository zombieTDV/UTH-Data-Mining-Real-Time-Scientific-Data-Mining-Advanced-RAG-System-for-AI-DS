"""Logging utility for Data Mining Pipelines.

Logs go to stdout/stderr only; pipelines never write log files to local disk.
Use the process supervisor (Airflow task logs, docker logs, shell redirect) to capture output.
"""

import logging
import sys
from pathlib import Path
from typing import Optional, Tuple

from src.config.settings import settings


def setup_pipeline_logging(
    pipeline_name: str = "batch_ingest",
    log_dir: Optional[Path] = None,
    capture_stdout: bool = True,
) -> Tuple[logging.Logger, None]:
    """Configure a stream-only logger. `log_dir` and `capture_stdout` are accepted for
    backward compatibility and ignored. Returns (logger, None) - there is no log file."""
    logger = logging.getLogger(pipeline_name)
    logger.setLevel(getattr(logging, settings.LOG_LEVEL, logging.INFO))
    logger.handlers.clear()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S"))
    logger.addHandler(handler)
    logger.propagate = False
    return logger, None
