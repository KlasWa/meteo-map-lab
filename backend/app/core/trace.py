"""Cloud Trace correlation for structured logs.

Cloud Run injects an `X-Cloud-Trace-Context: TRACE_ID/SPAN_ID;o=TRACE_TRUE`
header on every inbound request. If a JSON log entry includes the special
`logging.googleapis.com/trace` field with the full resource name
`projects/<PROJECT>/traces/<TRACE_ID>`, Cloud Logging auto-correlates the
entry with the matching Cloud Run access-log entry and any other entries
that share the same trace ID — so opening one shows all the related ones.

The trace ID is stashed in a contextvar by the inbound request middleware;
outbound httpx logging reads it from the same contextvar inside the
request's handler. Starlette's run_in_threadpool propagates contextvars to
the worker thread (via anyio), so sync route handlers see the same value
the async middleware set.

When K_SERVICE isn't set (local dev) the field resolves to empty and the
logger drops it — no behavior change off Cloud Run."""

import contextvars
import os

_trace_id: contextvars.ContextVar[str] = contextvars.ContextVar("trace_id", default="")

# Cloud Trace IDs are 32 lowercase hex characters; any header value that
# doesn't match is treated as missing rather than passed through.
_TRACE_ID_LEN = 32


def parse_cloud_trace_header(header: str) -> str:
    """Extract the trace ID from `TRACE_ID/SPAN_ID;o=TRACE_TRUE`, or `""` if
    the header is missing or doesn't match the expected shape."""
    if not header:
        return ""
    candidate = header.split("/", 1)[0].strip()
    if len(candidate) != _TRACE_ID_LEN:
        return ""
    return candidate


def set_trace_id(trace_id: str) -> None:
    _trace_id.set(trace_id)


def trace_field() -> str | None:
    """Return the `logging.googleapis.com/trace` resource-name value for the
    current request, or `None` if no trace ID was captured or the project
    isn't known (e.g. running locally without `GOOGLE_CLOUD_PROJECT`)."""
    tid = _trace_id.get()
    project = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
    if not tid or not project:
        return None
    return f"projects/{project}/traces/{tid}"
