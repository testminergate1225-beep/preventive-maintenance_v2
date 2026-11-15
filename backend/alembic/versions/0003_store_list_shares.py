"""Store list sharing: admins see all store lists; users only those shared with them

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-15
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "store_list_shares",
        sa.Column("store_list_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["store_list_id"], ["store_lists.id"], name=op.f("fk_store_list_shares_store_list_id"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_store_list_shares_user_id"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], name=op.f("fk_store_list_shares_created_by_id"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("store_list_id", "user_id", name=op.f("pk_store_list_shares")),
        mysql_engine="InnoDB", mysql_charset="utf8mb4", mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_index(op.f("ix_store_list_shares_user_id"), "store_list_shares", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_table("store_list_shares")
