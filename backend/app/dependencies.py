"""Resolve cookie authentication at the HTTP boundary using the session service."""

from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import UserSession
from app.security import SESSION_COOKIE
from app.services.auth import resolve_session


def require_session(request: Request, db: Annotated[Session, Depends(get_db)]) -> UserSession:
    return resolve_session(db, request.cookies.get(SESSION_COOKIE))
