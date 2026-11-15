"""Store lists — visible to admins, and to users an admin has shared a list with.

    GET    /store-lists                 admins: all · users: only lists shared with them
    GET    /store-lists/{id}            admin or shared user
    POST   /store-lists                 admin only (a user couldn't see a list they created)
    PUT    /store-lists/{id}            admin or shared user (edit & save)
    DELETE /store-lists/{id}            admin (soft delete)
    POST   /store-lists/{id}/restore    admin
    GET    /store-lists/{id}/shares     admin — users it's shared with
    PUT    /store-lists/{id}/shares     admin — replace the share list
"""

from datetime import date

from fastapi import APIRouter, Query, Request, Response, status
from sqlalchemy import exists, select

from app.api.deps import DB, AdminUser, CurrentUser, client_ip
from app.core.errors import AppError, Forbidden, NotFound
from app.core.security import utcnow
from app.models import ROLE_ADMIN, StoreList, StoreListShare, User
from app.schemas import Page, SharedUserOut, StoreListIn, StoreListOut, StoreListShareIn, StoreListSummaryOut
from app.services.audit import audit
from app.services.calc import store_list_totals
from app.services.records import RecordResource

router = APIRouter(prefix="/store-lists", tags=["store-lists"])

resource = RecordResource(
    StoreList, entity="store_list", label="Store list",
    search_columns=["file_name"],
    date_column="saved_at",
    order_by=[StoreList.saved_at.desc(), StoreList.id.desc()],
)


def _shared_with(user: User):
    """SQL condition: the store list is shared with this user."""
    return exists().where(StoreListShare.store_list_id == StoreList.id, StoreListShare.user_id == user.id)


def _get_visible(db, record_id: int, user: User, *, allow_deleted: bool = False) -> StoreList:
    row = resource.get(db, record_id, allow_deleted=allow_deleted and user.is_admin)
    if not user.is_admin and not any(s.user_id == user.id for s in row.shares):
        # Same answer as a missing list, so users can't probe for lists they weren't given.
        raise NotFound("Store list not found.")
    return row


def _out(row: StoreList, user: User, schema):
    out = schema.model_validate(row)
    if not user.is_admin:
        out.shared_with = []  # who else has access is admin information
    return out


def _data(body: StoreListIn) -> dict:
    snapshot = body.snapshot.model_dump()
    return {"file_name": body.file_name, "snapshot": snapshot, **store_list_totals(snapshot), "saved_at": utcnow()}


@router.get("", response_model=Page[StoreListSummaryOut])
def list_store_lists(
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
    where = [] if user.is_admin else [_shared_with(user)]
    stmt = resource.filtered(q=q, date_from=date_from, date_to=date_to, deleted=deleted, where=where)
    rows, total = resource.paginate(db, stmt, page=page, page_size=page_size)
    return Page(items=[_out(r, user, StoreListSummaryOut) for r in rows], total=total, page=page, page_size=page_size)


@router.get("/{record_id}", response_model=StoreListOut)
def get_store_list(record_id: int, user: CurrentUser, db: DB):
    return _out(_get_visible(db, record_id, user, allow_deleted=True), user, StoreListOut)


@router.post("", response_model=StoreListOut, status_code=status.HTTP_201_CREATED)
def create_store_list(body: StoreListIn, admin: AdminUser, request: Request, db: DB):
    return _out(resource.create(db, admin, _data(body), client_ip(request)), admin, StoreListOut)


@router.put("/{record_id}", response_model=StoreListOut)
def update_store_list(record_id: int, body: StoreListIn, user: CurrentUser, request: Request, db: DB):
    _get_visible(db, record_id, user)  # access check
    return _out(resource.update(db, user, record_id, _data(body), client_ip(request)), user, StoreListOut)


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_store_list(record_id: int, admin: AdminUser, request: Request, db: DB):
    resource.soft_delete(db, admin, record_id, client_ip(request))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{record_id}/restore", response_model=StoreListOut)
def restore_store_list(record_id: int, admin: AdminUser, request: Request, db: DB):
    return _out(resource.restore(db, admin, record_id, client_ip(request)), admin, StoreListOut)


@router.get("/{record_id}/shares", response_model=list[SharedUserOut])
def get_shares(record_id: int, admin: AdminUser, db: DB):
    return resource.get(db, record_id).shared_with


@router.put("/{record_id}/shares", response_model=list[SharedUserOut], summary="Set exactly which users can view & edit this list")
def set_shares(record_id: int, body: StoreListShareIn, admin: AdminUser, request: Request, db: DB):
    row = resource.get(db, record_id)
    wanted = set(body.user_ids)
    if wanted:
        users = db.scalars(select(User).where(User.id.in_(wanted))).all()
        found = {u.id for u in users}
        if missing := wanted - found:
            raise AppError(f"Unknown user id(s): {sorted(missing)}", code="invalid_users")
        if any(u.role == ROLE_ADMIN for u in users):
            raise AppError("Administrators already see every store list; share with regular users only.", code="invalid_users")
        if any(not u.is_active for u in users):
            raise AppError("Can't share with a deactivated user.", code="invalid_users")
    current = {s.user_id for s in row.shares}
    added, removed = sorted(wanted - current), sorted(current - wanted)
    row.shares = [s for s in row.shares if s.user_id in wanted] + [
        StoreListShare(user_id=uid, created_by_id=admin.id) for uid in added
    ]
    audit(db, "store_list.shared", user=admin, entity_type="store_list", entity_id=row.id,
          details={"added": added, "removed": removed}, ip=client_ip(request))
    db.commit()
    db.refresh(row)
    return row.shared_with
