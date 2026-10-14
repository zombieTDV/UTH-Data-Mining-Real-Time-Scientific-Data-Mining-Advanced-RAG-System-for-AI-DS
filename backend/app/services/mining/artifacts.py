from backend.app.schemas.mining import (
    AssociationRulesResponse,
    ClustersResponse,
    EdaResponse,
    GraphResponse,
    TrendsResponse,
)
from backend.app.services.mining.constants import (
    ASSOCIATION_RULES_FILENAME,
    CLUSTERS_FILENAME,
    EDA_FILENAME,
    GRAPH_FILENAME,
    TRENDS_FILENAME,
)
from backend.app.services.mining.loader import ArtifactLoader


def build_eda(loader: ArtifactLoader) -> EdaResponse:
    return EdaResponse(**loader._load_json(EDA_FILENAME))


def build_association_rules(loader: ArtifactLoader) -> AssociationRulesResponse:
    return AssociationRulesResponse(**loader._load_json(ASSOCIATION_RULES_FILENAME))


def build_clusters(loader: ArtifactLoader) -> ClustersResponse:
    return ClustersResponse(**loader._load_json(CLUSTERS_FILENAME))


def build_graph(loader: ArtifactLoader) -> GraphResponse:
    return GraphResponse(**loader._load_json(GRAPH_FILENAME))


def build_trends(loader: ArtifactLoader) -> TrendsResponse:
    return TrendsResponse(**loader._load_json(TRENDS_FILENAME))
