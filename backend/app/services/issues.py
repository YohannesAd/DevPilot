"""Authorize through the owning project; serialize issue writes with archival."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Issue, Label
from app.schemas.issues import CreateIssue, UpdateIssue
from app.services.projects import ProjectArchived, get_project


class IssueNotFound(Exception):
    pass


def create_issue(db: Session, owner_id: UUID, project_id: UUID, data: CreateIssue) -> Issue:
    project = get_project(db, owner_id, project_id, lock=True)
    if project.archived_at is not None:
        raise ProjectArchived
    issue = Issue(project_id=project.id, **data.model_dump())
    db.add(issue)
    db.commit()
    db.refresh(issue)
    return issue


def list_issues(db: Session, owner_id: UUID, project_id: UUID, limit: int, offset: int,
                *, status: str | None = None, priority: str | None = None,
                type: str | None = None, label_id: UUID | None = None,
                q: str | None = None) -> tuple[list[Issue], bool]:
    get_project(db, owner_id, project_id)
    query = select(Issue).where(Issue.project_id == project_id)
    for column, value in [(Issue.status, status), (Issue.priority, priority), (Issue.type, type)]:
        if value is not None:
            query = query.where(column == value)
    if label_id is not None:
        query = query.where(Issue.labels.any(Label.id == label_id))
    if q and q.strip():
        # Literal substring, with bound parameters and escaped LIKE metacharacters.
        query = query.where(Issue.title.icontains(q.strip(), autoescape=True))
    rows = list(db.scalars(query
                          .order_by(Issue.created_at.desc(), Issue.id.desc())
                          .offset(offset).limit(limit + 1)))
    return rows[:limit], len(rows) > limit


def _find_issue(db: Session, project_id: UUID, issue_id: UUID) -> Issue:
    issue = db.scalar(select(Issue).where(Issue.id == issue_id, Issue.project_id == project_id))
    if issue is None:
        raise IssueNotFound
    return issue


def get_issue(db: Session, owner_id: UUID, project_id: UUID, issue_id: UUID) -> Issue:
    get_project(db, owner_id, project_id)
    return _find_issue(db, project_id, issue_id)


def update_issue(db: Session, owner_id: UUID, project_id: UUID, issue_id: UUID, data: UpdateIssue) -> Issue:
    # Project mutations take this same row lock, so archive cannot bypass this check.
    project = get_project(db, owner_id, project_id, lock=True)
    issue = _find_issue(db, project_id, issue_id)
    if project.archived_at is not None:
        raise ProjectArchived
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(issue, field, value)
    db.commit()
    db.refresh(issue)
    return issue
