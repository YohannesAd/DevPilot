"""Owner-scoped database aggregates and fixed-size recent-work queries."""
from sqlalchemy import select, func
from app.models import Project, Issue
from app.schemas.dashboard import DashboardSummary, RecentIssue
from app.schemas.projects import PublicProject


def summary(db, owner_id):
    active = (Project.owner_id == owner_id, Project.archived_at.is_(None))
    projects = db.scalar(select(func.count()).select_from(Project).where(*active))
    counts = dict.fromkeys(["backlog", "todo", "in_progress", "review", "done"], 0)
    counts.update(dict(db.execute(select(Issue.status, func.count(Issue.id))
        .join(Project, Project.id == Issue.project_id).where(*active).group_by(Issue.status)).all()))
    recent_projects = db.scalars(select(Project).where(*active)
        .order_by(Project.updated_at.desc(), Project.id.desc()).limit(4)).all()
    recent_issues = db.execute(select(Issue.id, Issue.project_id, Project.name.label("project_name"),
        Issue.title, Issue.status, Issue.type, Issue.priority, Issue.updated_at)
        .join(Project, Project.id == Issue.project_id).where(*active)
        .order_by(Issue.updated_at.desc(), Issue.id.desc()).limit(6)).mappings().all()
    return DashboardSummary(active_projects=projects, total_issues=sum(counts.values()), status_counts=counts,
        recent_projects=[PublicProject.model_validate(row) for row in recent_projects],
        recent_issues=[RecentIssue.model_validate(row) for row in recent_issues])
