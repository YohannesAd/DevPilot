"""Project-scoped issue HTTP endpoints using the existing session boundary."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_session
from app.models import UserSession
from app.schemas.auth import ErrorResponse
from app.schemas.issues import CreateIssue, IssuePage, PublicIssue, UpdateIssue
from app.services import issues

router = APIRouter(prefix="/api/projects/{project_id}/issues", tags=["issues"], responses={
    401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse},
    409: {"model": ErrorResponse}, 422: {"model": ErrorResponse},
})
Database = Annotated[Session, Depends(get_db)]
Authenticated = Annotated[UserSession, Depends(require_session)]


@router.post("", status_code=201, response_model=PublicIssue)
def create(project_id: UUID, data: CreateIssue, session: Authenticated, db: Database) -> PublicIssue:
    return PublicIssue.model_validate(issues.create_issue(db, session.user_id, project_id, data))


@router.get("", response_model=IssuePage)
def listing(project_id: UUID, session: Authenticated, db: Database,
            limit: Annotated[int, Query(ge=1, le=100)] = 20,
            offset: Annotated[int, Query(ge=0)] = 0) -> IssuePage:
    rows, has_more = issues.list_issues(db, session.user_id, project_id, limit, offset)
    return IssuePage(items=[PublicIssue.model_validate(row) for row in rows], has_more=has_more)


@router.get("/{issue_id}", response_model=PublicIssue)
def detail(project_id: UUID, issue_id: UUID, session: Authenticated, db: Database) -> PublicIssue:
    return PublicIssue.model_validate(issues.get_issue(db, session.user_id, project_id, issue_id))


@router.patch("/{issue_id}", response_model=PublicIssue)
def update(project_id: UUID, issue_id: UUID, data: UpdateIssue, session: Authenticated, db: Database) -> PublicIssue:
    return PublicIssue.model_validate(issues.update_issue(db, session.user_id, project_id, issue_id, data))
