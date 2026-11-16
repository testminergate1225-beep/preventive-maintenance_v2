"""PM records archive: archived_at / archived_by_id / archive_reason on maintenance_records

Archived records leave the working list and due/overdue tracking but stay in history
and remain viewable read-only. Existing records are all left active.

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-16
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | Sequence[str] | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("maintenance_records", sa.Column("archived_at", sa.DateTime(), nullable=True))
    op.add_column("maintenance_records", sa.Column("archived_by_id", sa.Integer(), nullable=True))
    op.add_column("maintenance_records", sa.Column("archive_reason", sa.String(length=255), nullable=True))
    op.create_index(op.f("ix_maintenance_records_archived_at"), "maintenance_records", ["archived_at"], unique=False)
    op.create_foreign_key(op.f("fk_maintenance_records_archived_by_id"), "maintenance_records", "users",
                          ["archived_by_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    op.drop_constraint(op.f("fk_maintenance_records_archived_by_id"), "maintenance_records", type_="foreignkey")
    op.drop_index(op.f("ix_maintenance_records_archived_at"), table_name="maintenance_records")
    op.drop_column("maintenance_records", "archive_reason")
    op.drop_column("maintenance_records", "archived_by_id")
    op.drop_column("maintenance_records", "archived_at")
