import json
import sys
from pathlib import Path
from src.config.settings import settings
from src.storage.r2_client import R2Client
from src.utils.hasher import compute_sha256

run=Path(__file__).resolve().parent
r2=R2Client()
try:
    objects=r2.list_objects(prefix="silver/papers/")
    synchronized=[]
    for obj in objects:
        key=obj["key"]
        if not key.endswith("/papers.parquet"):
            continue
        relative=Path(key.removeprefix("silver/papers/"))
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("Invalid Silver object key")
        target=settings.SILVER_DIR/relative
        response=r2.s3.get_object(Bucket=r2.bucket_name,Key=key)
        with response["Body"] as body:
            data=body.read()
        digest=compute_sha256(data)
        if response.get("Metadata",{}).get("sha256") not in (None,digest):
            raise RuntimeError("Remote Silver checksum mismatch")
        if target.exists() and compute_sha256(target)!=digest:
            raise RuntimeError("Local Silver differs from R2; preserve and reconcile before crawling")
        target.parent.mkdir(parents=True,exist_ok=True)
        if not target.exists():
            temporary=target.with_suffix(".download.tmp")
            temporary.write_bytes(data)
            temporary.replace(target)
        synchronized.append({"key":key,"sha256":digest,"bytes":len(data)})
    result={"existing_silver_objects":len(objects),"restored_partitions":synchronized}
    (run/"preflight.json").write_text(json.dumps(result,indent=2))
    print(json.dumps(result,indent=2))
except Exception as exc:
    print(json.dumps({"error_type":type(exc).__name__}),file=sys.stderr)
    sys.exit(1)
finally:
    r2.s3.close()
