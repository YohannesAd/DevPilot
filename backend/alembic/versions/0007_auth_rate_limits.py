"""Shared expiring authentication attempt counters; no account data changes."""
from alembic import op
import sqlalchemy as sa

revision = "0007_auth_rate_limits"
down_revision = "0006_comments_labels"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("auth_rate_limits",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("attempts BETWEEN 1 AND 1000001", name="ck_auth_rate_limits_attempts"))
    op.create_index("ix_auth_rate_limits_expires", "auth_rate_limits", ["expires_at"])


def downgrade():
    op.drop_index("ix_auth_rate_limits_expires", table_name="auth_rate_limits")
    op.drop_table("auth_rate_limits")
