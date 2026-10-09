"""Unit tests for AssociationRuleMiner and CoauthorshipGraphMiner in src/mining/."""
from pathlib import Path
import networkx as nx
import pandas as pd
import pytest
from src.mining.association_rules import AssociationRuleMiner, KEYWORD_VOCAB
from src.mining.graph_mining import CoauthorshipGraphMiner


@pytest.fixture
def synthetic_parquet(tmp_path: Path) -> Path:
    """Creates a temporary Parquet file with synthetic academic papers."""
    p_file = tmp_path / "test_papers.parquet"
    data = [
        {
            "paper_id": "p1",
            "title": "Diffusion Models and Transformers for Computer Vision",
            "abstract": "We explore diffusion models combined with transformer architectures for vision.",
            "authors": ["Alice", "Bob"],
            "primary_category": "cs.CV",
            "categories": ["cs.CV", "cs.AI"],
        },
        {
            "paper_id": "p2",
            "title": "Large Language Models with Reinforcement Learning",
            "abstract": "We study transformer llm alignment via reinforcement learning.",
            "authors": ["Bob", "Charlie"],
            "primary_category": "cs.CL",
            "categories": ["cs.CL", "cs.AI"],
        },
        {
            "paper_id": "p3",
            "title": "Graph Neural Networks and Reinforcement Learning",
            "abstract": "Graph neural architectures optimized with reinforcement learning.",
            "authors": ["Alice", "Charlie"],
            "primary_category": "cs.LG",
            "categories": ["cs.LG", "cs.AI"],
        },
        {
            "paper_id": "p4",
            "title": "Single Author Autonomous Agent",
            "abstract": "Autonomous agent design.",
            "authors": ["Solo Author"],
            "primary_category": "cs.AI",
            "categories": ["cs.AI"],
        },
    ]
    df = pd.DataFrame(data)
    df.to_parquet(p_file, index=False)
    return p_file


@pytest.mark.unit
def test_keyword_vocab_definitions():
    assert len(KEYWORD_VOCAB) > 10
    terms = [kw[0] for kw in KEYWORD_VOCAB]
    assert "diffusion" in terms
    assert "transformer" in terms
    assert "rag" in terms


@pytest.mark.unit
def test_association_rule_transactions(synthetic_parquet):
    miner = AssociationRuleMiner(str(synthetic_parquet))
    transactions = miner._extract_transactions()

    assert len(transactions) >= 3
    # Check that tags and categories are properly prefixed
    for t in transactions:
        assert any(item.startswith("cat:") for item in t)
        assert any(item.startswith("tag:") for item in t)


@pytest.mark.unit
def test_coauthorship_fallback_network(synthetic_parquet):
    miner = CoauthorshipGraphMiner(str(synthetic_parquet))
    G = miner.build_coauthorship_fallback()

    assert isinstance(G, nx.Graph)
    # Alice, Bob, Charlie collaborate in pairs
    assert "Alice" in G.nodes
    assert "Bob" in G.nodes
    assert "Charlie" in G.nodes
    assert G.has_edge("Alice", "Bob")
    assert G.has_edge("Bob", "Charlie")
    assert G.has_edge("Alice", "Charlie")

    # Solo Author has no coauthors, so is not in the edge-induced coauthorship graph
    assert "Solo Author" not in G.nodes

    # Check edge weight is fractional: 1.0 / (2 - 1) = 1.0
    edge_data = G.get_edge_data("Alice", "Bob")
    assert edge_data["weight"] == 1.0
