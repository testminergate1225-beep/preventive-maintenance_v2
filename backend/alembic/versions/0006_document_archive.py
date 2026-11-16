"""Archive for load balancing records, megger tests and PM checklists

Same columns as the PM records archive (0005): archived_at / archived_by_id / archive_reason.
Existing records are all left active.

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-16
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | Sequence[str] | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = ("load_balancing_records", "megger_tests", "pm_checklists")


def upgrade() -> None:
    for t in TABLES:
        op.add_column(t, sa.Column("archived_at", sa.DateTime(), nullable=True))
        op.add_column(t, sa.Column("archive_reason", sa.String(length=255), nullable=True))
        op.add_column(t, sa.Column("archived_by_id", sa.Integer(), nullable=True))
        op.create_index(op.f(f"ix_{t}_archived_at"), t, ["archived_at"], unique=False)
        op.create_foreign_key(op.f(f"fk_{t}_archived_by_id"), t, "users", ["archived_by_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    for t in TABLES:
        op.drop_constraint(op.f(f"fk_{t}_archived_by_id"), t, type_="foreignkey")
        op.drop_index(op.f(f"ix_{t}_archived_at"), table_name=t)
        op.drop_column(t, "archived_by_id")
        op.drop_column(t, "archive_reason")
        op.drop_column(t, "archived_at")
