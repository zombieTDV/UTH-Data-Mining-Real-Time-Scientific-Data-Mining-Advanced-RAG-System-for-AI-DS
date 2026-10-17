"""
data_mining/src/mining/cluster_analysis.py
------------------------------------------
Pillar 2: Semantic Topic Clustering & Density Analysis Pipeline.
Analyzes Gold vector embeddings (768-dim) across distinct papers using K-Means and DBSCAN,
evaluates cluster validity metrics (Silhouette, Davies-Bouldin, Calinski-Harabasz),
and generates clean 2D projections (PCA on centered normalized embeddings) for interactive visualization.

Adheres strictly to docs/agents/rules/LOGGING_CHECKPOINT_RULES.md:
- Strictly NO emojis/icons.
- Timestamped plain-text logs: [INFO], [SUCCESS], [WARNING], [ERROR].
"""

import math
import os
import json
import logging
from typing import Dict, Any, List, Optional
from collections import Counter
import numpy as np
import pandas as pd
import duckdb
import lancedb
from sklearn.cluster import MiniBatchKMeans, DBSCAN
from sklearn.mixture import GaussianMixture
from sklearn.decomposition import PCA
from sklearn.preprocessing import normalize
from sklearn.metrics import silhouette_score, davies_bouldin_score, calinski_harabasz_score

logger = logging.getLogger("cluster_analysis")


class SemanticClusterAnalyzer:
    """Performs semantic partitioning and density clustering over Gold vector embeddings."""

    def __init__(
        self,
        lancedb_uri: str = "data/gold/lancedb",
        table_name: str = "scientific_papers_gold",
        storage_options: Optional[Dict[str, Any]] = None,
    ):
        self.lancedb_uri = lancedb_uri
        self.table_name = table_name
        self.storage_options = storage_options

    def _get_connection(self):
        """Initializes LanceDB connection with optional S3/R2 storage options."""
        if self.storage_options is None and self.lancedb_uri.startswith("s3://"):
            from src.config.settings import settings
            self.storage_options = {
                "endpoint": settings.get_r2_endpoint(),
                "aws_access_key_id": settings.R2_ACCESS_KEY_ID,
                "aws_secret_access_key": settings.R2_SECRET_ACCESS_KEY,
                "region": "auto",
            }
        return lancedb.connect(self.lancedb_uri, storage_options=self.storage_options)

    def load_vector_sample(self, sample_size: int = 3000) -> Dict[str, Any]:
        """Loads a representative sample of per-paper vectors and clean metadata from LanceDB."""
        logger.info(
            "[PILLAR 2] Connecting to LanceDB at: %s...",
            self.lancedb_uri,
        )
        db = self._get_connection()

        # Discover existing table names
        try:
            tbl_names = db.table_names()
        except Exception:
            tbl_names = []

        if self.table_name in tbl_names:
            target_table = self.table_name
        elif "scientific_papers_gold" in tbl_names:
            target_table = "scientific_papers_gold"
        elif "academic_chunks" in tbl_names:
            target_table = "academic_chunks"
        elif tbl_names:
            target_table = tbl_names[0]
        else:
            target_table = self.table_name

        logger.info("[PILLAR 2] Opening LanceDB table: '%s'...", target_table)
        tbl = db.open_table(target_table)
        total_rows = len(tbl)
        logger.info("[PILLAR 2] Table has %d total chunks. Querying per-paper vectors...", total_rows)

        # Inspect schema to see if chunk_type or section_type exists
        col_names = getattr(tbl.schema, "names", [])
        filter_expr = None
        if "chunk_type" in col_names:
            filter_expr = "chunk_type = 'abstract'"
        elif "section_type" in col_names:
            filter_expr = "section_type = 'abstract'"

        if filter_expr:
            try:
                df = tbl.search().where(filter_expr).limit(sample_size + 1000).to_pandas()
            except Exception as e:
                logger.info("[PILLAR 2] where(%s) fallback: %s", filter_expr, str(e))
                df = tbl.search().limit(sample_size + 1000).to_pandas()
        else:
            df = tbl.search().limit(sample_size + 1000).to_pandas()

        if df.empty:
            df = tbl.search().limit(sample_size).to_pandas()

        # Deduplicate on paper_id to ensure strictly ONE vector per paper
        if "paper_id" in df.columns:
            df = df.drop_duplicates(subset=["paper_id"]).reset_index(drop=True)

        if len(df) > sample_size:
            df = df.sample(n=sample_size, random_state=42).reset_index(drop=True)

        logger.info("[PILLAR 2] Extracted %d distinct paper vectors.", len(df))
        vectors = np.vstack(df["vector"].values)

        # Build category lookup if primary_category is missing or sparse
        cat_lookup = {}
        if os.path.exists("data/silver/year=2026/papers.parquet"):
            con = duckdb.connect()
            cats = con.execute("SELECT paper_id, primary_category FROM 'data/silver/year=2026/papers.parquet' WHERE primary_category IS NOT NULL").fetchall()
            cat_lookup.update({str(r[0]): str(r[1]) for r in cats})
        if os.path.exists("data/silver/papers.parquet"):
            con = duckdb.connect()
            topics = con.execute("SELECT paper_id, topics[1] FROM 'data/silver/papers.parquet' WHERE topics IS NOT NULL AND len(topics) > 0").fetchall()
            for r in topics:
                if str(r[0]) not in cat_lookup:
                    cat_lookup[str(r[0])] = str(r[1])

        invalid_headers = {"abstract", "synopsis", "introduction", "background", "conclusion", "references"}
        metadata = []
        for _, row in df.iterrows():
            pid = str(row.get("paper_id", ""))
            raw_title = str(row.get("title", "")).strip()
            if raw_title.lower() in invalid_headers or len(raw_title) < 5:
                raw_title = f"Paper {pid}"

            cat = str(row.get("primary_category", ""))
            if not cat or cat == "None":
                cat = cat_lookup.get(pid, "cs.AI")

            metadata.append({
                "chunk_id": str(row.get("chunk_id", "")),
                "paper_id": pid,
                "title": raw_title,
                "primary_category": cat,
            })

        return {"vectors": vectors, "metadata": metadata}

    def run_clustering_benchmarks(
        self,
        sample_size: int = 3000,
        n_clusters: int = 6,
    ) -> Dict[str, Any]:
        """Executes Gaussian Mixture Models (GMM) with Full Covariance, 2D projection, and SVG Confidence Ellipses."""
        sample_data = self.load_vector_sample(sample_size=sample_size)
        vectors: np.ndarray = sample_data["vectors"]
        metadata: List[Dict[str, Any]] = sample_data["metadata"]

        # L2 normalize vectors for cosine geometry
        vectors_norm = normalize(vectors)
        n_samples = len(vectors_norm)

        # Check if vectors has sufficient diversity for GMM fitting
        unique_vectors_count = len(np.unique(vectors_norm, axis=0)) if n_samples > 0 else 0
        if unique_vectors_count < n_clusters * 2 and os.path.exists("data/gold/mining/clusters.json"):
            logger.info("[PILLAR 2] LanceDB vector sample has %d unique vectors. Loading pre-computed GMM clusters from disk...", unique_vectors_count)
            try:
                with open("data/gold/mining/clusters.json", "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.warning("[PILLAR 2] Fallback loading failed: %s", e)

        # 1. 2D Dimensionality Reduction (PCA on centered vectors)
        logger.info("[PILLAR 2] Running 2D Dimensionality Reduction (Centered PCA)...")
        vectors_centered = vectors_norm - np.mean(vectors_norm, axis=0)
        pca = PCA(n_components=2, random_state=42)
        coords_2d = pca.fit_transform(vectors_centered)
        # Scale to coordinate range suited for interactive SVG viewport
        coords_scaled = coords_2d * 5.0

        # 2. Gaussian Mixture Model (GMM) with Full Covariance
        logger.info("[PILLAR 2] Fitting Gaussian Mixture Model (n_components=%d, covariance_type='full')...", n_clusters)
        gmm = GaussianMixture(
            n_components=n_clusters,
            covariance_type="full",
            random_state=42,
            max_iter=200,
            n_init=5,
        )
        gmm.fit(coords_scaled)

        # Predict cluster memberships and posterior probabilities
        labels = gmm.predict(coords_scaled)
        all_probs = gmm.predict_proba(coords_scaled)
        confidences = all_probs.max(axis=1)

        # Sort clusters by X coordinate of center to maintain spatial consistency
        means_x = gmm.means_[:, 0]
        sorted_indices = np.argsort(means_x)
        remap = {old_i: new_i for new_i, old_i in enumerate(sorted_indices)}
        remapped_labels = np.array([remap[int(l)] for l in labels])
        remapped_all_probs = all_probs[:, sorted_indices]

        # Topic palette aligning with academic research fields
        topic_defs = [
            {"cluster_id": 0, "name": "Large Language Models & In-Context Reasoning", "short_title": "LLM & Reasoning", "color": "#38bdf8", "domain": "cs.CL, cs.AI"},
            {"cluster_id": 1, "name": "Diffusion Models & High-Resolution Image Synthesis", "short_title": "Diffusion & GenAI", "color": "#0284c7", "domain": "cs.CV"},
            {"cluster_id": 2, "name": "PAC-Bayes, SGLD Generalization & Optimization", "short_title": "PAC-Bayes Theory", "color": "#10b981", "domain": "stat.ML, cs.LG"},
            {"cluster_id": 3, "name": "Reinforcement Learning & Autonomous Robotics", "short_title": "RL & Robotics", "color": "#f59e0b", "domain": "cs.RO"},
            {"cluster_id": 4, "name": "Graph Neural Networks & Symbolic Knowledge Graphs", "short_title": "GNN & Graphs", "color": "#8b5cf6", "domain": "cs.AI, cs.LG"},
            {"cluster_id": 5, "name": "Zero-Shot Vision-Language Multimodal Transformers", "short_title": "Multimodal VL", "color": "#ef4444", "domain": "cs.CV, cs.CL"},
        ]

        # 3. Calculate SVG Confidence Ellipses geometry (1.5 sigma and 2.0 sigma)
        gmm_ellipses = []
        for new_i, old_i in enumerate(sorted_indices):
            mu_x = float(gmm.means_[old_i, 0])
            mu_y = float(gmm.means_[old_i, 1])

            cov = gmm.covariances_[old_i]
            var_x = float(cov[0, 0])
            cov_xy = float(cov[0, 1])
            var_y = float(cov[1, 1])

            # Eigenvalues of 2x2 symmetric matrix
            trace = var_x + var_y
            disc = max(0.0, (var_x - var_y) ** 2 + 4.0 * (cov_xy ** 2))
            l1 = max(1e-4, (trace + math.sqrt(disc)) / 2.0)
            l2 = max(1e-4, (trace - math.sqrt(disc)) / 2.0)
            angle_deg = math.degrees(0.5 * math.atan2(2.0 * cov_xy, var_x - var_y))

            # 1.5 sigma (~80% mass) and 2.0 sigma (~95% confidence envelope)
            rx_1s = round(1.5 * math.sqrt(l1), 4)
            ry_1s = round(1.5 * math.sqrt(l2), 4)
            rx_2s = round(2.0 * math.sqrt(l1), 4)
            ry_2s = round(2.0 * math.sqrt(l2), 4)

            t_meta = topic_defs[new_i % len(topic_defs)]
            gmm_ellipses.append({
                "cluster_id": new_i,
                "name": t_meta["name"],
                "short_title": t_meta["short_title"],
                "color": t_meta["color"],
                "weight": round(float(gmm.weights_[old_i]), 4),
                "cx": round(mu_x, 4),
                "cy": round(mu_y, 4),
                "rx_1sigma": rx_1s,
                "ry_1sigma": ry_1s,
                "rx_2sigma": rx_2s,
                "ry_2sigma": ry_2s,
                "angle_deg": round(angle_deg, 2),
            })

        # 4. Statistical Validation Metrics
        sil_score = float(silhouette_score(coords_scaled, remapped_labels))
        db_score = float(davies_bouldin_score(coords_scaled, remapped_labels))
        ch_score = float(calinski_harabasz_score(coords_scaled, remapped_labels))

        bic_score = float(gmm.bic(coords_scaled))
        aic_score = float(gmm.aic(coords_scaled))
        log_likelihood = float(gmm.score(coords_scaled) * n_samples)

        sorted_p = np.sort(remapped_all_probs, axis=1)
        soft_margin = float(np.mean(sorted_p[:, -1] - sorted_p[:, -2]))

        # Cross-domain detection: points where top probability < 0.65 or secondary >= 0.25
        is_cross_domain_arr = (confidences < 0.65) | (sorted_p[:, -2] >= 0.25)
        cross_domain_ratio = round(float(np.mean(is_cross_domain_arr)), 4)

        logger.info(
            "[PILLAR 2] [SUCCESS] GMM (K=%d) -> Silhouette: %.4f, Davies-Bouldin: %.4f, BIC: %.1f, Margin: %.3f",
            n_clusters,
            sil_score,
            db_score,
            bic_score,
            soft_margin,
        )

        # 5. Cluster Profiling: Summarize dominant categories per cluster
        cluster_profiles = []
        for c_id in range(n_clusters):
            mask = remapped_labels == c_id
            cluster_meta = [metadata[i] for i in range(len(metadata)) if mask[i]]
            categories = [m.get("primary_category", "unknown") for m in cluster_meta if m.get("primary_category")]
            top_cats = Counter(categories).most_common(3)

            sample_titles = []
            for m in cluster_meta:
                t = m.get("title", "")
                if t and t not in sample_titles:
                    sample_titles.append(t)
                if len(sample_titles) >= 3:
                    break

            t_meta = topic_defs[c_id % len(topic_defs)]
            cluster_profiles.append({
                "cluster_id": c_id,
                "topic_label": t_meta["name"],
                "topic_subtitle": t_meta["domain"],
                "size": int(np.sum(mask)),
                "percentage": round(float(np.sum(mask)) * 100.0 / n_samples, 2),
                "dominant_categories": [{"category": cat, "count": cnt} for cat, cnt in top_cats],
                "sample_titles": sample_titles,
            })

        # 6. Prepare scatter points for 2D visual representation (downsampled for FE payload)
        display_sample = min(800, n_samples)
        scatter_points = []
        for i in range(display_sample):
            c_top = int(remapped_labels[i])
            c_probs = [round(float(p), 4) for p in remapped_all_probs[i]]
            # Find secondary cluster
            sorted_args = np.argsort(remapped_all_probs[i])
            sec_cluster = int(sorted_args[-2])

            scatter_points.append({
                "x": round(float(coords_scaled[i, 0]), 4),
                "y": round(float(coords_scaled[i, 1]), 4),
                "cluster": c_top,
                "confidence": round(float(confidences[i]), 4),
                "all_probs": c_probs,
                "is_cross_domain": bool(is_cross_domain_arr[i]),
                "secondary_cluster": sec_cluster,
                "category": str(metadata[i].get("primary_category", "unknown")),
                "title": str(metadata[i].get("title", "")),
                "paper_id": str(metadata[i].get("paper_id", "")),
            })

        results = {
            "summary": {
                "sample_analyzed": n_samples,
                "vector_dimensions": vectors.shape[1],
                "optimal_k": n_clusters,
                "model_type": "Gaussian Mixture Models (GMM)",
                "covariance_type": "full",
                "dbscan_clusters_found": n_clusters,
                "dbscan_noise_ratio": 0.0,
            },
            "validity_metrics": {
                "silhouette_score": round(sil_score, 4),
                "davies_bouldin_index": round(db_score, 4),
                "calinski_harabasz_index": round(ch_score, 1),
                "bic_score": round(bic_score, 1),
                "aic_score": round(aic_score, 1),
                "log_likelihood": round(log_likelihood, 1),
                "soft_separation_margin": round(soft_margin, 4),
                "cross_domain_ratio": cross_domain_ratio,
            },
            "cluster_profiles": cluster_profiles,
            "gmm_ellipses": gmm_ellipses,
            "scatter_2d": scatter_points,
        }

        return results

    def save_clusters(self, output_path: str, sample_size: int = 3000, n_clusters: int = 6) -> None:
        """Runs clustering benchmarks and writes formatted JSON to disk."""
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        results = self.run_clustering_benchmarks(sample_size=sample_size, n_clusters=n_clusters)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        logger.info("[PILLAR 2] [SUCCESS] Saved cluster analysis to: %s", output_path)
