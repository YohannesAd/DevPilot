"""Deterministic PostgreSQL counters and actual HTTP boundaries; no time.sleep."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from ipaddress import ip_network
from pathlib import Path
from secrets import token_urlsafe
from threading import Barrier

import pytest
from alembic import command
from alembic.config import Config
from fastapi import Request
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, inspect, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.client_ip import client_ip
from app.config import get_auth_settings, get_rate_limit_settings
from app.main import app
from app.models import AuthRateLimit
from app.routes import auth as auth_routes
from app.services.auth import InvalidCredentials
from app.services import rate_limits as limits


@pytest.fixture
def clock(monkeypatch):
    value = [datetime(2026, 1, 1, tzinfo=timezone.utc)]
    monkeypatch.setattr(limits, "database_now", lambda _db: value[0])
    return value


def configure(monkeypatch, **values):
    for key, value in values.items():
        monkeypatch.setenv(key, str(value))
    get_rate_limit_settings.cache_clear()


def connection(ip="203.0.113.1"):
    return TestClient(app, base_url="http://localhost:8000", client=(ip, 50000),
                      headers={"Origin": "http://localhost:3000"})


def reject_login(monkeypatch):
    calls = []
    def reject(*_args):
        calls.append(True)
        raise InvalidCredentials
    monkeypatch.setattr(auth_routes, "login_user", reject)
    return calls


def login(client, email="person@example.com", headers=None):
    return client.post("/api/auth/login", json={"email": email, "password": "not-a-real-password"}, headers=headers)


@pytest.mark.parametrize("dimension,threshold,window", [
    ("login_ip", 30, 600), ("login_email", 10, 900), ("register_ip", 5, 3600),
])
def test_default_limits_with_disposable_account_and_success_after_expiry(
    client, clock, monkeypatch, dimension, threshold, window
):
    # Use all actual default budgets together; only the isolated test clock advances.
    configure(monkeypatch, AUTH_LOGIN_IP_LIMIT=30, AUTH_LOGIN_IP_WINDOW_SECONDS=600,
              AUTH_LOGIN_EMAIL_LIMIT=10, AUTH_LOGIN_EMAIL_WINDOW_SECONDS=900,
              AUTH_REGISTER_IP_LIMIT=5, AUTH_REGISTER_IP_WINDOW_SECONDS=3600)
    account = {"email": "rate-check@example.com", "display_name": "Disposable rate check",
               "password": token_urlsafe(24)}
    assert client.post("/api/auth/register", json=account).status_code == 201
    if dimension == "register_ip":
        for _ in range(threshold - 1):
            assert client.post("/api/auth/register", json=account).status_code == 409
        path = "/api/auth/register"
        payload = {**account, "email": "rate-check-after@example.com"}
        success = 201
    else:
        for index in range(threshold):
            email = f"unknown-{index}@example.com" if dimension == "login_ip" else account["email"]
            assert login(client, email).status_code == 401
        path = "/api/auth/login"
        payload = {"email": account["email"], "password": account["password"]}
        success = 200
    blocked = client.post(path, json=payload)
    assert blocked.status_code == 429
    assert blocked.headers["retry-after"] == str(window)
    assert blocked.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "Retry-After" in blocked.headers["access-control-expose-headers"]
    assert blocked.json() == {"error": {"code": "rate_limited",
                                        "message": "Too many attempts. Wait before trying again."}}
    assert account["password"] not in blocked.text and account["email"] not in blocked.text
    clock[0] += timedelta(seconds=window - 1)
    still_blocked = client.post(path, json=payload)
    assert still_blocked.status_code == 429 and still_blocked.headers["retry-after"] == "1"
    clock[0] += timedelta(seconds=1)
    assert client.post(path, json=payload).status_code == success


def test_defaults_and_production_secret(monkeypatch):
    for key in ["AUTH_LOGIN_IP_LIMIT", "AUTH_LOGIN_EMAIL_LIMIT", "AUTH_REGISTER_IP_LIMIT", "AUTH_RATE_KEY_SECRET"]:
        monkeypatch.delenv(key, raising=False)
    get_rate_limit_settings.cache_clear()
    settings = get_rate_limit_settings()
    assert (settings.login_ip_limit, settings.login_ip_window) == (30, 600)
    assert (settings.login_email_limit, settings.login_email_window) == (10, 900)
    assert (settings.register_ip_limit, settings.register_ip_window) == (5, 3600)
    assert settings.trusted_proxies == () and "key_secret" not in repr(settings)
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("FRONTEND_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("API_ORIGIN", "https://api.example.com")
    get_auth_settings.cache_clear(); get_rate_limit_settings.cache_clear()
    with pytest.raises(RuntimeError, match="Production requires"):
        get_rate_limit_settings()


@pytest.mark.parametrize("key,value", [
    ("AUTH_LOGIN_IP_LIMIT", "0"), ("AUTH_REGISTER_IP_LIMIT", "-1"),
    ("AUTH_LOGIN_EMAIL_LIMIT", "1000001"), ("AUTH_LOGIN_IP_WINDOW_SECONDS", "x"),
    ("AUTH_REGISTER_IP_WINDOW_SECONDS", "86401"), ("AUTH_RATE_KEY_SECRET", "short"),
    ("AUTH_TRUSTED_PROXY_CIDRS", "*"), ("AUTH_TRUSTED_PROXY_CIDRS", "0.0.0.0/0"),
    ("AUTH_TRUSTED_PROXY_CIDRS", "::/0"), ("AUTH_TRUSTED_PROXY_CIDRS", "bad"),
])
def test_invalid_configuration_fails_closed(monkeypatch, key, value):
    configure(monkeypatch, **{key:value})
    with pytest.raises(RuntimeError): get_rate_limit_settings()


def test_login_ip_threshold_expiry_and_no_password_work_when_blocked(client, clock, monkeypatch, clean_database):
    configure(monkeypatch, AUTH_LOGIN_IP_LIMIT=2, AUTH_LOGIN_IP_WINDOW_SECONDS=60)
    calls = reject_login(monkeypatch)
    with connection() as a, connection("203.0.113.2") as b:
        assert login(a).status_code == 401
        assert login(a, "another@example.com").status_code == 401
        blocked = login(a, "third@example.com")
        assert blocked.status_code == 429 and len(calls) == 2
        assert blocked.headers["retry-after"] == "60"
        assert blocked.headers["access-control-allow-origin"] == "http://localhost:3000"
        assert blocked.headers["access-control-allow-credentials"] == "true"
        assert "Retry-After" in blocked.headers["access-control-expose-headers"]
        assert blocked.headers["cache-control"] == "no-store" and "set-cookie" not in blocked.headers
        assert blocked.json() == {"error":{"code":"rate_limited","message":"Too many attempts. Wait before trying again."}}
        assert login(b).status_code == 401  # Independent IP budget.
        clock[0] += timedelta(seconds=59, microseconds=100)
        assert login(a).headers["retry-after"] == "1"  # Ceiling, never zero; retry didn't extend expiry.
        clock[0] += timedelta(seconds=1)
        assert login(a).status_code == 401
    with Session(clean_database) as db:
        rows = db.scalars(select(AuthRateLimit)).all()
        assert all(len(row.key) == 64 and "example" not in row.key for row in rows)
        assert all(row.attempts <= 3 for row in rows)


@pytest.mark.parametrize("known", [True, False])
def test_email_normalization_and_known_unknown_identical_limit(client, clock, monkeypatch, known):
    email = "Person@example.com"
    if known:
        assert client.post("/api/auth/register", json={"email":email,"password":token_urlsafe(24),"display_name":"Person"}).status_code == 201
    configure(monkeypatch, AUTH_LOGIN_EMAIL_LIMIT=2, AUTH_LOGIN_EMAIL_WINDOW_SECONDS=90)
    # Real credential verification keeps the same generic errors for known/unknown users.
    with connection() as a, connection("203.0.113.2") as b, connection("203.0.113.3") as c:
        first = login(a, " Person@EXAMPLE.COM ")
        assert first.status_code == 401 and first.json()["error"]["code"] == "invalid_credentials"
        assert login(b, "person@example.com").json() == first.json()
        result = login(c, "PERSON@example.com")
        assert result.status_code == 429 and result.headers["retry-after"] == "90"
        assert "Person" not in result.text and "password" not in result.text
        assert login(c, "different@example.com").status_code == 401
        clock[0] += timedelta(seconds=90)
        assert login(c, email).status_code == 401


def test_registration_threshold_before_hashing_and_separate_login_budget(client, clock, monkeypatch):
    configure(monkeypatch, AUTH_REGISTER_IP_LIMIT=1, AUTH_REGISTER_IP_WINDOW_SECONDS=120)
    body = {"email":"register@example.com","display_name":"Register","password":token_urlsafe(24)}
    assert client.post("/api/auth/register", json=body).status_code == 201
    from app.services.auth import password_hasher
    def forbidden_hash(*_args): raise AssertionError("Blocked registration must not hash")
    with monkeypatch.context() as patch:
        patch.setattr(type(password_hasher), "hash", forbidden_hash)
        blocked = client.post("/api/auth/register", json={**body,"email":"second@example.com"})
        assert blocked.status_code == 429 and blocked.headers["retry-after"] == "120"
    with connection("203.0.113.12") as other:
        assert other.post("/api/auth/register", json={**body,"email":"other-ip@example.com"}).status_code == 201
    assert client.post("/api/auth/login", json={"email":body["email"],"password":body["password"]}).status_code == 200
    clock[0] += timedelta(seconds=120)
    assert client.post("/api/auth/register", json={**body,"email":"second@example.com"}).status_code == 201


def test_successes_and_duplicate_registration_count_without_revoking_session(client, clock, monkeypatch):
    configure(monkeypatch, AUTH_LOGIN_IP_LIMIT=1, AUTH_REGISTER_IP_LIMIT=2)
    body = {"email":"success@example.com","display_name":"Success","password":token_urlsafe(24)}
    assert client.post("/api/auth/register", json=body).status_code == 201
    assert client.post("/api/auth/register", json=body).status_code == 409
    assert client.post("/api/auth/register", json=body).status_code == 429
    payload = {"email":body["email"],"password":body["password"]}
    assert client.post("/api/auth/login", json=payload).status_code == 200
    blocked = client.post("/api/auth/login", json=payload)
    assert blocked.status_code == 429 and "set-cookie" not in blocked.headers
    assert client.get("/api/users/me").status_code == 200
    assert client.post("/api/auth/logout").status_code == 204


def test_csrf_and_validation_rejections_do_not_spend_password_attempts(client, clean_database):
    assert login(client, headers={"Origin":"https://untrusted.example"}).status_code == 403
    assert client.post("/api/auth/login", json={}).status_code == 422
    with Session(clean_database) as db:
        assert db.scalar(select(func.count()).select_from(AuthRateLimit)) == 0


@pytest.mark.parametrize("dimension", ["ip", "email"])
def test_concurrent_http_attempts_never_exceed_threshold(client, clock, monkeypatch, dimension):
    configure(monkeypatch, **{f"AUTH_LOGIN_{dimension.upper()}_LIMIT":3})
    calls = reject_login(monkeypatch)
    barrier = Barrier(12)
    def attempt(i):
        with connection("203.0.113.1" if dimension == "ip" else f"203.0.113.{i+1}") as browser:
            barrier.wait(timeout=10)
            return login(browser, f"person{i}@example.com" if dimension == "ip" else "person@example.com").status_code
    with ThreadPoolExecutor(max_workers=12) as pool:
        statuses = list(pool.map(attempt, range(12)))
    assert statuses.count(401) == 3 and statuses.count(429) == 9
    assert len(calls) == 3


def test_counters_survive_new_connections_and_settings_reload(client, clock, monkeypatch, clean_database):
    configure(monkeypatch, AUTH_LOGIN_IP_LIMIT=1)
    request = Request({"type":"http", "client":("203.0.113.4",1), "headers":[]})
    with Session(clean_database) as db: limits.check_attempt(db, request, "login", "person@example.com")
    get_rate_limit_settings.cache_clear()
    independent = create_engine(clean_database.url, hide_parameters=True)
    try:
        with Session(independent) as db:
            with pytest.raises(limits.RateLimited): limits.check_attempt(db, request, "login", "person@example.com")
    finally: independent.dispose()


def test_combined_limits_report_longest_wait_without_creating_email_keys(client, clock, monkeypatch, clean_database):
    configure(monkeypatch, AUTH_LOGIN_IP_LIMIT=1, AUTH_LOGIN_IP_WINDOW_SECONDS=20,
              AUTH_LOGIN_EMAIL_LIMIT=1, AUTH_LOGIN_EMAIL_WINDOW_SECONDS=90)
    reject_login(monkeypatch)
    assert login(client).status_code == 401
    assert login(client).headers["retry-after"] == "90"
    assert login(client, "new-address@example.com").headers["retry-after"] == "20"
    with Session(clean_database) as db:
        assert db.scalar(select(func.count()).select_from(AuthRateLimit)) == 2


def test_concurrent_registration_requests_share_the_ip_budget(client, clock, monkeypatch, clean_database):
    configure(monkeypatch, AUTH_REGISTER_IP_LIMIT=3)
    barrier = Barrier(8)
    password = token_urlsafe(24)
    def register(i):
        with connection() as browser:
            barrier.wait(timeout=10)
            return browser.post("/api/auth/register", json={"email":f"concurrent{i}@example.com",
                "display_name":"Concurrent", "password":password}).status_code
    with ThreadPoolExecutor(max_workers=8) as pool:
        statuses = list(pool.map(register, range(8)))
    assert statuses.count(201) == 3 and statuses.count(429) == 5
    with clean_database.connect() as db:
        assert db.scalar(text("SELECT count(*) FROM users")) == 3


@pytest.mark.parametrize("peer,headers,expected", [
    ("203.0.113.1", [("x-forwarded-for","198.51.100.1")], "203.0.113.1"),
    ("127.0.0.1", [("x-forwarded-for","198.51.100.1")], "198.51.100.1"),
    ("127.0.0.1", [("x-forwarded-for","192.0.2.8, 198.51.100.1")], "198.51.100.1"),
    ("127.0.0.1", [("x-forwarded-for","198.51.100.1, 10.0.0.2")], "198.51.100.1"),
    ("127.0.0.1", [("x-forwarded-for","invalid")], "127.0.0.1"),
    ("127.0.0.1", [("x-forwarded-for","198.51.100.1"),("x-forwarded-for","198.51.100.2")], "127.0.0.1"),
    ("127.0.0.1", [("x-forwarded-for",",198.51.100.1")], "127.0.0.1"),
    ("127.0.0.1", [("forwarded","for=198.51.100.1"),("x-real-ip","198.51.100.1")], "127.0.0.1"),
    ("::ffff:203.0.113.1", [], "203.0.113.1"),
    ("2001:db8::1", [], "2001:db8::1"),
    ("testclient", [], "unknown"),
    (None, [], "unknown"),
])
def test_client_address_trust_boundary(peer, headers, expected):
    request = Request({"type":"http", "client":(peer,1) if peer else None,
                       "headers":[(k.encode(),v.encode()) for k,v in headers]})
    assert client_ip(request, (ip_network("127.0.0.1/32"),ip_network("10.0.0.0/24"))) == expected


def test_trusted_proxy_http_budgets_and_untrusted_spoofing(client, clock, monkeypatch):
    configure(monkeypatch, AUTH_LOGIN_IP_LIMIT=1, AUTH_TRUSTED_PROXY_CIDRS="127.0.0.1/32")
    reject_login(monkeypatch)
    with connection("127.0.0.1") as proxy:
        assert login(proxy, headers={"X-Forwarded-For":"198.51.100.1"}).status_code == 401
        assert login(proxy, headers={"X-Forwarded-For":"198.51.100.2"}).status_code == 401
        assert login(proxy, headers={"X-Forwarded-For":"192.0.2.88, 198.51.100.1"}).status_code == 429
    with connection("203.0.113.9") as untrusted:
        assert login(untrusted, headers={"X-Forwarded-For":"192.0.2.1"}).status_code == 401
        assert login(untrusted, headers={"X-Forwarded-For":"192.0.2.2"}).status_code == 429


def test_expired_cleanup_is_bounded_and_skips_active_rows(client, clock, clean_database):
    with Session(clean_database) as db:
        db.add_all([AuthRateLimit(key=str(i).zfill(64),attempts=1,expires_at=clock[0]-timedelta(seconds=1)) for i in range(5)])
        db.add(AuthRateLimit(key="a"*64,attempts=1,expires_at=clock[0]+timedelta(seconds=60)))
        db.commit()
        assert limits.prune_expired(db, clock[0], 2) == 2; db.commit()
        assert db.scalar(select(func.count()).select_from(AuthRateLimit)) == 4
        assert limits.prune_expired(db, clock[0], 100) == 3; db.commit()
        assert db.scalar(select(func.count()).select_from(AuthRateLimit)) == 1


def test_cleanup_skips_locked_rows_and_cli_reports_backlog(client, clock, clean_database, monkeypatch):
    import sys
    from scripts import prune_rate_limits as cleanup
    monkeypatch.setattr(cleanup, "get_database_url", lambda: clean_database.url)
    monkeypatch.setattr(cleanup, "database_now", lambda _db: clock[0])
    with Session(clean_database) as db:
        db.add_all([AuthRateLimit(key=str(i).zfill(64),attempts=1,expires_at=clock[0]-timedelta(seconds=1)) for i in range(2)])
        db.add(AuthRateLimit(key="a"*64,attempts=1,expires_at=clock[0]+timedelta(seconds=60)))
        db.commit()
        with Session(clean_database) as locked:
            locked.execute(select(AuthRateLimit).where(AuthRateLimit.key == "0"*64).with_for_update())
            assert limits.prune_expired(db, clock[0], 100) == 1
            db.commit()
            assert db.get(AuthRateLimit, "0"*64) is not None
    monkeypatch.setattr(sys, "argv", ["prune", "--database", "devpilot_test", "--batch-size", "1", "--max-batches", "1"])
    cleanup.main()
    with Session(clean_database) as db:
        assert db.scalar(select(func.count()).select_from(AuthRateLimit)) == 1


def test_cleanup_cli_bounded_backlog_exit(client, clock, clean_database, monkeypatch):
    import sys
    from scripts import prune_rate_limits as cleanup
    monkeypatch.setattr(cleanup, "get_database_url", lambda: clean_database.url)
    monkeypatch.setattr(cleanup, "database_now", lambda _db: clock[0])
    with Session(clean_database) as db:
        db.add_all([AuthRateLimit(key=str(i).zfill(64),attempts=1,expires_at=clock[0]-timedelta(seconds=1)) for i in range(2)])
        db.commit()
    monkeypatch.setattr(sys, "argv", ["prune", "--database", "devpilot_test", "--batch-size", "1", "--max-batches", "1"])
    with pytest.raises(SystemExit) as result: cleanup.main()
    assert result.value.code == 1
    cleanup.main()


def test_unavailable_counter_storage_fails_closed(client, clock, monkeypatch):
    calls = reject_login(monkeypatch)
    def unavailable(*_args): raise SQLAlchemyError("private storage diagnostics")
    monkeypatch.setattr(limits, "consume", unavailable)
    response = login(client)
    assert response.status_code == 503 and not calls
    assert response.headers["retry-after"] == "60"
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert response.json()["error"]["code"] == "auth_unavailable"
    assert "private" not in response.text and "set-cookie" not in response.headers


def test_rate_migration_preserves_all_existing_tables(client, clean_database):
    body = {"email":"migration-rate@example.com","display_name":"Migration","password":token_urlsafe(24)}
    client.post("/api/auth/register",json=body)
    client.post("/api/auth/login",json={"email":body["email"],"password":body["password"]})
    project = client.post("/api/projects",json={"name":"Preserved"}).json()
    issue = client.post(f"/api/projects/{project['id']}/issues",json={"title":"Preserved"}).json()
    client.post(f"/api/projects/{project['id']}/issues/{issue['id']}/comments",json={"body":"Preserved"})
    label = client.post(f"/api/projects/{project['id']}/labels",json={"name":"Preserved"}).json()
    client.put(f"/api/projects/{project['id']}/issues/{issue['id']}/labels/{label['id']}")
    tables = ["users","sessions","projects","issues","comments","labels","issue_labels"]
    def snapshot():
        with clean_database.connect() as db:
            return {name:db.execute(text(f'SELECT * FROM {name}')).fetchall() for name in tables}
    before = snapshot()
    cfg = Config(str(Path(__file__).resolve().parents[1]/"alembic.ini"))
    command.downgrade(cfg,"0006_comments_labels")
    try:
        assert "auth_rate_limits" not in inspect(clean_database).get_table_names()
        assert snapshot() == before
    finally: command.upgrade(cfg,"head")
    command.check(cfg)
    assert snapshot() == before
