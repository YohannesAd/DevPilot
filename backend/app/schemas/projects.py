"""Bounded project input and explicit public response fields."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator


class CreateProject(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None = None

    @field_validator("description")
    @classmethod
    def blank_description(cls, value: str | None) -> str | None:
        return value or None


class PublicProject(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime


class ProjectPage(BaseModel):
    items: list[PublicProject]
    has_more: bool
