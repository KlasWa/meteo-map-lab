"""Verify the per-request timing middleware logs `request_complete` with the
expected `extra` fields. Exercises the real FastAPI middleware stack against
a built app — no mocks."""

import logging

from fastapi.testclient import TestClient

from app.main import build_app


def test_request_complete_logged_for_each_call(caplog):
    client = TestClient(build_app(""))

    caplog.clear()
    with caplog.at_level(logging.INFO, logger="app.request"):
        resp = client.get("/health")
    assert resp.status_code == 200

    timing_records = [r for r in caplog.records if r.message == "request_complete"]
    assert len(timing_records) == 1

    rec = timing_records[0]
    assert rec.path == "/health"
    assert rec.method == "GET"
    assert rec.status == 200
    assert isinstance(rec.duration_ms, float)
    assert rec.duration_ms >= 0


def test_logs_404_responses(caplog):
    client = TestClient(build_app(""))

    caplog.clear()
    with caplog.at_level(logging.INFO, logger="app.request"):
        client.get("/does-not-exist")

    timing_records = [r for r in caplog.records if r.message == "request_complete"]
    assert len(timing_records) == 1
    assert timing_records[0].status == 404
