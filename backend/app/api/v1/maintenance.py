import csv
import io
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Query, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select

from app.api.deps import DB, AdminUser, CurrentUser, client_ip
from app.core.errors import Forbidden
from app.models import MaintenanceRecord, MaintenanceUpload
from app.schemas import ArchiveIn, ArchiveResultOut, IdsIn, MaintenanceIn, MaintenanceOut, Page
from app.services.records import RecordResource, View

router = APIRouter(prefix="/maintenance", tags=["maintenance"])

M = MaintenanceRecord
resource = RecordResource(
    M, entity="maintenance", label="Maintenance record",
    search_columns=["branch_code", "branch_name", "location", "equipment", "task", "performed_by", "verified_by", "notes"],
    date_column="performed_on",
    order_by=[M.performed_on.desc(), M.id.desc()],
)

SORTS = {
    "-performedOn": [M.performed_on.desc(), M.id.desc()],
    "performedOn": [M.performed_on.asc(), M.id.asc()],
    "nextDue": [M.next_due.is_(None), M.next_due.asc(), M.id.asc()],
    "-createdAt": [M.created_at.desc(), M.id.desc()],
    "branch": [M.branch_name.asc(), M.branch_code.asc(), M.performed_on.desc()],
    "-archivedAt": [M.archived_at.desc(), M.id.desc()],
}


def _filters(q, status_, equipment, branch, performed_by, due, date_from, date_to, deleted, view: View = "active"):
    where = []
    if status_:
        where.append(M.status == status_)
    if equipment:
        where.append(M.equipment == equipment)
    if branch:
        where.append((M.branch_name == branch) | (M.branch_code == branch))
    if performed_by:
        where.append(M.performed_by.ilike(f"%{performed_by}%"))
    today = date.today()
    if due == "overdue":
        where.append(M.next_due < today)
    elif due == "week":
        where.append(M.next_due.between(today, today + timedelta(days=7)))
    elif due == "month":
        where.append(M.next_due.between(today, today + timedelta(days=30)))
    return resource.filtered(q=q, date_from=date_from, date_to=date_to, deleted=deleted, where=where, view=view)


def _with_upload_counts(db, rows):
    if not rows:
        return rows
    counts = dict(
        db.execute(
            select(MaintenanceUpload.record_id, func.count())
            .where(MaintenanceUpload.record_id.in_([r.id for r in rows]), MaintenanceUpload.deleted_at.is_(None))
            .group_by(MaintenanceUpload.record_id)
        ).all()
    )
    for r in rows:
        r.upload_count = counts.get(r.id, 0)
    return rows


@router.get("", response_model=Page[MaintenanceOut])
def list_maintenance(
    user: CurrentUser, db: DB,
    q: str | None = Query(None, max_length=100),
    status_: str | None = Query(None, alias="status", max_length=50),
    equipment: str | None = Query(None, max_length=255),
    branch: str | None = Query(None, max_length=255),
    performed_by: str | None = Query(None, alias="performedBy", max_length=255),
    due: Literal["overdue", "week", "month"] | None = None,
    date_from: date | None = Query(None, alias="dateFrom"),
    date_to: date | None = Query(None, alias="dateTo"),
    deleted: bool = False,
    view: View = "active",
    sort: Literal["-performedOn", "performedOn", "nextDue", "-createdAt", "branch", "-archivedAt"] = "-performedOn",
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=500, alias="pageSize"),
):
    if deleted and not user.is_admin:
        raise Forbidden("Only administrators can view deleted records.")
    stmt = _filters(q, status_, equipment, branch, performed_by, due, date_from, date_to, deleted, view)
    rows, total = resource.paginate(db, stmt, page=page, page_size=page_size, order=SORTS[sort])
    rows = _with_upload_counts(db, list(rows))
    return Page(items=[MaintenanceOut.model_validate(r) for r in rows], total=total, page=page, page_size=page_size)


@router.get("/export.csv", response_class=StreamingResponse, summary="Export filtered records as CSV")
def export_csv(
    user: CurrentUser, db: DB,
    q: str | None = Query(None, max_length=100),
    status_: str | None = Query(None, alias="status", max_length=50),
    equipment: str | None = Query(None, max_length=255),
    branch: str | None = Query(None, max_length=255),
    performed_by: str | None = Query(None, alias="performedBy", max_length=255),
    due: Literal["overdue", "week", "month"] | None = None,
    date_from: date | None = Query(None, alias="dateFrom"),
    date_to: date | None = Query(None, alias="dateTo"),
    view: View = "active",
):
    stmt = _filters(q, status_, equipment, branch, performed_by, due, date_from, date_to, False, view)
    rows = db.scalars(stmt.order_by(*SORTS["-performedOn"])).unique().all()
    buf = io.StringIO()
    buf.write("﻿")  # BOM so Excel opens UTF-8 correctly
    w = csv.writer(buf)
    w.writerow(["ID", "Branch Code", "Branch Name", "Location", "Performed On", "Equipment", "Task", "Status",
                "Performed By", "Verified By", "Next Due", "Notes", "Archived On", "Archive Reason"])
    for r in rows:
        w.writerow([r.id, r.branch_code or "", r.branch_name or "", r.location or "", r.performed_on or "",
                    r.equipment or "", r.task or "", r.status or "", r.performed_by or "", r.verified_by or "",
                    r.next_due or "", r.notes or "", r.archived_at.date() if r.archived_at else "", r.archive_reason or ""])
    prefix = {"active": "maintenance_records", "archived": "maintenance_archive", "all": "maintenance_records_all"}[view]
    filename = f"{prefix}_{date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]), media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{record_id}", response_model=MaintenanceOut)
def get_maintenance(record_id: int, user: CurrentUser, db: DB):
    row = resource.get(db, record_id, allow_deleted=user.is_admin)
    return _with_upload_counts(db, [row])[0]


@router.post("", response_model=MaintenanceOut, status_code=status.HTTP_201_CREATED)
def create_maintenance(body: MaintenanceIn, user: CurrentUser, request: Request, db: DB):
    data = body.model_dump()
    data["performed_on"] = data["performed_on"] or date.today()
    return resource.create(db, user, data, client_ip(request))


@router.put("/{record_id}", response_model=MaintenanceOut)
def update_maintenance(record_id: int, body: MaintenanceIn, user: CurrentUser, request: Request, db: DB):
    row = resource.update(db, user, record_id, body.model_dump(), client_ip(request))  # 409 if archived
    return _with_upload_counts(db, [row])[0]


@router.post("/archive", response_model=ArchiveResultOut,
             summary="Archive records by id, or every active record performed before a date (dryRun previews)")
def archive_maintenance(body: ArchiveIn, admin: AdminUser, request: Request, db: DB):
    return ArchiveResultOut(count=resource.archive(db, admin, ids=body.ids, before=body.before, reason=body.reason,
                                                   dry_run=body.dry_run, ip=client_ip(request)))


@router.post("/unarchive", response_model=ArchiveResultOut, summary="Return archived records to the active list")
def unarchive_maintenance(body: IdsIn, admin: AdminUser, request: Request, db: DB):
    return ArchiveResultOut(count=resource.unarchive(db, admin, body.ids, client_ip(request)))


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_maintenance(record_id: int, admin: AdminUser, request: Request, db: DB):
    resource.soft_delete(db, admin, record_id, client_ip(request))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{record_id}/restore", response_model=MaintenanceOut)
def restore_maintenance(record_id: int, admin: AdminUser, request: Request, db: DB):
    return resource.restore(db, admin, record_id, client_ip(request))
