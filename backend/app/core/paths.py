from pathlib import Path

CURRENT_FILE = Path(__file__).resolve()
PROJECT_ROOT = CURRENT_FILE.parents[3]
ENV_FILE = PROJECT_ROOT / ".env"
