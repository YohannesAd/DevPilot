"""Engine and request-scoped sessions. Schema changes belong to Alembic."""

from collections.abc import Generator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

from app.config import get_database_url


@lru_cache
def get_engine() -> Engine:
    # Lazy creation lets the health-only API run before database setup.
    return create_engine(
        get_database_url(),
        pool_pre_ping=True,
        hide_parameters=True,
        connect_args={"options": "-c timezone=UTC"},
    )


def get_db() -> Generator[Session, None, None]:
    # Callers explicitly commit; close rolls back any uncommitted transaction.
    with Session(get_engine()) as session:
        yield session
