from backend.app.api.endpoints.mining.errors import raise_artifact_not_found
from backend.app.schemas.mining import (
    AssociationRulesResponse,
    ClustersResponse,
    EdaResponse,
    GraphResponse,
    TrendsResponse,
)
from backend.app.services.mining import mining_service


def read_eda() -> EdaResponse:
    try:
        return mining_service.get_eda()
    except FileNotFoundError as e:
        raise_artifact_not_found(e)


def read_association_rules() -> AssociationRulesResponse:
    try:
        return mining_service.get_association_rules()
    except FileNotFoundError as e:
        raise_artifact_not_found(e)


def read_semantic_clusters() -> ClustersResponse:
    try:
        return mining_service.get_clusters()
    except FileNotFoundError as e:
        raise_artifact_not_found(e)


def read_coauthorship_graph() -> GraphResponse:
    try:
        return mining_service.get_graph()
    except FileNotFoundError as e:
        raise_artifact_not_found(e)


def read_trends() -> TrendsResponse:
    try:
        return mining_service.get_trends()
    except FileNotFoundError as e:
        raise_artifact_not_found(e)
