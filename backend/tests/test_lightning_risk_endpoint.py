from datetime import datetime, timezone

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


def _raw(ts_ms, lat, lon, cloud_indicator=0):
    dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    return {
        "year": dt.year, "month": dt.month, "day": dt.day,
        "hours": dt.hour, "minutes": dt.minute, "seconds": dt.second,
        "nanoseconds": 0, "lat": lat, "lon": lon,
        "peakCurrent": -5, "cloudIndicator": cloud_indicator,
    }


class FakeClient:
    def __init__(self):
        self.fail = False
        self.days = {}

    def fetch_day(self, year, month, day):
        if self.fail:
            raise httpx.ConnectError("boom")
        return {"values": self.days.get((year, month, day), [])}


def _make_service(fake):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
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


BASE = {"lat": 59.3, "lon": 18.1, "length_m": 20, "width_m": 10, "height_m": 5}


def test_risk_ok_with_strikes():
    fake = FakeClient()
    dt = datetime.fromtimestamp((NOW - 3600_000) / 1000, tz=timezone.utc)
    fake.days[(dt.year, dt.month, dt.day)] = [
        _raw(NOW - 3600_000, 59.30, 18.10, cloud_indicator=0),
        _raw(NOW - 7200_000, 59.31, 18.11, cloud_indicator=1),  # cloud, excluded from N_G
    ]
    client = _client_with(_make_service(fake))
    r = client.get("/api/lightning-risk", params=BASE)
    assert r.status_code == 200
    body = r.json()
    assert body["ground_flash_count"] == 1
    assert body["total_flash_count"] == 2
    assert body["radius_km"] == settings.lightning_radius_km
    assert body["expected_direct_per_year"] > 0
    assert 0 < body["annual_probability"] < 1
    assert body["return_period_years"] is not None
    assert body["expected_line_per_year"] is None  # no line length given
    assert body["hazard_band"] in {"Very low", "Low", "Moderate", "High"}


def test_risk_zero_when_no_strikes():
    client = _client_with(_make_service(FakeClient()))
    r = client.get("/api/lightning-risk", params=BASE)
    assert r.status_code == 200
    body = r.json()
    assert body["n_g"] == 0.0
    assert body["expected_direct_per_year"] == 0.0
    assert body["annual_probability"] == 0.0
    assert body["return_period_years"] is None
    assert body["hazard_band"] == "Very low"


def test_risk_includes_line_when_length_given():
    client = _client_with(_make_service(FakeClient()))
    r = client.get("/api/lightning-risk", params={**BASE, "line_length_m": 1000})
    assert r.status_code == 200
    body = r.json()
    # N_G is 0 here, so the line figure is 0.0 (present, not None).
    assert body["expected_line_per_year"] == 0.0


def test_risk_422_on_nonpositive_dimension():
    client = _client_with(_make_service(FakeClient()))
    r = client.get("/api/lightning-risk", params={**BASE, "height_m": 0})
    assert r.status_code == 422


def test_risk_422_on_bad_location_factor():
    client = _client_with(_make_service(FakeClient()))
    r = client.get("/api/lightning-risk", params={**BASE, "location_factor": 0.7})
    assert r.status_code == 422


def test_risk_503_when_unavailable_and_cold():
    fake = FakeClient()
    fake.fail = True
    client = _client_with(_make_service(fake))
    r = client.get("/api/lightning-risk", params=BASE)
    assert r.status_code == 503
