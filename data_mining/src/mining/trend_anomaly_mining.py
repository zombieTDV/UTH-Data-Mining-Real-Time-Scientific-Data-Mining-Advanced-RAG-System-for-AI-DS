"""
data_mining/src/mining/trend_anomaly_mining.py
----------------------------------------------
Pillar 4: Trend Velocity & Structural Anomaly Mining Pipeline.
Applies Isolation Forest with log1p scaling to detect structural outlier papers
(monographs, extreme formula density, massive collaboration teams),
and computes share-normalized temporal trend velocities across scientific categories.

Adheres strictly to docs/agents/rules/LOGGING_CHECKPOINT_RULES.md:
- Strictly NO emojis/icons.
- Timestamped plain-text logs: [INFO], [SUCCESS], [WARNING], [ERROR].
"""

import os
import json
import logging
from typing import Dict, Any, List
import numpy as np
import pandas as pd
import duckdb
from sklearn.ensemble import IsolationForest

logger = logging.getLogger("trend_anomaly_mining")


class TrendAnomalyMiner:
    """Detects structural outlier papers via Isolation Forest and tracks share-normalized research trend velocity."""

    def __init__(self, parquet_path: str):
        self.parquet_path = parquet_path

    def run_mining(self, contamination: float = 0.02) -> Dict[str, Any]:
        """Runs structural anomaly detection and share-normalized trend velocity modeling."""
        logger.info("[PILLAR 4] Loading paper features from: %s...", self.parquet_path)
        con = duckdb.connect()

        cols_df = con.execute(f"DESCRIBE SELECT * FROM read_parquet('{self.parquet_path}')").fetchdf()
        available_cols = set(cols_df["column_name"].tolist())

        # Construct adaptive query depending on available columns
        cat_col = "primary_category" if "primary_category" in available_cols else ("topics[1]" if "topics" in available_cols else "'cs.AI'")
        date_col = "published_date" if "published_date" in available_cols else ("publication_date" if "publication_date" in available_cols else "'2025-01-01'")
        math_col = "total_math_count" if "total_math_count" in available_cols else "0"
        words_col = "total_words" if "total_words" in available_cols else ("length(abstract) / 5" if "abstract" in available_cols else "500")
        sec_col = "total_sections" if "total_sections" in available_cols else "5"
        auth_len = "len(authors)" if "authors" in available_cols else "3"
        cat_len = "len(categories)" if "categories" in available_cols else ("len(topics)" if "topics" in available_cols else "1")

        query = f"""
        SELECT
            paper_id,
            title,
            {cat_col} AS primary_category,
            COALESCE({math_col}, 0) AS total_math_count,
            COALESCE({words_col}, 0) AS total_words,
            COALESCE({sec_col}, 0) AS total_sections,
            COALESCE({auth_len}, 1) AS author_count,
            COALESCE({cat_len}, 1) AS category_count,
            {date_col} AS published_date
        FROM read_parquet('{self.parquet_path}')
        """
        df = con.execute(query).fetchdf()

        # 1. Structural Anomaly Mining via Isolation Forest with log1p scaling
        logger.info("[PILLAR 4] Executing Isolation Forest on log1p-transformed structural features (contamination=%.3f)...", contamination)
        feature_cols = [
            "total_math_count",
            "total_words",
            "total_sections",
            "author_count",
            "category_count",
        ]
        X_raw = df[feature_cols].fillna(0).values.astype(np.float64)
        X_log = np.log1p(X_raw)

        iso_forest = IsolationForest(
            contamination=contamination,
            random_state=42,
            n_estimators=100,
        )
        preds = iso_forest.fit_predict(X_log)
        anomaly_scores = iso_forest.score_samples(X_log)

        df["is_anomaly"] = preds == -1
        df["anomaly_score"] = np.round(anomaly_scores, 4)

        anomalies_df = df[df["is_anomaly"]].sort_values(by="anomaly_score").head(30)

        anomaly_records = []
        for _, row in anomalies_df.iterrows():
            reasons = []
            if row["total_math_count"] > 1000:
                reasons.append(f"Extreme theoretical formula density ({int(row['total_math_count'])} formulas)")
            if row["total_words"] > 25000:
                reasons.append(f"Monograph-level length ({int(row['total_words'])} words)")
            if row["author_count"] > 15:
                reasons.append(f"Massive collaboration team ({int(row['author_count'])} authors)")
            if row["category_count"] >= 4:
                reasons.append(f"Highly interdisciplinary scope ({int(row['category_count'])} categories)")
            if not reasons:
                reasons.append("Multi-dimensional structural outlier in feature space")

            cat_display = str(row["primary_category"]) if row["primary_category"] else "cs.AI"
            anomaly_records.append({
                "paper_id": str(row["paper_id"]),
                "title": str(row["title"]),
                "primary_category": cat_display,
                "anomaly_score": float(row["anomaly_score"]),
                "math_count": int(row["total_math_count"]),
                "word_count": int(row["total_words"]),
                "author_count": int(row["author_count"]),
                "category_count": int(row["category_count"]),
                "outlier_reasons": reasons,
            })

        logger.info("[PILLAR 4] Identified %d structural outlier papers.", len(anomaly_records))

        # 2. Share-Normalized Trend Velocity Modeling
        logger.info("[PILLAR 4] Computing share-normalized temporal trend velocities...")
        trend_query = f"""
        WITH monthly_counts AS (
            SELECT
                {cat_col} AS primary_category,
                substr({date_col}, 1, 7) AS ym,
                count(*) AS monthly_papers
            FROM read_parquet('{self.parquet_path}')
            WHERE {cat_col} IS NOT NULL AND {date_col} IS NOT NULL AND length({date_col}) >= 7
            GROUP BY primary_category, ym
        ),
        ranked_months AS (
            SELECT
                primary_category,
                ym,
                monthly_papers,
                dense_rank() OVER (ORDER BY ym DESC) AS month_recency
            FROM monthly_counts
        ),
        aggregated AS (
            SELECT
                primary_category,
                sum(CASE WHEN month_recency <= 3 THEN monthly_papers ELSE 0 END) AS recent_quarter,
                sum(CASE WHEN month_recency > 3 AND month_recency <= 6 THEN monthly_papers ELSE 0 END) AS previous_quarter,
                sum(monthly_papers) AS all_time_total
            FROM ranked_months
            GROUP BY primary_category
            HAVING all_time_total >= 40
        )
        SELECT * FROM aggregated ORDER BY recent_quarter DESC
        """
        trend_rows = con.execute(trend_query).fetchall()

        total_recent = sum(int(r[1] or 0) for r in trend_rows)
        total_prev = max(1, sum(int(r[2] or 0) for r in trend_rows))

        trend_velocities = []
        for r in trend_rows:
            cat = str(r[0])
            recent = int(r[1] or 0)
            prev = int(r[2] or 0)
            all_time = int(r[3] or 0)

            share_rec = recent / max(1, total_recent)
            share_prev = prev / max(1, total_prev)

            # Share-normalized momentum
            if share_prev > 0:
                growth_rate_pct = round(((share_rec - share_prev) / share_prev) * 100.0, 2)
            else:
                growth_rate_pct = 100.0 if share_rec > 0 else 0.0

            share_diff_pct = (share_rec - share_prev) * 100.0

            if growth_rate_pct > 15.0 or share_diff_pct > 1.5:
                momentum = "SURGING"
            elif growth_rate_pct < -15.0 or share_diff_pct < -1.5:
                momentum = "DECLINING"
            else:
                momentum = "STABLE"

            trend_velocities.append({
                "category": cat,
                "recent_quarter_papers": recent,
                "previous_quarter_papers": prev,
                "growth_rate_pct": growth_rate_pct,
                "momentum": momentum,
                "all_time_papers": all_time,
            })

        results = {
            "summary": {
                "total_papers_analyzed": len(df),
                "total_anomalies_detected": int(np.sum(preds == -1)),
                "contamination_rate": contamination,
                "categories_tracked": len(trend_velocities),
                "trend_normalization": "share_normalized_momentum",
            },
            "anomalies": anomaly_records,
            "trend_velocity": trend_velocities,
        }

        logger.info(
            "[PILLAR 4] [SUCCESS] Completed Pillar 4 analysis (%d outliers, %d trend categories evaluated).",
            len(anomaly_records),
            len(trend_velocities),
        )
        return results

    def save_trends(self, output_path: str, contamination: float = 0.02) -> None:
        """Runs trend and anomaly mining and writes formatted JSON to disk."""
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        results = self.run_mining(contamination=contamination)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        logger.info("[PILLAR 4] [SUCCESS] Saved trend anomalies to: %s", output_path)
