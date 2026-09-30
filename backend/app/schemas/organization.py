"""Strict comment/label contracts; identity is always derived from the session."""
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, StringConstraints, model_validator

Color = Literal["blue", "green", "amber", "purple", "rose", "slate"]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)]
Body = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]


class CommentInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    body: Body


class CreateLabel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    name: Name
    color: Color = "blue"


class UpdateLabel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    name: Name | None = None
    color: Color | None = None

    @model_validator(mode="after")
    def validate_patch(self):
        if not self.model_fields_set or any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Provide at least one non-null editable field.")
        return self


class PublicLabel(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    project_id: UUID
    name: str
    color: Color


class CommentAuthor(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    display_name: str


class PublicComment(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    issue_id: UUID
    author: CommentAuthor
    body: str
    created_at: datetime
    updated_at: datetime
    edited: bool


class CommentPage(BaseModel):
    items: list[PublicComment]
    has_more: bool


class LabelPage(BaseModel):
    items: list[PublicLabel]
    has_more: bool
