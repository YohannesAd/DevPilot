"""Strict issue inputs; ownership and relationship are never writable fields."""

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator, model_validator
from app.schemas.organization import PublicLabel

IssueTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
IssueDescription = Annotated[str, StringConstraints(strip_whitespace=True, max_length=10000)]
IssueType = Literal["task", "bug", "feature"]
IssueStatus = Literal["backlog", "todo", "in_progress", "review", "done"]
IssuePriority = Literal["low", "medium", "high", "urgent"]


class IssueInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    description: IssueDescription | None = None

    @field_validator("description")
    @classmethod
    def blank_description(cls, value: str | None) -> str | None:
        return value or None


class CreateIssue(IssueInput):
    title: IssueTitle
    type: IssueType = "task"
    status: IssueStatus = "todo"
    priority: IssuePriority = "medium"


class UpdateIssue(IssueInput):
    title: IssueTitle | None = None
    type: IssueType | None = None
    status: IssueStatus | None = None
    priority: IssuePriority | None = None

    @model_validator(mode="after")
    def validate_patch(self) -> "UpdateIssue":
        if not self.model_fields_set:
            raise ValueError("Provide at least one editable field.")
        for field in self.model_fields_set - {"description"}:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null.")
        return self


class PublicIssue(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    title: str
    description: str | None
    type: IssueType
    status: IssueStatus
    priority: IssuePriority
    created_at: datetime
    updated_at: datetime
    labels: list[PublicLabel]


class IssuePage(BaseModel):
    items: list[PublicIssue]
    has_more: bool
