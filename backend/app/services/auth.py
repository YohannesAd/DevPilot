"""Registration persistence; authentication sessions are not implemented yet."""

from argon2 import PasswordHasher, Type
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import User
from app.schemas.auth import RegisterRequest

password_hasher = PasswordHasher(type=Type.ID)


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
