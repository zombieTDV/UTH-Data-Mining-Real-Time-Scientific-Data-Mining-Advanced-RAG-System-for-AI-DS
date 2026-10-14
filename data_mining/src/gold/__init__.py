from src.gold.contracts import (
    GOLD_SCHEMA_VERSION,
    TEXT_BUILDER_VERSION,
    GoldDocument,
)
from src.gold.text_builder import (
    TextBuildResult,
    build_semantic_text,
    normalize_text_for_hash,
)
from src.gold.schema import (
    GOLD_TABLE_NAME,
    EMBEDDING_DIM,
    gold_arrow_schema,
)
from src.gold.openalex_adapter import (
    OpenAlexAdapter,
    SilverValidationError,
)
from src.gold.checkpoint import (
    GoldCheckpoint,
    PIPELINE_STATE_RUNNING,
    PIPELINE_STATE_COMPLETED,
    PIPELINE_STATE_FAILED,
)
from src.gold.registry import GoldRegistry
from src.gold.vector_writer import (
    VectorWriter,
    VectorWriteResult,
)
from src.gold.manifest import (
    GoldRunManifest,
)
from src.gold.lancedb_manager import GoldLanceDBManager
from src.gold.publisher import (
    GoldSnapshotPublisher,
    FileHash,
    PublishResult,
)
from src.gold.snapshot import (
    GoldSnapshotManager,
    LatestPointer,
)
from src.gold.writer import (
    GoldPipelineWriter,
    PipelineStats,
)
