"""
data_mining/src/mining/mining_engine.py
---------------------------------------
Master Data Mining & Modeling Engine.
Executes the comprehensive analytical suite over the academic papers in Lakehouse:
- Real-time Exploratory Data Analysis (EDA) via DuckDB.
- Pillar 1: Frequent Pattern & Association Rule Mining (FP-Growth).
- Pillar 2: Semantic Topic Clustering & Density Analysis (K-Means/DBSCAN).
- Pillar 3: Graph Mining & Scientific Network Analysis (Citation Network / PageRank).
- Pillar 4: Trend Velocity & Anomaly Outlier Detection (Isolation Forest).

Reads Silver Parquet from MinIO (DuckDB over S3) and vectors from Qdrant; publishes every artifact to MinIO gold/mining/.
Nothing is read from or written to the local disk.
Adheres strictly to docs/agents/rules/LOGGING_CHECKPOINT_RULES.md (Strictly NO emojis/icons).
"""

import os
import sys
import time
import json
import logging
import argparse
from datetime import datetime
from typing import Dict, Any, Optional

# Ensure project imports resolve
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from src.config.settings import settings
from src.mining.lake_access import MINING_PREFIX, SILVER_PRIMARY_KEY, put_artifact, s3_uri
from src.utils.logger import setup_pipeline_logging
from src.mining.eda_engine import EdaEngine
from src.mining.association_rules import AssociationRuleMiner
from src.mining.cluster_analysis import SemanticClusterAnalyzer
from src.mining.graph_mining import ScientificGraphMiner
from src.mining.trend_anomaly_mining import TrendAnomalyMiner

logger, log_file = setup_pipeline_logging("mining_engine")


class MiningEngine:
    """Master orchestrator for scientific data mining and exploratory analytics."""

    def __init__(self, parquet_path: Optional[str] = None, **_ignored):
        # Silver source as an s3:// URI inside the MinIO bucket
        self.parquet_path = parquet_path or s3_uri(SILVER_PRIMARY_KEY)
        self.vector_source = f"qdrant://{settings.QDRANT_COLLECTION}"

    def run_all(self, upload_to_r2: bool = True) -> Dict[str, Any]:
        """Runs EDA and all 4 Data Mining pillars in sequential checkpoints (artifacts go to MinIO).

        `upload_to_r2` is accepted for backward compatibility; artifacts are always published to MinIO.
        """
        start_time = time.time()

        logger.info("================================================================================")
        logger.info("[MINING ENGINE] STARTING MASTER DATA MINING & MODELING EXECUTION")
        logger.info("[MINING ENGINE] Parquet source: %s", self.parquet_path)
        logger.info("[MINING ENGINE] Vector source: %s", self.vector_source)
        logger.info("[MINING ENGINE] Artifact target: %s", s3_uri(MINING_PREFIX))
        logger.info("================================================================================")

        manifest: Dict[str, Any] = {
            "execution_timestamp": datetime.now().isoformat(),
            "parquet_source": self.parquet_path,
            "vector_source": self.vector_source,
            "lancedb_source": self.vector_source,  # legacy key still read by the dashboard
            "modules": {},
            "status": "RUNNING",
        }

        # ----------------------------------------------------------------------
        # Checkpoint 1: Exploratory Data Analysis (EDA)
        # ----------------------------------------------------------------------
        t0 = time.time()
        logger.info("[CHECKPOINT 1/5] Executing Real-Time Exploratory Data Analysis (EDA)...")
        eda_engine = EdaEngine(self.parquet_path)
        eda_results = eda_engine.run_full_eda()
        eda_file = put_artifact("eda_summary.json", eda_results)
        manifest["modules"]["eda"] = {
            "elapsed_seconds": round(time.time() - t0, 2),
            "file": eda_file,
            "total_papers": eda_results["dataset_overview"]["total_papers"],
        }
        logger.info("[CHECKPOINT 1/5] [SUCCESS] EDA completed in %.2fs.", manifest["modules"]["eda"]["elapsed_seconds"])

        # ----------------------------------------------------------------------
        # Checkpoint 2: Pillar 1 - Association Rule Mining (FP-Growth)
        # ----------------------------------------------------------------------
        t0 = time.time()
        logger.info("[CHECKPOINT 2/5] Executing Pillar 1: Association Rule Mining (FP-Growth)...")
        rule_miner = AssociationRuleMiner(self.parquet_path)
        rule_results = rule_miner.mine_rules(min_support=0.02, min_lift=1.2)
        rules_file = put_artifact("association_rules.json", rule_results)
        manifest["modules"]["association_rules"] = {
            "elapsed_seconds": round(time.time() - t0, 2),
            "file": rules_file,
            "rules_mined": len(rule_results.get("rules", [])),
        }
        logger.info("[CHECKPOINT 2/5] [SUCCESS] Pillar 1 completed in %.2fs.", manifest["modules"]["association_rules"]["elapsed_seconds"])

        # ----------------------------------------------------------------------
        # Checkpoint 3: Pillar 2 - Semantic Topic Clustering
        # ----------------------------------------------------------------------
        t0 = time.time()
        logger.info("[CHECKPOINT 3/5] Executing Pillar 2: Semantic Topic Clustering...")
        cluster_analyzer = SemanticClusterAnalyzer()
        cluster_results = cluster_analyzer.run_clustering_benchmarks(sample_size=3000, n_clusters=6)
        clusters_file = put_artifact("clusters.json", cluster_results)
        manifest["modules"]["clusters"] = {
            "elapsed_seconds": round(time.time() - t0, 2),
            "file": clusters_file,
            "silhouette_score": cluster_results["validity_metrics"]["silhouette_score"],
        }
        logger.info("[CHECKPOINT 3/5] [SUCCESS] Pillar 2 completed in %.2fs.", manifest["modules"]["clusters"]["elapsed_seconds"])

        # ----------------------------------------------------------------------
        # Checkpoint 4: Pillar 3 - Scientific Network & Citation Graph Mining
        # ----------------------------------------------------------------------
        t0 = time.time()
        logger.info("[CHECKPOINT 4/5] Executing Pillar 3: Scientific Network & Citation Graph Mining...")
        graph_miner = ScientificGraphMiner(self.parquet_path)
        graph_results = graph_miner.analyze_network(top_hubs_limit=40)
        graph_file = put_artifact("graph_coauthorship.json", graph_results)
        manifest["modules"]["graph"] = {
            "elapsed_seconds": round(time.time() - t0, 2),
            "file": graph_file,
            "total_nodes": graph_results["network_summary"].get("total_nodes", graph_results["network_summary"].get("total_authors", 0)),
            "total_edges": graph_results["network_summary"].get("total_edges", graph_results["network_summary"].get("total_collaborations", 0)),
        }
        logger.info("[CHECKPOINT 4/5] [SUCCESS] Pillar 3 completed in %.2fs.", manifest["modules"]["graph"]["elapsed_seconds"])

        # ----------------------------------------------------------------------
        # Checkpoint 5: Pillar 4 - Trend Velocity & Structural Anomaly Mining
        # ----------------------------------------------------------------------
        t0 = time.time()
        logger.info("[CHECKPOINT 5/5] Executing Pillar 4: Trend Velocity & Structural Anomaly Mining...")
        trend_miner = TrendAnomalyMiner(self.parquet_path)
        trend_results = trend_miner.run_mining(contamination=0.02)
        trend_file = put_artifact("trends_anomalies.json", trend_results)
        manifest["modules"]["trends_anomalies"] = {
            "elapsed_seconds": round(time.time() - t0, 2),
            "file": trend_file,
            "anomalies_detected": len(trend_results.get("anomalies", [])),
        }
        logger.info("[CHECKPOINT 5/5] [SUCCESS] Pillar 4 completed in %.2fs.", manifest["modules"]["trends_anomalies"]["elapsed_seconds"])

        # ----------------------------------------------------------------------
        # Finalize Manifest
        # ----------------------------------------------------------------------
        total_time = round(time.time() - start_time, 2)
        manifest["total_execution_seconds"] = total_time
        manifest["status"] = "COMPLETED"

        manifest_file = put_artifact("mining_manifest.json", manifest)

        logger.info("================================================================================")
        logger.info("[MINING ENGINE] [SUMMARY] All 4 Pillars and EDA executed successfully in %.2fs.", total_time)
        logger.info("================================================================================")
        return manifest


def main():
    parser = argparse.ArgumentParser(description="Execute full Data Mining & EDA Engine (MinIO + Qdrant).")
    parser.add_argument("--parquet", type=str, default=None, help="s3:// URI of the Silver Parquet (default: primary Silver year file)")
    args = parser.parse_args()
    MiningEngine(parquet_path=args.parquet).run_all()


if __name__ == "__main__":
    main()
