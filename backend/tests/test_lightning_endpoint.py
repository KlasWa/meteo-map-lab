import httpx
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, create_engine

import app.models  # noqa: F401
from app.api.routes import get_lightning_service
from app.core.config import settings
from app.main import app
from app.repositories.lightning_sqlite import SqliteLightningRepository
from app.services.lightning import LightningService

NOW = 1_700_000_000_000


class FakeClient:
    def __init__(self):
        self.fail = False

    def fetch_day(self, year, month, day):
        if self.fail:
            raise httpx.ConnectError("boom")
        return {"values": []}


def _make_service(fake):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    svc = LightningService(fake, SqliteLightningRepository(engine), settings)
    svc._now_ms = lambda: NOW
    return svc


def _client_with(svc) -> TestClient:
    app.dependency_overrides[get_lightning_service] = lambda: svc
    return TestClient(app)


def teardown_function():
    app.dependency_overrides.clear()


def test_lightning_ok_empty():
    client = _client_with(_make_service(FakeClient()))
    r = client.get("/api/lightning", params={"lat": 59.3, "lon": 18.1})
    assert r.status_code == 200
    body = r.json()
    assert body["unit"] == "strikes"
    assert body["radius_km"] == settings.lightning_radius_km
    assert body["points"] == []


def test_lightning_invalid_resolution_422():
    client = _client_with(_make_service(FakeClient()))
    r = client.get("/api/lightning", params={"lat": 59.3, "lon": 18.1, "resolution": "weekly"})
    assert r.status_code == 422


def test_lightning_503_when_unavailable_and_cold():
    fake = FakeClient()
    fake.fail = True
    client = _client_with(_make_service(fake))
    r = client.get("/api/lightning", params={"lat": 59.3, "lon": 18.1})
    assert r.status_code == 503
