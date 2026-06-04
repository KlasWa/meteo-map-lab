"""Verify the instrumented httpx client logs `outbound_request` with the
expected structured fields. Exercises real httpx + event hooks against a
MockTransport — only the network is fake."""

import logging

import httpx

from app.core.http import make_logged_client


def _handler(routes: dict[str, tuple[int, str]]):
    def _fake(request: httpx.Request) -> httpx.Response:
        status, body = routes.get(request.url.path, (404, "not found"))
        return httpx.Response(status, text=body)

    return httpx.MockTransport(_fake)


def test_logs_one_line_per_request(caplog):
    client = make_logged_client(
        service="smhi-metobs",
        base_url="https://example.invalid",
        transport=_handler({"/ok": (200, "hi")}),
    )

    caplog.clear()
    with caplog.at_level(logging.INFO, logger="app.outbound"):
        client.get("/ok")

    outbound = [r for r in caplog.records if r.message == "outbound_request"]
    assert len(outbound) == 1
    rec = outbound[0]
    assert rec.service == "smhi-metobs"
    assert rec.method == "GET"
    assert rec.url.endswith("/ok")
    assert rec.status == 200
    assert isinstance(rec.duration_ms, float)
    assert rec.duration_ms >= 0


def test_logs_4xx_responses(caplog):
    client = make_logged_client(
        service="smhi-metobs",
        base_url="https://example.invalid",
        transport=_handler({}),  # everything 404s
    )

    caplog.clear()
    with caplog.at_level(logging.INFO, logger="app.outbound"):
        client.get("/missing")

    outbound = [r for r in caplog.records if r.message == "outbound_request"]
    assert len(outbound) == 1
    assert outbound[0].status == 404
    # service tag persists across status codes — important for log-based metrics
    # that count by service regardless of outcome.
    assert outbound[0].service == "smhi-metobs"


def test_service_tag_distinguishes_clients(caplog):
    metobs = make_logged_client(
        service="smhi-metobs",
        base_url="https://example.invalid",
        transport=_handler({"/m": (200, "")}),
    )
    lightning = make_logged_client(
        service="smhi-lightning",
        base_url="https://example.invalid",
        transport=_handler({"/l": (200, "")}),
    )

    caplog.clear()
    with caplog.at_level(logging.INFO, logger="app.outbound"):
        metobs.get("/m")
        lightning.get("/l")

    services = [r.service for r in caplog.records if r.message == "outbound_request"]
    assert services == ["smhi-metobs", "smhi-lightning"]


def test_connection_error_emits_no_log_line(caplog):
    # When the transport raises before any response, the response hook never
    # fires — caller code is responsible for handling the failure. Asserted so
    # a future change that "helpfully" logs failures here doesn't quietly drop
    # the URL/duration fields downstream consumers expect.
    def fail(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("nope", request=request)

    client = make_logged_client(
        service="smhi-metobs",
        base_url="https://example.invalid",
        transport=httpx.MockTransport(fail),
    )

    import pytest

    caplog.clear()
    with caplog.at_level(logging.INFO, logger="app.outbound"):
        with pytest.raises(httpx.ConnectError):
            client.get("/boom")

    assert not [r for r in caplog.records if r.message == "outbound_request"]


def test_multiple_requests_each_log_independently(caplog):
    client = make_logged_client(
        service="smhi-metobs",
        base_url="https://example.invalid",
        transport=_handler({"/a": (200, ""), "/b": (200, "")}),
    )

    caplog.clear()
    with caplog.at_level(logging.INFO, logger="app.outbound"):
        client.get("/a")
        client.get("/b")
        client.get("/a")

    paths = [r.url.split("/")[-1] for r in caplog.records if r.message == "outbound_request"]
    assert paths == ["a", "b", "a"]
