import httpx
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, create_engine

import app.models  # noqa: F401
from app.api.routes import get_cloud_cover_service
from app.core.config import settings
from app.dto import StationRaw
from app.main import app
from app.repositories.sqlite import SqliteRepository
from app.services.cloud_cover import CloudCoverService

NOW = 1_800_000_000_000


class FakeClient:
    def __init__(self):
        self.fail_recent = False

    def fetch_station_list(self, param=16):
        return [StationRaw(id=1, name="Near", lat=59.0, lon=18.0, active=True)]

    def fetch_recent(self, station_id, param=16):
        if self.fail_recent:
            raise httpx.ConnectError("boom")
        return {"value": [{"date": NOW - 3600_000, "value": "40", "quality": "G"}]}

    def fetch_archive(self, station_id, param=16):
        return "Datum;Tid (UTC);Total molnmängd;Kvalitet;;\n2025-01-01;00:00:00;80;G;;\n"


def _make_service(fake):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    # Service uses _now_ms() in the endpoint path; freeze it for determinism.
    svc = CloudCoverService(fake, SqliteRepository(engine), settings)
    svc._now_ms = lambda: NOW
    return svc


def _client_with(svc) -> TestClient:
    app.dependency_overrides[get_cloud_cover_service] = lambda: svc
    return TestClient(app)


def teardown_function():
    app.dependency_overrides.clear()


def test_cloud_cover_daily_ok():
    svc = _make_service(FakeClient())
    client = _client_with(svc)
    r = client.get("/api/cloud-cover", params={"lat": 59.05, "lon": 18.05, "resolution": "daily"})
    assert r.status_code == 200
    body = r.json()
    assert body["station"]["id"] == 1
    assert body["resolution"] == "daily"
    assert body["unit"] == "percent"
    assert body["stale"] is False
    assert "SMHI" in body["attribution"]
    assert len(body["points"]) >= 1


def test_cloud_cover_default_resolution_is_daily():
    svc = _make_service(FakeClient())
    client = _client_with(svc)
    r = client.get("/api/cloud-cover", params={"lat": 59.05, "lon": 18.05})
    assert r.status_code == 200
    assert r.json()["resolution"] == "daily"


def test_cloud_cover_invalid_resolution_is_422():
    svc = _make_service(FakeClient())
    client = _client_with(svc)
    r = client.get("/api/cloud-cover", params={"lat": 59.0, "lon": 18.0, "resolution": "weekly"})
    assert r.status_code == 422


def test_cloud_cover_no_station_is_404():
    svc = _make_service(FakeClient())
    client = _client_with(svc)
    r = client.get("/api/cloud-cover", params={"lat": 0.0, "lon": 0.0})
    assert r.status_code == 404


def test_cloud_cover_503_when_unavailable_and_cold():
    fake = FakeClient()
    fake.fail_recent = True
    svc = _make_service(fake)
    client = _client_with(svc)
    r = client.get("/api/cloud-cover", params={"lat": 59.05, "lon": 18.05})
    assert r.status_code == 503


def test_cloud_cover_param29_octas():
    svc = _make_service(FakeClient())
    client = _client_with(svc)
    r = client.get(
        "/api/cloud-cover",
        params={"lat": 59.05, "lon": 18.05, "resolution": "daily", "param": 29},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["param"] == 29
    assert body["unit"] == "octas"


def test_cloud_cover_default_param_is_16():
    svc = _make_service(FakeClient())
    client = _client_with(svc)
    r = client.get("/api/cloud-cover", params={"lat": 59.05, "lon": 18.05})
    assert r.json()["param"] == 16
    assert r.json()["unit"] == "percent"


def test_cloud_cover_invalid_param_is_422():
    svc = _make_service(FakeClient())
    client = _client_with(svc)
    r = client.get("/api/cloud-cover", params={"lat": 59.0, "lon": 18.0, "param": 99})
    assert r.status_code == 422
