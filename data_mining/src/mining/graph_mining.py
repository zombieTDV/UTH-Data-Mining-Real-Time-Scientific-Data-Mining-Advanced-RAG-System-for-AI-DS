"""
data_mining/src/mining/graph_mining.py
--------------------------------------
Pillar 3: Graph Mining & Scientific Network Analysis Pipeline.
Analyzes the directed academic citation graph (86,000+ edges across 8,800+ papers),
computes directed PageRank centrality, in-degree citation authority, and modularity communities,
and exports high-impact network topologies for interactive visualization.
Includes automatic fallback to fractional-weighted co-authorship if citation files are unavailable.

Adheres strictly to docs/agents/rules/LOGGING_CHECKPOINT_RULES.md:
- Strictly NO emojis/icons.
- Timestamped plain-text logs: [INFO], [SUCCESS], [WARNING], [ERROR].
"""

import os
import json
import logging
from typing import Dict, Any, List, Optional
from itertools import combinations
import duckdb
import networkx as nx
from networkx.algorithms.community import greedy_modularity_communities

logger = logging.getLogger("graph_mining")


class ScientificGraphMiner:
    """Mines scientific citation topologies, directed authority centrality, and research communities."""

    def __init__(self, parquet_path: str, citations_path: Optional[str] = None):
        self.parquet_path = parquet_path
        self.citations_path = citations_path or "data/silver/citations.parquet"

    def _has_citations_data(self) -> bool:
        """Checks if citation graph dataset is present and accessible."""
        if not os.path.exists(self.citations_path):
            return False
        # Verify papers parquet is also present for metadata join
        openalex_papers = "data/silver/papers.parquet"
        return os.path.exists(openalex_papers) or os.path.exists(self.parquet_path)

    def build_citation_network(self) -> nx.DiGraph:
        """Constructs directed citation graph (citing_paper -> cited_paper)."""
        logger.info("[PILLAR 3] Constructing directed citation graph from: %s...", self.citations_path)
        con = duckdb.connect()
        df_citations = con.execute(f"""
            SELECT citing_paper_id, cited_paper_id 
            FROM read_parquet('{self.citations_path}') 
            WHERE is_internal = true
        """).fetchdf()

        G = nx.from_pandas_edgelist(
            df_citations,
            source="citing_paper_id",
            target="cited_paper_id",
            create_using=nx.DiGraph(),
        )

        logger.info(
            "[PILLAR 3] [SUCCESS] Directed Citation Graph built: %d nodes, %d directed edges.",
            G.number_of_nodes(),
            G.number_of_edges(),
        )
        return G

    def build_coauthorship_fallback(self) -> nx.Graph:
        """Fallback: Constructs fractional-weighted co-authorship network."""
        logger.info("[PILLAR 3] Building co-authorship fallback network from: %s...", self.parquet_path)
        con = duckdb.connect()
        df = con.execute(
            f"SELECT paper_id, authors FROM read_parquet('{self.parquet_path}') WHERE authors IS NOT NULL"
        ).fetchdf()

        G = nx.Graph()
        author_paper_counts: Dict[str, int] = {}

        for _, row in df.iterrows():
            raw_authors = row["authors"]
            if raw_authors is None or not hasattr(raw_authors, "__iter__") or isinstance(raw_authors, str):
                continue

            clean_authors = [str(a).strip() for a in raw_authors if str(a).strip()]
            for author in clean_authors:
                author_paper_counts[author] = author_paper_counts.get(author, 0) + 1

            # Fractional weighting to mitigate author explosion from massive author lists
            n_authors = len(clean_authors)
            if n_authors > 1:
                weight = 1.0 / (n_authors - 1)
                for a1, a2 in combinations(clean_authors, 2):
                    if a1 == a2:
                        continue
                    if G.has_edge(a1, a2):
                        G[a1][a2]["weight"] += weight
                    else:
                        G.add_edge(a1, a2, weight=weight)

        for author, count in author_paper_counts.items():
            if author in G:
                G.nodes[author]["paper_count"] = count

        return G

    def analyze_network(
        self,
        top_hubs_limit: int = 40,
        max_export_nodes: int = 120,
    ) -> Dict[str, Any]:
        """Runs PageRank, Degree Centrality, and Community Detection on scientific network."""
        if self._has_citations_data():
            return self._analyze_citation_network(top_hubs_limit, max_export_nodes)
        else:
            return self._analyze_coauthorship_network(top_hubs_limit, max_export_nodes)

    def _analyze_citation_network(self, top_hubs_limit: int, max_export_nodes: int) -> Dict[str, Any]:
        """Analyzes directed citation graph for seminal papers and knowledge flow."""
        G = self.build_citation_network()
        if G.number_of_nodes() == 0:
            return {"network_summary": {}, "top_influencers": [], "communities": [], "graph_export": {}}

        logger.info("[PILLAR 3] Computing directed PageRank on citation network (alpha=0.85)...")
        pagerank_scores = nx.pagerank(G, alpha=0.85)

        # Load paper titles and first author metadata for node labeling
        con = duckdb.connect()
        metadata_path = "data/silver/papers.parquet" if os.path.exists("data/silver/papers.parquet") else self.parquet_path
        cols_df = con.execute(f"DESCRIBE SELECT * FROM read_parquet('{metadata_path}')").fetchdf()
        available_cols = set(cols_df["column_name"].tolist())
        
        select_clause = "paper_id, title"
        if "authors" in available_cols:
            select_clause += ", authors"
        if "citation_count" in available_cols:
            select_clause += ", citation_count"
            
        papers_meta = con.execute(f"SELECT {select_clause} FROM read_parquet('{metadata_path}')").fetchdf()
        meta_dict = papers_meta.set_index("paper_id").to_dict(orient="index")

        # Community detection on undirected projection of largest connected component
        logger.info("[PILLAR 3] Detecting research front communities (Greedy Modularity)...")
        G_undirected = G.to_undirected()
        communities_raw = list(greedy_modularity_communities(G_undirected))
        community_mapping = {}
        for comm_id, members in enumerate(communities_raw):
            for member in members:
                community_mapping[member] = comm_id

        # Compile top influential landmark papers by directed PageRank
        sorted_nodes = sorted(pagerank_scores.items(), key=lambda x: x[1], reverse=True)
        top_influencers = []
        for pid, pr in sorted_nodes[:top_hubs_limit]:
            meta = meta_dict.get(pid, {})
            title = str(meta.get("title", pid))
            authors = meta.get("authors")
            author_tag = ""
            if authors is not None and hasattr(authors, "__iter__") and len(authors) > 0 and not isinstance(authors, str):
                first_author = str(authors[0]).strip()
                author_tag = f" ({first_author} et al.)"
            display_name = f"{title}{author_tag}" if len(title) <= 50 else f"{title[:47]}...{author_tag}"

            in_deg = int(G.in_degree(pid))
            top_influencers.append({
                "author": display_name,
                "pagerank": round(float(pr), 6),
                "degree": in_deg,
                "paper_count": int(meta.get("citation_count", in_deg)),
                "community_id": int(community_mapping.get(pid, -1)),
            })

        # Global Network Summary
        density = float(nx.density(G))
        summary = {
            "total_nodes": G.number_of_nodes(),
            "total_edges": G.number_of_edges(),
            "total_authors": G.number_of_nodes(),  # Alias for FE backwards compatibility
            "total_collaborations": G.number_of_edges(),  # Alias for FE backwards compatibility
            "density": round(density, 6),
            "graph_type": "directed_citation_network",
            "modularity_communities": len(communities_raw),
        }

        # Subgraph export for frontend visualization
        export_node_set = set([n for n, _ in sorted_nodes[:max_export_nodes]])
        subG = G.subgraph(export_node_set)

        export_nodes = []
        for n in subG.nodes():
            meta = meta_dict.get(n, {})
            title = str(meta.get("title", n))
            label = title[:35] + "..." if len(title) > 35 else title
            export_nodes.append({
                "id": str(n),
                "label": label,
                "pagerank": round(float(pagerank_scores.get(n, 0)), 5),
                "degree": int(G.in_degree(n)),
                "community": int(community_mapping.get(n, 0)),
                "paper_count": int(G.in_degree(n)),
            })

        export_links = []
        for u, v in subG.edges():
            export_links.append({
                "source": str(u),
                "target": str(v),
                "weight": 1,
            })

        # Community breakdown summaries
        community_summaries = []
        for c_id, members in enumerate(communities_raw[:8]):
            # Get top cited papers in this community
            comm_members_pr = [(m, pagerank_scores.get(m, 0.0)) for m in members]
            comm_sorted = sorted(comm_members_pr, key=lambda x: x[1], reverse=True)[:5]
            sample_labels = []
            for m, _ in comm_sorted:
                t = str(meta_dict.get(m, {}).get("title", m))
                sample_labels.append(t[:40] if len(t) > 40 else t)

            community_summaries.append({
                "community_id": c_id,
                "size": len(members),
                "representative_authors": sample_labels,
            })

        result = {
            "network_summary": summary,
            "top_influencers": top_influencers,
            "communities": community_summaries,
            "graph_export": {
                "nodes": export_nodes,
                "links": export_links,
            },
        }

        logger.info(
            "[PILLAR 3] [SUCCESS] Analyzed citation network (%d top landmark papers, %d communities).",
            len(top_influencers),
            len(community_summaries),
        )
        return result

    def _analyze_coauthorship_network(self, top_hubs_limit: int, max_export_nodes: int) -> Dict[str, Any]:
        """Fallback analysis on coauthorship network."""
        G = self.build_coauthorship_fallback()
        if G.number_of_nodes() == 0:
            return {"network_summary": {}, "top_influencers": [], "communities": [], "graph_export": {}}

        pagerank_scores = nx.pagerank(G, weight="weight", alpha=0.85)
        communities_raw = list(greedy_modularity_communities(G))
        community_mapping = {}
        for comm_id, members in enumerate(communities_raw):
            for member in members:
                community_mapping[member] = comm_id

        sorted_nodes = sorted(pagerank_scores.items(), key=lambda x: x[1], reverse=True)
        top_influencers = []
        for author, pr in sorted_nodes[:top_hubs_limit]:
            top_influencers.append({
                "author": author,
                "pagerank": round(float(pr), 6),
                "degree": int(G.degree(author)),
                "paper_count": int(G.nodes[author].get("paper_count", 1)),
                "community_id": int(community_mapping.get(author, -1)),
            })

        summary = {
            "total_authors": G.number_of_nodes(),
            "total_collaborations": G.number_of_edges(),
            "density": round(float(nx.density(G)), 6),
            "graph_type": "coauthorship_network",
            "modularity_communities": len(communities_raw),
        }

        export_node_set = set([n for n, _ in sorted_nodes[:max_export_nodes]])
        subG = G.subgraph(export_node_set)
        export_nodes = [
            {
                "id": str(n),
                "label": str(n),
                "pagerank": round(float(pagerank_scores.get(n, 0)), 5),
                "degree": int(G.degree(n)),
                "community": int(community_mapping.get(n, 0)),
                "paper_count": int(G.nodes[n].get("paper_count", 1)),
            }
            for n in subG.nodes()
        ]
        export_links = [
            {"source": str(u), "target": str(v), "weight": int(max(1, round(data.get("weight", 1))))}
            for u, v, data in subG.edges(data=True)
        ]

        community_summaries = [
            {
                "community_id": c_id,
                "size": len(members),
                "representative_authors": list(members)[:5],
            }
            for c_id, members in enumerate(communities_raw[:8])
        ]

        return {
            "network_summary": summary,
            "top_influencers": top_influencers,
            "communities": community_summaries,
            "graph_export": {"nodes": export_nodes, "links": export_links},
        }

    def save_graph(self, output_path: str, top_hubs_limit: int = 40) -> None:
        """Runs graph mining and writes formatted JSON to disk."""
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        results = self.analyze_network(top_hubs_limit=top_hubs_limit)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        logger.info("[PILLAR 3] [SUCCESS] Saved graph topology to: %s", output_path)


# Backward-compatible alias for existing imports
CoauthorshipGraphMiner = ScientificGraphMiner
