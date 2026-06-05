"""Cloud Trace correlation tests. Exercises the contextvar wiring end-to-end:
header on the way in → middleware → sync route handler → outbound httpx hook,
verifying both log lines carry the same `logging.googleapis.com/trace` value.
Only the network is mocked — the real FastAPI middleware stack, the real
httpx event hooks, and the real contextvar all run."""

import logging

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core import trace as trace_mod
from app.core.http import make_logged_client
from app.core.trace import parse_cloud_trace_header, trace_field
from app.main import build_app

# A 32-hex-char trace ID matching Cloud Run's format.
_VALID = "0af7651916cd43dd8448eb211c80319c"


# ---- Pure header parser ----------------------------------------------------


def test_parse_header_extracts_trace_id():
    assert parse_cloud_trace_header(f"{_VALID}/abc;o=1") == _VALID


@pytest.mark.parametrize(
    "header",
    [
        "",
        "tooshort/span;o=1",
        "x" * 33 + "/span",  # length mismatch
        "/leading-slash",
    ],
)
def test_parse_header_rejects_malformed(header):
    assert parse_cloud_trace_header(header) == ""


# ---- trace_field env behavior ----------------------------------------------


def test_trace_field_returns_none_without_project(monkeypatch):
    monkeypatch.delenv("GOOGLE_CLOUD_PROJECT", raising=False)
    trace_mod.set_trace_id(_VALID)
    assert trace_field() is None


def test_trace_field_returns_none_without_trace_id(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
    trace_mod.set_trace_id("")
    assert trace_field() is None


def test_trace_field_returns_resource_name(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "meteo-map-lab")
    trace_mod.set_trace_id(_VALID)
    assert trace_field() == f"projects/meteo-map-lab/traces/{_VALID}"


# ---- End-to-end propagation: middleware → sync handler → outbound ---------


@pytest.fixture
def trace_app(monkeypatch):
    """FastAPI app with a sync handler that fires an outbound httpx call via
    an instrumented MockTransport client — the realistic shape of SMHIClient
    being called from inside a `def` route handler."""
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
    app = build_app("")

    client = make_logged_client(
        service="test-upstream",
        base_url="https://example.invalid",
        transport=httpx.MockTransport(lambda req: httpx.Response(200, text="ok")),
    )

    @app.get("/sync-with-outbound")
    def sync_endpoint():
        client.get("/upstream")
        return {"ok": True}

    return app


def test_outbound_log_carries_inbound_trace(trace_app, caplog):
    client = TestClient(trace_app)
    caplog.clear()
    with caplog.at_level(logging.INFO):
        client.get(
            "/sync-with-outbound",
            headers={"x-cloud-trace-context": f"{_VALID}/abc;o=1"},
        )

    outbound = [r for r in caplog.records if r.message == "outbound_request"]
    request_complete = [r for r in caplog.records if r.message == "request_complete"]
    assert len(outbound) == 1
    assert len(request_complete) == 1

    expected = f"projects/test-project/traces/{_VALID}"
    # Both entries carry the same trace, which is what makes Cloud Logging
    # group them. The inbound access-log entry from Cloud Run uses the same
    # trace value (set by Cloud Run from the same header), closing the loop.
    assert getattr(outbound[0], "logging.googleapis.com/trace") == expected
    assert getattr(request_complete[0], "logging.googleapis.com/trace") == expected


def test_no_trace_header_yields_no_trace_field(trace_app, caplog):
    client = TestClient(trace_app)
    caplog.clear()
    with caplog.at_level(logging.INFO):
        client.get("/sync-with-outbound")

    request_complete = [r for r in caplog.records if r.message == "request_complete"]
    outbound = [r for r in caplog.records if r.message == "outbound_request"]
    assert len(request_complete) == 1
    assert len(outbound) == 1
    assert getattr(request_complete[0], "logging.googleapis.com/trace", None) is None
    assert getattr(outbound[0], "logging.googleapis.com/trace", None) is None


def test_malformed_trace_header_yields_no_trace_field(trace_app, caplog):
    client = TestClient(trace_app)
    caplog.clear()
    with caplog.at_level(logging.INFO):
        client.get(
            "/sync-with-outbound",
            headers={"x-cloud-trace-context": "garbage/span;o=1"},
        )

    request_complete = [r for r in caplog.records if r.message == "request_complete"]
    assert len(request_complete) == 1
    assert getattr(request_complete[0], "logging.googleapis.com/trace", None) is None


def test_per_request_isolation(trace_app, caplog):
    """A trace ID set by one request must not leak into the next. Verifies
    the contextvar's per-task isolation rather than module-level state."""
    client = TestClient(trace_app)

    caplog.clear()
    with caplog.at_level(logging.INFO):
        client.get(
            "/sync-with-outbound",
            headers={"x-cloud-trace-context": f"{_VALID}/abc;o=1"},
        )
        client.get("/sync-with-outbound")  # no header

    records = [r for r in caplog.records if r.message == "request_complete"]
    assert len(records) == 2
    expected = f"projects/test-project/traces/{_VALID}"
    assert getattr(records[0], "logging.googleapis.com/trace") == expected
    assert getattr(records[1], "logging.googleapis.com/trace", None) is None
