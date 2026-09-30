"""Add project-owned issues without changing existing projects or accounts."""

from alembic import op
import sqlalchemy as sa

revision = "0005_create_issues"
down_revision = "0004_project_archival"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "issues",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("type", sa.String(16), server_default="task", nullable=False),
        sa.Column("status", sa.String(20), server_default="todo", nullable=False),
        sa.Column("priority", sa.String(16), server_default="medium", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_issues"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], name="fk_issues_project_id_projects"),
        sa.CheckConstraint("length(title) BETWEEN 1 AND 200 AND title ~ '[^[:space:]]'", name="ck_issues_title"),
        sa.CheckConstraint("description IS NULL OR length(description) <= 10000", name="ck_issues_description"),
        sa.CheckConstraint("type IN ('task', 'bug', 'feature')", name="ck_issues_type"),
        sa.CheckConstraint("status IN ('backlog', 'todo', 'in_progress', 'review', 'done')", name="ck_issues_status"),
        sa.CheckConstraint("priority IN ('low', 'medium', 'high', 'urgent')", name="ck_issues_priority"),
    )
    op.create_index("ix_issues_project_created_id", "issues", ["project_id", "created_at", "id"])


def downgrade() -> None:
    # Removes issue data only. Existing projects, archive states, users and sessions remain.
    op.drop_index("ix_issues_project_created_id", table_name="issues")
    op.drop_table("issues")
