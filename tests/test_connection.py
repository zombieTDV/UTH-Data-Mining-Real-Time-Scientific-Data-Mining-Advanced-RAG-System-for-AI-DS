"""Diagnostic & Integration test suite to verify connections defined in .env.

This script can be executed in two ways:
1. Directly via Python CLI:
       python tests/test_connection.py
2. Via Pytest:
       pytest -v tests/test_connection.py
"""

import json
import os
import sys
import time
from pathlib import Path

# Thêm project root vào sys.path để import nhất quán
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Load biến môi trường từ .env
try:
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=PROJECT_ROOT / ".env")
except ImportError:
    pass

import pytest
from src.config.settings import settings
from src.storage.minio_client import StorageClient


def test_env_file_exists():
    """Kiểm tra sự tồn tại của file .env tại project root."""
    env_path = PROJECT_ROOT / ".env"
    assert env_path.exists(), (
        f"File .env không tồn tại tại {env_path}. "
        "Hãy sao chép từ .env_example và điền thông tin: cp .env_example .env"
    )


@pytest.mark.live_storage
def test_env_variables_present():
    """Kiểm tra các biến môi trường thiết yếu của MinIO S3 trong .env."""
    required_vars = [
        "MINIO_ENDPOINT_URL",
        "MINIO_ACCESS_KEY_ID",
        "MINIO_SECRET_ACCESS_KEY",
        "MINIO_BUCKET_NAME",
    ]
    missing = [var for var in required_vars if not os.getenv(var, "").strip()]
    assert not missing, (
        f"Các biến môi trường sau chưa được điền trong .env: {', '.join(missing)}. "
        "Vui lòng mở .env và điền giá trị."
    )


@pytest.mark.live_storage
def test_minio_connection_and_permissions():
    """Kiểm tra kết nối tới MinIO S3: Head Bucket, Write, Read, Delete."""
    storage = StorageClient()

    # 1. Kiểm tra tồn tại Bucket
    try:
        storage.s3.head_bucket(Bucket=storage.bucket_name)
    except Exception as e:
        pytest.fail(f"Không thể kết nối tới MinIO bucket '{storage.bucket_name}': {e}")

    # 2. Kiểm tra quyền ghi (PutObject)
    test_key = f"_healthcheck/ping_{int(time.time())}.json"
    test_data = {
        "status": "ok",
        "service": "UTH-Data-Mining-MinIO-Healthcheck",
        "timestamp": time.time(),
        "created_by": "test_connection.py",
    }
    try:
        storage.upload_json(test_data, test_key)
    except Exception as e:
        pytest.fail(f"Lỗi quyền GHI vào MinIO bucket '{storage.bucket_name}': {e}")

    # 3. Kiểm tra quyền đọc (GetObject)
    try:
        fetched = storage.get_json(test_key)
        assert fetched.get("status") == "ok"
    except Exception as e:
        pytest.fail(f"Lỗi quyền ĐỌC từ MinIO bucket '{storage.bucket_name}': {e}")

    # 4. Kiểm tra quyền xóa (DeleteObject)
    try:
        deleted = storage.delete_object(test_key)
        assert deleted is True
    except Exception as e:
        pytest.fail(f"Lỗi quyền XÓA trên MinIO bucket '{storage.bucket_name}': {e}")


@pytest.mark.live_storage
def test_arxiv_connectivity():
    """Kiểm tra kết nối mạng tới endpoint arXiv API / RSS."""
    try:
        import httpx
        response = httpx.get(
            "http://export.arxiv.org/api/query?search_query=cat:cs.AI&max_results=1",
            timeout=15.0,
            follow_redirects=True,
        )
        assert response.status_code == 200, (
            f"arXiv API trả về status code {response.status_code}"
        )
        assert b"arxiv.org" in response.content, "Phản hồi không phải từ arXiv"
    except ImportError:
        import urllib.request
        req = urllib.request.Request(
            "http://export.arxiv.org/api/query?search_query=cat:cs.AI&max_results=1",
            headers={"User-Agent": "UTH-DataMining/1.0"},
        )
        with urllib.request.urlopen(req, timeout=15) as res:
            assert res.status == 200


def test_local_directories_creation():
    """Kiểm tra thư mục lưu trữ thô cục bộ (DATA_RAW_DIR)."""
    raw_dir_str = os.getenv("DATA_RAW_DIR", "data/raw")
    raw_dir = PROJECT_ROOT / raw_dir_str
    raw_dir.mkdir(parents=True, exist_ok=True)
    assert raw_dir.exists() and raw_dir.is_dir()


def main():
    print("=" * 70)
    print("🚀 BẮT ĐẦU KIỂM TRA TOÀN BỘ KẾT NỐI THEO FILE .ENV (MINIO S3 STACK)")
    print("=" * 70)

    # 1. Kiểm tra .env
    print("\n[1/4] Kiểm tra file .env...")
    env_file = PROJECT_ROOT / ".env"
    if not env_file.exists():
        print("  ❌ THẤT BẠI: File .env không tồn tại.")
        sys.exit(1)
    print(f"  ✅ Đã tìm thấy file .env tại: {env_file}")

    # 2. Kiểm tra biến môi trường
    print("\n[2/4] Kiểm tra các biến môi trường MinIO S3...")
    required = [
        "MINIO_ENDPOINT_URL",
        "MINIO_ACCESS_KEY_ID",
        "MINIO_SECRET_ACCESS_KEY",
        "MINIO_BUCKET_NAME",
    ]
    missing = [k for k in required if not os.getenv(k, "").strip()]
    if missing:
        print(f"  ❌ THẤT BẠI: Thiếu các biến sau: {', '.join(missing)}")
        sys.exit(1)
    print("  ✅ Đã điền đầy đủ các biến môi trường:")
    print(f"     - MINIO_BUCKET_NAME: {os.getenv('MINIO_BUCKET_NAME')}")
    print(f"     - MINIO_ENDPOINT_URL: {os.getenv('MINIO_ENDPOINT_URL')}")
    print(f"     - MINIO_ACCESS_KEY_ID: {os.getenv('MINIO_ACCESS_KEY_ID')}")

    # 3. Test MinIO S3
    print("\n[3/4] Kiểm tra kết nối & quyền đọc/ghi tới MinIO S3...")
    try:
        test_minio_connection_and_permissions()
        print("  ✅ KẾT NỐI MINIO S3 THÀNH CÔNG VƯỢT TRỘI!")
        print("     - Bucket tồn tại và phản hồi tốt (HeadBucket OK)")
        print("     - Đã ghi thử nghiệm file test (PutObject OK)")
        print("     - Đã đọc kiểm tra tính toàn vẹn (GetObject OK)")
        print("     - Đã xóa dọn dẹp file test thành công (DeleteObject OK)")
    except Exception as e:
        print(f"  ❌ THẤT BẠI KẾT NỐI MINIO: {e}")
        print("\n💡 Gợi ý khắc phục:")
        print("   1. Kiểm tra Docker container minio_service đang chạy trên port 9000.")
        print("   2. Kiểm tra MINIO_ACCESS_KEY_ID và MINIO_SECRET_ACCESS_KEY trong .env.")
        print("   3. Đảm bảo bucket 'uth-scientific-lakehouse' đã được tạo trên MinIO.")
        sys.exit(1)

    # 4. Test arXiv API
    print("\n[4/4] Kiểm tra kết nối tới arXiv API...")
    try:
        test_arxiv_connectivity()
        print("  ✅ Kết nối tới arXiv API hoạt động bình thường.")
    except Exception as e:
        print(f"  ⚠️ CẢNH BÁO: Không thể kết nối tới arXiv API ({e}). Hãy kiểm tra mạng.")

    # 5. Local storage
    test_local_directories_creation()
    print(f"  ✅ Thư mục đệm local '{os.getenv('DATA_RAW_DIR', 'data/raw')}' sẵn sàng.")

    print("\n" + "=" * 70)
    print("🎉 TOÀN BỘ KẾT NỐI ĐỀU HOÀN HẢO! HỆ THỐNG ĐÃ SẴN SÀNG CÀO DỮ LIỆU.")
    print("=" * 70)


if __name__ == "__main__":
    main()
