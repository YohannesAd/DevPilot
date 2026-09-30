"""Add comments, project labels and project-safe issue label assignments."""
from alembic import op
import sqlalchemy as sa

revision = "0006_comments_labels"
down_revision = "0005_create_issues"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint("uq_issues_id_project", "issues", ["id", "project_id"])
    op.create_table("labels",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(30), nullable=False),
        sa.Column("color", sa.String(16), nullable=False, server_default="blue"),
        sa.PrimaryKeyConstraint("id", name="pk_labels"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], name="fk_labels_project"),
        sa.UniqueConstraint("id", "project_id", name="uq_labels_id_project"),
        sa.CheckConstraint("length(name) BETWEEN 1 AND 30 AND name ~ '[^[:space:]]' AND name = btrim(name)", name="ck_labels_name"),
        sa.CheckConstraint("color IN ('blue', 'green', 'amber', 'purple', 'rose', 'slate')", name="ck_labels_color"))
    op.create_index("uq_labels_project_name_lower", "labels", ["project_id", sa.text("lower(name)")], unique=True)
    op.create_table("issue_labels",
        sa.Column("issue_id", sa.Uuid(), nullable=False),
        sa.Column("label_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.PrimaryKeyConstraint("issue_id", "label_id", name="pk_issue_labels"),
        sa.ForeignKeyConstraint(["issue_id", "project_id"], ["issues.id", "issues.project_id"], name="fk_issue_labels_issue_project"),
        sa.ForeignKeyConstraint(["label_id", "project_id"], ["labels.id", "labels.project_id"], name="fk_issue_labels_label_project", ondelete="CASCADE"))
    op.create_index("ix_issue_labels_label", "issue_labels", ["label_id"])
    op.create_table("comments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("issue_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id", name="pk_comments"),
        sa.ForeignKeyConstraint(["issue_id"], ["issues.id"], name="fk_comments_issue"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], name="fk_comments_author"),
        sa.CheckConstraint("length(body) BETWEEN 1 AND 5000 AND body ~ '[^[:space:]]'", name="ck_comments_body"))
    op.create_index("ix_comments_issue_created_id", "comments", ["issue_id", "created_at", "id"])


def downgrade() -> None:
    op.drop_table("comments")
    op.drop_table("issue_labels")
    op.drop_table("labels")
    op.drop_constraint("uq_issues_id_project", "issues", type_="unique")
