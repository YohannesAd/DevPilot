"""Registration endpoint; no login or cookie behavior."""

from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.auth import ErrorResponse, PublicUser, RegisterRequest
from app.services.auth import EmailAlreadyRegistered, register_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


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
