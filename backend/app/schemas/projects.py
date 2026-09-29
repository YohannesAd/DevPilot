"""Bounded project input and explicit public response fields."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator, model_validator

ProjectName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
ProjectDescription = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


class CreateProject(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    name: ProjectName
    description: ProjectDescription | None = None

    @field_validator("description")
    @classmethod
    def blank_description(cls, value: str | None) -> str | None:
        return value or None


class UpdateProject(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    name: ProjectName | None = None
    description: ProjectDescription | None = None

    @model_validator(mode="after")
    def validate_patch(self) -> "UpdateProject":
        if not self.model_fields_set:
            raise ValueError("Provide at least one editable field.")
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("Name cannot be null.")
        return self

    @field_validator("description")
    @classmethod
    def blank_description(cls, value: str | None) -> str | None:
        return value or None


class ProjectAction(BaseModel):
    """Actions accept only an empty JSON object, never ownership or field updates."""
    model_config = ConfigDict(extra="forbid", strict=True)


class PublicProject(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class ProjectPage(BaseModel):
    items: list[PublicProject]
    has_more: bool
