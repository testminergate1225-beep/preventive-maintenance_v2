"""ORM models — the single source of truth for users and maintenance data."""

import uuid as uuid_lib
from datetime import date, datetime, time
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    func,
)
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from app.db import Base, TimestampMixin

ROLE_ADMIN = "admin"
ROLE_USER = "user"
ROLES = (ROLE_ADMIN, ROLE_USER)

TOKEN_PURPOSE_RESET = "reset"
TOKEN_PURPOSE_INVITE = "invite"


def Dec(precision: int, scale: int) -> Numeric:  # noqa: N802 — reads like a type
    """DECIMAL column surfaced to Python as float (JSON friendly)."""
    return Numeric(precision, scale, asdecimal=False)


# ───────────────────────────── Users & auth ─────────────────────────────


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    uuid: Mapped[str] = mapped_column(String(36), unique=True, default=lambda: str(uuid_lib.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    full_name: Mapped[str | None] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default=ROLE_USER, server_default=ROLE_USER)
    # NULL means "no password set yet" — the user must use an invite / reset link.
    password_hash: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    failed_login_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    locked_until: Mapped[datetime | None] = mapped_column(DateTime)
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)

    @property
    def is_admin(self) -> bool:
        return self.role == ROLE_ADMIN

    @property
    def has_password(self) -> bool:
        return bool(self.password_hash)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    # All tokens produced by rotating one login share a family; reuse of a
    # rotated token revokes the whole family (stolen-token detection).
    family_id: Mapped[str] = mapped_column(String(36), index=True)
    remember: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)
    rotated_at: Mapped[datetime | None] = mapped_column(DateTime)
    user_agent: Mapped[str | None] = mapped_column(String(255))
    ip_address: Mapped[str | None] = mapped_column(String(45))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    user: Mapped[User] = relationship()


class AuthToken(Base):
    """One-time tokens for password reset and account invites (hash stored, never the raw token)."""

    __tablename__ = "auth_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    purpose: Mapped[str] = mapped_column(String(20))
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used_at: Mapped[datetime | None] = mapped_column(DateTime)
    requested_ip: Mapped[str | None] = mapped_column(String(45))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    user: Mapped[User] = relationship()


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = (Index("ix_audit_log_entity", "entity_type", "entity_id"),)

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    action: Mapped[str] = mapped_column(String(64))
    entity_type: Mapped[str | None] = mapped_column(String(64))
    entity_id: Mapped[str | None] = mapped_column(String(64))
    details: Mapped[dict[str, Any] | None] = mapped_column(JSON(none_as_null=True))
    ip_address: Mapped[str | None] = mapped_column(String(45))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)

    user: Mapped[User | None] = relationship()


# ───────────────────────────── Records ─────────────────────────────


class RecordMixin(TimestampMixin):
    """Ownership + soft-delete columns shared by every maintenance record table."""

    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)

    @declared_attr
    def created_by_id(cls) -> Mapped[int | None]:
        return mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    @declared_attr
    def updated_by_id(cls) -> Mapped[int | None]:
        return mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    @declared_attr
    def created_by(cls) -> Mapped[User | None]:
        return relationship(foreign_keys=[cls.created_by_id], lazy="joined")  # type: ignore[list-item]

    @property
    def created_by_name(self) -> str | None:
        u = self.created_by
        return (u.full_name or u.email) if u else None


class ArchiveMixin:
    """Archive: closed-out records leave the working list (and due tracking) but stay in
    history and remain viewable read-only. Admins can unarchive at any time."""

    archived_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    archive_reason: Mapped[str | None] = mapped_column(String(255))

    @declared_attr
    def archived_by_id(cls) -> Mapped[int | None]:
        return mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    @declared_attr
    def archived_by(cls) -> Mapped[User | None]:
        return relationship(foreign_keys=[cls.archived_by_id], lazy="joined")  # type: ignore[list-item]

    @property
    def archived_by_name(self) -> str | None:
        u = self.archived_by
        return (u.full_name or u.email) if u else None


class MaintenanceRecord(ArchiveMixin, RecordMixin, Base):
    __tablename__ = "maintenance_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    branch_code: Mapped[str | None] = mapped_column(String(100), index=True)
    branch_name: Mapped[str | None] = mapped_column(String(255))
    location: Mapped[str | None] = mapped_column(String(255))
    equipment: Mapped[str | None] = mapped_column(String(255))
    task: Mapped[str] = mapped_column(Text)
    status: Mapped[str | None] = mapped_column(String(50), index=True)
    performed_by: Mapped[str | None] = mapped_column(String(255))
    verified_by: Mapped[str | None] = mapped_column(String(255))
    performed_on: Mapped[date | None] = mapped_column(Date, index=True)
    next_due: Mapped[date | None] = mapped_column(Date, index=True)
    notes: Mapped[str | None] = mapped_column(Text)


class MaintenanceUpload(Base):
    __tablename__ = "maintenance_uploads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    record_id: Mapped[int | None] = mapped_column(
        ForeignKey("maintenance_records.id", ondelete="SET NULL"), index=True
    )
    original_name: Mapped[str] = mapped_column(String(255))
    stored_name: Mapped[str] = mapped_column(String(255), unique=True)
    content_type: Mapped[str | None] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    deleted_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    record: Mapped[MaintenanceRecord | None] = relationship(lazy="joined")
    uploaded_by: Mapped[User | None] = relationship(foreign_keys=[uploaded_by_id], lazy="joined")
    deleted_by: Mapped[User | None] = relationship(foreign_keys=[deleted_by_id], lazy="joined")

    @property
    def uploaded_by_name(self) -> str | None:
        return (self.uploaded_by.full_name or self.uploaded_by.email) if self.uploaded_by else None

    @property
    def deleted_by_name(self) -> str | None:
        return (self.deleted_by.full_name or self.deleted_by.email) if self.deleted_by else None

    @property
    def url(self) -> str:
        return f"/api/v1/uploads/{self.id}/file"


class LoadBalancingRecord(ArchiveMixin, RecordMixin, Base):
    __tablename__ = "load_balancing_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    file_name: Mapped[str | None] = mapped_column(String(255))
    ref_id: Mapped[str | None] = mapped_column(String(100))
    branch_code: Mapped[str | None] = mapped_column(String(100), index=True)
    company: Mapped[str | None] = mapped_column(String(255))
    location: Mapped[str | None] = mapped_column(String(255))
    panel: Mapped[str | None] = mapped_column(String(255))
    mcb: Mapped[int | None] = mapped_column(Integer)
    main_voltage: Mapped[float | None] = mapped_column(Dec(10, 2))
    wires: Mapped[str | None] = mapped_column(String(255))
    circuit_type: Mapped[str | None] = mapped_column(String(30))
    test_date: Mapped[date | None] = mapped_column(Date, index=True)
    test_time: Mapped[time | None] = mapped_column(Time)
    conducted_by: Mapped[str | None] = mapped_column(String(255))
    witness_by: Mapped[str | None] = mapped_column(String(255))
    certified_by: Mapped[str | None] = mapped_column(String(255))
    witness_tenant: Mapped[str | None] = mapped_column(String(255))
    remarks: Mapped[str | None] = mapped_column(Text)
    # System voltages
    v_ll: Mapped[float | None] = mapped_column(Dec(10, 2))
    v_ln: Mapped[float | None] = mapped_column(Dec(10, 2))
    v_ph: Mapped[float | None] = mapped_column(Dec(10, 2))
    v_l1l2: Mapped[float | None] = mapped_column(Dec(10, 2))
    v_l1l3: Mapped[float | None] = mapped_column(Dec(10, 2))
    v_l2l3: Mapped[float | None] = mapped_column(Dec(10, 2))
    v_l1n: Mapped[float | None] = mapped_column(Dec(10, 2))
    v_l2n: Mapped[float | None] = mapped_column(Dec(10, 2))
    v_l3n: Mapped[float | None] = mapped_column(Dec(10, 2))
    # Circuit loads: [{name, value, phase}]
    loads: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON(none_as_null=True))
    phase_a: Mapped[float | None] = mapped_column(Dec(12, 2))
    phase_b: Mapped[float | None] = mapped_column(Dec(12, 2))
    phase_c: Mapped[float | None] = mapped_column(Dec(12, 2))
    total_load: Mapped[float | None] = mapped_column(Dec(12, 2))
    kva_total: Mapped[float | None] = mapped_column(Dec(12, 3))
    # Full load test
    nameplate_kw: Mapped[float | None] = mapped_column(Dec(12, 2))
    meas_van: Mapped[float | None] = mapped_column(Dec(10, 2))
    meas_vbn: Mapped[float | None] = mapped_column(Dec(10, 2))
    meas_vcn: Mapped[float | None] = mapped_column(Dec(10, 2))
    meas_ia: Mapped[float | None] = mapped_column(Dec(10, 2))
    meas_ib: Mapped[float | None] = mapped_column(Dec(10, 2))
    meas_ic: Mapped[float | None] = mapped_column(Dec(10, 2))
    pf_a: Mapped[float | None] = mapped_column(Dec(5, 3))
    pf_b: Mapped[float | None] = mapped_column(Dec(5, 3))
    pf_c: Mapped[float | None] = mapped_column(Dec(5, 3))
    saved_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)


class MeggerTest(ArchiveMixin, RecordMixin, Base):
    __tablename__ = "megger_tests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    file_name: Mapped[str | None] = mapped_column(String(255))
    company: Mapped[str | None] = mapped_column(String(255))
    location: Mapped[str | None] = mapped_column(String(255))
    subject: Mapped[str | None] = mapped_column(String(255))
    test_date: Mapped[date | None] = mapped_column(Date, index=True)
    ir_test_type: Mapped[str | None] = mapped_column(String(100))
    test_voltage: Mapped[str | None] = mapped_column(String(50))
    reference_no: Mapped[str | None] = mapped_column(String(100))
    circuit_type: Mapped[str | None] = mapped_column(String(30))
    conducted_by: Mapped[str | None] = mapped_column(String(255))
    witnessed_by: Mapped[str | None] = mapped_column(String(255))
    verified_by: Mapped[str | None] = mapped_column(String(255))
    # Readings in MΩ: [{panel, branch, "L1-L2", ..., "N-G", wire, remarks}]
    rows: Mapped[list[dict[str, Any]] | None] = mapped_column("readings", JSON(none_as_null=True))
    saved_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)

    @property
    def row_count(self) -> int:
        return len(self.rows or [])

    @property
    def failed_count(self) -> int:
        return sum(1 for r in (self.rows or []) if str(r.get("remarks") or "").strip().lower() == "failed")


class PmChecklist(ArchiveMixin, RecordMixin, Base):
    __tablename__ = "pm_checklists"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    branch_name: Mapped[str | None] = mapped_column(String(255))
    branch_code: Mapped[str | None] = mapped_column(String(100), index=True)
    location: Mapped[str | None] = mapped_column(String(255))
    checklist_date: Mapped[date | None] = mapped_column(Date, index=True)
    conducted_by: Mapped[str | None] = mapped_column(String(255))
    ref_number: Mapped[str | None] = mapped_column(String(100))
    sig_conducted: Mapped[str | None] = mapped_column(String(255))
    sig_witnessed: Mapped[str | None] = mapped_column(String(255))
    sig_store_manager: Mapped[str | None] = mapped_column(String(255))
    sig_store_rep: Mapped[str | None] = mapped_column(String(255))
    overall_recommendations: Mapped[str | None] = mapped_column(Text)
    # [{category, subtitle, items: [{desc, status: ok|not_ok|na|'', remarks, recommendations}]}]
    categories: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON(none_as_null=True))
    saved_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)

    def _count(self, status: str) -> int:
        return sum(
            1 for c in (self.categories or []) for i in (c.get("items") or []) if (i or {}).get("status") == status
        )

    @property
    def ok_count(self) -> int:
        return self._count("ok")

    @property
    def not_ok_count(self) -> int:
        return self._count("not_ok")

    @property
    def na_count(self) -> int:
        return self._count("na")

    # The checklist's active (not deleted) Bill of Materials, if any.
    bom: Mapped["Bom | None"] = relationship(
        primaryjoin="and_(Bom.checklist_id == PmChecklist.id, Bom.deleted_at.is_(None))",
        viewonly=True, uselist=False, lazy="selectin",
    )

    @property
    def bom_id(self) -> int | None:
        return self.bom.id if self.bom else None

    @property
    def bom_status(self) -> str | None:
        return self.bom.status if self.bom else None


BOM_DRAFT = "draft"
BOM_FINAL = "final"


class Bom(RecordMixin, Base):
    """Bill of Materials raised from a PM checklist's NOT OK findings (one active BOM per checklist).

    Draft → Finalize (freezes revision N as a PDF and e-mails the store a 30-day link).
    Editing a finalized BOM reopens it as a draft; finalizing again issues revision N+1.
    """

    __tablename__ = "boms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    checklist_id: Mapped[int] = mapped_column(ForeignKey("pm_checklists.id", ondelete="CASCADE"), index=True)
    bom_number: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(20), default=BOM_DRAFT, server_default=BOM_DRAFT)
    revision: Mapped[int] = mapped_column(Integer, default=0, server_default="0")  # last finalized revision
    store_email: Mapped[str | None] = mapped_column(String(255))
    cc_emails: Mapped[str | None] = mapped_column(String(1000))
    notes: Mapped[str | None] = mapped_column(Text)
    prepared_by: Mapped[str | None] = mapped_column(String(255))
    checked_by: Mapped[str | None] = mapped_column(String(255))
    approved_by: Mapped[str | None] = mapped_column(String(255))
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime)
    finalized_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    emailed_at: Mapped[datetime | None] = mapped_column(DateTime)
    emailed_to: Mapped[str | None] = mapped_column(String(1300))
    email_error: Mapped[str | None] = mapped_column(String(500))

    checklist: Mapped["PmChecklist"] = relationship(lazy="joined")
    items: Mapped[list["BomItem"]] = relationship(
        back_populates="bom", cascade="all, delete-orphan", order_by="BomItem.position", lazy="selectin"
    )
    finalized_by: Mapped[User | None] = relationship(foreign_keys=[finalized_by_id], lazy="joined")
    links: Mapped[list["BomLink"]] = relationship(viewonly=True, order_by="BomLink.id.desc()", lazy="selectin")

    @property
    def finalized_by_name(self) -> str | None:
        u = self.finalized_by
        return (u.full_name or u.email) if u else None

    @property
    def item_count(self) -> int:
        return len(self.items)


class BomImage(Base):
    """Photo of a material item, stored under UPLOAD_DIR/bom/images."""

    __tablename__ = "bom_images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    stored_name: Mapped[str] = mapped_column(String(255), unique=True)
    original_name: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class BomItem(Base):
    __tablename__ = "bom_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bom_id: Mapped[int] = mapped_column(ForeignKey("boms.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    part_number: Mapped[str | None] = mapped_column(String(100))
    quantity: Mapped[float] = mapped_column(Dec(12, 2))
    unit: Mapped[str | None] = mapped_column(String(50))
    unit_cost: Mapped[float | None] = mapped_column(Dec(14, 2))
    # Which checklist finding it fixes, e.g. "Panel Board › Breakers".
    finding: Mapped[str | None] = mapped_column(String(500))
    image_id: Mapped[int | None] = mapped_column(ForeignKey("bom_images.id", ondelete="SET NULL"))

    bom: Mapped[Bom] = relationship(back_populates="items")
    image: Mapped[BomImage | None] = relationship(lazy="joined")

    @property
    def amount(self) -> float | None:
        return round(self.quantity * self.unit_cost, 2) if self.unit_cost is not None else None


class BomLink(Base):
    """Secure, expiring download link for one finalized revision's PDF (only the token hash is stored)."""

    __tablename__ = "bom_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bom_id: Mapped[int] = mapped_column(ForeignKey("boms.id", ondelete="CASCADE"), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    pdf_name: Mapped[str] = mapped_column(String(255))
    sent_to: Mapped[str | None] = mapped_column(String(1300))
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    download_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_downloaded_at: Mapped[datetime | None] = mapped_column(DateTime)

    bom: Mapped[Bom] = relationship(lazy="joined")


class StoreList(RecordMixin, Base):
    __tablename__ = "store_lists"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    file_name: Mapped[str | None] = mapped_column(String(255))
    # {areas: [{id, name, locked, entries: [...]}]}
    snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSON(none_as_null=True))
    total_main: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    total_sat: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    total_redemption: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    total_areas: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    saved_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)

    shares: Mapped[list["StoreListShare"]] = relationship(
        back_populates="store_list", cascade="all, delete-orphan", lazy="selectin", order_by="StoreListShare.created_at"
    )

    @property
    def shared_with(self) -> list[User]:
        return [s.user for s in self.shares if s.user is not None]


class StoreListShare(Base):
    """Grants a (non-admin) user access to view and edit one store list. Admins always see every list."""

    __tablename__ = "store_list_shares"

    store_list_id: Mapped[int] = mapped_column(ForeignKey("store_lists.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    store_list: Mapped[StoreList] = relationship(back_populates="shares")
    user: Mapped[User] = relationship(foreign_keys=[user_id], lazy="joined")
