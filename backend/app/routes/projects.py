"""Authenticated project HTTP endpoints; owner identity comes only from the session."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_session
from app.models import UserSession
from app.schemas.auth import ErrorResponse
from app.schemas.projects import CreateProject, ProjectPage, PublicProject
from app.services import projects

router = APIRouter(prefix="/api/projects", tags=["projects"], responses={
    401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 422: {"model": ErrorResponse},
})
Database = Annotated[Session, Depends(get_db)]
Authenticated = Annotated[UserSession, Depends(require_session)]


@router.post("", status_code=201, response_model=PublicProject)
def create(data: CreateProject, session: Authenticated, db: Database) -> PublicProject:
    return PublicProject.model_validate(projects.create_project(db, session.user_id, data))


@router.get("", response_model=ProjectPage)
def listing(session: Authenticated, db: Database,
            limit: Annotated[int, Query(ge=1, le=100)] = 20,
            offset: Annotated[int, Query(ge=0)] = 0) -> ProjectPage:
    rows, has_more = projects.list_projects(db, session.user_id, limit, offset)
    return ProjectPage(items=[PublicProject.model_validate(row) for row in rows], has_more=has_more)


@router.get("/{project_id}", response_model=PublicProject, responses={404: {"model": ErrorResponse}})
def detail(project_id: UUID, session: Authenticated, db: Database) -> PublicProject:
    return PublicProject.model_validate(projects.get_project(db, session.user_id, project_id))
