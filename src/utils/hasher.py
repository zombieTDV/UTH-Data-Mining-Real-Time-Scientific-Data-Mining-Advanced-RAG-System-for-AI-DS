"""Cryptographic hashing utilities to enforce the Immutable Raw Invariant and Deduplication."""

import hashlib
import re
import unicodedata
from pathlib import Path
from typing import Union


def compute_sha256(data: Union[bytes, str, Path]) -> str:
    """Tính mã băm SHA-256 cho dữ liệu dạng bytes, chuỗi str hoặc đường dẫn Path."""
    hasher = hashlib.sha256()

    if isinstance(data, Path):
        with open(data, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                hasher.update(chunk)
    elif isinstance(data, str):
        hasher.update(data.encode("utf-8"))
    elif isinstance(data, (bytes, bytearray)):
        hasher.update(data)
    else:
        raise TypeError(f"Dữ liệu không hỗ trợ để tính hash: {type(data)}")

    return hasher.hexdigest()


def normalize_abstract_text(abstract: str) -> str:
    """Chuẩn hóa văn bản abstract để tính hash thống nhất giữa các nguồn học thuật."""
    if not abstract:
        return ""
    # Chuẩn hóa Unicode NFKC
    text = unicodedata.normalize("NFKC", str(abstract))
    # Chuyển chữ thường
    text = text.lower()
    # Loại bỏ thẻ HTML nếu có
    text = re.sub(r"<[^>]+>", " ", text)
    # Loại bỏ ký tự đặc biệt / dấu câu thừa, giữ lại chữ và số
    text = re.sub(r"[^\w\s]", "", text)
    # Gộp khoảng trắng thừa
    text = re.sub(r"\s+", " ", text).strip()
    return text


def compute_abstract_hash(abstract: str) -> str:
    """Tính mã băm SHA-256 (64 hex characters) từ abstract đã chuẩn hóa làm khóa khử trùng lặp."""
    cleaned = normalize_abstract_text(abstract)
    if not cleaned:
        return ""
    return hashlib.sha256(cleaned.encode("utf-8")).hexdigest()
