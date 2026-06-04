"""Instrumented httpx client factory. Every outbound request emits one
structured log line on response — service tag, method, URL, status, duration.
Cloud Logging picks up the `extra` fields via JsonFormatter so you can filter
on them in the console:

    jsonPayload.message="outbound_request"
    jsonPayload.message="outbound_request" AND jsonPayload.service="smhi"
    jsonPayload.message="outbound_request" AND jsonPayload.status>=400

Logs-based metric on the same filter gives you a per-minute call count
without changing any code.

Timing pattern: stash perf_counter on the request via httpx's per-request
`extensions` dict, compute the delta in the response hook. httpx invokes the
response hook even on 4xx/5xx responses (anything that reaches the network);
connection-level errors raise before the hook fires, so caller code still
needs to handle those."""

import logging
import time

import httpx

_logger = logging.getLogger("app.outbound")


def make_logged_client(
    *,
    service: str,
    base_url: str,
    timeout: float = 30.0,
    transport: httpx.BaseTransport | None = None,
) -> httpx.Client:
    """Build an httpx.Client that logs each outbound request as
    `outbound_request` with structured fields. `service` identifies the
    upstream (e.g. "smhi-metobs", "smhi-lightning")."""

    def on_request(request: httpx.Request) -> None:
        request.extensions["start_perf"] = time.perf_counter()

    def on_response(response: httpx.Response) -> None:
        started = response.request.extensions.get("start_perf")
        duration_ms = (
            round((time.perf_counter() - started) * 1000, 1)
            if started is not None
            else None
        )
        _logger.info(
            "outbound_request",
            extra={
                "service": service,
                "method": response.request.method,
                "url": str(response.request.url),
                "status": response.status_code,
                "duration_ms": duration_ms,
            },
        )

    return httpx.Client(
        base_url=base_url,
        timeout=timeout,
        transport=transport,
        event_hooks={"request": [on_request], "response": [on_response]},
    )
