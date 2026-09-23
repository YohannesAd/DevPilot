"""Registration, login and logout HTTP endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_session
from app.models import UserSession
from app.schemas.auth import ErrorResponse, LoginRequest, PublicUser, RegisterRequest
from app.security import SESSION_COOKIE, clear_session_cookie, set_session_cookie
from app.services.auth import EmailAlreadyRegistered, login_user, logout_session, register_user

router = APIRouter(prefix="/api/auth", tags=["auth"], responses={403: {"model": ErrorResponse}})


@router.post(
    "/register", status_code=201, response_model=PublicUser,
    responses={409: {"model": ErrorResponse, "description": "Email already registered"},
               422: {"model": ErrorResponse, "description": "Invalid registration input"}},
)
def register(
    registration: RegisterRequest, db: Annotated[Session, Depends(get_db)]
) -> PublicUser | JSONResponse:
    try:
        user = register_user(db, registration)
    except EmailAlreadyRegistered:
        return JSONResponse(status_code=409, content={"error": {
            "code": "email_already_registered",
            "message": "An account with this email already exists.",
        }})
    return PublicUser.model_validate(user)


@router.post("/login", response_model=PublicUser, responses={
    401: {"model": ErrorResponse}, 422: {"model": ErrorResponse},
})
def login(credentials: LoginRequest, request: Request, response: Response,
          db: Annotated[Session, Depends(get_db)]) -> PublicUser:
    user, token, expires_at = login_user(db, credentials, request.cookies.get(SESSION_COOKIE))
    set_session_cookie(response, token, expires_at)
    return PublicUser.model_validate(user)


@router.post("/logout", status_code=204, responses={401: {"model": ErrorResponse}})
def logout(session: Annotated[UserSession, Depends(require_session)],
           db: Annotated[Session, Depends(get_db)]) -> Response:
    logout_session(db, session)
    response = Response(status_code=204)
    clear_session_cookie(response)
    return response
