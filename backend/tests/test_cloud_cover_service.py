import httpx
import pytest

from app.core.config import settings
from app.dto import StationRaw
from app.services.cloud_cover import (
    CloudCoverService,
    NoStationFound,
    SMHIUnavailable,
)

NOW = 1_800_000_000_000  # fixed "now" in ms


class FakeClient:
    def __init__(self):
        self.station_calls = 0
        self.recent_calls = 0
        self.archive_calls = 0
        self.fail_recent = False

    def fetch_station_list(self):
        self.station_calls += 1
        return [StationRaw(id=1, name="Near", lat=59.0, lon=18.0, active=True)]

    def fetch_recent(self, station_id):
        self.recent_calls += 1
        if self.fail_recent:
            raise httpx.ConnectError("boom")
        return {"value": [{"date": NOW - 3600_000, "value": "40", "quality": "G"}]}

    def fetch_archive(self, station_id):
        self.archive_calls += 1
        # one point inside 13 months, one ancient point that must be dropped
        return (
            "Datum;Tid (UTC);Total molnmängd;Kvalitet;;\n"
            "2025-01-01;00:00:00;80;G;;\n"
            "1990-01-01;00:00:00;10;G;;\n"
        )


def _service(repo, client):
    return CloudCoverService(client, repo, settings)


def test_ensure_cached_fetches_both_then_skips_archive(repo):
    client = FakeClient()
    svc = _service(repo, client)
    svc.repo.upsert_stations(client.fetch_station_list())  # seed stations

    svc.ensure_cached(1, now_ms=NOW)
    assert client.recent_calls == 1
    assert client.archive_calls == 1

    # Second call within TTL: no recent re-fetch, archive already cached
    svc.ensure_cached(1, now_ms=NOW + 60_000)
    assert client.recent_calls == 1
    assert client.archive_calls == 1


def test_archive_drops_rows_older_than_history(repo):
    client = FakeClient()
    svc = _service(repo, client)
    svc.ensure_cached(1, now_ms=NOW)
    rows = repo.get_observations(1, 0, NOW)
    # 1990 row dropped; 2025 archive row + recent row remain
    assert all(r.ts_utc > NOW - svc.history_ms for r in rows)


def test_recent_refetched_after_ttl(repo):
    client = FakeClient()
    svc = _service(repo, client)
    svc.ensure_cached(1, now_ms=NOW)
    svc.ensure_cached(1, now_ms=NOW + settings.recent_ttl_seconds * 1000 + 1)
    assert client.recent_calls == 2
    assert client.archive_calls == 1  # archive still once


def test_recent_failure_raises_smhi_unavailable(repo):
    client = FakeClient()
    client.fail_recent = True
    svc = _service(repo, client)
    with pytest.raises(SMHIUnavailable):
        svc.ensure_cached(1, now_ms=NOW)
    # No recent ledger written -> will retry next time
    assert repo.get_fetch_log(1, "recent") is None


def test_get_cloud_cover_happy_path(repo):
    client = FakeClient()
    svc = _service(repo, client)
    resp = svc.get_cloud_cover(59.05, 18.05, "daily", now_ms=NOW)
    assert resp.station.id == 1
    assert resp.resolution == "daily"
    assert resp.stale is False
    assert len(resp.points) >= 1
    assert resp.station.distance_km >= 0


def test_get_cloud_cover_no_station(repo):
    client = FakeClient()
    svc = _service(repo, client)
    with pytest.raises(NoStationFound):
        svc.get_cloud_cover(0.0, 0.0, "daily", now_ms=NOW)


def test_get_cloud_cover_stale_when_refresh_fails_but_cache_exists(repo):
    client = FakeClient()
    svc = _service(repo, client)
    svc.get_cloud_cover(59.05, 18.05, "daily", now_ms=NOW)  # warm cache
    client.fail_recent = True
    resp = svc.get_cloud_cover(
        59.05,
        18.05,
        "daily",
        now_ms=NOW + settings.recent_ttl_seconds * 1000 + 1,
    )
    assert resp.stale is True
    assert len(resp.points) >= 1
