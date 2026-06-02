import httpx
import pytest

from app.core.config import settings
from app.services.lightning import LightningService, LightningUnavailable

NOW = 1_700_000_000_000  # fixed "now" in ms


def _raw(ts_ms, lat, lon):
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
        "cloudIndicator": 0,
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
