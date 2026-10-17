"""DuckDB Analytical Query Engine for the Scientific Lakehouse.

Supports running high-performance SQL queries over Silver Parquet datasets
both locally and directly on MinIO S3 via the httpfs extension.
"""

from pathlib import Path
from typing import Any, Optional
import duckdb
import pandas as pd

from src.config.settings import settings


class DuckDBEngine:
    """SQL Query Engine powered by embedded DuckDB."""

    def __init__(self, in_memory: bool = True, db_path: Optional[str] = None):
        self.con = duckdb.connect(database=":memory:" if in_memory else (db_path or "lakehouse.duckdb"))
        self._configure_s3_httpfs()

    def _configure_s3_httpfs(self):
        """Cấu hình extension httpfs của DuckDB để query trực tiếp dữ liệu trên MinIO S3."""
        cfg = settings.get_active_storage_config()
        endpoint = cfg["endpoint_url"]
        endpoint_clean = endpoint.replace("https://", "").replace("http://", "")

        try:
            self.con.execute("INSTALL httpfs; LOAD httpfs;")
            if endpoint_clean and cfg["access_key_id"]:
                self.con.execute(f"SET s3_endpoint = '{endpoint_clean}';")
                self.con.execute(f"SET s3_access_key_id = '{cfg['access_key_id']}';")
                self.con.execute(f"SET s3_secret_access_key = '{cfg['secret_access_key']}';")
                self.con.execute("SET s3_url_style = 'path';")
                use_ssl_str = "true" if cfg.get("use_ssl", False) else "false"
                self.con.execute(f"SET s3_use_ssl = {use_ssl_str};")
        except Exception:
            # Fallback nếu môi trường mạng chặn cài extension lúc khởi động
            pass

    def query_df(self, sql: str) -> pd.DataFrame:
        """Thực thi câu lệnh SQL và trả về kết quả dạng Pandas DataFrame."""
        return self.con.execute(sql).fetchdf()

    def query_silver_local(self, limit: int = 10) -> pd.DataFrame:
        """Truy vấn các bài báo từ tầng Silver trên ổ đĩa local."""
        silver_path = str(settings.ROOT_DIR / "data" / "silver" / "**" / "*.parquet")
        sql = f"SELECT paper_id, title, primary_category, total_sections, total_math_count, total_words FROM '{silver_path}' LIMIT {limit}"
        return self.query_df(sql)

    def query_silver_s3(self, limit: int = 10) -> pd.DataFrame:
        """Truy vấn các bài báo trực tiếp từ tầng Silver trên MinIO S3 Lakehouse."""
        s3_path = f"s3://{settings.MINIO_BUCKET_NAME}/silver/papers/**/*.parquet"
        sql = f"SELECT paper_id, title, primary_category, total_sections, total_math_count, total_words FROM '{s3_path}' LIMIT {limit}"
        return self.query_df(sql)

    # Legacy alias
    query_silver_r2 = query_silver_s3
