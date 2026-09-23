"""Tests require an explicitly named, disposable local PostgreSQL database."""

import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app import config, database
from app.main import app


@pytest.fixture(autouse=True)
def isolated_auth_settings(monkeypatch):
    # Never load private backend/.env, including when HTTP middleware initializes.
    monkeypatch.setattr(config, "load_dotenv", lambda *args, **kwargs: None)
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("FRONTEND_ORIGIN", "http://localhost:3000")
    monkeypatch.setenv("API_ORIGIN", "http://localhost:8000")
    config.get_auth_settings.cache_clear()
    app.middleware_stack = None
    yield
    config.get_auth_settings.cache_clear()
    app.middleware_stack = None


@pytest.fixture(scope="session")
def test_engine():
    value = os.environ.get("TEST_DATABASE_URL")
    if not value:
        pytest.fail("Set TEST_DATABASE_URL to a disposable local devpilot_test database.")
    try:
        url = make_url(value)
    except Exception:
        pytest.fail("TEST_DATABASE_URL is invalid.", pytrace=False)
    if (
        url.drivername != "postgresql+psycopg"
        or url.host not in {"127.0.0.1", "localhost", "::1"}
        or url.database != "devpilot_test"
        or url.query  # Do not allow query parameters to override host/database.
    ):
        pytest.fail("Tests require local PostgreSQL database devpilot_test; refusing other targets.")

    def forbid_development_engine():
        raise AssertionError("Tests must never use the development database engine.")

    # Alembic gets the validated test URL directly: no backend/.env read or fallback.
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(config, "get_database_url", lambda: url)
        patch.setattr(database, "get_engine", forbid_development_engine)
        cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
        command.upgrade(cfg, "head")
        engine = create_engine(
            url, hide_parameters=True, connect_args={"options": "-c timezone=UTC"}
        )
        try:
            yield engine
        finally:
            engine.dispose()


@pytest.fixture
def clean_database(test_engine):
    # Only the guarded, disposable devpilot_test database is cleared.
    with test_engine.begin() as connection:
        connection.execute(text("TRUNCATE TABLE sessions, users"))
    yield test_engine
    with test_engine.begin() as connection:
        connection.execute(text("TRUNCATE TABLE sessions, users"))


@pytest.fixture
def client(clean_database):
    def test_db():
        with Session(clean_database) as session:
            yield session

    app.dependency_overrides[database.get_db] = test_db
    try:
        with TestClient(app, base_url="http://localhost:8000",
                        headers={"Origin": "http://localhost:3000"}) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(database.get_db, None)
