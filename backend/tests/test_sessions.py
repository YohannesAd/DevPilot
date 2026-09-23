from datetime import datetime, timedelta, timezone
from http.cookies import SimpleCookie
from pathlib import Path
from uuid import UUID

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import func, inspect, select
from sqlalchemy.orm import Session

from app.config import get_auth_settings
from app.main import app
from app.models import User, UserSession
from app.security import SESSION_COOKIE
from app.services import auth

ACCOUNT = {"email": "Session.User@example.com", "display_name": "Session User",
           "password": "Local-test-password-2026!"}
LOGIN = {"email": "session.user@EXAMPLE.COM", "password": ACCOUNT["password"]}


@pytest.fixture
def account(client):
    response = client.post("/api/auth/register", json=ACCOUNT)
    assert response.status_code == 201
    return response.json()


def sign_in(client):
    response = client.post("/api/auth/login", json=LOGIN)
    assert response.status_code == 200
    return response


def test_login_cookie_digest_and_persistent_current_user(client, account, clean_database):
    response = sign_in(client)
    assert response.json() == account
    assert response.headers["cache-control"] == "no-store"
    cookie = SimpleCookie(response.headers["set-cookie"])[SESSION_COOKIE]
    assert cookie["httponly"] and cookie["samesite"] == "lax"
    assert not cookie["secure"] and not cookie["domain"]
    assert cookie["path"] == "/" and int(cookie["max-age"]) == auth.SESSION_TTL_SECONDS
    assert cookie["expires"]
    token = cookie.value
    assert len(token) == 43 and token not in response.text
    with Session(clean_database) as db:
        row = db.scalar(select(UserSession))
        assert row.token_hash == auth.token_digest(token) and row.token_hash != token
        assert row.user_id == UUID(account["id"])
        assert row.revoked_at is None
        assert abs((row.expires_at - row.created_at).total_seconds() - auth.SESSION_TTL_SECONDS) < 5
    # Fresh connections and HTTP client recover identity exclusively from stored data.
    clean_database.dispose()
    with TestClient(app, base_url="http://localhost:8000") as fresh:
        fresh.cookies.set(SESSION_COOKIE, token)
        me = fresh.get("/api/users/me")
        assert me.status_code == 200 and me.json() == account
        assert me.headers["cache-control"] == "no-store"


def test_unknown_email_and_wrong_password_are_identical(client, account, clean_database, monkeypatch):
    calls = []
    original = auth.password_hasher.verify
    # Patch the service's hasher rather than timing assertions, which are unreliable.
    class RecordingHasher:
        def hash(self, value):
            return auth.PasswordHasher(type=auth.Type.ID).hash(value)

        def verify(self, hashed, password):
            calls.append(hashed)
            return original(hashed, password)

    monkeypatch.setattr(auth, "password_hasher", RecordingHasher())
    wrong = client.post("/api/auth/login", json={**LOGIN, "password": "wrong"})
    missing = client.post("/api/auth/login", json={**LOGIN, "email": "missing@example.com"})
    assert wrong.status_code == missing.status_code == 401
    assert wrong.json() == missing.json() == {"error": {
        "code": "invalid_credentials", "message": "Invalid email or password.",
    }}
    assert len(calls) == 2 and all(value.startswith("$argon2id$") for value in calls)
    assert "set-cookie" not in wrong.headers and "set-cookie" not in missing.headers
    with Session(clean_database) as db:
        assert db.scalar(select(func.count()).select_from(UserSession)) == 0


@pytest.mark.parametrize("token", [None, "malformed", "a" * 43, "a" * 1000])
def test_missing_or_invalid_session(client, token):
    if token:
        client.cookies.set(SESSION_COOKIE, token)
    assert client.get("/api/users/me").status_code == 401
    assert client.post("/api/auth/logout").status_code == 401


@pytest.mark.parametrize("state", ["expired", "revoked"])
def test_expired_and_revoked_sessions(client, account, clean_database, state):
    sign_in(client)
    with Session(clean_database) as db:
        row = db.scalar(select(UserSession))
        if state == "expired":
            row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        else:
            row.revoked_at = datetime.now(timezone.utc)
        db.commit()
    assert client.get("/api/users/me").status_code == 401
    assert client.post("/api/auth/logout").status_code == 401


def test_logout_revokes_only_current_session_and_prevents_replay(client, account, clean_database):
    sign_in(client)
    first = client.cookies.get(SESSION_COOKIE)
    client.cookies.clear()
    sign_in(client)
    second = client.cookies.get(SESSION_COOKIE)
    assert first != second
    response = client.post("/api/auth/logout")
    assert response.status_code == 204 and not response.content
    deleted = SimpleCookie(response.headers["set-cookie"])[SESSION_COOKIE]
    assert deleted["max-age"] == "0" and deleted["path"] == "/"
    assert deleted["httponly"] and deleted["samesite"] == "lax"
    client.cookies.clear()
    client.cookies.set(SESSION_COOKIE, second)
    assert client.get("/api/users/me").status_code == 401
    client.cookies.set(SESSION_COOKIE, first)
    assert client.get("/api/users/me").json() == account
    with Session(clean_database) as db:
        assert db.scalar(select(UserSession).where(
            UserSession.token_hash == auth.token_digest(second))).revoked_at is not None


def test_relogin_rotates_and_revokes_previous_cookie(client, account):
    sign_in(client)
    old = client.cookies.get(SESSION_COOKIE)
    sign_in(client)
    assert client.cookies.get(SESSION_COOKIE) != old
    client.cookies.clear()
    client.cookies.set(SESSION_COOKIE, old)
    assert client.get("/api/users/me").status_code == 401


def test_current_user_is_bound_to_cookie_not_requested_id(client, account):
    sign_in(client)
    first_token = client.cookies.get(SESSION_COOKIE)
    second_payload = {**ACCOUNT, "email": "second-user@example.com"}
    second = client.post("/api/auth/register", json=second_payload).json()
    client.cookies.clear()
    assert client.post("/api/auth/login", json={
        "email": second_payload["email"], "password": second_payload["password"],
    }).status_code == 200
    assert client.get("/api/users/me", params={"user_id": account["id"]}).json() == second
    client.cookies.clear()
    client.cookies.set(SESSION_COOKIE, first_token)
    assert client.get("/api/users/me").json() == account


def test_duplicate_origin_headers_are_rejected(client, account):
    sign_in(client)
    client.headers.pop("origin")
    response = client.post("/api/auth/logout", headers=[
        ("Origin", "http://localhost:3000"), ("Origin", "https://evil.example"),
    ])
    assert response.status_code == 403
    assert client.get("/api/users/me").status_code == 200


@pytest.mark.parametrize("origin", [None, "null", "https://evil.example", "http://localhost:3000.evil.example",
                                  "http://127.0.0.1:3000", "http://localhost:3000/"])
def test_csrf_rejects_logout_without_revoking(client, account, origin):
    sign_in(client)
    client.headers.pop("origin")
    headers = {} if origin is None else {"Origin": origin}
    response = client.post("/api/auth/logout", headers=headers)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "csrf_failed"
    assert "set-cookie" not in response.headers
    assert client.get("/api/users/me").status_code == 200


@pytest.mark.parametrize("path", ["/api/auth/login", "/api/auth/register"])
def test_csrf_also_protects_login_and_registration(client, path):
    client.headers.pop("origin")
    assert client.post(path, json=ACCOUNT).status_code == 403


def test_api_origin_and_cors_allowlist(client, account):
    assert client.post("/api/auth/login", json=LOGIN,
                       headers={"Origin": "http://localhost:8000"}).status_code == 200
    accepted = client.options("/api/auth/logout", headers={
        "Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type",
    })
    assert accepted.status_code == 200
    assert accepted.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert accepted.headers["access-control-allow-credentials"] == "true"
    rejected = client.options("/api/auth/logout", headers={
        "Origin": "https://evil.example", "Access-Control-Request-Method": "POST",
    })
    assert rejected.status_code == 400
    assert "access-control-allow-origin" not in rejected.headers


def test_production_cookie_is_secure(client, account, monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("FRONTEND_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("API_ORIGIN", "https://api.example.com")
    get_auth_settings.cache_clear()
    app.middleware_stack = None
    with TestClient(app, base_url="https://api.example.com",
                    headers={"Origin": "https://app.example.com"}) as https:
        response = sign_in(https)
        cookie = SimpleCookie(response.headers["set-cookie"])[SESSION_COOKIE]
        assert cookie["secure"] and cookie["httponly"] and not cookie["domain"]
        assert https.get("/api/users/me").status_code == 200
        response = https.post("/api/auth/logout")
        assert response.status_code == 204
        assert SimpleCookie(response.headers["set-cookie"])[SESSION_COOKIE]["secure"]


@pytest.mark.parametrize("origin", ["http://localhost:3000", "*", "https://app.example.com/path", "null"])
def test_production_rejects_unsafe_configuration(monkeypatch, origin):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("FRONTEND_ORIGIN", origin)
    with pytest.raises(RuntimeError):
        get_auth_settings()


@pytest.mark.parametrize("payload", [{}, {**LOGIN, "password": ""}, {**LOGIN, "password": "x" * 129},
                                     {**LOGIN, "email": "bad"}, {**LOGIN, "extra": "x"}])
def test_invalid_login_input(client, payload):
    response = client.post("/api/auth/login", json=payload)
    assert response.status_code == 422 and response.json()["error"]["code"] == "validation_error"
    assert "set-cookie" not in response.headers


def test_migration_matches_models_and_downgrade_preserves_users(client, account, clean_database):
    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.check(cfg)
    command.downgrade(cfg, "0001_create_users")
    try:
        assert "sessions" not in inspect(clean_database).get_table_names()
        with Session(clean_database) as db:
            assert db.get(User, UUID(account["id"])) is not None
    finally:
        command.upgrade(cfg, "head")
    command.check(cfg)
