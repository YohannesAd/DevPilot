"""Registration input limits and an explicit public user allowlist."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, StringConstraints


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    email: Annotated[EmailStr, Field(max_length=254)]
    display_name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
    ]
    password: Annotated[SecretStr, Field(min_length=12, max_length=128)]


class PublicUser(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    display_name: str
    created_at: datetime
    updated_at: datetime


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    email: Annotated[EmailStr, Field(max_length=254)]
    # Login accepts any nonempty bounded password; registration defines new-password policy.
    password: Annotated[SecretStr, Field(min_length=1, max_length=128)]


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail
