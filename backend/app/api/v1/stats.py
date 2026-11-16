from collections import Counter
from datetime import date, timedelta

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.api.deps import DB, CurrentUser
from app.models import LoadBalancingRecord, MaintenanceRecord, MaintenanceUpload, MeggerTest, PmChecklist, StoreList, StoreListShare
from app.schemas import CamelModel, MaintenanceOut

router = APIRouter(prefix="/stats", tags=["stats"])
M = MaintenanceRecord


class Bucket(CamelModel):
    label: str
    count: int


class DashboardOut(CamelModel):
    counts: dict[str, int]
    overdue: int
    due_soon: int
    completed_this_month: int
    status_breakdown: list[Bucket]
    equipment_top: list[Bucket]
    monthly: list[Bucket]
    recent: list[MaintenanceOut]
    upcoming: list[MaintenanceOut]


class PerformerOut(CamelModel):
    performed_by: str
    count: int


def _count(db, model) -> int:
    """Live records; for archivable types, only the active (non-archived) ones."""
    where = [model.deleted_at.is_(None)]
    if hasattr(model, "archived_at"):
        where.append(model.archived_at.is_(None))
    return db.scalar(select(func.count()).select_from(model).where(*where)) or 0


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(user: CurrentUser, db: DB):
    today = date.today()
    live = M.deleted_at.is_(None)
    # Archived records are closed out: they still count in history (status, equipment,
    # monthly trend, completed this month) but not in the working list or due tracking.
    active = (live, M.archived_at.is_(None))

    counts = {
        "maintenance": db.scalar(select(func.count()).select_from(M).where(*active)) or 0,
        "maintenanceArchived": db.scalar(select(func.count()).select_from(M).where(live, M.archived_at.is_not(None))) or 0,
        "loadBalancing": _count(db, LoadBalancingRecord),
        "meggerTests": _count(db, MeggerTest),
        "checklists": _count(db, PmChecklist),
        "storeLists": _count(db, StoreList) if user.is_admin else (db.scalar(
            select(func.count()).select_from(StoreList)
            .where(StoreList.deleted_at.is_(None), StoreList.shares.any(StoreListShare.user_id == user.id))
        ) or 0),
        "uploads": db.scalar(
            select(func.count()).select_from(MaintenanceUpload).where(MaintenanceUpload.deleted_at.is_(None))
        ) or 0,
    }
    overdue = db.scalar(select(func.count()).select_from(M).where(*active, M.next_due < today)) or 0
    due_soon = db.scalar(
        select(func.count()).select_from(M).where(*active, M.next_due.between(today, today + timedelta(days=7)))
    ) or 0
    month_start = today.replace(day=1)
    completed = db.scalar(
        select(func.count()).select_from(M).where(live, M.performed_on >= month_start, M.performed_on <= today)
    ) or 0

    status_rows = db.execute(
        select(M.status, func.count()).where(live).group_by(M.status).order_by(func.count().desc())
    ).all()
    equip_rows = db.execute(
        select(M.equipment, func.count()).where(live, M.equipment.is_not(None))
        .group_by(M.equipment).order_by(func.count().desc()).limit(6)
    ).all()

    # Last 12 calendar months (portable across MySQL/SQLite: aggregate in Python).
    first = (today.replace(day=1) - timedelta(days=335)).replace(day=1)
    dates = db.scalars(select(M.performed_on).where(live, M.performed_on >= first, M.performed_on <= today)).all()
    by_month = Counter(d.strftime("%Y-%m") for d in dates if d)
    months, cursor = [], first
    while cursor <= today:
        key = cursor.strftime("%Y-%m")
        months.append(Bucket(label=key, count=by_month.get(key, 0)))
        cursor = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)

    recent = db.scalars(select(M).where(*active).order_by(M.created_at.desc(), M.id.desc()).limit(6)).unique().all()
    upcoming = db.scalars(
        select(M).where(*active, M.next_due >= today).order_by(M.next_due.asc()).limit(6)
    ).unique().all()

    return DashboardOut(
        counts=counts,
        overdue=overdue,
        due_soon=due_soon,
        completed_this_month=completed,
        status_breakdown=[Bucket(label=s or "Unspecified", count=c) for s, c in status_rows],
        equipment_top=[Bucket(label=e, count=c) for e, c in equip_rows],
        monthly=months,
        recent=[MaintenanceOut.model_validate(r) for r in recent],
        upcoming=[MaintenanceOut.model_validate(r) for r in upcoming],
    )


@router.get("/performers", response_model=list[PerformerOut],
            summary="Record counts per 'performed by' value (grouping into teams happens client-side)")
def performers(
    user: CurrentUser, db: DB,
    date_from: date | None = Query(None, alias="dateFrom"),
    date_to: date | None = Query(None, alias="dateTo"),
):
    stmt = select(M.performed_by, func.count()).where(M.deleted_at.is_(None), M.performed_by.is_not(None))
    if date_from:
        stmt = stmt.where(M.performed_on >= date_from)
    if date_to:
        stmt = stmt.where(M.performed_on <= date_to)
    rows = db.execute(stmt.group_by(M.performed_by).order_by(func.count().desc())).all()
    return [PerformerOut(performed_by=p, count=c) for p, c in rows]
