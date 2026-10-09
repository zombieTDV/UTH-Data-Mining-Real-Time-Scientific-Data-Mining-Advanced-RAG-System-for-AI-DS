"""Smoke tests: verify the project skeleton imports and the layout is intact.

These pass out of the box right after bootstrapping — they are the first
line of defense that a fresh checkout is wired correctly.
"""
from pathlib import Path
import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.unit
def test_src_packages_importable():
    import src.config  # noqa: F401
    import src.indexing  # noqa: F401
    import src.ingestion  # noqa: F401
    import src.mining  # noqa: F401
    import src.pipelines  # noqa: F401
    import src.transformation  # noqa: F401
    import src.utils  # noqa: F401


@pytest.mark.unit
def test_core_directories_exist():
    for rel in (
        "backend",
        "frontend",
        "src",
        "data",
        "benchmarks",
        "docs",
        "tests",
    ):
        assert (PROJECT_ROOT / rel).is_dir(), f"missing directory: {rel}"


@pytest.mark.unit
def test_documentation_files_exist():
    for rel in (
        "README.md",
        "SETUP.md",
        "pyproject.toml",
        "pytest.ini",
        "requirements.txt",
    ):
        assert (PROJECT_ROOT / rel).is_file(), f"missing file: {rel}"
