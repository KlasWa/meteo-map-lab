"""Logging configuration. Emits structured JSON when running on Cloud Run
(detected via the K_SERVICE env var Knative/Cloud Run sets on every revision),
plain text everywhere else. Cloud Logging parses JSON stdout lines into
`jsonPayload.*` fields that can be filtered in the console — e.g.
`jsonPayload.duration_ms > 500` for the request-timing middleware."""

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


def configure_logging(level: int = logging.INFO) -> None:
    """Install a single stdout handler. Idempotent — safe to call again on
    reload-driven test runs."""
    handler = logging.StreamHandler(sys.stdout)
    if os.environ.get("K_SERVICE"):
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)
