from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_app_startup_runs_lifespan():
    # Using TestClient as a context manager triggers startup/shutdown,
    # which runs init_db(). It must complete without error.
    with TestClient(app) as c:
        assert c.get("/health").status_code == 200
