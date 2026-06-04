from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    cors_origins: list[str] = ["http://localhost:5173"]
    database_url: str = "sqlite:///./meteo_map_lab.db"
    smhi_base_url: str = "https://opendata-download-metobs.smhi.se/api"
    cloud_cover_param: int = 16  # default parameter for the endpoint
    cloud_cover_params: list[int] = [16, 29, 31, 33, 35]  # supported parameters
    cloud_cover_layer_params: list[int] = [29, 31, 33, 35]  # octa layers, low->high,
    # combined (max) by the /api/cloud-cover/combined endpoint
    history_months: int = 13  # how far back to retain/serve
    recent_ttl_seconds: int = 3600  # re-fetch latest-months window after this
    archive_ttl_days: int = 30  # re-fetch corrected-archive after this, to pick
    # up SMHI quality corrections folded in after latest-months ages out
    station_list_ttl_days: int = 1  # refresh station list after this
    nearest_max_km: float = 250.0  # reject coordinates with no station within
    # (wider than typical: active param-16 stations are sparse since manual
    # cloud obs are being phased out — see param 29 for denser coverage)

    lightning_base_url: str = (
        "https://opendata-download-lightning.smhi.se/api/version/latest"
    )
    lightning_radius_km: float = 50.0  # count strikes within this radius
    lightning_history_months: int = 12  # how far back to retain/serve
    lightning_recent_ttl_seconds: int = 3600  # re-fetch today/yesterday after this
    lightning_fetch_workers: int = 8  # parallel day-file fetches on cold start


settings = Settings()
