"""Project persistence always scopes reads to the authenticated owner."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Project
from app.schemas.projects import CreateProject


class ProjectNotFound(Exception):
    pass


def create_project(db: Session, owner_id: UUID, data: CreateProject) -> Project:
    project = Project(owner_id=owner_id, name=data.name, description=data.description)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def list_projects(db: Session, owner_id: UUID, limit: int, offset: int) -> tuple[list[Project], bool]:
    rows = list(db.scalars(select(Project).where(Project.owner_id == owner_id)
                          .order_by(Project.created_at.desc(), Project.id.desc())
                          .offset(offset).limit(limit + 1)))
    return rows[:limit], len(rows) > limit


def get_project(db: Session, owner_id: UUID, project_id: UUID) -> Project:
    project = db.scalar(select(Project).where(Project.id == project_id, Project.owner_id == owner_id))
    if project is None:
        raise ProjectNotFound
    return project
