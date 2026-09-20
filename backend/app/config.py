from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    deepseek_api_key: str | None = None
    llm_enabled: bool = True
    llm_base_url: str = "https://api.deepseek.com"
    llm_model: str = "deepseek-chat"
    llm_timeout_seconds: float = 30.0
    llm_max_retries: int = Field(default=2, ge=0, le=5)
    llm_retry_base_seconds: float = Field(default=0.5, ge=0, le=10)
    csv_concurrency: int = Field(default=4, ge=1, le=32)
    csv_row_timeout_seconds: float = Field(default=90, gt=0)
    csv_max_active_jobs: int = Field(default=4, ge=1, le=32)
    csv_job_ttl_seconds: int = Field(default=3600, ge=60)
    csv_max_retained_jobs: int = Field(default=10, ge=1)

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
