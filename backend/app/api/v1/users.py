from fastapi import APIRouter, Query, Request, status
from sqlalchemy import func, or_, select

from app.api.deps import DB, AdminUser, client_ip
from app.core.errors import AppError, Conflict, NotFound
from app.core.security import hash_password
from app.models import ROLE_ADMIN, AuditLog, User
from app.schemas import AuditOut, InviteOut, Page, UserCreateIn, UserOut, UserUpdateIn
from app.services import auth as auth_service
from app.services.audit import audit

router = APIRouter(tags=["users"])


def _get(db, user_id: int) -> User:
    u = db.get(User, user_id)
    if not u:
        raise NotFound("User not found.")
    return u


def _active_admin_count(db) -> int:
    return db.scalar(select(func.count()).select_from(User).where(User.role == ROLE_ADMIN, User.is_active.is_(True)))


@router.get("/users", response_model=Page[UserOut])
def list_users(
    admin: AdminUser, db: DB,
    q: str | None = Query(None, max_length=100),
    page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200, alias="pageSize"),
):
    stmt = select(User)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.email.ilike(like), User.full_name.ilike(like)))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(User.full_name, User.email).offset((page - 1) * page_size).limit(page_size)).all()
    return Page(items=[UserOut.model_validate(u) for u in rows], total=total, page=page, page_size=page_size)


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(body: UserCreateIn, admin: AdminUser, request: Request, db: DB):
    """Create a user. Without a password, follow up with POST /users/{id}/invite."""
    email = auth_service.normalize_email(body.email)
    if auth_service.get_user_by_email(db, email):
        raise Conflict("A user with this e-mail already exists.", code="email_taken")
    user = User(email=email, full_name=body.full_name, role=body.role, is_active=True)
    if body.password:
        user.password_hash = hash_password(body.password)
    db.add(user)
    db.flush()
    audit(db, "user.created", user=admin, entity_type="user", entity_id=user.id,
          details={"email": email, "role": body.role}, ip=client_ip(request))
    db.commit()
    return user


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdateIn, admin: AdminUser, request: Request, db: DB):
    user = _get(db, user_id)
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    if user.id == admin.id and (changes.get("role", ROLE_ADMIN) != ROLE_ADMIN or changes.get("is_active") is False):
        raise AppError("You can't remove your own administrator access or deactivate yourself.", code="self_lockout")
    demoting = user.role == ROLE_ADMIN and (changes.get("role") not in (None, ROLE_ADMIN) or changes.get("is_active") is False)
    if demoting and _active_admin_count(db) <= 1:
        raise AppError("At least one active administrator is required.", code="last_admin")
    for k, v in changes.items():
        setattr(user, k, v)
    if changes.get("is_active") is False:
        auth_service.revoke_all_sessions(db, user)
    audit(db, "user.updated", user=admin, entity_type="user", entity_id=user.id, details=changes, ip=client_ip(request))
    db.commit()
    return user


@router.post("/users/{user_id}/invite", response_model=InviteOut,
             summary="E-mail a set-password link (works for new users and password resets by an admin)")
def send_invite(user_id: int, admin: AdminUser, request: Request, db: DB):
    user = _get(db, user_id)
    if not user.is_active:
        raise AppError("Activate the user before sending an invite.", code="user_inactive")
    link, emailed = auth_service.invite_user(db, user, client_ip(request))
    audit(db, "user.invite_sent", user=admin, entity_type="user", entity_id=user.id,
          details={"emailed": emailed}, ip=client_ip(request))
    db.commit()
    if emailed:
        return InviteOut(message=f"Invite e-mailed to {user.email}.", emailed=True)
    return InviteOut(
        message="E-mail could not be sent (SMTP not configured or failed). Share this link with the user securely.",
        emailed=False, link=link,
    )


@router.get("/audit", response_model=Page[AuditOut], tags=["audit"])
def list_audit(
    admin: AdminUser, db: DB,
    action: str | None = Query(None, max_length=64),
    entity_type: str | None = Query(None, max_length=64, alias="entityType"),
    user_id: int | None = Query(None, alias="userId"),
    page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200, alias="pageSize"),
):
    stmt = select(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action.like(f"{action}%"))
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(AuditLog.id.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    items = [
        AuditOut(
            id=r.id, action=r.action, entity_type=r.entity_type, entity_id=r.entity_id, details=r.details,
            ip_address=r.ip_address, created_at=r.created_at,
            user_email=r.user.email if r.user else None, user_name=r.user.full_name if r.user else None,
        )
        for r in rows
    ]
    return Page(items=items, total=total, page=page, page_size=page_size)
