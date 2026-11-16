"""Generic CRUD for record tables: pagination, search, date range, soft delete, archive and audit."""

from collections.abc import Callable, Sequence
from datetime import date
from typing import Any, Literal

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import Conflict, NotFound
from app.core.security import utcnow
from app.models import User
from app.services.audit import audit

View = Literal["active", "archived", "all"]


class RecordResource:
    def __init__(
        self,
        model: type,
        *,
        entity: str,
        label: str,
        search_columns: Sequence[str],
        date_column: str,
        order_by: Sequence[Any],
    ):
        self.model = model
        self.entity = entity
        self.label = label
        self.search_columns = [getattr(model, c) for c in search_columns]
        self.date_column = getattr(model, date_column)
        self.order_by = order_by
        self.archivable = hasattr(model, "archived_at")

    def query(self, *, deleted: bool = False) -> Select:
        col = self.model.deleted_at
        return select(self.model).where(col.is_not(None) if deleted else col.is_(None))

    def filtered(
        self,
        *,
        q: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        deleted: bool = False,
        where: Sequence[Any] = (),
        view: View = "active",
    ) -> Select:
        stmt = self.query(deleted=deleted)
        if self.archivable and not deleted:  # the deleted bin shows everything deleted, archived or not
            if view == "active":
                stmt = stmt.where(self.model.archived_at.is_(None))
            elif view == "archived":
                stmt = stmt.where(self.model.archived_at.is_not(None))
        if q:
            like = f"%{q.strip()}%"
            stmt = stmt.where(or_(*[c.ilike(like) for c in self.search_columns]))
        if date_from:
            stmt = stmt.where(self.date_column >= date_from)
        if date_to:
            stmt = stmt.where(self.date_column <= date_to)
        for w in where:
            stmt = stmt.where(w)
        return stmt

    def paginate(self, db: Session, stmt: Select, *, page: int, page_size: int, order: Sequence[Any] | None = None):
        total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
        rows = db.scalars(
            stmt.order_by(*(order or self.order_by)).offset((page - 1) * page_size).limit(page_size)
        ).unique().all()
        return rows, total

    def get(self, db: Session, record_id: int, *, allow_deleted: bool = False):
        row = db.get(self.model, record_id)
        if not row or (row.deleted_at is not None and not allow_deleted):
            raise NotFound(f"{self.label} not found.")
        return row

    def create(self, db: Session, user: User, data: dict[str, Any], ip: str | None):
        row = self.model(**data, created_by_id=user.id, updated_by_id=user.id)
        db.add(row)
        db.flush()
        audit(db, f"{self.entity}.created", user=user, entity_type=self.entity, entity_id=row.id, ip=ip)
        db.commit()
        db.refresh(row)
        return row

    def ensure_editable(self, row) -> None:
        if self.archivable and row.archived_at is not None:
            raise Conflict(f"This {self.label.lower()} is archived and read-only. Unarchive it to make changes.",
                           code="archived")

    # ── Archive ──

    def archive(self, db: Session, admin: User, *, ids: list[int] | None, before: date | None,
                reason: str | None, dry_run: bool, ip: str | None) -> int:
        """Archive active records by id, or every active record dated before `before`.

        Records without a date fall back to the day they were created.
        """
        M = self.model
        stmt = select(M).where(M.deleted_at.is_(None), M.archived_at.is_(None))
        if ids is not None:
            stmt = stmt.where(M.id.in_(ids))
        else:
            stmt = stmt.where(func.coalesce(self.date_column, func.date(M.created_at)) < before)
        rows = db.scalars(stmt).unique().all()
        if dry_run or not rows:
            return len(rows)
        now = utcnow()
        for r in rows:
            r.archived_at, r.archived_by_id, r.archive_reason = now, admin.id, reason
        details: dict[str, Any] = {"count": len(rows), "ids": [r.id for r in rows][:500], "reason": reason}
        if before:
            details["before"] = before.isoformat()
        audit(db, f"{self.entity}.archived", user=admin, entity_type=self.entity, details=details, ip=ip)
        db.commit()
        return len(rows)

    def unarchive(self, db: Session, admin: User, ids: list[int], ip: str | None) -> int:
        M = self.model
        rows = db.scalars(select(M).where(M.id.in_(ids), M.deleted_at.is_(None), M.archived_at.is_not(None))).unique().all()
        for r in rows:
            r.archived_at, r.archived_by_id, r.archive_reason = None, None, None
            r.updated_by_id = admin.id
        if rows:
            audit(db, f"{self.entity}.unarchived", user=admin, entity_type=self.entity,
                  details={"count": len(rows), "ids": [r.id for r in rows]}, ip=ip)
            db.commit()
        return len(rows)

    def update(self, db: Session, user: User, record_id: int, data: dict[str, Any], ip: str | None):
        row = self.get(db, record_id)
        self.ensure_editable(row)
        changed = [k for k, v in data.items() if getattr(row, k) != v]
        for k, v in data.items():
            setattr(row, k, v)
        row.updated_by_id = user.id
        audit(db, f"{self.entity}.updated", user=user, entity_type=self.entity, entity_id=row.id,
              details={"fields": changed[:50]}, ip=ip)
        db.commit()
        db.refresh(row)
        return row

    def soft_delete(self, db: Session, user: User, record_id: int, ip: str | None, on_delete: Callable | None = None):
        row = self.get(db, record_id)
        row.deleted_at = utcnow()
        row.updated_by_id = user.id
        if on_delete:
            on_delete(row)
        audit(db, f"{self.entity}.deleted", user=user, entity_type=self.entity, entity_id=row.id, ip=ip)
        db.commit()

    def restore(self, db: Session, user: User, record_id: int, ip: str | None):
        row = self.get(db, record_id, allow_deleted=True)
        row.deleted_at = None
        row.updated_by_id = user.id
        audit(db, f"{self.entity}.restored", user=user, entity_type=self.entity, entity_id=row.id, ip=ip)
        db.commit()
        db.refresh(row)
        return row
