"""Comments and labels remain nested under the authorized project and issue."""
from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import require_session
from app.models import UserSession
from app.schemas.organization import CommentInput, CreateLabel, UpdateLabel, PublicComment, PublicLabel, CommentPage, LabelPage
from app.services import organization as service

router = APIRouter(prefix="/api/projects/{project_id}", tags=["comments and labels"])
Database = Annotated[Session, Depends(get_db)]
Authenticated = Annotated[UserSession, Depends(require_session)]
Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0)]


@router.get("/issues/{issue_id}/comments", response_model=CommentPage)
def comments(project_id: UUID, issue_id: UUID, session: Authenticated, db: Database, limit: Limit = 20, offset: Offset = 0):
    rows, more = service.comments(db, session.user_id, project_id, issue_id, limit, offset)
    return CommentPage(items=[PublicComment.model_validate(row) for row in rows], has_more=more)


@router.post("/issues/{issue_id}/comments", response_model=PublicComment, status_code=201)
def create_comment(project_id: UUID, issue_id: UUID, data: CommentInput, session: Authenticated, db: Database):
    return service.create_comment(db, session.user_id, project_id, issue_id, data)


@router.get("/issues/{issue_id}/comments/{comment_id}", response_model=PublicComment)
def comment(project_id: UUID, issue_id: UUID, comment_id: UUID, session: Authenticated, db: Database):
    return service.comment(db, session.user_id, project_id, issue_id, comment_id)


@router.patch("/issues/{issue_id}/comments/{comment_id}", response_model=PublicComment)
def update_comment(project_id: UUID, issue_id: UUID, comment_id: UUID, data: CommentInput, session: Authenticated, db: Database):
    return service.update_comment(db, session.user_id, project_id, issue_id, comment_id, data)


@router.delete("/issues/{issue_id}/comments/{comment_id}", status_code=204)
def delete_comment(project_id: UUID, issue_id: UUID, comment_id: UUID, session: Authenticated, db: Database):
    service.delete_comment(db, session.user_id, project_id, issue_id, comment_id)
    return Response(status_code=204)


@router.get("/labels", response_model=LabelPage)
def labels(project_id: UUID, session: Authenticated, db: Database, limit: Limit = 20, offset: Offset = 0):
    rows, more = service.labels(db, session.user_id, project_id, limit, offset)
    return LabelPage(items=[PublicLabel.model_validate(row) for row in rows], has_more=more)


@router.post("/labels", response_model=PublicLabel, status_code=201)
def create_label(project_id: UUID, data: CreateLabel, session: Authenticated, db: Database):
    return service.create_label(db, session.user_id, project_id, data)


@router.get("/labels/{label_id}", response_model=PublicLabel)
def label(project_id: UUID, label_id: UUID, session: Authenticated, db: Database):
    service.project_access(db, session.user_id, project_id)
    return service.find_label(db, project_id, label_id)


@router.patch("/labels/{label_id}", response_model=PublicLabel)
def update_label(project_id: UUID, label_id: UUID, data: UpdateLabel, session: Authenticated, db: Database):
    return service.update_label(db, session.user_id, project_id, label_id, data)


@router.delete("/labels/{label_id}", status_code=204)
def delete_label(project_id: UUID, label_id: UUID, session: Authenticated, db: Database):
    service.delete_label(db, session.user_id, project_id, label_id)
    return Response(status_code=204)


@router.put("/issues/{issue_id}/labels/{label_id}", response_model=list[PublicLabel])
def assign_label(project_id: UUID, issue_id: UUID, label_id: UUID, session: Authenticated, db: Database):
    return service.assign_label(db, session.user_id, project_id, issue_id, label_id, True)


@router.delete("/issues/{issue_id}/labels/{label_id}", response_model=list[PublicLabel])
def remove_label(project_id: UUID, issue_id: UUID, label_id: UUID, session: Authenticated, db: Database):
    return service.assign_label(db, session.user_id, project_id, issue_id, label_id, False)
