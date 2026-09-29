"""Preserve projects while adding reversible archival state."""

from alembic import op
import sqlalchemy as sa

revision = "0004_project_archival"
down_revision = "0003_create_projects"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    # Project rows remain; archive timestamps are lost and all projects become active.
    op.drop_column("projects", "archived_at")
