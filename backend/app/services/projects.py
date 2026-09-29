"""Project persistence always scopes reads to the authenticated owner."""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Project
from app.schemas.projects import CreateProject, UpdateProject


class ProjectNotFound(Exception):
    pass


class ProjectArchived(Exception):
    pass


def create_project(db: Session, owner_id: UUID, data: CreateProject) -> Project:
    project = Project(owner_id=owner_id, name=data.name, description=data.description)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def list_projects(db: Session, owner_id: UUID, limit: int, offset: int,
                  archived: bool = False) -> tuple[list[Project], bool]:
    archive_filter = Project.archived_at.is_not(None) if archived else Project.archived_at.is_(None)
    rows = list(db.scalars(select(Project).where(Project.owner_id == owner_id, archive_filter)
                          .order_by(Project.created_at.desc(), Project.id.desc())
                          .offset(offset).limit(limit + 1)))
    return rows[:limit], len(rows) > limit


def get_project(db: Session, owner_id: UUID, project_id: UUID, *, lock: bool = False) -> Project:
    query = select(Project).where(Project.id == project_id, Project.owner_id == owner_id)
    # Serialize edits and archive transitions so an edit cannot bypass a concurrent archive.
    project = db.scalar(query.with_for_update() if lock else query)
    if project is None:
        raise ProjectNotFound
    return project


def update_project(db: Session, owner_id: UUID, project_id: UUID, data: UpdateProject) -> Project:
    project = get_project(db, owner_id, project_id, lock=True)
    if project.archived_at is not None:
        raise ProjectArchived
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return project


def set_archived(db: Session, owner_id: UUID, project_id: UUID, *, archived: bool) -> Project:
    project = get_project(db, owner_id, project_id, lock=True)
    if archived != (project.archived_at is not None):
        project.archived_at = datetime.now(timezone.utc) if archived else None
    # Repeated actions leave both archived_at and updated_at unchanged.
    db.commit()
    db.refresh(project)
    return project
