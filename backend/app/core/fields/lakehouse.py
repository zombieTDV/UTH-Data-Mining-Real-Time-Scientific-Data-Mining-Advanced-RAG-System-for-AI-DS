from pathlib import Path

from backend.app.core.paths import PROJECT_ROOT


class LakehouseFields:
    PROJECT_ROOT_DIR: Path = PROJECT_ROOT
    DATA_DIR: Path = PROJECT_ROOT / "data"
    SILVER_PARQUET: Path = PROJECT_ROOT / "data" / "silver" / "year=2026" / "papers.parquet"
    LANCEDB_URI: str = str(PROJECT_ROOT / "data" / "gold" / "lancedb")
    LANCEDB_TABLE: str = "scientific_papers_gold"
    MINING_ARTIFACTS_DIR: Path = PROJECT_ROOT / "data" / "gold" / "mining"
