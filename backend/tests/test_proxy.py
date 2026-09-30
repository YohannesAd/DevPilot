"""Authenticated frontend proxy boundary; all data is disposable PostgreSQL."""
from secrets import token_hex, token_urlsafe

import pytest

from app import config
from app.config import get_database_url as configured_database_url
from app.main import app


def enable_proxy(monkeypatch):
    secret = token_hex(32)
    monkeypatch.setenv("API_PROXY_SECRET", secret)
    config.get_proxy_settings.cache_clear()
    app.middleware_stack = None
    return {"x-devpilot-proxy-secret": secret, "x-devpilot-client-ip": "203.0.113.10"}


@pytest.mark.parametrize("path", ["/api/users/me", "/api/projects", "/api/auth/login", "/docs", "/openapi.json"])
def test_direct_backend_access_rejected(client, monkeypatch, path):
    enable_proxy(monkeypatch)
    response = client.get(path, headers={"x-forwarded-for": "203.0.113.10", "x-devpilot-client-ip": "203.0.113.10"})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "proxy_required"
    assert response.headers["cache-control"] == "no-store"
    assert client.get("/api/health").status_code == 200


@pytest.mark.parametrize("bad", ["", "not-an-ip", "203.0.113.1, 203.0.113.2", "fe80::1%eth0"])
def test_invalid_verified_ip_rejected(client, monkeypatch, bad):
    headers = enable_proxy(monkeypatch)
    headers["x-devpilot-client-ip"] = bad
    assert client.get("/api/users/me", headers=headers).status_code == 403


def test_wrong_and_duplicate_secrets_rejected(client, monkeypatch):
    headers = enable_proxy(monkeypatch)
    wrong = {**headers, "x-devpilot-proxy-secret": token_hex(32)}
    assert client.get("/api/users/me", headers=wrong).status_code == 403
    assert client.get("/api/users/me", headers=[*headers.items(), ("x-devpilot-proxy-secret", headers["x-devpilot-proxy-secret"])]).status_code == 403


def test_verified_ips_are_separate_and_forwarded_spoofing_ignored(client, monkeypatch):
    headers = enable_proxy(monkeypatch)
    monkeypatch.setenv("AUTH_LOGIN_IP_LIMIT", "1")
    config.get_rate_limit_settings.cache_clear()
    body = {"email": "unknown@example.com", "password": token_urlsafe(24)}
    assert client.post("/api/auth/login", json=body, headers=headers).status_code == 401
    response = client.post("/api/auth/login", json=body, headers={**headers, "x-forwarded-for": "198.51.100.3"})
    assert response.status_code == 429 and int(response.headers["retry-after"]) > 0
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert client.post("/api/auth/login", json=body, headers={**headers, "x-devpilot-client-ip": "203.0.113.11"}).status_code == 401


def test_proxy_keeps_csrf_sessions_and_production_cookie(client, monkeypatch):
    headers = enable_proxy(monkeypatch)
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("FRONTEND_ORIGIN", "https://staging.example.com")
    monkeypatch.setenv("API_ORIGIN", "https://api.example.com")
    config.get_auth_settings.cache_clear()
    headers["origin"] = "https://staging.example.com"
    body = {"email": "proxy-check@example.com", "password": token_urlsafe(24), "display_name": "Disposable proxy check"}
    assert client.post("/api/auth/register", json=body, headers={**headers, "origin": "https://foreign.example.com"}).status_code == 403
    assert client.post("/api/auth/register", json=body, headers=headers).status_code == 201
    response = client.post("/api/auth/login", json={"email": body["email"], "password": body["password"]}, headers=headers)
    assert response.status_code == 200
    cookie = response.headers["set-cookie"]
    assert all(part in cookie for part in ["HttpOnly", "Secure", "SameSite=lax", "Path=/"])
    assert "Domain=" not in cookie
    # HTTP test transport does not send Secure cookies automatically; explicit transport
    # verifies the backend session, not a browser's HTTPS cookie policy.
    session_headers = {**headers, "cookie": cookie.split(";", 1)[0]}
    assert client.get("/api/users/me", headers=session_headers).status_code == 200
    logout = client.post("/api/auth/logout", headers=session_headers)
    assert logout.status_code == 204 and "Max-Age=0" in logout.headers["set-cookie"]
    assert client.get("/api/users/me", headers=session_headers).status_code == 401


def test_production_config_requires_proxy_secret_and_verified_tls(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("FRONTEND_ORIGIN", "https://staging.example.com")
    monkeypatch.setenv("API_ORIGIN", "https://api.example.com")
    config.get_auth_settings.cache_clear()
    with pytest.raises(RuntimeError, match="API_PROXY_SECRET"):
        config.get_proxy_settings()
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://test@db.example.com/staging?sslmode=require")
    with pytest.raises(RuntimeError, match="verify-full"):
        configured_database_url()
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://test@db.example.com/staging?sslmode=verify-full&sslrootcert=system")
    assert configured_database_url().query["sslmode"] == "verify-full"
