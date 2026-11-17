"""Bill of Materials for PM checklists: boms, bom_items, bom_images, bom_links

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-17
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | Sequence[str] | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

MYSQL = {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}


def _dec(p: int, s: int):
    return sa.Numeric(precision=p, scale=s, asdecimal=False)


def upgrade() -> None:
    op.create_table(
        "boms",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("checklist_id", sa.Integer(), nullable=False),
        sa.Column("bom_number", sa.String(100), nullable=False),
        sa.Column("status", sa.String(20), server_default="draft", nullable=False),
        sa.Column("revision", sa.Integer(), server_default="0", nullable=False),
        sa.Column("store_email", sa.String(255)),
        sa.Column("cc_emails", sa.String(1000)),
        sa.Column("notes", sa.Text()),
        sa.Column("prepared_by", sa.String(255)),
        sa.Column("checked_by", sa.String(255)),
        sa.Column("approved_by", sa.String(255)),
        sa.Column("finalized_at", sa.DateTime()),
        sa.Column("finalized_by_id", sa.Integer()),
        sa.Column("emailed_at", sa.DateTime()),
        sa.Column("emailed_to", sa.String(1300)),
        sa.Column("email_error", sa.String(500)),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime()),
        sa.Column("created_by_id", sa.Integer()),
        sa.Column("updated_by_id", sa.Integer()),
        sa.ForeignKeyConstraint(["checklist_id"], ["pm_checklists.id"], name=op.f("fk_boms_checklist_id"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["finalized_by_id"], ["users.id"], name=op.f("fk_boms_finalized_by_id"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], name=op.f("fk_boms_created_by_id"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["updated_by_id"], ["users.id"], name=op.f("fk_boms_updated_by_id"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_boms")),
        **MYSQL,
    )
    op.create_index(op.f("ix_boms_checklist_id"), "boms", ["checklist_id"])
    op.create_index(op.f("ix_boms_deleted_at"), "boms", ["deleted_at"])

    op.create_table(
        "bom_images",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("stored_name", sa.String(255), nullable=False),
        sa.Column("original_name", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("uploaded_by_id", sa.Integer()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["uploaded_by_id"], ["users.id"], name=op.f("fk_bom_images_uploaded_by_id"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_bom_images")),
        sa.UniqueConstraint("stored_name", name=op.f("uq_bom_images_stored_name")),
        **MYSQL,
    )

    op.create_table(
        "bom_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bom_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("part_number", sa.String(100)),
        sa.Column("quantity", _dec(12, 2), nullable=False),
        sa.Column("unit", sa.String(50)),
        sa.Column("unit_cost", _dec(14, 2)),
        sa.Column("finding", sa.String(500)),
        sa.Column("image_id", sa.Integer()),
        sa.ForeignKeyConstraint(["bom_id"], ["boms.id"], name=op.f("fk_bom_items_bom_id"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["image_id"], ["bom_images.id"], name=op.f("fk_bom_items_image_id"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_bom_items")),
        **MYSQL,
    )
    op.create_index(op.f("ix_bom_items_bom_id"), "bom_items", ["bom_id"])

    op.create_table(
        "bom_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bom_id", sa.Integer(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("pdf_name", sa.String(255), nullable=False),
        sa.Column("sent_to", sa.String(1300)),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime()),
        sa.Column("created_by_id", sa.Integer()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("download_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_downloaded_at", sa.DateTime()),
        sa.ForeignKeyConstraint(["bom_id"], ["boms.id"], name=op.f("fk_bom_links_bom_id"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], name=op.f("fk_bom_links_created_by_id"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_bom_links")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_bom_links_token_hash")),
        **MYSQL,
    )
    op.create_index(op.f("ix_bom_links_bom_id"), "bom_links", ["bom_id"])
    op.create_index(op.f("ix_bom_links_expires_at"), "bom_links", ["expires_at"])


def downgrade() -> None:
    op.drop_table("bom_links")
    op.drop_table("bom_items")
    op.drop_table("bom_images")
    op.drop_table("boms")
