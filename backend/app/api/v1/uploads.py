"""Photo / video attachments for maintenance records.

Files live in UPLOAD_DIR and are only served through an authenticated endpoint.
Deleting moves an upload to the trash (soft delete); admins can purge it permanently.
"""

import os
import secrets
import time
from pathlib import Path

from fastapi import APIRouter, File, Form, Query, Request, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select

from app.api.deps import DB, AdminUser, CurrentUser, client_ip
from app.core.config import get_settings
from app.core.errors import AppError, Forbidden, NotFound
from app.core.security import utcnow
from app.models import MaintenanceRecord, MaintenanceUpload
from app.schemas import IdsIn, Page, UploadAssociateIn, UploadLimitsOut, UploadOut
from app.services.audit import audit

router = APIRouter(prefix="/uploads", tags=["uploads"])

ALLOWED: dict[str, str] = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif", "webp": "image/webp",
    "mp4": "video/mp4", "mov": "video/quicktime", "webm": "video/webm", "avi": "video/x-msvideo",
    "mkv": "video/x-matroska",
}
CHUNK = 1024 * 1024


def _sniff_ok(ext: str, head: bytes) -> bool:
    """Check the file's magic bytes match its extension (blocks renamed executables/HTML)."""
    if ext in ("jpg", "jpeg"):
        return head.startswith(b"\xff\xd8\xff")
    if ext == "png":
        return head.startswith(b"\x89PNG\r\n\x1a\n")
    if ext == "gif":
        return head[:6] in (b"GIF87a", b"GIF89a")
    if ext == "webp":
        return head[:4] == b"RIFF" and head[8:12] == b"WEBP"
    if ext in ("webm", "mkv"):
        return head.startswith(b"\x1a\x45\xdf\xa3")
    if ext == "avi":
        return head[:4] == b"RIFF" and head[8:12] == b"AVI "
    if ext in ("mp4", "mov"):
        return head[4:8] in (b"ftyp", b"moov", b"mdat", b"wide", b"free", b"skip", b"pnot")
    return False


def _upload_dir() -> Path:
    d = get_settings().upload_dir
    d.mkdir(parents=True, exist_ok=True)
    return d


def _file_path(u: MaintenanceUpload) -> Path:
    base = _upload_dir().resolve()
    p = (base / u.stored_name).resolve()
    if base not in p.parents:  # defence in depth against path traversal in stored data
        raise NotFound("File not found.")
    return p


def _get(db, upload_id: int) -> MaintenanceUpload:
    u = db.get(MaintenanceUpload, upload_id)
    if not u:
        raise NotFound("Upload not found.")
    return u


def _check_record(db, record_id: int | None) -> None:
    if record_id is None:
        return
    rec = db.get(MaintenanceRecord, record_id)
    if not rec or rec.deleted_at is not None:
        raise AppError("The maintenance record to attach to does not exist.", code="invalid_record")
    if rec.archived_at is not None:
        raise AppError("That maintenance record is archived and read-only. Unarchive it to attach files.",
                       code="archived", status_code=409)


@router.get("/limits", response_model=UploadLimitsOut)
def limits(user: CurrentUser):
    return UploadLimitsOut(max_bytes=get_settings().max_upload_bytes, allowed_extensions=sorted(ALLOWED))


@router.get("", response_model=Page[UploadOut])
def list_uploads(
    user: CurrentUser, db: DB,
    deleted: bool = False,
    record_id: int | None = Query(None, alias="recordId"),
    q: str | None = Query(None, max_length=100),
    kind: str | None = Query(None, pattern="^(image|video)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(48, ge=1, le=200, alias="pageSize"),
):
    U = MaintenanceUpload
    stmt = select(U).outerjoin(MaintenanceRecord, U.record_id == MaintenanceRecord.id)
    stmt = stmt.where(U.deleted_at.is_not(None) if deleted else U.deleted_at.is_(None))
    if record_id is not None:
        stmt = stmt.where(U.record_id == record_id)
    if kind:
        stmt = stmt.where(U.content_type.like(f"{kind}/%"))
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(U.original_name.ilike(like), MaintenanceRecord.branch_code.ilike(like),
                              MaintenanceRecord.branch_name.ilike(like), MaintenanceRecord.task.ilike(like)))
    total =db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    order = U.deleted_at.desc() if deleted else U.uploaded_at.desc()
    rows = db.scalars(stmt.order_by(order, U.id.desc()).offset((page - 1) * page_size).limit(page_size)).unique().all()
    return Page(items=[UploadOut.model_validate(r) for r in rows], total=total, page=page, page_size=page_size)


@router.post("", response_model=UploadOut, status_code=status.HTTP_201_CREATED)
async def upload_file(
    request: Request, user: CurrentUser, db: DB,
    file: UploadFile = File(...),
    record_id: int | None = Form(None, alias="recordId"),
):
    s = get_settings()
    original = os.path.basename(file.filename or "upload")[:255]
    ext = original.rsplit(".", 1)[-1].lower() if "." in original else ""
    if ext not in ALLOWED:
        raise AppError(f"File type .{ext or '?'} is not allowed. Allowed: {', '.join(sorted(ALLOWED))}.",
                       code="unsupported_media_type", status_code=415)
    _check_record(db, record_id)

    head = await file.read(16)
    if not _sniff_ok(ext, head):
        raise AppError("File contents don't match its extension.", code="unsupported_media_type", status_code=415)

    stored = f"{int(time.time())}_{secrets.token_hex(6)}.{ext}"
    dest = _upload_dir() / stored
    size = len(head)
    try:
        with dest.open("wb") as out:
            out.write(head)
            while chunk := await file.read(CHUNK):
                size += len(chunk)
                if size > s.max_upload_bytes:
                    raise AppError(f"File exceeds the {s.max_upload_mb} MB limit.", code="payload_too_large",
                                   status_code=413)
                out.write(chunk)
    except BaseException:
        dest.unlink(missing_ok=True)
        raise

    row = MaintenanceUpload(record_id=record_id, original_name=original, stored_name=stored,
                            content_type=ALLOWED[ext], size_bytes=size, uploaded_by_id=user.id)
    db.add(row)
    db.flush()
    audit(db, "upload.created", user=user, entity_type="upload", entity_id=row.id,
          details={"name": original, "recordId": record_id, "size": size}, ip=client_ip(request))
    db.commit()
    db.refresh(row)
    return row


@router.get("/{upload_id}/file", response_class=FileResponse, summary="Download / stream the file (auth required)")
def get_file(upload_id: int, user: CurrentUser, db: DB, download: bool = False):
    u = _get(db, upload_id)
    if u.deleted_at is not None and not user.is_admin:
        raise NotFound("Upload not found.")
    path = _file_path(u)
    if not path.is_file():
        raise NotFound("The file is missing from storage.")
    return FileResponse(
        path, media_type=u.content_type or "application/octet-stream", filename=u.original_name,
        content_disposition_type="attachment" if download else "inline",
        headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"},
    )


@router.patch("/{upload_id}", response_model=UploadOut, summary="Attach to / detach from a maintenance record")
def associate(upload_id: int, body: UploadAssociateIn, user: CurrentUser, request: Request, db: DB):
    u = _get(db, upload_id)
    _check_record(db, body.record_id)
    u.record_id = body.record_id
    audit(db, "upload.associated", user=user, entity_type="upload", entity_id=u.id,
          details={"recordId": body.record_id}, ip=client_ip(request))
    db.commit()
    db.refresh(u)
    return u


@router.delete("/{upload_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Move to trash")
def trash(upload_id: int, user: CurrentUser, request: Request, db: DB):
    u = _get(db, upload_id)
    if u.deleted_at is None:
        u.deleted_at = utcnow()
        u.deleted_by_id = user.id
        audit(db, "upload.trashed", user=user, entity_type="upload", entity_id=u.id, ip=client_ip(request))
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/restore", status_code=status.HTTP_204_NO_CONTENT, summary="Restore uploads from the trash")
def restore(body: IdsIn, user: CurrentUser, request: Request, db: DB):
    rows = db.scalars(select(MaintenanceUpload).where(MaintenanceUpload.id.in_(body.ids))).unique().all()
    for u in rows:
        u.deleted_at = None
        u.deleted_by_id = None
    audit(db, "upload.restored", user=user, entity_type="upload", details={"ids": [u.id for u in rows]},
          ip=client_ip(request))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/purge", status_code=status.HTTP_204_NO_CONTENT, summary="Permanently delete trashed uploads (admin)")
def purge(body: IdsIn, admin: AdminUser, request: Request, db: DB):
    rows = db.scalars(select(MaintenanceUpload).where(MaintenanceUpload.id.in_(body.ids))).unique().all()
    if any(u.deleted_at is None for u in rows):
        raise Forbidden("Move uploads to the trash before deleting them permanently.", code="not_in_trash")
    for u in rows:
        try:
            _file_path(u).unlink(missing_ok=True)
        except NotFound:
            pass
        db.delete(u)
    audit(db, "upload.purged", user=admin, entity_type="upload", details={"ids": body.ids}, ip=client_ip(request))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
