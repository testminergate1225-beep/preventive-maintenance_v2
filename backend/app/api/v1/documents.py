"""Load balancing, megger tests, PM checklists and store lists share the same REST shape:

    GET    /{resource}            paginated summaries (?q=&dateFrom=&dateTo=&deleted=)
    GET    /{resource}/{id}       full record
    POST   /{resource}            create
    PUT    /{resource}/{id}       replace
    DELETE /{resource}/{id}       soft delete (admin)
    POST   /{resource}/{id}/restore   undo soft delete (admin)
"""

from collections.abc import Callable
from datetime import date
from typing import Any

from fastapi import APIRouter, Query, Request, Response, status
from pydantic import BaseModel

from app.api.deps import DB, AdminUser, CurrentUser, client_ip
from app.core.errors import Forbidden
from app.core.security import utcnow
from app.models import LoadBalancingRecord, MeggerTest, PmChecklist
from app.schemas import (
    ChecklistIn,
    ChecklistOut,
    ChecklistSummaryOut,
    LoadBalancingIn,
    LoadBalancingOut,
    LoadBalancingSummaryOut,
    MeggerIn,
    MeggerOut,
    MeggerSummaryOut,
    Page,
)
from app.services.calc import load_balancing_totals
from app.services.records import RecordResource


def make_router(
    *,
    prefix: str,
    tag: str,
    resource: RecordResource,
    in_schema: type[BaseModel],
    summary_schema: type[BaseModel],
    detail_schema: type[BaseModel],
    to_data: Callable[[Any], dict[str, Any]],
) -> APIRouter:
    router = APIRouter(prefix=prefix, tags=[tag])

    @router.get("", response_model=Page[summary_schema])  # type: ignore[valid-type]
    def list_records(
        user: CurrentUser, db: DB,
        q: str | None = Query(None, max_length=100),
        date_from: date | None = Query(None, alias="dateFrom"),
        date_to: date | None = Query(None, alias="dateTo"),
        deleted: bool = False,
        page: int = Query(1, ge=1),
        page_size: int = Query(25, ge=1, le=200, alias="pageSize"),
    ):
        if deleted and not user.is_admin:
            raise Forbidden("Only administrators can view deleted records.")
        stmt = resource.filtered(q=q, date_from=date_from, date_to=date_to, deleted=deleted)
        rows, total = resource.paginate(db, stmt, page=page, page_size=page_size)
        return Page(items=[summary_schema.model_validate(r) for r in rows], total=total, page=page, page_size=page_size)

    @router.get("/{record_id}", response_model=detail_schema)
    def get_record(record_id: int, user: CurrentUser, db: DB):
        return resource.get(db, record_id, allow_deleted=user.is_admin)

    @router.post("", response_model=detail_schema, status_code=status.HTTP_201_CREATED)
    def create_record(body: in_schema, user: CurrentUser, request: Request, db: DB):  # type: ignore[valid-type]
        return resource.create(db, user, {**to_data(body), "saved_at": utcnow()}, client_ip(request))

    @router.put("/{record_id}", response_model=detail_schema)
    def update_record(record_id: int, body: in_schema, user: CurrentUser, request: Request, db: DB):  # type: ignore[valid-type]
        return resource.update(db, user, record_id, {**to_data(body), "saved_at": utcnow()}, client_ip(request))

    @router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_record(record_id: int, admin: AdminUser, request: Request, db: DB):
        resource.soft_delete(db, admin, record_id, client_ip(request))
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.post("/{record_id}/restore", response_model=detail_schema)
    def restore_record(record_id: int, admin: AdminUser, request: Request, db: DB):
        return resource.restore(db, admin, record_id, client_ip(request))

    return router


# ───────────────────────────── Load balancing ─────────────────────────────


def _lb_data(body: LoadBalancingIn) -> dict[str, Any]:
    data = body.model_dump()
    data["loads"] = [load.model_dump(exclude_none=True) for load in body.loads]
    data.update(load_balancing_totals(body.circuit_type, data["loads"], data))
    return data


load_balancing_router = make_router(
    prefix="/load-balancing",
    tag="load-balancing",
    resource=RecordResource(
        LoadBalancingRecord, entity="load_balancing", label="Load balancing record",
        search_columns=["file_name", "ref_id", "branch_code", "company", "location", "panel", "conducted_by"],
        date_column="test_date",
        order_by=[LoadBalancingRecord.saved_at.desc(), LoadBalancingRecord.id.desc()],
    ),
    in_schema=LoadBalancingIn,
    summary_schema=LoadBalancingSummaryOut,
    detail_schema=LoadBalancingOut,
    to_data=_lb_data,
)

# ───────────────────────────── Megger ─────────────────────────────


def _megger_data(body: MeggerIn) -> dict[str, Any]:
    data = body.model_dump(exclude={"rows"})
    data["rows"] = [r.model_dump(by_alias=True) for r in body.rows]
    return data


megger_router = make_router(
    prefix="/megger-tests",
    tag="megger",
    resource=RecordResource(
        MeggerTest, entity="megger_test", label="Megger test",
        search_columns=["file_name", "company", "location", "reference_no", "conducted_by"],
        date_column="test_date",
        order_by=[MeggerTest.saved_at.desc(), MeggerTest.id.desc()],
    ),
    in_schema=MeggerIn,
    summary_schema=MeggerSummaryOut,
    detail_schema=MeggerOut,
    to_data=_megger_data,
)

# ───────────────────────────── PM checklists ─────────────────────────────


def _checklist_data(body: ChecklistIn) -> dict[str, Any]:
    data = body.model_dump(exclude={"categories"})
    data["categories"] = [c.model_dump() for c in body.categories]
    return data


checklist_router = make_router(
    prefix="/checklists",
    tag="checklists",
    resource=RecordResource(
        PmChecklist, entity="pm_checklist", label="Checklist",
        search_columns=["branch_name", "branch_code", "location", "ref_number", "conducted_by"],
        date_column="checklist_date",
        order_by=[PmChecklist.saved_at.desc(), PmChecklist.id.desc()],
    ),
    in_schema=ChecklistIn,
    summary_schema=ChecklistSummaryOut,
    detail_schema=ChecklistOut,
    to_data=_checklist_data,
)

# Store lists have per-user sharing rules: see app/api/v1/store_lists.py
