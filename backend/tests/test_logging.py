"""Tests for the JSON log formatter that drives Cloud Logging's structured
fields. Plain-text fallback for local dev is covered by the configure path."""

import json
import logging

from app.core.logging import JsonFormatter, configure_logging


def _format(record: logging.LogRecord) -> dict:
    return json.loads(JsonFormatter().format(record))


def test_basic_fields_present():
    record = logging.LogRecord(
        name="app.request", level=logging.INFO, pathname=__file__, lineno=1,
        msg="hello", args=(), exc_info=None,
    )
    out = _format(record)
    assert out["severity"] == "INFO"
    assert out["message"] == "hello"
    assert out["logger"] == "app.request"


def test_extra_fields_are_passed_through():
    record = logging.LogRecord(
        name="app.request", level=logging.INFO, pathname=__file__, lineno=1,
        msg="request_complete", args=(), exc_info=None,
    )
    # extra= on the logger call ends up as attributes on the record
    record.path = "/api/cloud-cover"
    record.duration_ms = 1234.5
    record.status = 200

    out = _format(record)
    assert out["path"] == "/api/cloud-cover"
    assert out["duration_ms"] == 1234.5
    assert out["status"] == 200


def test_exception_info_is_serialised():
    try:
        raise ValueError("boom")
    except ValueError:
        import sys
        record = logging.LogRecord(
            name="app", level=logging.ERROR, pathname=__file__, lineno=1,
            msg="oops", args=(), exc_info=sys.exc_info(),
        )

    out = _format(record)
    assert "ValueError: boom" in out["exception"]


def test_non_json_serialisable_extras_are_dropped(monkeypatch):
    class NotJsonable:
        pass

    record = logging.LogRecord(
        name="app", level=logging.INFO, pathname=__file__, lineno=1,
        msg="x", args=(), exc_info=None,
    )
    record.bad = NotJsonable()
    record.good = "ok"

    out = _format(record)
    assert out["good"] == "ok"
    assert "bad" not in out


def test_configure_logging_swaps_handlers(monkeypatch):
    monkeypatch.setenv("K_SERVICE", "meteo-map-lab-backend")
    configure_logging()
    root = logging.getLogger()
    assert len(root.handlers) == 1
    assert isinstance(root.handlers[0].formatter, JsonFormatter)

    # Restore plain formatter to avoid leaking JSON into subsequent tests' captures.
    monkeypatch.delenv("K_SERVICE", raising=False)
    configure_logging()
    assert not isinstance(root.handlers[0].formatter, JsonFormatter)
