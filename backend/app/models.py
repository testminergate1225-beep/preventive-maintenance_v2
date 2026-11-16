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


class MaintenanceRecord(RecordMixin, Base):
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
    # Archive: closed-out records leave the working list and due/overdue tracking but stay
    # in history (charts, performance) and remain viewable read-only.
    archived_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    archived_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    archive_reason: Mapped[str | None] = mapped_column(String(255))

    archived_by: Mapped[User | None] = relationship(foreign_keys=[archived_by_id], lazy="joined")

    @property
    def archived_by_name(self) -> str | None:
        u = self.archived_by
        return (u.full_name or u.email) if u else None


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


class LoadBalancingRecord(RecordMixin, Base):
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


class MeggerTest(RecordMixin, Base):
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


class PmChecklist(RecordMixin, Base):
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
