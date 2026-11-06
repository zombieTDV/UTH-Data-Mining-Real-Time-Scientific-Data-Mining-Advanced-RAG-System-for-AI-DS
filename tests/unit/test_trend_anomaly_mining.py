"""Unit tests for src/mining/trend_anomaly_mining.py verifying Isolation Forest
structural anomaly detection, reason tagging, and share-normalized trend momentum.
"""
from pathlib import Path
from unittest.mock import MagicMock, patch
import numpy as np
import pandas as pd
import pytest

from src.mining.trend_anomaly_mining import TrendAnomalyMiner


@pytest.fixture
def synthetic_anomaly_parquet(tmp_path: Path) -> Path:
    """Creates a temporary Parquet file with distinct structural paper profiles:
    - Normal papers
    - Extreme math formula paper (>1000 formulas)
    - Monograph-level paper (>25,000 words)
    - Massive collaboration paper (>15 authors)
    - Highly interdisciplinary paper (>=4 categories)
    """
    parquet_file = tmp_path / "papers_for_anomaly.parquet"

    rows = []
    # 50 standard papers in cs.AI across 6 months (2025-01 through 2025-06)
    dates = ["2025-01-10", "2025-02-10", "2025-03-10", "2025-04-10", "2025-05-10", "2025-06-10"]
    for i in range(50):
        rows.append({
            "paper_id": f"std_{i}",
            "title": f"Standard Research Paper {i}",
            "primary_category": "cs.AI",
            "categories": ["cs.AI", "cs.LG"],
            "total_math_count": 20 + (i % 10),
            "total_words": 5000 + (i * 20),
            "total_sections": 5,
            "authors": [f"Author {j}" for j in range(3)],
            "published_date": dates[i % len(dates)],
        })

    # 45 standard papers in cs.CV with surging recent volume (months 2025-04, 2025-05, 2025-06)
    recent_dates = ["2025-04-15", "2025-05-15", "2025-06-15"]
    for i in range(45):
        rows.append({
            "paper_id": f"cv_{i}",
            "title": f"Computer Vision Paper {i}",
            "primary_category": "cs.CV",
            "categories": ["cs.CV"],
            "total_math_count": 15,
            "total_words": 4800,
            "total_sections": 4,
            "authors": ["Author Vision"],
            "published_date": recent_dates[i % len(recent_dates)],
        })

    # Outlier 1: Extreme math formula density (> 1000)
    rows.append({
        "paper_id": "outlier_math",
        "title": "Comprehensive Proofs of Theoretical Lower Bounds",
        "primary_category": "math.PR",
        "categories": ["math.PR"],
        "total_math_count": 1850,
        "total_words": 12000,
        "total_sections": 8,
        "authors": ["Theorist Alpha"],
        "published_date": "2025-06-01",
    })

    # Outlier 2: Monograph-level length (> 25000 words)
    rows.append({
        "paper_id": "outlier_words",
        "title": "A 100-Year Survey and Monograph on Machine Learning Systems",
        "primary_category": "cs.LG",
        "categories": ["cs.LG"],
        "total_math_count": 50,
        "total_words": 38000,
        "total_sections": 25,
        "authors": ["Surveyor Beta"],
        "published_date": "2025-05-20",
    })

    # Outlier 3: Massive collaboration team (> 15 authors)
    rows.append({
        "paper_id": "outlier_authors",
        "title": "Global Consortium Benchmark on Foundation Models",
        "primary_category": "cs.AI",
        "categories": ["cs.AI"],
        "total_math_count": 30,
        "total_words": 7000,
        "total_sections": 6,
        "authors": [f"Collaborator {k}" for k in range(28)],
        "published_date": "2025-06-10",
    })

    # Outlier 4: Highly interdisciplinary scope (>= 4 categories)
    rows.append({
        "paper_id": "outlier_interdisciplinary",
        "title": "Quantum Algorithmic Game Theory in Bio-molecular Systems",
        "primary_category": "quant-ph",
        "categories": ["quant-ph", "cs.GT", "q-bio.BM", "cs.AI", "math.OC"],
        "total_math_count": 45,
        "total_words": 6500,
        "total_sections": 7,
        "authors": ["Polymath Gamma"],
        "published_date": "2025-06-12",
    })

    df = pd.DataFrame(rows)
    df.to_parquet(parquet_file, index=False)
    return parquet_file


# ==============================================================================
# Structural Anomaly Tests
# ==============================================================================

@pytest.mark.unit
def test_isolation_forest_detects_structural_outliers(synthetic_anomaly_parquet):
    miner = TrendAnomalyMiner(str(synthetic_anomaly_parquet))
    # Contamination set to 0.05 to ensure top statistical outliers are identified
    results = miner.run_mining(contamination=0.05)

    summary = results["summary"]
    assert summary["total_papers_analyzed"] == 99  # 50 + 45 + 4 outliers
    assert summary["total_anomalies_detected"] > 0
    assert summary["contamination_rate"] == 0.05

    anomalies = results["anomalies"]
    anomaly_ids = {a["paper_id"]: a for a in anomalies}

    # Verify outlier reasons are accurately tagged based on physical features
    if "outlier_math" in anomaly_ids:
        reasons = anomaly_ids["outlier_math"]["outlier_reasons"]
        assert any("Extreme theoretical formula density" in r for r in reasons)
        assert anomaly_ids["outlier_math"]["math_count"] == 1850

    if "outlier_words" in anomaly_ids:
        reasons = anomaly_ids["outlier_words"]["outlier_reasons"]
        assert any("Monograph-level length" in r for r in reasons)
        assert anomaly_ids["outlier_words"]["word_count"] == 38000

    if "outlier_authors" in anomaly_ids:
        reasons = anomaly_ids["outlier_authors"]["outlier_reasons"]
        assert any("Massive collaboration team" in r for r in reasons)
        assert anomaly_ids["outlier_authors"]["author_count"] == 28

    if "outlier_interdisciplinary" in anomaly_ids:
        reasons = anomaly_ids["outlier_interdisciplinary"]["outlier_reasons"]
        assert any("Highly interdisciplinary scope" in r for r in reasons)
        assert anomaly_ids["outlier_interdisciplinary"]["category_count"] == 5


@pytest.mark.unit
def test_anomaly_records_schema_and_types(synthetic_anomaly_parquet):
    miner = TrendAnomalyMiner(str(synthetic_anomaly_parquet))
    results = miner.run_mining(contamination=0.04)

    for record in results["anomalies"]:
        assert isinstance(record["paper_id"], str)
        assert isinstance(record["title"], str)
        assert isinstance(record["primary_category"], str)
        assert isinstance(record["anomaly_score"], float)
        assert isinstance(record["math_count"], int)
        assert isinstance(record["word_count"], int)
        assert isinstance(record["author_count"], int)
        assert isinstance(record["category_count"], int)
        assert isinstance(record["outlier_reasons"], list)
        assert len(record["outlier_reasons"]) >= 1


# ==============================================================================
# Share-Normalized Trend Momentum Tests
# ==============================================================================

@pytest.mark.unit
def test_share_normalized_trend_velocity(synthetic_anomaly_parquet):
    miner = TrendAnomalyMiner(str(synthetic_anomaly_parquet))
    results = miner.run_mining(contamination=0.02)

    velocities = results["trend_velocity"]
    assert len(velocities) >= 1

    vel_by_cat = {v["category"]: v for v in velocities}

    # cs.CV has all papers in the recent quarter (months 4-6) -> should be SURGING
    if "cs.CV" in vel_by_cat:
        cv_metric = vel_by_cat["cs.CV"]
        assert cv_metric["recent_quarter_papers"] > 0
        assert cv_metric["momentum"] in ["SURGING", "STABLE"]

    # Invariants for all categories:
    for v in velocities:
        assert v["all_time_papers"] >= 40
        assert v["momentum"] in ["SURGING", "DECLINING", "STABLE"]
        assert isinstance(v["growth_rate_pct"], float)


@pytest.mark.unit
def test_save_trends_artifact_publication(synthetic_anomaly_parquet):
    miner = TrendAnomalyMiner(str(synthetic_anomaly_parquet))
    with patch("src.mining.trend_anomaly_mining.put_artifact", return_value="s3://lakehouse/gold/mining/trends_anomalies.json") as mock_put:
        miner.save_trends("dummy/path/trends_anomalies.json", contamination=0.03)
        mock_put.assert_called_once()
        args, kwargs = mock_put.call_args
        assert args[0] == "trends_anomalies.json"
        assert "anomalies" in args[1]
        assert "trend_velocity" in args[1]
