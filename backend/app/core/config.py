from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    cors_origins: list[str] = ["http://localhost:5173"]
    database_url: str = "sqlite:///./elvy_map.db"
    smhi_base_url: str = "https://opendata-download-metobs.smhi.se/api"
    cloud_cover_param: int = 16  # SMHI "Total molnmängd", percent
    history_months: int = 13  # how far back to retain/serve
    recent_ttl_seconds: int = 3600  # re-fetch latest-months window after this
    station_list_ttl_days: int = 30  # refresh station list after this
    nearest_max_km: float = 250.0  # reject coordinates with no station within
    # (wider than typical: active param-16 stations are sparse since manual
    # cloud obs are being phased out — see param 29 for denser coverage)


settings = Settings()
