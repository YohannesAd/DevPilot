"""Account credentials and persistent session lifecycle."""

from datetime import datetime, timedelta, timezone
from functools import lru_cache
import hashlib
import re
import secrets

from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import User, UserSession
from app.schemas.auth import LoginRequest, RegisterRequest

password_hasher = PasswordHasher(type=Type.ID)
SESSION_TTL_SECONDS = 7 * 24 * 60 * 60


class InvalidCredentials(Exception):
    """Unknown email and failed password verification share this error."""


class AuthenticationRequired(Exception):
    """No valid, unexpired and unrevoked session was presented."""


@lru_cache(maxsize=1)
def _dummy_hash() -> str:
    return password_hasher.hash(secrets.token_urlsafe(32))


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def resolve_session(db: Session, token: str | None) -> UserSession:
    if not token or not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
        raise AuthenticationRequired()
    session = db.scalar(select(UserSession).where(
        UserSession.token_hash == token_digest(token),
        UserSession.revoked_at.is_(None),
        UserSession.expires_at > func.now(),
    ))
    if session is None:
        raise AuthenticationRequired()
    return session


def login_user(
    db: Session, credentials: LoginRequest, previous_token: str | None = None
) -> tuple[User, str, datetime]:
    user = db.scalar(select(User).where(func.lower(User.email) == func.lower(str(credentials.email))))
    stored_hash = user.password_hash if user else _dummy_hash()
    try:
        password_hasher.verify(stored_hash, credentials.password.get_secret_value())
    except (VerificationError, InvalidHashError):
        raise InvalidCredentials() from None
    if user is None:
        raise InvalidCredentials()
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=SESSION_TTL_SECONDS)
    # A successful re-login replaces/revokes the presented cookie, not other devices.
    if previous_token and re.fullmatch(r"[A-Za-z0-9_-]{43}", previous_token):
        db.execute(update(UserSession).where(
            UserSession.token_hash == token_digest(previous_token),
            UserSession.revoked_at.is_(None),
        ).values(revoked_at=func.now()))
    db.add(UserSession(user_id=user.id, token_hash=token_digest(token), expires_at=expires_at))
    db.commit()
    return user, token, expires_at


def logout_session(db: Session, session: UserSession) -> None:
    session.revoked_at = datetime.now(timezone.utc)
    db.commit()


class EmailAlreadyRegistered(Exception):
    """The database rejected a case-insensitive duplicate email."""


def register_user(db: Session, registration: RegisterRequest) -> User:
    user = User(
        email=str(registration.email),
        display_name=registration.display_name,
        password_hash=password_hasher.hash(registration.password.get_secret_value()),
    )
    db.add(user)
    try:
        # The unique index is authoritative, including concurrent registrations.
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if (
            getattr(exc.orig, "sqlstate", None) == "23505"
            and getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
            == "uq_users_email_lower"
        ):
            raise EmailAlreadyRegistered() from None
        raise
    db.refresh(user)
    return user
