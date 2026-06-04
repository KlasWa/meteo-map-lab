import httpx

from app.services.lightning_client import LightningClient


def _client_with(handler) -> LightningClient:
    transport = httpx.MockTransport(handler)
    return LightningClient(base_url="https://example.test/api/version/latest", transport=transport)


def test_fetch_day_hits_day_url():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/year/2024/month/7/day/15/data.json")
        return httpx.Response(200, json={"values": [{"lat": 1.0}]})

    payload = _client_with(handler).fetch_day(2024, 7, 15)
    assert payload["values"][0]["lat"] == 1.0


def test_fetch_day_404_returns_empty():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    assert _client_with(handler).fetch_day(1999, 1, 1) == {}


def test_fetch_day_other_error_raises():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    try:
        _client_with(handler).fetch_day(2024, 7, 15)
        raise AssertionError("expected HTTPStatusError")
    except httpx.HTTPStatusError:
        pass
