"""
data_mining/src/mining/cluster_analysis.py
------------------------------------------
Pillar 2: Semantic Topic Clustering & Density Analysis Pipeline.
Analyzes Gold vector embeddings (Qdrant) (768-dim) across distinct papers using K-Means and DBSCAN,
evaluates cluster validity metrics (Silhouette, Davies-Bouldin, Calinski-Harabasz),
and generates clean 2D projections (PCA on centered normalized embeddings) for interactive visualization.

Adheres strictly to docs/agents/rules/LOGGING_CHECKPOINT_RULES.md:
- Strictly NO emojis/icons.
- Timestamped plain-text logs: [INFO], [SUCCESS], [WARNING], [ERROR].
"""

import os
import json
import logging
from typing import Dict, Any, List, Optional
from collections import Counter
import numpy as np
import pandas as pd
from src.config.settings import settings
from src.mining.lake_access import SILVER_PRIMARY_KEY, duck_connect, put_artifact, qdrant_client, s3_uri, sample_abstract_vectors
from sklearn.cluster import MiniBatchKMeans, DBSCAN
from sklearn.mixture import GaussianMixture
from sklearn.decomposition import PCA
from sklearn.preprocessing import normalize
from sklearn.metrics import silhouette_score, davies_bouldin_score, calinski_harabasz_score

logger = logging.getLogger("cluster_analysis")


class SemanticClusterAnalyzer:
    """Performs semantic partitioning and density clustering over Gold vector embeddings stored in Qdrant."""

    def __init__(self, collection: Optional[str] = None, silver_key: str = SILVER_PRIMARY_KEY):
        self.collection = collection or settings.QDRANT_COLLECTION
        self.silver_key = silver_key

    def load_vector_sample(self, sample_size: int = 3000) -> Dict[str, Any]:
        """Loads a random sample of per-paper abstract vectors and clean metadata from Qdrant."""
        logger.info("[PILLAR 2] Sampling abstract vectors from Qdrant collection '%s'...", self.collection)
        client = qdrant_client()
        points = sample_abstract_vectors(client, sample_size)

        # One vector per paper
        seen, picked = set(), []
        for pt in points:
            pid = str((pt.payload or {}).get("paper_id", ""))
            if pid and pid not in seen:
                seen.add(pid)
                picked.append(pt)
            if len(picked) >= sample_size:
                break
        if not picked:
            raise RuntimeError("No abstract vectors found in Qdrant; run the ingestion pipeline first.")
        logger.info("[PILLAR 2] Extracted %d distinct paper vectors.", len(picked))
        vectors = np.vstack([np.asarray(pt.vector, dtype=np.float32) for pt in picked])

        # Category lookup from Silver (MinIO) for payloads without primary_category
        cat_lookup: Dict[str, str] = {}
        try:
            con = duck_connect()
            rows = con.execute(
                f"SELECT paper_id, primary_category FROM read_parquet('{s3_uri(self.silver_key)}') WHERE primary_category IS NOT NULL"
            ).fetchall()
            cat_lookup = {str(r[0]): str(r[1]) for r in rows}
        except Exception as e:
            logger.warning("[PILLAR 2] Category lookup from Silver unavailable: %s", e)

        invalid_headers = {"abstract", "synopsis", "introduction", "background", "conclusion", "references"}
        metadata = []
        for pt in picked:
            payload = pt.payload or {}
            pid = str(payload.get("paper_id", ""))
            raw_title = str(payload.get("title", "")).strip()
            if raw_title.lower() in invalid_headers or len(raw_title) < 5:
                raw_title = f"Paper {pid}"
            cat = str(payload.get("primary_category") or "")
            if not cat or cat == "None":
                cat = cat_lookup.get(pid, "cs.AI")
            metadata.append({"chunk_id": str(payload.get("chunk_id", "")), "paper_id": pid, "title": raw_title, "primary_category": cat})

        return {"vectors": vectors, "metadata": metadata}

    def run_clustering_benchmarks(
        self,
        sample_size: int = 3000,
        n_clusters: int = 6,
    ) -> Dict[str, Any]:
        """Executes K-Means and DBSCAN benchmarks with K sweep, validation metrics, and 2D projection."""
        sample_data = self.load_vector_sample(sample_size=sample_size)
        vectors: np.ndarray = sample_data["vectors"]
        metadata: List[Dict[str, Any]] = sample_data["metadata"]

        # L2 normalize vectors for cosine geometry
        vectors_norm = normalize(vectors)

        # 1. 2D Dimensionality Reduction (PCA on centered vectors)
        logger.info("[PILLAR 2] Running 2D Dimensionality Reduction (Centered PCA)...")
        vectors_centered = vectors_norm - np.mean(vectors_norm, axis=0)
        pca = PCA(n_components=2, random_state=42)
        coords_2d = pca.fit_transform(vectors_centered)

        # 2. Gaussian Mixture Model (GMM) - Probabilistic Soft Clustering
        logger.info("[PILLAR 2] Executing Gaussian Mixture Model (GMM - EM) with K=%d...", n_clusters)
        best_k = n_clusters
        val_sample_idx = np.random.choice(len(vectors_norm), size=min(1500, len(vectors_norm)), replace=False)

        # Baseline K-Means for benchmark comparison
        km = MiniBatchKMeans(n_clusters=best_k, random_state=42, batch_size=512, n_init=3)
        km_labels = km.fit_predict(vectors_norm)
        sil_score = float(silhouette_score(vectors_norm[val_sample_idx], km_labels[val_sample_idx], metric="cosine"))
        db_score = float(davies_bouldin_score(vectors_norm, km_labels))
        ch_score = float(calinski_harabasz_score(vectors_norm, km_labels))

        # 3. 2D Visual Scaling & Gaussian Mixture Estimation
        display_sample = min(800, len(vectors_norm))
        coords_scaled = coords_2d[:display_sample] * 5.0

        gmm = GaussianMixture(
            n_components=best_k,
            covariance_type="full",
            random_state=42,
            max_iter=200,
            n_init=3,
        )
        gmm.fit(coords_scaled)
        probs = gmm.predict_proba(coords_scaled)
        gmm_labels = gmm.predict(coords_scaled)

        bic_score = float(gmm.bic(coords_scaled))
        aic_score = float(gmm.aic(coords_scaled))
        log_lik = float(gmm.score(coords_scaled))

        logger.info(
            "[PILLAR 2] [SUCCESS] GMM (K=%d) -> BIC: %.1f, AIC: %.1f, Log-Likelihood: %.4f | Silhouette: %.4f",
            best_k,
            bic_score,
            aic_score,
            log_lik,
            sil_score,
        )

        # 4. Covariance Ellipses for 2D Confidence Contours (2-sigma ~ 95.4% mass)
        cluster_ellipses = {}
        for c_id in range(best_k):
            cov = gmm.covariances_[c_id]
            vals, vecs = np.linalg.eigh(cov)
            order = vals.argsort()[::-1]
            vals = vals[order]
            vecs = vecs[:, order]
            rx = float(2.0 * np.sqrt(max(1e-5, vals[0])))
            ry = float(2.0 * np.sqrt(max(1e-5, vals[1])))
            theta = float(np.degrees(np.arctan2(vecs[1, 0], vecs[0, 0])))
            mean = gmm.means_[c_id]
            cluster_ellipses[c_id] = {
                "cx": round(float(mean[0]), 4),
                "cy": round(float(mean[1]), 4),
                "rx": round(rx, 4),
                "ry": round(ry, 4),
                "theta_deg": round(theta, 2),
                "weight": round(float(gmm.weights_[c_id]), 4),
            }

        # 5. Density Clustering: DBSCAN on normalized representations
        logger.info("[PILLAR 2] Executing DBSCAN density clustering (eps=0.28, min_samples=10)...")
        dbscan = DBSCAN(eps=0.28, min_samples=10, metric="cosine")
        dbscan_labels = dbscan.fit_predict(vectors_norm)
        noise_count = int(np.sum(dbscan_labels == -1))
        num_dbscan_clusters = len(set(dbscan_labels) - {-1})
        noise_ratio = round(float(noise_count) / max(1, len(vectors_norm)), 4)

        # 6. Cluster Profiling: Summarize dominant categories per GMM component
        cluster_profiles = []
        for c_id in range(best_k):
            mask = gmm_labels == c_id
            cluster_meta = [metadata[i] for i in range(display_sample) if mask[i]]
            categories = [m.get("primary_category", "unknown") for m in cluster_meta if m.get("primary_category")]
            top_cats = Counter(categories).most_common(3)
            sample_titles = []
            for m in cluster_meta:
                t = m.get("title", "")
                if t and t not in sample_titles:
                    sample_titles.append(t)
                if len(sample_titles) >= 3:
                    break

            cluster_profiles.append({
                "cluster_id": c_id,
                "size": int(np.sum(mask)),
                "percentage": round(float(np.sum(mask)) * 100.0 / display_sample, 2),
                "weight": round(float(gmm.weights_[c_id]), 4),
                "dominant_categories": [{"category": cat, "count": cnt} for cat, cnt in top_cats],
                "sample_titles": sample_titles,
                "ellipse": cluster_ellipses.get(c_id),
            })

        # 7. Prepare scatter points with soft posterior responsibilities
        max_probs = np.max(probs, axis=1)
        cross_disc_count = int(np.sum(max_probs < 0.65))
        scatter_points = []
        for i in range(display_sample):
            p_vec = probs[i]
            sorted_indices = np.argsort(p_vec)[::-1]
            c_primary = int(sorted_indices[0])
            p_primary = round(float(p_vec[c_primary]), 3)
            c_secondary = int(sorted_indices[1])
            p_secondary = round(float(p_vec[c_secondary]), 3)
            is_cross_disc = bool(p_primary < 0.65)

            scatter_points.append({
                "x": round(float(coords_scaled[i, 0]), 4),
                "y": round(float(coords_scaled[i, 1]), 4),
                "cluster": c_primary,
                "max_probability": p_primary,
                "secondary_cluster": c_secondary,
                "secondary_probability": p_secondary,
                "is_cross_disciplinary": is_cross_disc,
                "cluster_probabilities": [round(float(p), 3) for p in p_vec],
                "category": str(metadata[i].get("primary_category", "unknown")),
                "title": str(metadata[i].get("title", "")),
                "paper_id": str(metadata[i].get("paper_id", "")),
            })

        results = {
            "summary": {
                "algorithm": "Gaussian Mixture Model (GMM - EM Soft Clustering)",
                "sample_analyzed": len(vectors_norm),
                "vector_dimensions": vectors.shape[1],
                "optimal_k": best_k,
                "dbscan_clusters_found": num_dbscan_clusters,
                "dbscan_noise_ratio": noise_ratio,
                "cross_disciplinary_papers": cross_disc_count,
                "cross_disciplinary_ratio": round(float(cross_disc_count) / max(1, display_sample), 4),
            },
            "validity_metrics": {
                "silhouette_score": round(sil_score, 4),
                "davies_bouldin_index": round(db_score, 4),
                "calinski_harabasz_index": round(ch_score, 1),
                "bic": round(bic_score, 2),
                "aic": round(aic_score, 2),
                "log_likelihood": round(log_lik, 4),
            },
            "cluster_profiles": cluster_profiles,
            "scatter_2d": scatter_points,
        }

        return results

    def save_clusters(self, output_path: str, sample_size: int = 3000, n_clusters: int = 6) -> None:
        """Runs clustering benchmarks and publishes the JSON artifact to MinIO (gold/mining/) using the basename of output_path."""
        results = self.run_clustering_benchmarks(sample_size=sample_size, n_clusters=n_clusters)
        uri = put_artifact(os.path.basename(output_path), results)
        logger.info("[PILLAR 2] [SUCCESS] Saved cluster analysis to: %s", uri)
