from pydantic_settings import BaseSettings, SettingsConfigDict

from backend.app.core.fields.lakehouse import LakehouseFields
from backend.app.core.fields.llm import LlmFields
from backend.app.core.fields.server import ServerFields
from backend.app.core.fields.storage import StorageFields
from backend.app.core.paths import ENV_FILE


class Settings(LlmFields, LakehouseFields, StorageFields, ServerFields, BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE) if ENV_FILE.exists() else None,
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
