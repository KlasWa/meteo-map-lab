import httpx
import pytest

from app.core.config import settings
from app.services.lightning import LightningService, LightningUnavailable

NOW = 1_700_000_000_000  # fixed "now" in ms


def _raw(ts_ms, lat, lon, cloud_indicator=0):
    from datetime import datetime, timezone

    dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    return {
        "year": dt.year,
        "month": dt.month,
        "day": dt.day,
        "hours": dt.hour,
        "minutes": dt.minute,
        "seconds": dt.second,
        "nanoseconds": 0,
        "lat": lat,
        "lon": lon,
        "peakCurrent": -5,
        "cloudIndicator": cloud_indicator,
    }


class FakeClient:
    def __init__(self):
        self.calls = 0
        self.fail = False
        self.days: dict[tuple, list] = {}  # (year, month, day) -> list of raw dicts

    def fetch_day(self, year, month, day):
        self.calls += 1
        if self.fail:
            raise httpx.ConnectError("boom")
        return {"values": self.days.get((year, month, day), [])}


def _service(lrepo, client):
    return LightningService(client, lrepo, settings)


def test_counts_strikes_within_radius(lrepo):
    client = FakeClient()
    near = _raw(NOW - 3600_000, 59.30, 18.07)
    far = _raw(NOW - 3600_000, 62.00, 18.07)  # ~300km north, outside 50km
    from datetime import datetime, timezone

    dt = datetime.fromtimestamp((NOW - 3600_000) / 1000, tz=timezone.utc)
    client.days[(dt.year, dt.month, dt.day)] = [near, far]

    svc = _service(lrepo, client)
    resp = svc.get_lightning(59.30, 18.07, "daily", now_ms=NOW)
    assert resp.unit == "strikes"
    assert resp.radius_km == settings.lightning_radius_km
    assert sum(p.count for p in resp.points) == 1  # only the near strike


def test_second_call_does_not_refetch_final_days(lrepo):
    client = FakeClient()
    svc = _service(lrepo, client)
    svc.get_lightning(59.0, 18.0, "daily", now_ms=NOW)
    first = client.calls
    svc.get_lightning(59.0, 18.0, "daily", now_ms=NOW)
    assert client.calls == first  # within TTL, no day re-fetched


def test_cold_and_unavailable_raises(lrepo):
    client = FakeClient()
    client.fail = True
    svc = _service(lrepo, client)
    with pytest.raises(LightningUnavailable):
        svc.get_lightning(59.0, 18.0, "daily", now_ms=NOW)


def test_non_final_day_refetched_after_ttl(lrepo):
    client = FakeClient()
    svc = _service(lrepo, client)
    svc.get_lightning(59.0, 18.0, "daily", now_ms=NOW)
    first = client.calls
    later = NOW + settings.lightning_recent_ttl_seconds * 1000 + 1
    svc.get_lightning(59.0, 18.0, "daily", now_ms=later)
    # only the two non-final days (today + yesterday) are re-fetched
    assert client.calls == first + 2


def test_serves_cached_when_unavailable(lrepo):
    from datetime import datetime, timezone

    client = FakeClient()
    dt = datetime.fromtimestamp((NOW - 3600_000) / 1000, tz=timezone.utc)
    client.days[(dt.year, dt.month, dt.day)] = [_raw(NOW - 3600_000, 59.30, 18.07)]
    svc = _service(lrepo, client)
    svc.get_lightning(59.30, 18.07, "daily", now_ms=NOW)  # warm cache

    client.fail = True
    later = NOW + settings.lightning_recent_ttl_seconds * 1000 + 1
    resp = svc.get_lightning(59.30, 18.07, "daily", now_ms=later)
    assert resp.stale is True
    assert sum(p.count for p in resp.points) >= 1  # cached strike still served


def test_warm_cache_then_outage_serves_empty_not_503(lrepo):
    # Warm the cache successfully (all days fetch OK, zero strikes everywhere).
    client = FakeClient()
    svc = _service(lrepo, client)
    svc.get_lightning(59.0, 18.0, "daily", now_ms=NOW)

    # Later, SMHI is down (today/yesterday re-fetch fails) and this location has
    # no strikes. The warm cache must serve an empty result, NOT raise 503.
    client.fail = True
    later = NOW + settings.lightning_recent_ttl_seconds * 1000 + 1
    resp = svc.get_lightning(59.0, 18.0, "daily", now_ms=later)
    assert resp.stale is True
    assert resp.points == []


def test_ground_flash_density_counts_ground_only(lrepo):
    from datetime import datetime, timezone

    client = FakeClient()
    # Two ground flashes and one cloud flash, all near the point and recent.
    g1 = _raw(NOW - 3600_000, 59.30, 18.07, cloud_indicator=0)
    g2 = _raw(NOW - 7200_000, 59.31, 18.08, cloud_indicator=0)
    c1 = _raw(NOW - 7200_000, 59.31, 18.06, cloud_indicator=1)
    dt = datetime.fromtimestamp((NOW - 3600_000) / 1000, tz=timezone.utc)
    client.days[(dt.year, dt.month, dt.day)] = [g1, g2, c1]

    svc = _service(lrepo, client)
    d = svc.ground_flash_density(59.30, 18.07, now_ms=NOW)

    assert d.total_flash_count == 3
    assert d.ground_flash_count == 2
    assert d.radius_km == settings.lightning_radius_km
    assert d.span_years == settings.lightning_history_months / 12
    # N_G uses ground count only.
    from math import isclose, pi

    expected = 2 / (pi * d.radius_km * d.radius_km) / d.span_years
    assert isclose(d.n_g, expected)
    assert d.stale is False


def test_ground_flash_density_excludes_far_strikes(lrepo):
    from datetime import datetime, timezone

    client = FakeClient()
    near = _raw(NOW - 3600_000, 59.30, 18.07, cloud_indicator=0)
    far = _raw(NOW - 3600_000, 62.00, 18.07, cloud_indicator=0)  # ~300 km away
    dt = datetime.fromtimestamp((NOW - 3600_000) / 1000, tz=timezone.utc)
    client.days[(dt.year, dt.month, dt.day)] = [near, far]

    svc = _service(lrepo, client)
    d = svc.ground_flash_density(59.30, 18.07, now_ms=NOW)
    assert d.ground_flash_count == 1
    assert d.total_flash_count == 1


def test_ground_flash_density_cold_and_unavailable_raises(lrepo):
    client = FakeClient()
    client.fail = True
    svc = _service(lrepo, client)
    with pytest.raises(LightningUnavailable):
        svc.ground_flash_density(59.0, 18.0, now_ms=NOW)


def test_get_lightning_still_works_after_refactor(lrepo):
    from datetime import datetime, timezone

    client = FakeClient()
    dt = datetime.fromtimestamp((NOW - 3600_000) / 1000, tz=timezone.utc)
    client.days[(dt.year, dt.month, dt.day)] = [_raw(NOW - 3600_000, 59.30, 18.07)]
    svc = _service(lrepo, client)
    resp = svc.get_lightning(59.30, 18.07, "daily", now_ms=NOW)
    assert sum(p.count for p in resp.points) == 1
