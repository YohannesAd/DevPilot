"""Add owner-scoped projects; preserve users and sessions on downgrade."""

from alembic import op
import sqlalchemy as sa

revision = "0003_create_projects"
down_revision = "0002_create_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.String(2000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_projects"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], name="fk_projects_owner_id_users"),
        sa.CheckConstraint("length(trim(name)) > 0", name="ck_projects_name_not_blank"),
    )
    op.create_index("ix_projects_owner_created_id", "projects", ["owner_id", "created_at", "id"])


def downgrade() -> None:
    op.drop_index("ix_projects_owner_created_id", table_name="projects")
    op.drop_table("projects")
