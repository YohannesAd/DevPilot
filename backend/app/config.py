"""Local environment configuration; no credentials belong in source code."""

import os
from pathlib import Path

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
