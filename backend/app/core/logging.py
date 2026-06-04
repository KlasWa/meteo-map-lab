"""Logging configuration. Emits structured JSON when running on Cloud Run
(detected via the K_SERVICE env var Knative/Cloud Run sets on every revision),
plain text everywhere else. Cloud Logging parses JSON stdout lines into
`jsonPayload.*` fields that can be filtered in the console — e.g.
`jsonPayload.duration_ms > 500` for the request-timing middleware.

Also silences a few noisy stdlib loggers that duplicate our structured lines
without adding any filterable fields (httpx + httpcore at the outbound layer,
uvicorn.access at the inbound layer)."""

import json
import logging
import os
import sys

# Standard LogRecord attributes — everything else passed via logger.info(..., extra={...})
# becomes a custom field on the JSON payload.
_RESERVED_LOG_RECORD_ATTRS = {
    "args", "asctime", "created", "exc_info", "exc_text", "filename",
    "funcName", "levelname", "levelno", "lineno", "message", "module",
    "msecs", "msg", "name", "pathname", "process", "processName",
    "relativeCreated", "stack_info", "thread", "threadName", "taskName",
}

# Libraries that emit their own per-request INFO lines duplicating ours.
# Quieting to WARNING keeps real failures (4xx/5xx, connection errors) visible
# while removing the per-request chatter.
_NOISY_LOGGERS = ("httpx", "httpcore", "uvicorn.access")


class JsonFormatter(logging.Formatter):
    """Render a LogRecord as a single-line JSON object Cloud Logging can index."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "severity": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        for key, value in record.__dict__.items():
            if key in _RESERVED_LOG_RECORD_ATTRS or key in payload:
                continue
            try:
                json.dumps(value)
            except TypeError:
                continue
            payload[key] = value
        return json.dumps(payload)


class TextFormatter(logging.Formatter):
    """Plain-text formatter that appends `extra={…}` fields after the message.
    Keeps the human-readable shape for local dev while still surfacing the
    structured fields the JSON formatter exposes in production. Without this,
    `logger.info("request_complete", extra={…})` would print only the message
    locally and the duration_ms / path / etc. would be invisible."""

    _BASE_FMT = "%(levelname)s %(name)s: %(message)s"

    def __init__(self) -> None:
        super().__init__(self._BASE_FMT)

    def format(self, record: logging.LogRecord) -> str:
        base = super().format(record)
        extras = [
            f"{k}={v}"
            for k, v in record.__dict__.items()
            if k not in _RESERVED_LOG_RECORD_ATTRS and k != "message"
        ]
        return f"{base} | {' '.join(extras)}" if extras else base


def configure_logging(level: int = logging.INFO) -> None:
    """Install a single stdout handler and quiet the noisy library loggers.
    Idempotent — safe to call again on reload-driven test runs."""
    handler = logging.StreamHandler(sys.stdout)
    if os.environ.get("K_SERVICE"):
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(TextFormatter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)

    for name in _NOISY_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)
