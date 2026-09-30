"""Bounded active-work summaries, not historical activity metrics."""
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel
from app.schemas.issues import IssueStatus, IssueType, IssuePriority
from app.schemas.projects import PublicProject


class RecentIssue(BaseModel):
    id: UUID
    project_id: UUID
    project_name: str
    title: str
    status: IssueStatus
    type: IssueType
    priority: IssuePriority
    updated_at: datetime


class DashboardSummary(BaseModel):
    active_projects: int
    total_issues: int
    status_counts: dict[IssueStatus, int]
    recent_projects: list[PublicProject]
    recent_issues: list[RecentIssue]
