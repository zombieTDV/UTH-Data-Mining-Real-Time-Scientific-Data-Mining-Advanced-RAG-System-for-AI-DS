import pytest
import pandas as pd
import networkx as nx
from unittest.mock import MagicMock, patch
from src.mining.graph_mining import ScientificGraphMiner


def test_build_coauthorship_fallback():
    mock_df = pd.DataFrame([
        {"paper_id": "p1", "authors": ["Alice", "Bob"]},
        {"paper_id": "p2", "authors": ["Bob", "Charlie", "Dave"]},
        {"paper_id": "p3", "authors": ["Alice", "Dave"]},
        {"paper_id": "p4", "authors": None},  # Null handling
    ])

    miner = ScientificGraphMiner(parquet_path="mock_papers.parquet")
    mock_con = MagicMock()
    mock_con.execute.return_value.fetchdf.return_value = mock_df

    with patch("src.mining.graph_mining.duck_connect", return_value=mock_con):
        G = miner.build_coauthorship_fallback()

        assert isinstance(G, nx.Graph)
        assert set(G.nodes()) == {"Alice", "Bob", "Charlie", "Dave"}
        # Alice authored p1 and p3 -> 2 papers
        assert G.nodes["Alice"]["paper_count"] == 2
        # Bob authored p1 and p2 -> 2 papers
        assert G.nodes["Bob"]["paper_count"] == 2

        # Verify fractional weighting: p2 has 3 authors -> weight = 1 / (3 - 1) = 0.5
        # Edge Bob-Charlie only in p2 -> 0.5
        assert G["Bob"]["Charlie"]["weight"] == 0.5
        # Edge Alice-Bob only in p1 (2 authors -> weight = 1.0)
        assert G["Alice"]["Bob"]["weight"] == 1.0


def test_build_citation_network():
    mock_df = pd.DataFrame([
        {"citing_paper_id": "p2", "cited_paper_id": "p1"},
        {"citing_paper_id": "p3", "cited_paper_id": "p1"},
        {"citing_paper_id": "p3", "cited_paper_id": "p2"},
    ])

    miner = ScientificGraphMiner(parquet_path="mock_papers.parquet", citations_path="mock_citations.parquet")
    mock_con = MagicMock()
    mock_con.execute.return_value.fetchdf.return_value = mock_df

    with patch("src.mining.graph_mining.duck_connect", return_value=mock_con):
        G = miner.build_citation_network()

        assert isinstance(G, nx.DiGraph)
        assert G.number_of_nodes() == 3
        assert G.number_of_edges() == 3
        # In-degree of cited paper p1 should be 2 (cited by p2 and p3)
        assert G.in_degree("p1") == 2


def test_analyze_network_citation_workflow():
    miner = ScientificGraphMiner(parquet_path="mock_papers.parquet", citations_path="mock_citations.parquet")
    
    # Mock citation graph
    G_cit = nx.DiGraph()
    G_cit.add_edge("p2", "p1")
    G_cit.add_edge("p3", "p1")

    mock_meta_df = pd.DataFrame([
        {"paper_id": "p1", "title": "Foundation Paper", "authors": ["Geoffrey Hinton"], "citation_count": 2},
        {"paper_id": "p2", "title": "Second Paper", "authors": ["Yann LeCun"], "citation_count": 1},
        {"paper_id": "p3", "title": "Third Paper", "authors": ["Yoshua Bengio"], "citation_count": 0},
    ])
    mock_cols_df = pd.DataFrame([
        {"column_name": "paper_id"},
        {"column_name": "title"},
        {"column_name": "authors"},
        {"column_name": "citation_count"},
    ])

    mock_con = MagicMock()
    mock_con.execute.side_effect = [
        MagicMock(fetchdf=MagicMock(return_value=mock_cols_df)),
        MagicMock(fetchdf=MagicMock(return_value=mock_meta_df)),
    ]

    with patch.object(miner, "_has_citations_data", return_value=True), \
         patch.object(miner, "build_citation_network", return_value=G_cit), \
         patch("src.mining.graph_mining.duck_connect", return_value=mock_con):
        
        res = miner.analyze_network()

        assert "network_summary" in res
        assert res["network_summary"]["total_nodes"] == 3
        assert res["network_summary"]["graph_type"] == "directed_citation_network"
        assert len(res["top_influencers"]) > 0
        # Paper p1 received all citations, so it must have highest PageRank
        top = res["top_influencers"][0]
        assert "Foundation Paper" in top["author"]
        assert top["degree"] == 2
        assert "graph_export" in res
        assert len(res["graph_export"]["nodes"]) == 3
