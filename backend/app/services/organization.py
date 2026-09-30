"""Owner-scoped comments and labels, serialized against project archival."""
from uuid import UUID
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.models import Comment, Label, IssueLabel
from app.services.projects import get_project, ProjectArchived
from app.services.issues import _find_issue
from app.schemas.organization import CommentInput, CreateLabel, UpdateLabel


class OrganizationError(Exception):
    def __init__(self, code: str, message: str, status: int = 404):
        self.code, self.message, self.status = code, message, status


def project_access(db, owner_id, project_id, write=False):
    project = get_project(db, owner_id, project_id, lock=write)
    if write and project.archived_at is not None:
        raise ProjectArchived
    return project


def issue_access(db, owner_id, project_id, issue_id, write=False):
    project_access(db, owner_id, project_id, write)
    return _find_issue(db, project_id, issue_id)


def comments(db: Session, owner_id: UUID, project_id: UUID, issue_id: UUID, limit: int, offset: int):
    issue_access(db, owner_id, project_id, issue_id)
    rows = list(db.scalars(select(Comment).where(Comment.issue_id == issue_id)
        .order_by(Comment.created_at, Comment.id).offset(offset).limit(limit + 1)))
    return rows[:limit], len(rows) > limit


def comment(db, owner_id, project_id, issue_id, comment_id, write=False):
    issue_access(db, owner_id, project_id, issue_id, write)
    row = db.scalar(select(Comment).where(Comment.id == comment_id, Comment.issue_id == issue_id))
    if row is None or (write and row.author_id != owner_id):
        raise OrganizationError("comment_not_found", "Comment not found.")
    return row


def create_comment(db, owner_id, project_id, issue_id, data: CommentInput):
    issue_access(db, owner_id, project_id, issue_id, True)
    row = Comment(issue_id=issue_id, author_id=owner_id, body=data.body)
    db.add(row); db.commit(); db.refresh(row)
    return row


def update_comment(db, owner_id, project_id, issue_id, comment_id, data: CommentInput):
    row = comment(db, owner_id, project_id, issue_id, comment_id, True)
    row.body = data.body
    db.commit(); db.refresh(row)
    return row


def delete_comment(db, owner_id, project_id, issue_id, comment_id):
    row = comment(db, owner_id, project_id, issue_id, comment_id, True)
    db.delete(row); db.commit()


def labels(db, owner_id, project_id, limit, offset):
    project_access(db, owner_id, project_id)
    rows = list(db.scalars(select(Label).where(Label.project_id == project_id)
        .order_by(func.lower(Label.name), Label.id).offset(offset).limit(limit + 1)))
    return rows[:limit], len(rows) > limit


def find_label(db, project_id, label_id):
    row = db.scalar(select(Label).where(Label.id == label_id, Label.project_id == project_id))
    if row is None:
        raise OrganizationError("label_not_found", "Label not found in this project.")
    return row


def save_label(db, row):
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if getattr(getattr(exc.orig, "diag", None), "constraint_name", None) == "uq_labels_project_name_lower":
            raise OrganizationError("label_name_taken", "A label with this name already exists in this project.", 409) from None
        raise
    db.refresh(row)
    return row


def create_label(db, owner_id, project_id, data: CreateLabel):
    project_access(db, owner_id, project_id, True)
    row = Label(project_id=project_id, **data.model_dump())
    db.add(row)
    return save_label(db, row)


def update_label(db, owner_id, project_id, label_id, data: UpdateLabel):
    project_access(db, owner_id, project_id, True)
    row = find_label(db, project_id, label_id)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    return save_label(db, row)


def delete_label(db, owner_id, project_id, label_id):
    project_access(db, owner_id, project_id, True)
    row = find_label(db, project_id, label_id)
    db.delete(row); db.commit()  # The FK cascades assignments only, never issues.


def assign_label(db, owner_id, project_id, issue_id, label_id, assigned):
    issue = issue_access(db, owner_id, project_id, issue_id, True)
    find_label(db, project_id, label_id)
    row = db.get(IssueLabel, (issue_id, label_id))
    if assigned and row is None:
        db.add(IssueLabel(issue_id=issue_id, label_id=label_id, project_id=project_id))
    elif not assigned and row is not None:
        db.delete(row)
    db.commit()
    db.refresh(issue)
    return issue.labels
