"""Database-atomic fixed windows shared by all workers; count before password work."""
from datetime import timedelta
import hashlib
import hmac
import logging
import math
import unicodedata

from sqlalchemy import case, delete, func, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import SQLAlchemyError

from app.client_ip import client_ip
from app.config import get_rate_limit_settings
from app.models import AuthRateLimit

logger = logging.getLogger(__name__)


class RateLimited(Exception):
    def __init__(self, retry_after):
        self.retry_after = retry_after


class RateLimitUnavailable(Exception):
    pass


def database_now(db):
    return db.scalar(select(func.clock_timestamp()))


def bucket_key(secret, scope, identity):
    return hmac.new(secret, f"{scope}\0{identity}".encode(), hashlib.sha256).hexdigest()


def prune_expired(db, now, batch_size=100):
    # Skip busy rows and cap each transaction's work, including under concurrent cleanup.
    keys = select(AuthRateLimit.key).where(AuthRateLimit.expires_at <= now).order_by(
        AuthRateLimit.expires_at, AuthRateLimit.key).limit(batch_size).with_for_update(skip_locked=True)
    return db.execute(delete(AuthRateLimit).where(AuthRateLimit.key.in_(keys))).rowcount


def consume(db, key, limit, window, now):
    table = AuthRateLimit.__table__
    expired = table.c.expires_at <= now
    statement = insert(table).values(key=key, attempts=1, expires_at=now + timedelta(seconds=window))
    statement = statement.on_conflict_do_update(index_elements=[table.c.key], set_={
        "attempts": case((expired, 1), else_=func.least(table.c.attempts + 1, limit + 1)),
        "expires_at": case((expired, statement.excluded.expires_at), else_=table.c.expires_at),
    }).returning(table.c.attempts, table.c.expires_at)
    attempts, expiry = db.execute(statement).one()
    return max(1, math.ceil((expiry - now).total_seconds())) if attempts > limit else 0


def check_attempt(db, request, action, email):
    settings = get_rate_limit_settings()
    ip = client_ip(request, settings.trusted_proxies)
    try:
        # Counters commit before auth services; failed credentials cannot roll them back.
        # Bound lock waits/query execution; unavailable storage fails closed.
        db.execute(text("SET LOCAL lock_timeout = '2s'"))
        db.execute(text("SET LOCAL statement_timeout = '3s'"))
        now = database_now(db)
        prune_expired(db, now)
        limit, window = ((settings.login_ip_limit, settings.login_ip_window) if action == "login"
                         else (settings.register_ip_limit, settings.register_ip_window))
        retry = consume(db, bucket_key(settings.key_secret, f"{action}:ip", ip), limit, window, now)
        # A blocked IP cannot create unlimited arbitrary-email buckets.
        if action == "login":
            normalized = unicodedata.normalize("NFC", str(email)).strip().lower()
            email_key = bucket_key(settings.key_secret, "login:email", normalized)
            if not retry:
                retry = consume(db, email_key, settings.login_email_limit, settings.login_email_window, now)
            else:
                # Do not spend/create email counters for a denied IP, but report the
                # longer existing email wait rather than suggesting an early retry.
                expiry = db.scalar(select(AuthRateLimit.expires_at).where(
                    AuthRateLimit.key == email_key, AuthRateLimit.expires_at > now,
                    AuthRateLimit.attempts >= settings.login_email_limit))
                if expiry:
                    retry = max(retry, math.ceil((expiry - now).total_seconds()))
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.error("Authentication rate-limit storage unavailable")
        raise RateLimitUnavailable from None
    if retry:
        raise RateLimited(retry)
