from backend.app.services.retrieval.defaults import (
    DEFAULT_PAPER_CHUNK_LIMIT,
    DEFAULT_TOP_K,
)


def build_search_query(table, query, category, top_k):
    k = top_k or DEFAULT_TOP_K
    query_builder = table.search(query)
    if category:
        query_builder = query_builder.where(f"primary_category = '{category}'")
    return query_builder.limit(k)


def build_paper_query(table, paper_id):
    return table.search().where(f"paper_id = '{paper_id}'").limit(DEFAULT_PAPER_CHUNK_LIMIT)
