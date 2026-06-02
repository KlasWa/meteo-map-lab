from app.core.config import settings


def test_cloud_cover_defaults():
    assert settings.cloud_cover_param == 16
    assert settings.cloud_cover_params == [16, 29]
    assert settings.history_months == 13
    assert settings.recent_ttl_seconds == 3600
    assert settings.station_list_ttl_days == 1
    assert settings.nearest_max_km == 250.0
    assert settings.lightning_radius_km == 50.0
    assert settings.lightning_history_months == 12
    assert settings.lightning_recent_ttl_seconds == 3600
    assert settings.lightning_fetch_workers == 8
    assert "lightning" in settings.lightning_base_url
