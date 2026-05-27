from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    cors_origins: list[str] = ["http://localhost:5173"]
    database_url: str = "sqlite:///./elvy_map.db"
    smhi_base_url: str = "https://opendata-download-metobs.smhi.se/api"


settings = Settings()
