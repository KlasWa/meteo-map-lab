import json
from pathlib import Path

import httpx

from app.services.smhi import SMHIClient

FIXTURES = Path(__file__).parent / "fixtures"


def _client_with(handler) -> SMHIClient:
    transport = httpx.MockTransport(handler)
    return SMHIClient(
        base_url="https://example.test/api", param=16, transport=transport
    )


def test_fetch_station_list_maps_fields():
    body = (FIXTURES / "station_list_sample.json").read_text()

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/version/1.0/parameter/16.json"
        return httpx.Response(200, content=body)

    stations = _client_with(handler).fetch_station_list()
    assert len(stations) == 2
    s = stations[0]
    assert s.id == 92410
    assert s.name == "Arvika A"
    assert s.lat == 59.6743
    assert s.lon == 12.6354
    assert s.active is True


def test_fetch_recent_returns_json():
    payload = json.loads((FIXTURES / "recent_sample.json").read_text())

    def handler(request: httpx.Request) -> httpx.Response:
        assert "latest-months/data.json" in request.url.path
        assert "/station/92410/" in request.url.path
        return httpx.Response(200, json=payload)

    data = _client_with(handler).fetch_recent(92410)
    assert data["value"][0]["value"] == "90"


def test_fetch_archive_returns_text():
    csv_text = (FIXTURES / "archive_sample.csv").read_text()

    def handler(request: httpx.Request) -> httpx.Response:
        assert "corrected-archive/data.csv" in request.url.path
        return httpx.Response(200, text=csv_text)

    text = _client_with(handler).fetch_archive(92410)
    assert "Total molnmängd" in text


def test_http_error_propagates():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    try:
        _client_with(handler).fetch_recent(92410)
        raise AssertionError("expected HTTPStatusError")
    except httpx.HTTPStatusError:
        pass
