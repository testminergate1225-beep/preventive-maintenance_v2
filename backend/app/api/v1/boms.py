"""Bill of Materials for PM checklists.

    GET    /checklists/{id}/bom              the checklist's BOM (404 if none)
    POST   /checklists/{id}/bom              create (one active BOM per checklist)
    GET    /checklists/{id}/bom/recipient    store e-mail last used for the same branch
    GET    /boms/{id}  PUT /boms/{id}  DELETE /boms/{id}
    GET    /boms/{id}/pdf                    current PDF (DRAFT watermark until finalized)
    POST   /boms/{id}/finalize               freeze revision N+1 as a PDF and e-mail the store a 30-day link
    POST   /boms/{id}/resend                 e-mail a fresh link to the latest finalized revision
    POST   /bom-images  GET /bom-images/{id} item photos
    GET    /public/bom/{token}               the e-mailed PDF link (no sign-in; expires, revocable)
"""

import hashlib
import os
import secrets
import time
from datetime import timedelta

from fastapi import APIRouter, File, Request, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.api.deps import DB, CurrentUser, client_ip
from app.api.v1.uploads import _sniff_ok
from app.core.config import get_settings
from app.core.errors import AppError, Conflict, Forbidden, NotFound
from app.core.security import utcnow
from app.models import BOM_DRAFT, BOM_FINAL, Bom, BomImage, BomItem, BomLink, PmChecklist, User
from app.schemas import BomImageOut, BomIn, BomOut, BomSendResultOut, CamelModel, _emails
from app.services import email as mailer
from app.services.audit import audit
from app.services.bom_pdf import pdf_dir, render_bom_pdf

router = APIRouter(tags=["bill-of-materials"])

IMAGE_TYPES = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024


# ───────────────────────── helpers ─────────────────────────

def _checklist(db, checklist_id: int) -> PmChecklist:
    c = db.get(PmChecklist, checklist_id)
    if not c or c.deleted_at is not None:
        raise NotFound("Checklist not found.")
    return c


def _bom(db, bom_id: int) -> Bom:
    b = db.get(Bom, bom_id)
    if not b or b.deleted_at is not None or b.checklist.deleted_at is not None:
        raise NotFound("Bill of Materials not found.")
    return b


def _ensure_editable(b: Bom) -> None:
    if b.checklist.archived_at is not None:
        raise Conflict("The checklist is archived, so its Bill of Materials is read-only. Unarchive the checklist first.",
                       code="archived")


def _bom_number(c: PmChecklist) -> str:
    ref = (c.ref_number or "").strip()
    if ref.upper().startswith("PM-"):
        return "BOM-" + ref[3:]
    d = c.checklist_date
    return f"BOM-{d:%Y%m%d}-{c.id:04d}" if d else f"BOM-{c.id:06d}"


def _image_dir():
    d = get_settings().upload_dir / "bom" / "images"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _apply(db, b: Bom, body: BomIn) -> None:
    data = body.model_dump(exclude={"items"})
    for k, v in data.items():
        setattr(b, k, v)
    image_ids = {i.image_id for i in body.items if i.image_id}
    if image_ids:
        found = set(db.scalars(select(BomImage.id).where(BomImage.id.in_(image_ids))).all())
        if missing := image_ids - found:
            raise AppError(f"Unknown item photo id(s): {sorted(missing)}.", code="invalid_image")
    b.items = [BomItem(position=n, **it.model_dump()) for n, it in enumerate(body.items)]


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _link_url(token: str) -> str:
    return f"{get_settings().app_base_url.rstrip('/')}/api/v1/public/bom/{token}"


def _out(b: Bom) -> BomOut:
    return BomOut.model_validate(b)


def _issue_link_and_email(db, b: Bom, user: User, pdf_name: str, ip: str | None) -> BomSendResultOut:
    s = get_settings()
    token = secrets.token_urlsafe(32)
    expires = utcnow() + timedelta(days=s.bom_link_days)
    cc = _emails(b.cc_emails)
    recipients = ", ".join([b.store_email or "", *cc]).strip(", ")
    db.add(BomLink(bom_id=b.id, revision=b.revision, token_hash=_hash(token), pdf_name=pdf_name, sent_to=recipients,
                   expires_at=expires, created_by_id=user.id))
    link = _link_url(token)
    sent = mailer.send_bom(
        b.store_email or "", cc, bom_number=b.bom_number, revision=b.revision,
        branch=b.checklist.branch_name or "your store", checklist_ref=b.checklist.ref_number,
        item_count=len(b.items), prepared_by=b.prepared_by, link=link, expires=f"{expires:%d %b %Y}",
    )
    if sent:
        b.emailed_at, b.emailed_to, b.email_error = utcnow(), recipients, None
        message = f"E-mailed to {recipients}."
    else:
        b.email_error = ("E-mail is not configured on the server (BOM_SMTP_*)." if not s.bom_smtp_enabled
                         else "The mail server did not accept the message. Check the address and try Resend.")
        message = f"{b.email_error} Copy the link below and send it manually."
    audit(db, "bom.emailed" if sent else "bom.email_failed", user=user, entity_type="bom", entity_id=b.id,
          details={"revision": b.revision, "to": recipients}, ip=ip)
    db.commit()
    db.refresh(b)
    return BomSendResultOut(bom=_out(b), emailed=sent, message=message, link=link, expires_at=expires)


# ───────────────────────── checklist-scoped ─────────────────────────

@router.get("/checklists/{checklist_id}/bom", response_model=BomOut)
def get_checklist_bom(checklist_id: int, user: CurrentUser, db: DB):
    c = _checklist(db, checklist_id)
    if not c.bom:
        raise NotFound("This checklist has no Bill of Materials yet.")
    return _out(c.bom)


class RecipientOut(CamelModel):
    store_email: str | None
    cc_emails: str | None


@router.get("/checklists/{checklist_id}/bom/recipient", response_model=RecipientOut,
            summary="Store e-mail / CC last used for the same branch (to prefill a new BOM)")
def suggested_recipient(checklist_id: int, user: CurrentUser, db: DB):
    c = _checklist(db, checklist_id)
    keys = [k for k in (c.branch_code, c.branch_name) if k]
    if not keys:
        return RecipientOut(store_email=None, cc_emails=None)
    match = (PmChecklist.branch_code == c.branch_code) if c.branch_code else (PmChecklist.branch_name == c.branch_name)
    prev = db.scalars(
        select(Bom).join(PmChecklist, Bom.checklist_id == PmChecklist.id)
        .where(match, Bom.store_email.is_not(None), Bom.deleted_at.is_(None))
        .order_by(Bom.updated_at.desc()).limit(1)
    ).first()
    return RecipientOut(store_email=prev.store_email if prev else None, cc_emails=prev.cc_emails if prev else None)


@router.post("/checklists/{checklist_id}/bom", response_model=BomOut, status_code=status.HTTP_201_CREATED)
def create_bom(checklist_id: int, body: BomIn, user: CurrentUser, request: Request, db: DB):
    c = _checklist(db, checklist_id)
    if c.archived_at is not None:
        raise Conflict("The checklist is archived. Unarchive it before adding a Bill of Materials.", code="archived")
    if c.bom:
        raise Conflict("This checklist already has a Bill of Materials.", code="bom_exists")
    b = Bom(checklist_id=c.id, bom_number=_bom_number(c), status=BOM_DRAFT, revision=0,
            created_by_id=user.id, updated_by_id=user.id)
    db.add(b)
    _apply(db, b, body)
    if not b.prepared_by:
        b.prepared_by = user.full_name or user.email
    db.flush()
    audit(db, "bom.created", user=user, entity_type="bom", entity_id=b.id,
          details={"checklistId": c.id, "items": len(body.items)}, ip=client_ip(request))
    db.commit()
    db.refresh(b)
    return _out(b)


# ───────────────────────── BOM ─────────────────────────

@router.get("/boms/{bom_id}", response_model=BomOut)
def get_bom(bom_id: int, user: CurrentUser, db: DB):
    return _out(_bom(db, bom_id))


@router.put("/boms/{bom_id}", response_model=BomOut, summary="Save changes (a finalized BOM reopens as a draft)")
def update_bom(bom_id: int, body: BomIn, user: CurrentUser, request: Request, db: DB):
    b = _bom(db, bom_id)
    _ensure_editable(b)
    reopened = b.status == BOM_FINAL
    _apply(db, b, body)
    b.status = BOM_DRAFT
    b.updated_by_id = user.id
    audit(db, "bom.updated", user=user, entity_type="bom", entity_id=b.id,
          details={"items": len(body.items), "reopened": reopened}, ip=client_ip(request))
    db.commit()
    db.refresh(b)
    return _out(b)


@router.delete("/boms/{bom_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Delete (drafts: creator or admin; finalized: admin). E-mailed links stop working.")
def delete_bom(bom_id: int, user: CurrentUser, request: Request, db: DB):
    b = _bom(db, bom_id)
    _ensure_editable(b)
    if not user.is_admin and (b.revision > 0 or b.created_by_id != user.id):
        raise Forbidden("Only an administrator can delete a Bill of Materials that was issued or created by someone else.")
    now = utcnow()
    b.deleted_at = now
    b.updated_by_id = user.id
    for link in db.scalars(select(BomLink).where(BomLink.bom_id == b.id, BomLink.revoked_at.is_(None))).all():
        link.revoked_at = now
    audit(db, "bom.deleted", user=user, entity_type="bom", entity_id=b.id, ip=client_ip(request))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _pdf_response(content: bytes, filename: str, *, download: bool) -> Response:
    return Response(content, media_type="application/pdf", headers={
        "Content-Disposition": f'{"attachment" if download else "inline"}; filename="{filename}"',
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow",
    })


@router.get("/boms/{bom_id}/pdf", response_class=Response, summary="Current PDF (for Print / Download)")
def bom_pdf(bom_id: int, user: CurrentUser, db: DB, download: bool = False):
    b = _bom(db, bom_id)
    return _pdf_response(render_bom_pdf(b), f"{b.bom_number}.pdf", download=download)


@router.post("/boms/{bom_id}/finalize", response_model=BomSendResultOut,
             summary="Issue the next revision: freeze it as a PDF and e-mail the store a 30-day link")
def finalize_bom(bom_id: int, user: CurrentUser, request: Request, db: DB):
    b = _bom(db, bom_id)
    _ensure_editable(b)
    if b.status == BOM_FINAL:
        raise Conflict("This revision is already finalized. Use Resend to e-mail it again.", code="already_final")
    if not b.items:
        raise AppError("Add at least one material item before finalizing.", code="bom_empty")
    if not b.store_email:
        raise AppError("Enter the store's e-mail address before finalizing.", code="bom_no_recipient")
    b.status, b.revision = BOM_FINAL, b.revision + 1
    b.finalized_at, b.finalized_by_id = utcnow(), user.id
    pdf_name = f"{b.bom_number}-r{b.revision}-{secrets.token_hex(4)}.pdf"
    (pdf_dir() / pdf_name).write_bytes(render_bom_pdf(b))
    audit(db, "bom.finalized", user=user, entity_type="bom", entity_id=b.id, details={"revision": b.revision},
          ip=client_ip(request))
    db.flush()
    return _issue_link_and_email(db, b, user, pdf_name, client_ip(request))


@router.post("/boms/{bom_id}/resend", response_model=BomSendResultOut,
             summary="E-mail a fresh link to the latest finalized revision")
def resend_bom(bom_id: int, user: CurrentUser, request: Request, db: DB):
    b = _bom(db, bom_id)
    _ensure_editable(b)
    if b.status != BOM_FINAL:
        raise Conflict("Finalize the Bill of Materials first.", code="not_final")
    if not b.store_email:
        raise AppError("Enter the store's e-mail address first.", code="bom_no_recipient")
    last = next((link for link in b.links if link.revision == b.revision and (pdf_dir() / link.pdf_name).is_file()), None)
    if last:
        pdf_name = last.pdf_name
    else:  # frozen file missing (e.g. storage restored): re-freeze the current final revision
        pdf_name = f"{b.bom_number}-r{b.revision}-{secrets.token_hex(4)}.pdf"
        (pdf_dir() / pdf_name).write_bytes(render_bom_pdf(b))
    return _issue_link_and_email(db, b, user, pdf_name, client_ip(request))


# ───────────────────────── item photos ─────────────────────────

@router.post("/bom-images", response_model=BomImageOut, status_code=status.HTTP_201_CREATED)
async def upload_bom_image(user: CurrentUser, db: DB, file: UploadFile = File(...)):
    original = os.path.basename(file.filename or "photo")[:255]
    ext = original.rsplit(".", 1)[-1].lower() if "." in original else ""
    if ext not in IMAGE_TYPES:
        raise AppError("Item photos must be JPG, PNG or WEBP.", code="unsupported_media_type", status_code=415)
    data = await file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise AppError("Item photos must be 10 MB or smaller.", code="payload_too_large", status_code=413)
    if not _sniff_ok(ext, data[:16]):
        raise AppError("File contents don't match its extension.", code="unsupported_media_type", status_code=415)
    stored = f"{int(time.time())}_{secrets.token_hex(6)}.{ext}"
    (_image_dir() / stored).write_bytes(data)
    img = BomImage(stored_name=stored, original_name=original, content_type=IMAGE_TYPES[ext], size_bytes=len(data),
                   uploaded_by_id=user.id)
    db.add(img)
    db.commit()
    return BomImageOut(id=img.id, url=f"/api/v1/bom-images/{img.id}")


@router.get("/bom-images/{image_id}", response_class=FileResponse)
def get_bom_image(image_id: int, user: CurrentUser, db: DB):
    img = db.get(BomImage, image_id)
    path = (_image_dir() / img.stored_name).resolve() if img else None
    if not img or not path or _image_dir().resolve() not in path.parents or not path.is_file():
        raise NotFound("Photo not found.")
    return FileResponse(path, media_type=img.content_type,
                        headers={"Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff"})


# ───────────────────────── public link (from the e-mail) ─────────────────────────

_GONE_PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Link expired</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
<div style="max-width:440px;margin:24px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;text-align:center">
<div style="font-size:40px">&#9881;</div><h1 style="font-size:20px;margin:12px 0 8px">This link is no longer valid</h1>
<p style="color:#475569;line-height:1.55;margin:0">The Bill of Materials download link has expired or was withdrawn.
Please contact the Preventive Maintenance team and ask them to resend it.</p></div></body></html>"""


def _gone() -> Response:
    return Response(_GONE_PAGE, status_code=410, media_type="text/html",
                    headers={"Cache-Control": "no-store", "X-Robots-Tag": "noindex"})


@router.get("/public/bom/{token}", response_class=Response, include_in_schema=False)
def public_bom_pdf(token: str, request: Request, db: DB):
    if not (20 <= len(token) <= 100):
        return _gone()
    link = db.scalars(select(BomLink).where(BomLink.token_hash == _hash(token))).first()
    if (not link or link.revoked_at or link.expires_at <= utcnow() or link.bom.deleted_at is not None
            or link.bom.checklist.deleted_at is not None):
        return _gone()
    path = (pdf_dir() / link.pdf_name).resolve()
    if pdf_dir().resolve() not in path.parents or not path.is_file():
        return _gone()
    link.download_count += 1
    link.last_downloaded_at = utcnow()
    audit(db, "bom.link_downloaded", entity_type="bom", entity_id=link.bom_id, details={"revision": link.revision},
          ip=client_ip(request))
    db.commit()
    return _pdf_response(path.read_bytes(), f"{link.bom.bom_number}-rev{link.revision}.pdf", download=False)
