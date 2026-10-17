from pathlib import Path
import pytest
from src.transformation.html_parser import AcademicHTMLParser
from src.indexing.chunker import AcademicChunker
from src.indexing.qdrant_manager import QdrantManager


@pytest.fixture
def synthetic_html_paper():
    return """<!DOCTYPE html>
<html>
<head><title>Deep Equilibrium Diffusion Models</title></head>
<body>
    <h1 class="ltx_title">Deep Equilibrium Diffusion Models</h1>
    <div class="ltx_abstract">
        <p>We present deep equilibrium diffusion architectures for fast continuous-time score evaluation across complex generative modeling settings.</p>
    </div>
    <section class="ltx_section" id="intro">
        <h2>1. Introduction</h2>
        <p>Diffusion models have transformed generative modeling across vision and multimodal domains by defining continuous time reverse drift equations that reconstruct high dimensional distributions with exceptional empirical fidelity and stability.</p>
    </section>
    <section class="ltx_section" id="method">
        <h2>2. Methodology</h2>
        <p>By framing the reverse drift as a fixed point iteration, we solve the equilibrium equation directly through accelerated implicit differentiation, providing substantially improved sampling throughput while strictly maintaining distributional fidelity across validation metrics.</p>
    </section>
</body>
</html>"""



@pytest.mark.system
def test_complete_lakehouse_pipeline_flow(tmp_path: Path, synthetic_html_paper, mock_embedder):
    # Step 1: Parse HTML paper
    parser = AcademicHTMLParser()
    parsed = parser.parse(synthetic_html_paper)
    paper_id = "2401.99999"
    assert parsed["parsed_title"] == "Deep Equilibrium Diffusion Models"
    assert len(parsed["sections"]) >= 2

    # Step 2: Academic chunking via chunk_paper
    paper_record = {
        "paper_id": paper_id,
        "title": parsed["parsed_title"],
        "abstract": parsed["parsed_abstract"],
        "authors": ["Alice Smith", "Bob Jones"],
        "primary_category": "cs.AI",
        "sections_json": parsed["sections"],
    }
    chunker = AcademicChunker(max_chunk_words=500, overlap_words=50)
    all_chunks = chunker.chunk_paper(paper_record)

    assert len(all_chunks) >= 2

    # Step 3: Embed chunks with 768-D vectors
    texts = [c["text"] for c in all_chunks]
    vectors = mock_embedder.embed_documents(texts)
    assert len(vectors) == len(all_chunks)
    assert len(vectors[0]) == 768

    for c, vec in zip(all_chunks, vectors):
        c["vector"] = vec

    # Step 4: Index into Qdrant
    manager = QdrantManager(collection_name="pipeline_flow_gold_test")
    inserted_count = manager.insert_chunks(all_chunks)
    assert inserted_count == len(all_chunks)

    # Step 5: Query and verify retrieval
    query = "equilibrium fixed point iteration"
    q_vec = mock_embedder.embed_query(query)
    results_df = manager.vector_search(query_vector=q_vec, limit=2)

    assert len(results_df) > 0
    top_result = results_df.iloc[0]
    assert top_result["paper_id"] == "2401.99999"
    assert top_result["title"] == "Deep Equilibrium Diffusion Models"
    assert len(top_result["authors"]) > 0


@pytest.mark.system
def test_queue_consumer_three_tier_medallion_flow(tmp_path: Path, synthetic_html_paper, mock_embedder):
    from unittest.mock import MagicMock
    from src.ingestion.queue_consumer import QueueConsumer

    # Prepare QueueConsumer with mock embedder
    consumer = QueueConsumer(qdrant_client=QdrantManager(collection_name="pipeline_consumer_medallion_test"))
    consumer._embedder = mock_embedder

    paper_payload = {
        "paper_id": "2402.12345",
        "title": "Deep Equilibrium Diffusion Models",
        "abstract": "We present deep equilibrium diffusion architectures for fast continuous-time score evaluation across complex generative modeling settings.",
        "authors": ["Alice Smith", "Bob Jones"],
        "categories": ["cs.AI", "cs.LG"],
        "published_date": "2026-03-01T00:00:00Z",
        "raw_html": synthetic_html_paper,
    }

    # Execute consumer processing
    success = consumer.process_paper(paper_payload)
    assert success is True

    # 1. Verify Bronze exists on MinIO
    bronze_key = "bronze/papers/2026/2402.12345.json"
    assert consumer.storage.object_exists(bronze_key) is True

    # 2. Verify Silver Parquet exists on MinIO
    silver_key = "silver/papers/year=2026/papers.parquet"
    assert consumer.storage.object_exists(silver_key) is True

    # 3. Verify Gold vector indexing in Qdrant
    q_vec = mock_embedder.embed_query("diffusion models reverse drift")
    res = consumer.qdrant.vector_search(query_vector=q_vec, limit=3)
    assert len(res) > 0
    assert any(r["paper_id"] == "2402.12345" for _, r in res.iterrows())


