"""Public fields for the user identified by the session cookie."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.dependencies import require_session
from app.models import UserSession
from app.schemas.auth import ErrorResponse, PublicUser

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/me", response_model=PublicUser, responses={401: {"model": ErrorResponse}})
def current_user(session: Annotated[UserSession, Depends(require_session)]) -> PublicUser:
    return PublicUser.model_validate(session.user)
