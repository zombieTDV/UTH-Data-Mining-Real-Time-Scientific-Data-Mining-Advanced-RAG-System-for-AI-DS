"""
data_mining/src/mining/cluster_analysis.py
------------------------------------------
Pillar 2: Semantic Topic Clustering & Density Analysis Pipeline.
Analyzes Gold vector embeddings (Qdrant) (768-dim) across distinct papers using K-Means and DBSCAN,
evaluates cluster validity metrics (Silhouette, Davies-Bouldin, Calinski-Harabasz),
and generates clean 2D projections (PCA on centered normalized embeddings) for interactive visualization.

Adheres strictly to agents/rules/LOGGING_CHECKPOINT_RULES.md:
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
from src.mining.lake_access import SILVER_PRIMARY_KEY, all_abstract_vectors, duck_connect, put_artifact, qdrant_client, s3_uri, sample_abstract_vectors
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

        # Title / category from Silver (MinIO): the Qdrant payload only carries chunk identity + filter fields
        cat_lookup: Dict[str, str] = {}
        title_lookup: Dict[str, str] = {}
        try:
            con = duck_connect()
            con.execute("CREATE TEMP TABLE picked(paper_id VARCHAR)")
            con.executemany("INSERT INTO picked VALUES (?)", [[str((pt.payload or {}).get("paper_id", ""))] for pt in picked])
            rows = con.execute(
                f"SELECT s.paper_id, s.primary_category, s.title FROM read_parquet('{s3_uri(self.silver_key)}', union_by_name=true) s "
                "JOIN picked USING (paper_id)"
            ).fetchall()
            cat_lookup = {str(r[0]): str(r[1]) for r in rows if r[1]}
            title_lookup = {str(r[0]): str(r[2]) for r in rows if r[2]}
        except Exception as e:
            logger.warning("[PILLAR 2] Title/category lookup from Silver unavailable: %s", e)

        invalid_headers = {"abstract", "synopsis", "introduction", "background", "conclusion", "references"}
        metadata = []
        for pt in picked:
            payload = pt.payload or {}
            pid = str(payload.get("paper_id", ""))
            raw_title = str(payload.get("title") or title_lookup.get(pid, "")).strip()
            if raw_title.lower() in invalid_headers or len(raw_title) < 5:
                raw_title = f"Paper {pid}"
            cat = str(payload.get("primary_category") or "")
            if not cat or cat == "None":
                cat = cat_lookup.get(pid, "cs.AI")
            metadata.append({"chunk_id": str(payload.get("chunk_id", "")), "paper_id": pid, "title": raw_title, "primary_category": cat})

        return {"vectors": vectors, "metadata": metadata}

    def load_all_vectors(self) -> Dict[str, Any]:
        """Every paper's abstract vector in Qdrant (one per paper). Category comes from the point payload;
        titles are looked up later, only for the points that are displayed."""
        logger.info("[PILLAR 2] Loading ALL abstract vectors from Qdrant collection '%s'...", self.collection)
        seen, rows, vecs = set(), [], []
        for pt in all_abstract_vectors(qdrant_client()):
            payload = pt.payload or {}
            pid = str(payload.get("paper_id", ""))
            if not pid or pid in seen or pt.vector is None:
                continue
            seen.add(pid)
            vecs.append(np.asarray(pt.vector, dtype=np.float32))
            rows.append({"chunk_id": str(payload.get("chunk_id", "")), "paper_id": pid, "title": "",
                         "primary_category": str(payload.get("primary_category") or "")})
        if not vecs:
            raise RuntimeError("No abstract vectors found in Qdrant; run the ingestion pipeline first.")
        logger.info("[PILLAR 2] Loaded %d distinct paper vectors.", len(vecs))
        return {"vectors": np.vstack(vecs), "metadata": rows}

    def _fill_titles(self, metadata: List[Dict[str, Any]], idx: np.ndarray) -> None:
        """Fill title (and a missing category) from Silver for the given metadata rows only."""
        need = [int(i) for i in idx if not metadata[int(i)].get("title")]
        if not need:
            return
        try:
            con = duck_connect()
            con.execute("CREATE TEMP TABLE want(paper_id VARCHAR)")
            con.executemany("INSERT INTO want VALUES (?)", [[metadata[i]["paper_id"]] for i in need])
            rows = con.execute(
                f"SELECT s.paper_id, s.primary_category, s.title FROM read_parquet('{s3_uri(self.silver_key)}', union_by_name=true) s "
                "JOIN want USING (paper_id)"
            ).fetchall()
            title = {str(r[0]): str(r[2]) for r in rows if r[2]}
            cat = {str(r[0]): str(r[1]) for r in rows if r[1]}
        except Exception as e:
            logger.warning("[PILLAR 2] Title lookup from Silver unavailable: %s", e)
            title, cat = {}, {}
        for i in need:
            m = metadata[i]
            m["title"] = title.get(m["paper_id"]) or f"Paper {m['paper_id']}"
            if not m.get("primary_category") or m["primary_category"] == "None":
                m["primary_category"] = cat.get(m["paper_id"], "unknown")

    def run_clustering_benchmarks(
        self,
        sample_size: Optional[int] = None,
        n_clusters: int = 6,
        display_points: int = 2000,
        silhouette_sample: int = 5000,
        dbscan_sample: int = 3000,
        grid: tuple = (96, 72),
    ) -> Dict[str, Any]:
        """K-Means, PCA 2D and GMM over every paper (sample_size=None) or a random sample of sample_size papers.

        Silhouette and DBSCAN are O(n^2), so they run on a random subset whose size is reported in the summary.
        The artifact carries cluster profiles over all papers, a 2D density grid covering all papers, and
        `display_points` individual points (with titles) for hover in the UI."""
        data = self.load_all_vectors() if sample_size is None else self.load_vector_sample(sample_size=sample_size)
        vectors: np.ndarray = np.asarray(data["vectors"], dtype=np.float32)
        metadata: List[Dict[str, Any]] = data["metadata"]
        n = len(vectors)
        rng = np.random.default_rng(42)
        best_k = n_clusters

        vectors_norm = normalize(vectors)

        # 1. K-Means on all 768-d vectors: validity metrics
        logger.info("[PILLAR 2] K-Means (K=%d) on %d papers...", best_k, n)
        km = MiniBatchKMeans(n_clusters=best_k, random_state=42, batch_size=2048, n_init=3)
        km_labels = km.fit_predict(vectors_norm)
        sil_n = min(silhouette_sample, n)
        sil_idx = rng.choice(n, size=sil_n, replace=False)
        sil_score = float(silhouette_score(vectors_norm[sil_idx], km_labels[sil_idx], metric="cosine"))
        db_score = float(davies_bouldin_score(vectors_norm, km_labels))
        ch_score = float(calinski_harabasz_score(vectors_norm, km_labels))

        # 2. PCA 2D on all papers, GMM on the 2D projection of all papers
        logger.info("[PILLAR 2] PCA 2D + GMM (K=%d) on %d papers...", best_k, n)
        coords = PCA(n_components=2, random_state=42).fit_transform(vectors_norm - vectors_norm.mean(axis=0)) * 5.0
        gmm = GaussianMixture(n_components=best_k, covariance_type="full", random_state=42, max_iter=200, n_init=3)
        gmm.fit(coords)
        probs = gmm.predict_proba(coords)
        labels = probs.argmax(axis=1)
        max_probs = probs.max(axis=1)
        bic_score, aic_score, log_lik = float(gmm.bic(coords)), float(gmm.aic(coords)), float(gmm.score(coords))
        logger.info("[PILLAR 2] [SUCCESS] GMM -> BIC %.1f, AIC %.1f, LL %.4f | Silhouette %.4f (on %d)",
                    bic_score, aic_score, log_lik, sil_score, sil_n)

        # 3. Covariance ellipses (2-sigma)
        cluster_ellipses = {}
        for c_id in range(best_k):
            vals, vecs = np.linalg.eigh(gmm.covariances_[c_id])
            order = vals.argsort()[::-1]
            vals, vecs = vals[order], vecs[:, order]
            mean = gmm.means_[c_id]
            cluster_ellipses[c_id] = {
                "cx": round(float(mean[0]), 4), "cy": round(float(mean[1]), 4),
                "rx": round(float(2.0 * np.sqrt(max(1e-5, vals[0]))), 4), "ry": round(float(2.0 * np.sqrt(max(1e-5, vals[1]))), 4),
                "theta_deg": round(float(np.degrees(np.arctan2(vecs[1, 0], vecs[0, 0]))), 2),
                "weight": round(float(gmm.weights_[c_id]), 4),
            }

        # 4. DBSCAN (O(n^2)) on a random subset
        db_n = min(dbscan_sample, n)
        db_idx = rng.choice(n, size=db_n, replace=False)
        logger.info("[PILLAR 2] DBSCAN (eps=0.28, min_samples=10) on %d papers...", db_n)
        dbscan_labels = DBSCAN(eps=0.28, min_samples=10, metric="cosine").fit_predict(vectors_norm[db_idx])
        num_dbscan_clusters = len(set(dbscan_labels) - {-1})
        noise_ratio = round(float(np.sum(dbscan_labels == -1)) / max(1, db_n), 4)

        # 5. Display points (with titles) for hover
        disp_n = min(display_points, n)
        disp_idx = np.sort(rng.choice(n, size=disp_n, replace=False))
        self._fill_titles(metadata, disp_idx)

        # 6. Cluster profiles over ALL papers
        cats = np.array([m.get("primary_category") or "unknown" for m in metadata], dtype=object)
        cluster_profiles = []
        for c_id in range(best_k):
            mask = labels == c_id
            size = int(mask.sum())
            top_cats = Counter(cats[mask].tolist()).most_common(3)
            sample_titles = [metadata[int(i)]["title"] for i in disp_idx if labels[int(i)] == c_id][:3]
            cluster_profiles.append({
                "cluster_id": c_id,
                "size": size,
                "percentage": round(size * 100.0 / max(1, n), 2),
                "weight": round(float(gmm.weights_[c_id]), 4),
                "cross_disciplinary": int(np.sum(mask & (max_probs < 0.65))),
                "dominant_categories": [{"category": c, "count": int(k)} for c, k in top_cats],
                "sample_titles": sample_titles,
                "ellipse": cluster_ellipses.get(c_id),
            })

        # 7. Density grid over ALL papers: per non-empty cell the paper count and its dominant cluster
        lo, hi = np.percentile(coords, 0.2, axis=0), np.percentile(coords, 99.8, axis=0)
        nx, ny = grid
        ix = np.clip(((coords[:, 0] - lo[0]) / max(1e-9, hi[0] - lo[0]) * nx).astype(int), 0, nx - 1)
        iy = np.clip(((coords[:, 1] - lo[1]) / max(1e-9, hi[1] - lo[1]) * ny).astype(int), 0, ny - 1)
        counts = np.zeros((nx, ny, best_k), dtype=np.int32)
        np.add.at(counts, (ix, iy, labels), 1)
        cells = [[int(a), int(b), int(counts[a, b].sum()), int(counts[a, b].argmax())]
                 for a, b in zip(*np.nonzero(counts.sum(axis=2)))]
        density = {"x0": round(float(lo[0]), 4), "x1": round(float(hi[0]), 4), "y0": round(float(lo[1]), 4),
                   "y1": round(float(hi[1]), 4), "nx": nx, "ny": ny, "cells": cells}

        # 8. Scatter points (display subset) with soft posteriors
        scatter_points = []
        for i in disp_idx:
            i = int(i)
            order = np.argsort(probs[i])[::-1]
            p1, p2 = round(float(probs[i][order[0]]), 3), round(float(probs[i][order[1]]), 3)
            scatter_points.append({
                "x": round(float(coords[i, 0]), 4), "y": round(float(coords[i, 1]), 4),
                "cluster": int(order[0]), "max_probability": p1,
                "secondary_cluster": int(order[1]), "secondary_probability": p2,
                "is_cross_disciplinary": bool(max_probs[i] < 0.65),
                "cluster_probabilities": [round(float(p), 3) for p in probs[i]],
                "category": str(metadata[i].get("primary_category", "unknown")),
                "title": str(metadata[i].get("title", "")),
                "paper_id": str(metadata[i].get("paper_id", "")),
            })

        cross = int(np.sum(max_probs < 0.65))
        return {
            "summary": {
                "algorithm": "Gaussian Mixture Model (GMM - EM Soft Clustering)",
                "sample_analyzed": n,
                "vector_dimensions": int(vectors.shape[1]),
                "optimal_k": best_k,
                "display_points": disp_n,
                "silhouette_sample": sil_n,
                "dbscan_sample": db_n,
                "dbscan_clusters_found": num_dbscan_clusters,
                "dbscan_noise_ratio": noise_ratio,
                "cross_disciplinary_papers": cross,
                "cross_disciplinary_ratio": round(cross / max(1, n), 4),
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
            "density_2d": density,
            "scatter_2d": scatter_points,
        }

    def save_clusters(self, output_path: str, sample_size: Optional[int] = None, n_clusters: int = 6) -> None:
        """Runs clustering benchmarks and publishes the JSON artifact to MinIO (gold/mining/) using the basename of output_path."""
        results = self.run_clustering_benchmarks(sample_size=sample_size, n_clusters=n_clusters)
        uri = put_artifact(os.path.basename(output_path), results)
        logger.info("[PILLAR 2] [SUCCESS] Saved cluster analysis to: %s", uri)
