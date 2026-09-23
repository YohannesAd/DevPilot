"""Local environment configuration; no credentials belong in source code."""

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import load_dotenv
from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import ArgumentError


def get_database_url() -> URL:
    # Resolve relative to this file so API and Alembic use the same .env.
    # An explicitly set environment variable always takes precedence.
    load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)
    value = os.environ.get("DATABASE_URL")
    if not value:
        raise RuntimeError("Set DATABASE_URL in the environment or backend/.env.")
    try:
        url = make_url(value)
    except (ArgumentError, ValueError):
        raise RuntimeError("DATABASE_URL must be a valid PostgreSQL URL.") from None
    if url.drivername not in {"postgresql", "postgresql+psycopg"}:
        raise RuntimeError("DATABASE_URL must use postgresql+psycopg://.")
    if not url.host or not url.database or not url.username:
        raise RuntimeError("DATABASE_URL must specify a host, database, and username.")
    return url.set(drivername="postgresql+psycopg")


@dataclass(frozen=True)
class AuthSettings:
    frontend_origin: str = "http://localhost:3000"
    api_origin: str = "http://localhost:8000"
    secure_cookie: bool = False


@lru_cache
def get_auth_settings() -> AuthSettings:
    load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)
    environment = os.environ.get("APP_ENV", "development")
    if environment not in {"development", "production"}:
        raise RuntimeError("APP_ENV must be development or production.")
    production = environment == "production"
    origins = []
    for name, default in [("FRONTEND_ORIGIN", "http://localhost:3000"),
                          ("API_ORIGIN", "http://localhost:8000")]:
        value = os.environ.get(name, "" if production else default)
        try:
            parsed = urlsplit(value)
            valid = (
                parsed.scheme in ({"https"} if production else {"http", "https"})
                and parsed.hostname and parsed.port != 0
                and not parsed.username and not parsed.password
                and not parsed.path and not parsed.query and not parsed.fragment
                and "*" not in value
            )
        except ValueError:
            valid = False
        if not valid:
            raise RuntimeError(f"{name} must be an exact origin; production requires HTTPS.")
        origins.append(value)
    return AuthSettings(*origins, secure_cookie=production)
