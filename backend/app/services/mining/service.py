import asyncio
from typing import Any, AsyncGenerator, Dict

from backend.app.schemas.mining import (
    AssociationRulesResponse,
    ClustersResponse,
    EdaResponse,
    GraphResponse,
    TrendsResponse,
)
from backend.app.services.mining.artifacts import (
    build_association_rules,
    build_clusters,
    build_eda,
    build_graph,
    build_trends,
)
from backend.app.services.mining.constants import TELEMETRY_INTERVAL_SECONDS
from backend.app.services.mining.loader import ArtifactLoader
from backend.app.services.mining.manifest import build_manifest
from backend.app.services.mining.telemetry import serialize_telemetry


class MiningService:
    def __init__(self):
        self._loader = ArtifactLoader()

    def get_eda(self) -> EdaResponse:
        return build_eda(self._loader)

    def get_association_rules(self) -> AssociationRulesResponse:
        return build_association_rules(self._loader)

    def get_clusters(self) -> ClustersResponse:
        return build_clusters(self._loader)

    def get_graph(self) -> GraphResponse:
        return build_graph(self._loader)

    def get_trends(self) -> TrendsResponse:
        return build_trends(self._loader)

    def get_manifest(self) -> Dict[str, Any]:
        return build_manifest(self._loader)

    async def stream_telemetry(self) -> AsyncGenerator[str, None]:
        while True:
            yield serialize_telemetry(self.get_manifest())
            await asyncio.sleep(TELEMETRY_INTERVAL_SECONDS)


mining_service = MiningService()
