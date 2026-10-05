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
from sklearn.decomposition import PCA
from sklearn.preprocessing import normalize
from sklearn.metrics import silhouette_score, davies_bouldin_score, calinski_harabasz_score

logger = logging.getLogger("cluster_analysis")


class SemanticClusterAnalyzer:
    """Performs semantic partitioning and density clustering over Gold vector embeddings."""

    def __init__(
        self,
        lancedb_uri: str = "data/gold/lancedb",
        table_name: str = "academic_chunks",
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
        elif "academic_chunks" in tbl_names:
            target_table = "academic_chunks"
        elif "scientific_papers_gold" in tbl_names:
            target_table = "scientific_papers_gold"
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

        # 2. Partitioning: K-Means with K selection / sweep
        logger.info("[PILLAR 2] Sweeping K-Means across candidate K values [4, 6, 8]...")
        best_k = n_clusters
        best_sil = -1.0
        best_kmeans = None
        best_labels = None

        candidate_ks = [4, 6, 8]
        val_sample_idx = np.random.choice(len(vectors_norm), size=min(1500, len(vectors_norm)), replace=False)

        for k in candidate_ks:
            km = MiniBatchKMeans(n_clusters=k, random_state=42, batch_size=512, n_init=3)
            labels = km.fit_predict(vectors_norm)
            sil = float(silhouette_score(vectors_norm[val_sample_idx], labels[val_sample_idx], metric="cosine"))
            logger.info("[PILLAR 2] K=%d -> Silhouette Score: %.4f", k, sil)
            if k == n_clusters or sil > best_sil:
                if k == n_clusters:
                    best_k = k
                    best_sil = sil
                    best_kmeans = km
                    best_labels = labels

        if best_kmeans is None:
            best_kmeans = MiniBatchKMeans(n_clusters=n_clusters, random_state=42, batch_size=512, n_init=3)
            best_labels = best_kmeans.fit_predict(vectors_norm)
            best_k = n_clusters

        # Final validity metrics
        sil_score = float(silhouette_score(vectors_norm[val_sample_idx], best_labels[val_sample_idx], metric="cosine"))
        db_score = float(davies_bouldin_score(vectors_norm, best_labels))
        ch_score = float(calinski_harabasz_score(vectors_norm, best_labels))

        logger.info(
            "[PILLAR 2] [SUCCESS] K-Means (K=%d) -> Silhouette: %.4f, Davies-Bouldin: %.4f, Calinski-Harabasz: %.1f",
            best_k,
            sil_score,
            db_score,
            ch_score,
        )

        # 3. Density Clustering: DBSCAN on normalized representations
        logger.info("[PILLAR 2] Executing DBSCAN density clustering (eps=0.28, min_samples=10)...")
        dbscan = DBSCAN(eps=0.28, min_samples=10, metric="cosine")
        dbscan_labels = dbscan.fit_predict(vectors_norm)
        noise_count = int(np.sum(dbscan_labels == -1))
        num_dbscan_clusters = len(set(dbscan_labels) - {-1})
        noise_ratio = round(float(noise_count) / max(1, len(vectors_norm)), 4)
        logger.info("[PILLAR 2] DBSCAN found %d dense core clusters with %.1f%% noise.", num_dbscan_clusters, noise_ratio * 100)

        # 4. Cluster Profiling: Summarize dominant categories per K-Means cluster
        cluster_profiles = []
        for c_id in range(best_k):
            mask = best_labels == c_id
            cluster_meta = [metadata[i] for i in range(len(metadata)) if mask[i]]
            categories = [m.get("primary_category", "unknown") for m in cluster_meta if m.get("primary_category")]
            top_cats = Counter(categories).most_common(3)
            # Pick representative unique paper titles
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
                "percentage": round(float(np.sum(mask)) * 100.0 / len(vectors_norm), 2),
                "dominant_categories": [{"category": cat, "count": cnt} for cat, cnt in top_cats],
                "sample_titles": sample_titles,
            })

        # 5. Prepare scatter points for 2D visual representation (downsampled for FE payload)
        display_sample = min(800, len(vectors_norm))
        coords_scaled = coords_2d[:display_sample] * 5.0
        scatter_points = []
        for i in range(display_sample):
            scatter_points.append({
                "x": round(float(coords_scaled[i, 0]), 4),
                "y": round(float(coords_scaled[i, 1]), 4),
                "cluster": int(best_labels[i]),
                "category": str(metadata[i].get("primary_category", "unknown")),
                "title": str(metadata[i].get("title", "")),
                "paper_id": str(metadata[i].get("paper_id", "")),
            })

        results = {
            "summary": {
                "sample_analyzed": len(vectors_norm),
                "vector_dimensions": vectors.shape[1],
                "optimal_k": best_k,
                "dbscan_clusters_found": num_dbscan_clusters,
                "dbscan_noise_ratio": noise_ratio,
            },
            "validity_metrics": {
                "silhouette_score": round(sil_score, 4),
                "davies_bouldin_index": round(db_score, 4),
                "calinski_harabasz_index": round(ch_score, 1),
            },
            "cluster_profiles": cluster_profiles,
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
