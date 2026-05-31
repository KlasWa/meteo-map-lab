from app.core.config import settings


def test_cloud_cover_defaults():
    assert settings.cloud_cover_param == 16
    assert settings.history_months == 13
    assert settings.recent_ttl_seconds == 3600
    assert settings.station_list_ttl_days == 30
    assert settings.nearest_max_km == 150.0
