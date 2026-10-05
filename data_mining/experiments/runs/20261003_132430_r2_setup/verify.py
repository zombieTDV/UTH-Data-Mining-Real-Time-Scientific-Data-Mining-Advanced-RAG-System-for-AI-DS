import datetime
import json
import sys
from pathlib import Path
from zoneinfo import ZoneInfo
import pyarrow.parquet as pq
from src.config.settings import settings
from src.storage.r2_client import R2Client
from src.storage.duckdb_engine import DuckDBEngine
from src.utils.hasher import compute_sha256

run=Path(__file__).resolve().parent
r2=R2Client()
try:
    verified=[]
    for path in sorted(settings.SILVER_DIR.glob("year=*/papers.parquet")):
        key=f"silver/papers/{path.parent.name}/papers.parquet"
        response=r2.s3.get_object(Bucket=r2.bucket_name,Key=key)
        with response["Body"] as body:
            remote_hash=compute_sha256(body.read())
        local_hash=compute_sha256(path)
        if remote_hash!=local_hash or response.get("Metadata",{}).get("sha256")!=local_hash:
            raise RuntimeError("Silver remote/local SHA-256 mismatch")
        verified.append({"key":key,"sha256":local_hash,"rows":pq.ParquetFile(path).metadata.num_rows,
                         "bytes":path.stat().st_size})
    with DuckDBEngine(silver_dir=settings.SILVER_DIR) as engine:
        summary=engine.query_df("SELECT count(*) AS rows, count(DISTINCT paper_id) AS unique_papers FROM read_parquet(?, union_by_name=true)",
                               [str(settings.SILVER_DIR/"**"/"*.parquet")]).to_dict(orient="records")[0]
    checkpoint=json.loads((settings.MANIFEST_DIR/"r2"/"batch_checkpoint.json").read_text())
    result={"verified_at":datetime.datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).isoformat(),
            "verified_silver":verified,"silver_summary":summary,
            "checkpoint":{k:checkpoint.get(k) for k in ["page_num","page_offset","total_ingested","config","exhausted"]}}
    if summary["rows"]!=summary["unique_papers"]:
        raise RuntimeError("Duplicate Silver paper IDs")
    raw=r2.list_objects(prefix="bronze/arxiv/oai/raw/",max_keys=1)
    if not raw:raise RuntimeError("No Bronze objects found")
    response=r2.s3.get_object(Bucket=r2.bucket_name,Key=raw[0]["key"])
    with response["Body"] as body:raw_digest=compute_sha256(body.read())
    if response.get("Metadata",{}).get("sha256")!=raw_digest:raise RuntimeError("Bronze checksum mismatch")
    result["bronze_sample"]={"key":raw[0]["key"],"sha256":raw_digest}
    (run/"verification.json").write_text(json.dumps(result,indent=2))
    print(json.dumps(result,indent=2))
except Exception as exc:
    print(json.dumps({"error_type":type(exc).__name__}),file=sys.stderr)
    sys.exit(1)
finally:
    r2.s3.close()
