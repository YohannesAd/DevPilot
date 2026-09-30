"""Local environment configuration; no credentials belong in source code."""

import os
import re
from ipaddress import ip_network
from dataclasses import dataclass, field
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
    if os.environ.get("APP_ENV") == "production" and url.query.get("sslmode") != "verify-full":
        raise RuntimeError("Production DATABASE_URL requires sslmode=verify-full and a trusted CA.")
    return url.set(drivername="postgresql+psycopg")


@dataclass(frozen=True)
class ProxySettings:
    secret: str = field(repr=False)


@lru_cache
def get_proxy_settings() -> ProxySettings:
    load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)
    secret = os.environ.get("API_PROXY_SECRET", "")
    if (get_auth_settings().secure_cookie or secret) and not re.fullmatch(r"[a-fA-F0-9]{64}", secret):
        raise RuntimeError("API_PROXY_SECRET must be a shared 32-byte random secret encoded as 64 hex characters.")
    return ProxySettings(secret)


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


@dataclass(frozen=True)
class RateLimitSettings:
    login_ip_limit: int
    login_ip_window: int
    login_email_limit: int
    login_email_window: int
    register_ip_limit: int
    register_ip_window: int
    key_secret: bytes = field(repr=False)
    trusted_proxies: tuple


@lru_cache
def get_rate_limit_settings() -> RateLimitSettings:
    load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)
    def number(name, default, maximum):
        try:
            value = int(os.environ.get(name, str(default)))
            if not 1 <= value <= maximum:
                raise ValueError
            return value
        except ValueError:
            raise RuntimeError(f"{name} must be an integer between 1 and {maximum}.") from None

    secret = os.environ.get("AUTH_RATE_KEY_SECRET", "")
    if secret and len(secret.encode()) < 32:
        raise RuntimeError("AUTH_RATE_KEY_SECRET must contain at least 32 bytes.")
    if not secret:
        if get_auth_settings().secure_cookie:
            raise RuntimeError("Production requires a shared AUTH_RATE_KEY_SECRET of at least 32 random bytes.")
        secret = "devpilot-development-rate-key-not-for-production"
    try:
        proxies = tuple(ip_network(item.strip(), strict=True) for item in
                        os.environ.get("AUTH_TRUSTED_PROXY_CIDRS", "").split(",") if item.strip())
        if any(network.prefixlen == 0 for network in proxies):
            raise ValueError
    except ValueError:
        raise RuntimeError("AUTH_TRUSTED_PROXY_CIDRS must contain explicit IPs/CIDRs, never a wildcard or default route.") from None
    return RateLimitSettings(
        number("AUTH_LOGIN_IP_LIMIT", 30, 1000000), number("AUTH_LOGIN_IP_WINDOW_SECONDS", 600, 86400),
        number("AUTH_LOGIN_EMAIL_LIMIT", 10, 1000000), number("AUTH_LOGIN_EMAIL_WINDOW_SECONDS", 900, 86400),
        number("AUTH_REGISTER_IP_LIMIT", 5, 1000000), number("AUTH_REGISTER_IP_WINDOW_SECONDS", 3600, 86400),
        secret.encode(), proxies,
    )
