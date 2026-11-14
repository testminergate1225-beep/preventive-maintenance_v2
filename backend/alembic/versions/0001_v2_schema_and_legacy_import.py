"""v2 schema and legacy import

Creates the v2 schema. If tables from the PHP/Firebase version exist, they are
renamed to ``legacy_<name>`` (kept intact as a backup) and their rows are copied
into the new tables with type clean-up:

* users              identifier → email (lower-cased, de-duplicated); Firebase /
                     libsodium hashes are dropped → users set a password via invite/reset
* maintenance        camelCase columns → snake_case, ``date`` → ``performed_on``
* load balancing     camelCase → snake_case, JSON ``loads`` parsed
* megger tests       header fields lifted out of the ``data`` JSON blob into columns
* pm checklist       ``date`` VARCHAR → real DATE (table renamed to ``pm_checklists``)
* store lists        ``store_list_records`` → ``store_lists``
* uploads            ``deleted`` flag → ``deleted_at``; orphaned record links nulled;
                     spoofable ``uploader`` / ``deleted_by`` text dropped

Primary keys are preserved so upload ↔ record links survive.

Revision ID: 0001
Revises:
Create Date: 2026-11-14 19:14:17.669736
"""
import json
import os
import uuid as uuid_lib
from collections.abc import Sequence
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Any

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

MYSQL_OPTS = {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}

# legacy table name → name it is preserved under
LEGACY_TABLES = {
    "users": "legacy_users",
    "maintenance_records": "legacy_maintenance_records",
    "load_balancing_records": "legacy_load_balancing_records",
    "megger_tests": "legacy_megger_tests",
    "pm_checklist": "legacy_pm_checklist",
    "store_list_records": "legacy_store_list_records",
    "maintenance_uploads": "legacy_maintenance_uploads",
}


def upgrade() -> None:
    bind = op.get_bind()
    existing = set(sa.inspect(bind).get_table_names())
    if "users" in existing and "uuid" in {c["name"] for c in sa.inspect(bind).get_columns("users")}:
        raise RuntimeError("The v2 schema already exists; refusing to run the legacy import twice.")
    renamed = []
    for old, new in LEGACY_TABLES.items():
        if old in existing:
            if new in existing:
                raise RuntimeError(f"Both {old} and {new} exist — resolve manually before migrating.")
            op.rename_table(old, new)
            renamed.append(new)

    _create_schema()

    if renamed:
        _import_legacy(bind, set(renamed))


def _create_schema() -> None:
    op.create_table('users',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('uuid', sa.String(length=36), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('full_name', sa.String(length=255), nullable=True),
    sa.Column('role', sa.String(length=20), server_default='user', nullable=False),
    sa.Column('password_hash', sa.String(length=255), nullable=True),
    sa.Column('is_active', sa.Boolean(), server_default='1', nullable=False),
    sa.Column('failed_login_count', sa.Integer(), server_default='0', nullable=False),
    sa.Column('locked_until', sa.DateTime(), nullable=True),
    sa.Column('password_changed_at', sa.DateTime(), nullable=True),
    sa.Column('last_login_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_users')),
    sa.UniqueConstraint('email', name=op.f('uq_users_email')),
    sa.UniqueConstraint('uuid', name=op.f('uq_users_uuid')),
    **MYSQL_OPTS
    )
    op.create_table('audit_log',
    sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('action', sa.String(length=64), nullable=False),
    sa.Column('entity_type', sa.String(length=64), nullable=True),
    sa.Column('entity_id', sa.String(length=64), nullable=True),
    sa.Column('details', sa.JSON(none_as_null=True), nullable=True),
    sa.Column('ip_address', sa.String(length=45), nullable=True),
    sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_audit_log_user_id'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_audit_log')),
    **MYSQL_OPTS
    )
    op.create_index(op.f('ix_audit_log_created_at'), 'audit_log', ['created_at'], unique=False)
    op.create_index('ix_audit_log_entity', 'audit_log', ['entity_type', 'entity_id'], unique=False)
    op.create_index(op.f('ix_audit_log_user_id'), 'audit_log', ['user_id'], unique=False)
    op.create_table('auth_tokens',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('purpose', sa.String(length=20), nullable=False),
    sa.Column('expires_at', sa.DateTime(), nullable=False),
    sa.Column('used_at', sa.DateTime(), nullable=True),
    sa.Column('requested_ip', sa.String(length=45), nullable=True),
    sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_auth_tokens_user_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_auth_tokens')),
    sa.UniqueConstraint('token_hash', name=op.f('uq_auth_tokens_token_hash')),
    **MYSQL_OPTS
    )
    op.create_index(op.f('ix_auth_tokens_user_id'), 'auth_tokens', ['user_id'], unique=False)
    op.create_table('load_balancing_records',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('file_name', sa.String(length=255), nullable=True),
    sa.Column('ref_id', sa.String(length=100), nullable=True),
    sa.Column('branch_code', sa.String(length=100), nullable=True),
    sa.Column('company', sa.String(length=255), nullable=True),
    sa.Column('location', sa.String(length=255), nullable=True),
    sa.Column('panel', sa.String(length=255), nullable=True),
    sa.Column('mcb', sa.Integer(), nullable=True),
    sa.Column('main_voltage', sa.Numeric(precision=10, scale=2, asdecimal=False), nullable=True),
    sa.Column('wires', sa.String(length=255), nullable=True),
    sa.Column('circuit_type', sa.String(length=30), nullable=True),
    sa.Column('test_date', sa.Date(), nullable=True),
    sa.Column('test_time', sa.Time(), nullable=True),
    sa.Column('conducted_by', sa.String(length=255), nullable=True),
    sa.Column('witness_by', sa.String(length=255), nullable=True),
    sa.Column('certified_by', sa.String(length=255), nullable=True),
    sa.Column('witness_tenant', sa.String(length=255), nullable=True),
    sa.Column('remarks', sa.Text(), nullable=True),
    sa.Column('v_ll', sa.Numeric(precision=10, scale=2, asdecimal=False), nullable=True),
    sa.Column('v_ln', sa.Numeric(precision=10, scale=2, asdecimal=False), nullable=True),
    sa.Column('v_ph', sa.Numeric(precision=10, scale=2, asdecimal=False), nullable=True),
    sa.Column('v_l1l2', sa.Numeric(precision=10, scale=2, asdecimal=False), nullable=True),
    sa.Column('v_l1l3', sa.Numeric(precision=10, scale=2, asdecimal=False), nullable=True),
    sa.Column('v_l2l3', sa.Numeric(precision=10, scale=2, asdecimal=False), nullable=True),
    sa.Column('v_l1n', sa.Numeric(precision=10, scale=2, asdecimal=False), nullable=True),
    sa.Column('v_l2n', sa.Numeric(precision=10, scale=2, asdecimal=False), nullable=True),
    sa.Column('v_l3n', sa.Numeric(precision=10, scale=2, asdecimal=False), nullable=True),
    sa.Column('loads', sa.JSON(none_as_null=True), nullable=True),
    sa.Column('phase_a', sa.Numeric(precision=12, scale=2, asdecimal=False), nullable=True),
    sa.Column('phase_b', sa.Numeric(precision=12, scale=2, asdecimal=False), nullable=True),
    sa.Column('phase_c', sa.Numeric(precision=12, scale=2, asdecimal=False), nullable=True),
    sa.Column('total_load', sa.Numeric(precision=12, scale=2, asdecimal=False), nullable=True),
    sa.Column('kva_total', sa.Numeric(precision=12, scale=3, asdecimal=False), nullable=True),
    sa.Column('nameplate_kw', sa.Numeric(precision=12, scale=2, asdecimal=False), nullable=True),
    sa.Column('meas_van', sa.Numeric(precision=10, scale=2, asdecimal=False), nullable=True),
    sa.Column('meas_vbn', sa.Numeric(precision=10, scale=2, asdecimal=False), nullable=True),
    sa.Column('meas_vcn', sa.Numeric(precision=10, scale=2, asdecimal=False), nullable=True),
    sa.Column('meas_ia', sa.Numeric(precision=10, scale=2, asdecimal=False), nullable=True),
    sa.Column('meas_ib', sa.Numeric(precision=10, scale=2, asdecimal=False), nullable=True),
    sa.Column('meas_ic', sa.Numeric(precision=10, scale=2, asdecimal=False), nullable=True),
    sa.Column('pf_a', sa.Numeric(precision=5, scale=3, asdecimal=False), nullable=True),
    sa.Column('pf_b', sa.Numeric(precision=5, scale=3, asdecimal=False), nullable=True),
    sa.Column('pf_c', sa.Numeric(precision=5, scale=3, asdecimal=False), nullable=True),
    sa.Column('saved_at', sa.DateTime(), nullable=True),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.Column('created_by_id', sa.Integer(), nullable=True),
    sa.Column('updated_by_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], name=op.f('fk_load_balancing_records_created_by_id'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['updated_by_id'], ['users.id'], name=op.f('fk_load_balancing_records_updated_by_id'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_load_balancing_records')),
    **MYSQL_OPTS
    )
    op.create_index(op.f('ix_load_balancing_records_branch_code'), 'load_balancing_records', ['branch_code'], unique=False)
    op.create_index(op.f('ix_load_balancing_records_deleted_at'), 'load_balancing_records', ['deleted_at'], unique=False)
    op.create_index(op.f('ix_load_balancing_records_saved_at'), 'load_balancing_records', ['saved_at'], unique=False)
    op.create_index(op.f('ix_load_balancing_records_test_date'), 'load_balancing_records', ['test_date'], unique=False)
    op.create_table('maintenance_records',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('branch_code', sa.String(length=100), nullable=True),
    sa.Column('branch_name', sa.String(length=255), nullable=True),
    sa.Column('location', sa.String(length=255), nullable=True),
    sa.Column('equipment', sa.String(length=255), nullable=True),
    sa.Column('task', sa.Text(), nullable=False),
    sa.Column('status', sa.String(length=50), nullable=True),
    sa.Column('performed_by', sa.String(length=255), nullable=True),
    sa.Column('verified_by', sa.String(length=255), nullable=True),
    sa.Column('performed_on', sa.Date(), nullable=True),
    sa.Column('next_due', sa.Date(), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.Column('created_by_id', sa.Integer(), nullable=True),
    sa.Column('updated_by_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], name=op.f('fk_maintenance_records_created_by_id'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['updated_by_id'], ['users.id'], name=op.f('fk_maintenance_records_updated_by_id'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_maintenance_records')),
    **MYSQL_OPTS
    )
    op.create_index(op.f('ix_maintenance_records_branch_code'), 'maintenance_records', ['branch_code'], unique=False)
    op.create_index(op.f('ix_maintenance_records_deleted_at'), 'maintenance_records', ['deleted_at'], unique=False)
    op.create_index(op.f('ix_maintenance_records_next_due'), 'maintenance_records', ['next_due'], unique=False)
    op.create_index(op.f('ix_maintenance_records_performed_on'), 'maintenance_records', ['performed_on'], unique=False)
    op.create_index(op.f('ix_maintenance_records_status'), 'maintenance_records', ['status'], unique=False)
    op.create_table('megger_tests',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('file_name', sa.String(length=255), nullable=True),
    sa.Column('company', sa.String(length=255), nullable=True),
    sa.Column('location', sa.String(length=255), nullable=True),
    sa.Column('subject', sa.String(length=255), nullable=True),
    sa.Column('test_date', sa.Date(), nullable=True),
    sa.Column('ir_test_type', sa.String(length=100), nullable=True),
    sa.Column('test_voltage', sa.String(length=50), nullable=True),
    sa.Column('reference_no', sa.String(length=100), nullable=True),
    sa.Column('circuit_type', sa.String(length=30), nullable=True),
    sa.Column('conducted_by', sa.String(length=255), nullable=True),
    sa.Column('witnessed_by', sa.String(length=255), nullable=True),
    sa.Column('verified_by', sa.String(length=255), nullable=True),
    sa.Column('readings', sa.JSON(none_as_null=True), nullable=True),
    sa.Column('saved_at', sa.DateTime(), nullable=True),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.Column('created_by_id', sa.Integer(), nullable=True),
    sa.Column('updated_by_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], name=op.f('fk_megger_tests_created_by_id'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['updated_by_id'], ['users.id'], name=op.f('fk_megger_tests_updated_by_id'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_megger_tests')),
    **MYSQL_OPTS
    )
    op.create_index(op.f('ix_megger_tests_deleted_at'), 'megger_tests', ['deleted_at'], unique=False)
    op.create_index(op.f('ix_megger_tests_saved_at'), 'megger_tests', ['saved_at'], unique=False)
    op.create_index(op.f('ix_megger_tests_test_date'), 'megger_tests', ['test_date'], unique=False)
    op.create_table('pm_checklists',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('branch_name', sa.String(length=255), nullable=True),
    sa.Column('branch_code', sa.String(length=100), nullable=True),
    sa.Column('location', sa.String(length=255), nullable=True),
    sa.Column('checklist_date', sa.Date(), nullable=True),
    sa.Column('conducted_by', sa.String(length=255), nullable=True),
    sa.Column('ref_number', sa.String(length=100), nullable=True),
    sa.Column('sig_conducted', sa.String(length=255), nullable=True),
    sa.Column('sig_witnessed', sa.String(length=255), nullable=True),
    sa.Column('sig_store_manager', sa.String(length=255), nullable=True),
    sa.Column('sig_store_rep', sa.String(length=255), nullable=True),
    sa.Column('overall_recommendations', sa.Text(), nullable=True),
    sa.Column('categories', sa.JSON(none_as_null=True), nullable=True),
    sa.Column('saved_at', sa.DateTime(), nullable=True),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.Column('created_by_id', sa.Integer(), nullable=True),
    sa.Column('updated_by_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], name=op.f('fk_pm_checklists_created_by_id'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['updated_by_id'], ['users.id'], name=op.f('fk_pm_checklists_updated_by_id'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_pm_checklists')),
    **MYSQL_OPTS
    )
    op.create_index(op.f('ix_pm_checklists_branch_code'), 'pm_checklists', ['branch_code'], unique=False)
    op.create_index(op.f('ix_pm_checklists_checklist_date'), 'pm_checklists', ['checklist_date'], unique=False)
    op.create_index(op.f('ix_pm_checklists_deleted_at'), 'pm_checklists', ['deleted_at'], unique=False)
    op.create_index(op.f('ix_pm_checklists_saved_at'), 'pm_checklists', ['saved_at'], unique=False)
    op.create_table('refresh_tokens',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('family_id', sa.String(length=36), nullable=False),
    sa.Column('remember', sa.Boolean(), server_default='0', nullable=False),
    sa.Column('expires_at', sa.DateTime(), nullable=False),
    sa.Column('revoked_at', sa.DateTime(), nullable=True),
    sa.Column('rotated_at', sa.DateTime(), nullable=True),
    sa.Column('user_agent', sa.String(length=255), nullable=True),
    sa.Column('ip_address', sa.String(length=45), nullable=True),
    sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_refresh_tokens_user_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_refresh_tokens')),
    sa.UniqueConstraint('token_hash', name=op.f('uq_refresh_tokens_token_hash')),
    **MYSQL_OPTS
    )
    op.create_index(op.f('ix_refresh_tokens_family_id'), 'refresh_tokens', ['family_id'], unique=False)
    op.create_index(op.f('ix_refresh_tokens_user_id'), 'refresh_tokens', ['user_id'], unique=False)
    op.create_table('store_lists',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('file_name', sa.String(length=255), nullable=True),
    sa.Column('snapshot', sa.JSON(none_as_null=True), nullable=True),
    sa.Column('total_main', sa.Integer(), server_default='0', nullable=False),
    sa.Column('total_sat', sa.Integer(), server_default='0', nullable=False),
    sa.Column('total_redemption', sa.Integer(), server_default='0', nullable=False),
    sa.Column('total_areas', sa.Integer(), server_default='0', nullable=False),
    sa.Column('saved_at', sa.DateTime(), nullable=True),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.Column('created_by_id', sa.Integer(), nullable=True),
    sa.Column('updated_by_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], name=op.f('fk_store_lists_created_by_id'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['updated_by_id'], ['users.id'], name=op.f('fk_store_lists_updated_by_id'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_store_lists')),
    **MYSQL_OPTS
    )
    op.create_index(op.f('ix_store_lists_deleted_at'), 'store_lists', ['deleted_at'], unique=False)
    op.create_index(op.f('ix_store_lists_saved_at'), 'store_lists', ['saved_at'], unique=False)
    op.create_table('maintenance_uploads',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('record_id', sa.Integer(), nullable=True),
    sa.Column('original_name', sa.String(length=255), nullable=False),
    sa.Column('stored_name', sa.String(length=255), nullable=False),
    sa.Column('content_type', sa.String(length=100), nullable=True),
    sa.Column('size_bytes', sa.BigInteger(), nullable=False),
    sa.Column('uploaded_by_id', sa.Integer(), nullable=True),
    sa.Column('uploaded_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.Column('deleted_by_id', sa.Integer(), nullable=True),
    sa.ForeignKeyConstraint(['deleted_by_id'], ['users.id'], name=op.f('fk_maintenance_uploads_deleted_by_id'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['record_id'], ['maintenance_records.id'], name=op.f('fk_maintenance_uploads_record_id'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['uploaded_by_id'], ['users.id'], name=op.f('fk_maintenance_uploads_uploaded_by_id'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_maintenance_uploads')),
    sa.UniqueConstraint('stored_name', name=op.f('uq_maintenance_uploads_stored_name')),
    **MYSQL_OPTS
    )
    op.create_index(op.f('ix_maintenance_uploads_deleted_at'), 'maintenance_uploads', ['deleted_at'], unique=False)
    op.create_index(op.f('ix_maintenance_uploads_record_id'), 'maintenance_uploads', ['record_id'], unique=False)
    op.create_index(op.f('ix_maintenance_uploads_uploaded_at'), 'maintenance_uploads', ['uploaded_at'], unique=False)


# ───────────────────────────── legacy data import ─────────────────────────────

CIRCUITS_LB = {"single_ln", "single_llc", "single_ll", "three_wye", "three_delta"}
CIRCUITS_MEGGER = {"3phase-delta", "3phase-wye", "1phase-ll", "1phase-ln"}
MEGGER_KEYS = ["L1-L2", "L1-L3", "L2-L3", "L1-N", "L2-N", "L3-N", "L1-G", "L2-G", "L3-G", "N-G"]


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)


def _s(v: Any, n: int) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s[:n] if s else None


def _f(v: Any) -> float | None:
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _i(v: Any) -> int | None:
    f = _f(v)
    return int(f) if f is not None else None


def _d(v: Any) -> date | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v).strip()
    if not s or s.startswith("0000"):
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d", "%B %d, %Y", "%b %d, %Y"):
        try:
            return datetime.strptime(s[:10] if fmt == "%Y-%m-%d" else s, fmt).date()
        except ValueError:
            pass
    return None


def _dt(v: Any) -> datetime | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v
    s = str(v).strip().replace("T", " ").rstrip("Z")
    if not s or s.startswith("0000"):
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(s[:19] if fmt.endswith("%S") else s[:16] if fmt.endswith("%M") else s[:10], fmt)
        except ValueError:
            pass
    return None


def _t(v: Any) -> time | None:
    if v is None:
        return None
    if isinstance(v, time):
        return v
    if isinstance(v, timedelta):  # PyMySQL returns TIME columns as timedelta
        secs = int(v.total_seconds()) % 86400
        return time(secs // 3600, (secs % 3600) // 60, secs % 60)
    for fmt in ("%H:%M:%S", "%H:%M", "%I:%M %p"):
        try:
            return datetime.strptime(str(v).strip().upper(), fmt).time()
        except ValueError:
            pass
    return None


def _j(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, (bytes, bytearray)):
        v = v.decode("utf-8", "replace")
    if isinstance(v, str):
        try:
            return json.loads(v)
        except ValueError:
            return None
    return v


def _plain(v: Any) -> Any:
    """Make values JSON-safe (Decimal → float) for JSON columns."""
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, dict):
        return {k: _plain(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_plain(x) for x in v]
    return v


def _rows(bind, table: str) -> list[dict[str, Any]]:
    return [dict(r) for r in bind.execute(sa.text(f"SELECT * FROM {table}")).mappings()]


def _insert(bind, table: str, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    t = sa.Table(table, sa.MetaData(), autoload_with=bind)
    for col in t.columns:
        if isinstance(col.type, sa.JSON):
            col.type.none_as_null = True  # store SQL NULL, not the JSON literal 'null'
    for i in range(0, len(rows), 500):
        bind.execute(t.insert(), rows[i : i + 500])
    print(f"  {table}: {len(rows)} row(s) imported")


def _stamps(r: dict[str, Any]) -> dict[str, datetime]:
    created = _dt(r.get("created_at")) or _now()
    return {"created_at": created, "updated_at": _dt(r.get("updated_at")) or created}


def _import_legacy(bind, present: set[str]) -> None:
    print("Importing legacy data...")

    if "legacy_users" in present:
        out, seen_email, seen_uuid = [], set(), set()
        for r in _rows(bind, "legacy_users"):
            email = (r.get("identifier") or "").strip().lower()
            if "@" not in email or email in seen_email:
                print(f"  skipped user id={r.get('id')} (missing or duplicate e-mail {email!r})")
                continue
            uid = _s(r.get("user_uid"), 36)
            if not uid or uid in seen_uuid:
                uid = str(uuid_lib.uuid4())
            seen_email.add(email)
            seen_uuid.add(uid)
            pw = r.get("password_hash") or ""
            role = (r.get("role") or "user").strip().lower()
            created = _dt(r.get("created_at")) or _now()
            out.append({
                "id": r["id"], "uuid": uid, "email": email[:255], "full_name": _s(r.get("full_name"), 255),
                "role": role if role in ("admin", "user") else "user",
                "password_hash": pw if pw.startswith("$argon2") else None,
                "is_active": True, "failed_login_count": 0,
                "last_login_at": _dt(r.get("last_signed_in")), "created_at": created, "updated_at": created,
            })
        _insert(bind, "users", out)

    record_ids: set[int] = set()
    if "legacy_maintenance_records" in present:
        out = []
        for r in _rows(bind, "legacy_maintenance_records"):
            record_ids.add(r["id"])
            out.append({
                "id": r["id"],
                "branch_code": _s(r.get("BranchCode"), 100), "branch_name": _s(r.get("BranchName"), 255),
                "location": _s(r.get("location"), 255), "equipment": _s(r.get("equipment"), 255),
                "task": (r.get("task") or "").strip() or "(no description)", "status": _s(r.get("status"), 50),
                "performed_by": _s(r.get("performedBy"), 255), "verified_by": _s(r.get("verifiedBy"), 255),
                "performed_on": _d(r.get("date")), "next_due": _d(r.get("nextDue")),
                "notes": (r.get("notes") or "").strip() or None, **_stamps(r),
            })
        _insert(bind, "maintenance_records", out)

    if "legacy_load_balancing_records" in present:
        out = []
        for r in _rows(bind, "legacy_load_balancing_records"):
            loads = _j(r.get("loads"))
            circ = r.get("circType")
            out.append({
                "id": r["id"], "file_name": _s(r.get("fileName"), 255), "ref_id": _s(r.get("refId"), 100),
                "branch_code": _s(r.get("branch"), 100), "company": _s(r.get("company"), 255),
                "location": _s(r.get("location"), 255), "panel": _s(r.get("panel"), 255),
                "mcb": _i(r.get("mcb")), "main_voltage": _f(r.get("mainV")), "wires": _s(r.get("wires"), 255),
                "circuit_type": circ if circ in CIRCUITS_LB else None,
                "test_date": _d(r.get("date")), "test_time": _t(r.get("time")),
                "conducted_by": _s(r.get("conductedBy"), 255), "witness_by": _s(r.get("witnessBy"), 255),
                "certified_by": _s(r.get("certifiedBy"), 255), "witness_tenant": _s(r.get("witnessTenant"), 255),
                "remarks": (r.get("remarks") or "").strip() or None,
                "v_ll": _f(r.get("vll")), "v_ln": _f(r.get("vln")), "v_ph": _f(r.get("vph")),
                "v_l1l2": _f(r.get("vl1l2Ind")), "v_l1l3": _f(r.get("vl1l3Ind")), "v_l2l3": _f(r.get("vl2l3Ind")),
                "v_l1n": _f(r.get("vl1nInd")), "v_l2n": _f(r.get("vl2nInd")), "v_l3n": _f(r.get("vl3nInd")),
                "loads": _plain(loads) if isinstance(loads, list) else None,
                "phase_a": _f(r.get("phaseA")), "phase_b": _f(r.get("phaseB")), "phase_c": _f(r.get("phaseC")),
                "total_load": _f(r.get("totalLoad")), "kva_total": _f(r.get("kvaTotal")),
                "nameplate_kw": _f(r.get("nameplate")),
                "meas_van": _f(r.get("meas_van")), "meas_vbn": _f(r.get("meas_vbn")), "meas_vcn": _f(r.get("meas_vcn")),
                "meas_ia": _f(r.get("meas_ia")), "meas_ib": _f(r.get("meas_ib")), "meas_ic": _f(r.get("meas_ic")),
                "pf_a": _f(r.get("pf_a")), "pf_b": _f(r.get("pf_b")), "pf_c": _f(r.get("pf_c")),
                "saved_at": _dt(r.get("savedAt")), **_stamps(r),
            })
        _insert(bind, "load_balancing_records", out)

    if "legacy_megger_tests" in present:
        out = []
        for r in _rows(bind, "legacy_megger_tests"):
            data = _j(r.get("data")) or {}
            if isinstance(data, dict) and "rows" not in data and isinstance(data.get("data"), dict):
                data = data["data"]  # tolerate an extra level of nesting from older saves
            if not isinstance(data, dict):
                data = {}
            rows = []
            for row in data.get("rows") or []:
                if not isinstance(row, dict):
                    continue
                clean = {"panel": _s(row.get("panel"), 255), "branch": _s(row.get("branch"), 255),
                         "wire": _s(row.get("wire"), 255), "remarks": _s(row.get("remarks"), 255)}
                for k in MEGGER_KEYS:
                    raw = row.get(k)
                    num = _f(raw)
                    clean[k] = num if num is not None else _s(raw, 50)  # keep non-numeric readings like ">2000"
                rows.append(clean)
            circ = data.get("circuitType")
            created = _dt(r.get("created_at")) or _now()
            out.append({
                "id": r["id"], "file_name": _s(r.get("name"), 255),
                "company": _s(data.get("company"), 255), "location": _s(data.get("location"), 255),
                "subject": _s(data.get("subject"), 255), "test_date": _d(data.get("date")),
                "ir_test_type": _s(data.get("time"), 100), "test_voltage": _s(data.get("testVoltage"), 50),
                "reference_no": _s(data.get("referenceNo"), 100),
                "circuit_type": circ if circ in CIRCUITS_MEGGER else None,
                "conducted_by": _s(data.get("conductedBy"), 255), "witnessed_by": _s(data.get("witnessedBy"), 255),
                "verified_by": _s(data.get("verifiedBy"), 255), "readings": rows,
                "saved_at": _dt(r.get("savedAt")) or created, "created_at": created, "updated_at": created,
            })
        _insert(bind, "megger_tests", out)

    if "legacy_pm_checklist" in present:
        out = []
        for r in _rows(bind, "legacy_pm_checklist"):
            cats = _j(r.get("categories"))
            created = _dt(r.get("created_at")) or _now()
            out.append({
                "id": r["id"], "branch_name": _s(r.get("branchName"), 255), "branch_code": _s(r.get("branchCode"), 100),
                "location": _s(r.get("location"), 255), "checklist_date": _d(r.get("date")),
                "conducted_by": _s(r.get("conductedBy"), 255), "ref_number": _s(r.get("refNumber"), 100),
                "sig_conducted": _s(r.get("sigConducted"), 255), "sig_witnessed": _s(r.get("sigWitnessed"), 255),
                "sig_store_manager": _s(r.get("sigStoreManager"), 255), "sig_store_rep": _s(r.get("sigStoreRep"), 255),
                "overall_recommendations": (r.get("overallRecommendations") or "").strip() or None,
                "categories": _plain(cats) if isinstance(cats, list) else None,
                "saved_at": _dt(r.get("savedAt")) or created, "created_at": created, "updated_at": created,
            })
        _insert(bind, "pm_checklists", out)

    if "legacy_store_list_records" in present:
        out = []
        for r in _rows(bind, "legacy_store_list_records"):
            snap = _j(r.get("snapshot"))
            created = _dt(r.get("created_at")) or _now()
            out.append({
                "id": r["id"], "file_name": _s(r.get("fileName"), 255),
                "snapshot": _plain(snap) if isinstance(snap, dict) else None,
                "total_main": _i(r.get("totalMain")) or 0, "total_sat": _i(r.get("totalSat")) or 0,
                "total_redemption": _i(r.get("totalRedemption")) or 0, "total_areas": _i(r.get("totalAreas")) or 0,
                "saved_at": _dt(r.get("savedAt")) or created, "created_at": created, "updated_at": created,
            })
        _insert(bind, "store_lists", out)

    if "legacy_maintenance_uploads" in present:
        out, seen = [], set()
        for r in _rows(bind, "legacy_maintenance_uploads"):
            stored = os.path.basename((r.get("file_path") or "").replace("\\", "/"))
            if not stored or stored in seen:
                print(f"  skipped upload id={r.get('id')} (missing or duplicate file path)")
                continue
            seen.add(stored)
            uploaded = _dt(r.get("uploaded_at")) or _now()
            rid = _i(r.get("record_id"))
            out.append({
                "id": r["id"], "record_id": rid if rid in record_ids else None,
                "original_name": _s(r.get("file_name"), 255) or stored, "stored_name": stored[:255],
                "content_type": _s(r.get("file_type"), 100), "size_bytes": _i(r.get("file_size")) or 0,
                "uploaded_at": uploaded,
                "deleted_at": (_dt(r.get("deleted_at")) or uploaded) if _i(r.get("deleted")) else None,
            })
        _insert(bind, "maintenance_uploads", out)

    print("Legacy import complete. Original tables are preserved as legacy_*.")


def downgrade() -> None:
    _drop_schema()
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    for old, new in LEGACY_TABLES.items():
        if new in existing and old not in existing:
            op.rename_table(new, old)


def _drop_schema() -> None:
    # Dropping a table drops its indexes; order respects foreign keys.
    for table in ("maintenance_uploads", "store_lists", "refresh_tokens", "pm_checklists", "megger_tests",
                  "maintenance_records", "load_balancing_records", "auth_tokens", "audit_log", "users"):
        op.drop_table(table)
