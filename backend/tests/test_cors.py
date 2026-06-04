"""Integration tests for CORS wiring. Exercises the real CORSMiddleware
against an app built from controlled origins, so the comma-split logic and
the middleware behavior are verified end-to-end."""

from fastapi.testclient import TestClient

from app.main import build_app


def _client(cors_origins: str) -> TestClient:
    return TestClient(build_app(cors_origins))


def test_allowed_origin_is_echoed_in_response():
    client = _client("https://example.com")
    resp = client.get("/health", headers={"Origin": "https://example.com"})
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "https://example.com"


def test_disallowed_origin_does_not_get_cors_header():
    client = _client("https://example.com")
    resp = client.get("/health", headers={"Origin": "https://attacker.com"})
    assert resp.status_code == 200
    assert "access-control-allow-origin" not in resp.headers


def test_comma_separated_origins_are_all_allowed():
    client = _client("https://a.example.com,https://b.example.com")

    resp_a = client.get("/health", headers={"Origin": "https://a.example.com"})
    assert resp_a.headers.get("access-control-allow-origin") == "https://a.example.com"

    resp_b = client.get("/health", headers={"Origin": "https://b.example.com"})
    assert resp_b.headers.get("access-control-allow-origin") == "https://b.example.com"


def test_whitespace_around_origins_is_trimmed():
    client = _client(" https://x.example.com , https://y.example.com ")
    resp = client.get("/health", headers={"Origin": "https://x.example.com"})
    assert resp.headers.get("access-control-allow-origin") == "https://x.example.com"


def test_empty_cors_origins_yields_no_cors():
    client = _client("")
    resp = client.get("/health", headers={"Origin": "https://example.com"})
    # Health still works (CORS only affects browsers, not the response body),
    # but no Access-Control-Allow-Origin is set so a browser would block it.
    assert resp.status_code == 200
    assert "access-control-allow-origin" not in resp.headers


def test_preflight_with_allowed_origin_succeeds():
    client = _client("https://example.com")
    resp = client.options(
        "/health",
        headers={
            "Origin": "https://example.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "https://example.com"
