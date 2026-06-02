from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, create_engine

import app.models  # noqa: F401
from app.api.routes import get_cloud_cover_service, get_lightning_service
from app.dto import ParsedObs, StationRaw, StrikeRaw
from app.main import app
from app.repositories.lightning_sqlite import SqliteLightningRepository
from app.repositories.sqlite import SqliteRepository


class _Svc:
    """Minimal stand-in exposing `.repo` (the endpoint only needs repo.purge())."""

    def __init__(self, repo):
        self.repo = repo


def _seeded_repos():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    crepo = SqliteRepository(engine)
    lrepo = SqliteLightningRepository(engine)
    crepo.upsert_stations([StationRaw(id=1, name="S", lat=59.0, lon=18.0, active=True)])
    crepo.upsert_observations(1, [ParsedObs(1000, 50.0, "G")])
    crepo.record_fetch(0, "station_list", 1, None, None)
    lrepo.upsert_strikes(
        [StrikeRaw(ts_utc=1000, lat=59.0, lon=18.0, peak_current=-5.0, cloud_indicator=0)]
    )
    lrepo.record_day(86400000, fetched_at=1, count=1)
    return crepo, lrepo


def _client_with(crepo, lrepo) -> TestClient:
    app.dependency_overrides[get_cloud_cover_service] = lambda: _Svc(crepo)
    app.dependency_overrides[get_lightning_service] = lambda: _Svc(lrepo)
    return TestClient(app)


def teardown_function():
    app.dependency_overrides.clear()


def test_purge_cloud_only():
    crepo, lrepo = _seeded_repos()
    r = _client_with(crepo, lrepo).delete("/api/cache", params={"scope": "cloud"})
    assert r.status_code == 200
    body = r.json()
    assert body["scope"] == "cloud"
    assert body["deleted"] == {"observations": 1, "stations": 1, "fetch_logs": 1}
    assert crepo.station_count() == 0
    assert lrepo.has_any_day() is True  # lightning untouched


def test_purge_lightning_only():
    crepo, lrepo = _seeded_repos()
    r = _client_with(crepo, lrepo).delete("/api/cache", params={"scope": "lightning"})
    assert r.status_code == 200
    assert r.json()["deleted"] == {"lightning_strikes": 1, "lightning_days": 1}
    assert lrepo.has_any_day() is False
    assert crepo.station_count() == 1  # cloud untouched


def test_purge_all_is_default():
    crepo, lrepo = _seeded_repos()
    r = _client_with(crepo, lrepo).delete("/api/cache")
    assert r.status_code == 200
    body = r.json()
    assert body["scope"] == "all"
    assert body["deleted"]["observations"] == 1
    assert body["deleted"]["lightning_strikes"] == 1
    assert crepo.station_count() == 0
    assert lrepo.has_any_day() is False


def test_purge_invalid_scope_422():
    crepo, lrepo = _seeded_repos()
    r = _client_with(crepo, lrepo).delete("/api/cache", params={"scope": "bogus"})
    assert r.status_code == 422
