"""CLI Entry point for Gold Lakehouse Indexing Pipeline (Silver Parquet -> Qdrant Gold Vector DB).

Workflow:
1. Reads structured papers from Silver Parquet layer via DuckDB.
2. Performs domain-aware Section Chunking (Abstract + Intro + Method + Experiments) via AcademicChunker.
3. Generates 768-dim embeddings locally using Nomic-embed-text-v1.5 on Apple Silicon GPU (MPS).
4. Stores vectors and metadata into Qdrant collection (scientific_papers_gold).
5. Executes semantic vector search verification.

Usage:
    python -m src.pipelines.run_indexing --limit 500 --batch-size 32
"""

import argparse
import sys
import time
from pathlib import Path
from tabulate import tabulate

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config.settings import settings
from src.indexing.chunker import AcademicChunker
from src.indexing.embedder import NomicEmbedder
from src.indexing.qdrant_manager import QdrantManager
from src.storage.duckdb_engine import DuckDBEngine
from src.utils.logger import setup_pipeline_logging


def main():
    parser = argparse.ArgumentParser(
        description="Index Silver papers into Qdrant Gold Vector Lakehouse."
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=500,
        help="So luong bai bao can index vao Gold (mac dinh: 500 bai, 0 = tat ca bai trong Silver).",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=32,
        help="Batch size cho mo hinh embedding (mac dinh: 32).",
    )
    args = parser.parse_args()

    # Khoi tao log file theo timestamp tai logs/
    logger, log_file = setup_pipeline_logging(pipeline_name="gold_indexing")

    print("=" * 80)
    print("🚀 BẮT ĐẦU PIPELINE INDEXING GOLD LAYER (SILVER PARQUET -> QDRANT VECTOR DB)")
    print("=" * 80)
    print(f"📌 Vector Database: Qdrant ({settings.QDRANT_URL})")
    print(f"📌 Collection Target: {settings.QDRANT_COLLECTION}")
    print(f"📌 Model Embedding: {settings.EMBEDDING_MODEL_PATH}")
    print(f"📌 Log file: {log_file}")

    # 1. Doc du lieu tu Silver Parquet qua DuckDB
    print("\n[1/4] Truy van du lieu Silver Parquet qua DuckDB...")
    duckdb_engine = DuckDBEngine()
    limit_clause = f"LIMIT {args.limit}" if args.limit > 0 else ""
    silver_path = str(settings.ROOT_DIR / "data" / "silver" / "**" / "*.parquet")

    query = f"""
        SELECT paper_id, title, primary_category, abstract, full_text_structured, sections
        FROM '{silver_path}'
        {limit_clause}
    """
    df_silver = duckdb_engine.query_df(query)
    total_papers = len(df_silver)
    print(f"[INFO] Da tai {total_papers:,} bai bao tu Silver Parquet.")

    if total_papers == 0:
        print("[WARNING] Khong tim thay du lieu trong Silver Layer de indexing!")
        sys.exit(0)

    # 2. Phân đoạn học thuật (Section Chunking)
    print("\n[2/4] Phan doan van ban hoc thuat (Academic Section Chunking)...")
    chunker = AcademicChunker(chunk_size=512, chunk_overlap=64)
    all_chunks = []

    for _, row in df_silver.iterrows():
        paper_dict = {
            "paper_id": row["paper_id"],
            "title": row["title"],
            "primary_category": row["primary_category"],
            "abstract": row["abstract"],
            "sections": row.get("sections", []),
            "full_text_structured": row.get("full_text_structured", ""),
        }
        chunks = chunker.chunk_paper(paper_dict)
        all_chunks.extend(chunks)

    print(f"[INFO] Da sinh {len(all_chunks):,} chunks tu {total_papers:,} bai bao.")

    # 3. Vector Embedding
    print("\n[3/4] Tinh toan Vector Embeddings voi Nomic Embed...")
    embedder = NomicEmbedder()
    texts_to_embed = [c["text"] for c in all_chunks]

    t0 = time.time()
    embeddings = embedder.embed_documents(texts_to_embed, batch_size=args.batch_size)
    elapsed = time.time() - t0
    print(f"[INFO] Tinh toan xong {len(embeddings):,} vectors trong {elapsed:.2f}s ({len(embeddings)/max(0.1, elapsed):.1f} chunks/s).")

    for c, vec in zip(all_chunks, embeddings):
        c["vector"] = vec

    # 4. Ghi du lieu vao Qdrant
    print("\n[4/4] Luu tru vectors vao Qdrant Gold Collection...")
    qdrant_mgr = QdrantManager()
    inserted_count = qdrant_mgr.insert_chunks(all_chunks)
    print(f"[INFO] Da nap {inserted_count:,} ban ghi vao Qdrant Collection '{qdrant_mgr.collection_name}'.")

    # 5. Kiem thu Semantic Vector Search thuc te tren Tang Gold
    print("\n--- Kiem thu Semantic Vector Search tren Qdrant ---")
    sample_query = "How to improve OCR faithfulness and reduce hallucination in vision-language models?"
    print(f"[QUERY] Cau hoi tim kiem mau: \"{sample_query}\"")

    query_vec = embedder.embed_query(sample_query)
    search_results = qdrant_mgr.vector_search(query_vector=query_vec, limit=4)

    display_results = []
    if not search_results.empty:
        for _, res in search_results.iterrows():
            distance = res.get("_distance", 0.0)
            similarity = 1.0 - distance
            display_results.append(
                {
                    "Score (Sim)": f"{similarity:.4f}",
                    "Paper ID": res.get("paper_id", "N/A"),
                    "Section": f"{res.get('section_title', '')} ({res.get('section_type', '')})",
                    "Snippet": res.get("text", "")[:110] + "...",
                }
            )
        print(tabulate(display_results, headers="keys", tablefmt="pipe", showindex=False))
    else:
        print("[NOTICE] Khong tim thay ket qua tim kiem.")

    print("\n" + "=" * 80)
    print("🎉 HOAN THANH INDEXING VAO QDRANT GOLD LAYER THANH CONG!")
    print("=" * 80)


if __name__ == "__main__":
    main()
