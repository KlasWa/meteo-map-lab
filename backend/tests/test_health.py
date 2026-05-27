from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_metrics_valid_coords():
    resp = client.get("/api/metrics", params={"lat": 59.33, "lon": 18.07})
    assert resp.status_code == 200
    body = resp.json()
    assert body["lat"] == 59.33
    assert body["lon"] == 18.07
    assert set(body) == {
        "lat",
        "lon",
        "cloud_cover_pct",
        "lightning_probability",
        "note",
    }


def test_metrics_invalid_coords_returns_422():
    resp = client.get("/api/metrics", params={"lat": "abc", "lon": 18.07})
    assert resp.status_code == 422


def test_app_startup_runs_lifespan():
    # Using TestClient as a context manager triggers startup/shutdown,
    # which runs init_db(). It must complete without error.
    with TestClient(app) as c:
        assert c.get("/health").status_code == 200
