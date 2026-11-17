import io
from datetime import timedelta

import pytest
from PIL import Image

from app.core.security import utcnow
from app.db import SessionLocal
from app.models import BomLink
from app.services import email as mailer
from tests.conftest import ApiClient, app, login, make_user

CHECKLIST = {
    "branchName": "SM North EDSA", "branchCode": "TW-NE", "location": "Level 3", "checklistDate": "2026-11-10",
    "refNumber": "PM-20261110-101500",
    "categories": [{"category": "Panel Board", "subtitle": "", "items": [
        {"desc": "Breakers", "status": "not_ok", "remarks": "Tripping", "recommendations": "Replace 2 breakers"},
        {"desc": "Busbar", "status": "ok", "remarks": "", "recommendations": ""},
    ]}],
}
ITEMS = [
    {"name": "Circuit breaker 2P 30A", "partNumber": "BKR-2P30", "quantity": 2, "unit": "pc", "unitCost": "850",
     "finding": "Panel Board > Breakers", "description": "Bolt-on, 10kA"},
    {"name": "THHN wire 3.5mm²", "quantity": 15, "unit": "m", "unitCost": ""},
]


def _client(email: str) -> ApiClient:
    c = ApiClient(app)
    assert login(c, email).status_code == 200
    return c


@pytest.fixture
def ctx():
    make_user("admin@example.com", role="admin", name="Admin")
    make_user("tech@example.com", name="Tech One")
    make_user("tech2@example.com", name="Tech Two")
    admin, tech, tech2 = _client("admin@example.com"), _client("tech@example.com"), _client("tech2@example.com")
    cid = tech.post("/api/v1/checklists", json=CHECKLIST).json()["id"]
    return admin, tech, tech2, cid


def _png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (40, 30), (245, 158, 11)).save(buf, "PNG")
    return buf.getvalue()


def test_bom_lifecycle(ctx, monkeypatch):
    admin, tech, tech2, cid = ctx
    assert tech.get(f"/api/v1/checklists/{cid}/bom").status_code == 404

    # Photo upload (validated by content), then create the BOM linked to the checklist
    img = tech.post("/api/v1/bom-images", files={"file": ("breaker.png", _png(), "image/png")})
    assert img.status_code == 201, img.text
    assert tech.get(img.json()["url"]).status_code == 200
    bad = tech.post("/api/v1/bom-images", files={"file": ("x.png", b"<html>nope</html>", "image/png")})
    assert bad.status_code == 415

    items = [{**ITEMS[0], "imageId": img.json()["id"]}, ITEMS[1]]
    r = tech.post(f"/api/v1/checklists/{cid}/bom", json={"items": items})
    assert r.status_code == 201, r.text
    bom = r.json()
    assert bom["bomNumber"] == "BOM-20261110-101500" and bom["status"] == "draft" and bom["revision"] == 0
    assert bom["preparedBy"] == "Tech One" and bom["itemCount"] == 2
    assert bom["items"][0]["amount"] == 1700 and bom["items"][1]["unitCost"] is None
    assert tech.post(f"/api/v1/checklists/{cid}/bom", json={"items": []}).status_code == 409  # one per checklist

    # The checklist list shows the link
    summary = tech.get("/api/v1/checklists").json()["items"][0]
    assert summary["bomId"] == bom["id"] and summary["bomStatus"] == "draft"

    # Draft PDF renders (with photo)
    pdf = tech.get(f"/api/v1/boms/{bom['id']}/pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF") and pdf.headers["content-type"] == "application/pdf"

    # Finalize needs a store e-mail
    assert tech.post(f"/api/v1/boms/{bom['id']}/finalize").json()["error"]["code"] == "bom_no_recipient"
    bad_cc = tech.put(f"/api/v1/boms/{bom['id']}", json={"storeEmail": "store@example.com", "ccEmails": "nope", "items": items})
    assert bad_cc.status_code == 422
    tech.put(f"/api/v1/boms/{bom['id']}", json={"storeEmail": "store@example.com", "ccEmails": "boss@example.com; ops@example.com",
                                                "items": items})

    sent = []
    monkeypatch.setattr(mailer, "send_email", lambda *a, **k: sent.append((a, k)) or True)
    fin = tech.post(f"/api/v1/boms/{bom['id']}/finalize")
    assert fin.status_code == 200, fin.text
    res = fin.json()
    assert res["emailed"] is True and res["bom"]["status"] == "final" and res["bom"]["revision"] == 1
    assert res["link"].startswith("http://app.test/api/v1/public/bom/")
    (to, subject, text, html), kw = sent[0]
    assert to == "store@example.com" and kw["cc"] == ["boss@example.com", "ops@example.com"]
    assert "BOM-20261110-101500" in subject and res["link"] in text and res["link"] in html
    assert kw["mailbox"].from_name == "Preventive Maintenance"
    assert res["bom"]["emailedTo"] == "store@example.com, boss@example.com, ops@example.com"
    assert tech.post(f"/api/v1/boms/{bom['id']}/finalize").status_code == 409  # already final

    # Public link works without signing in, and serves the frozen revision
    token_path = res["link"].replace("http://app.test", "")
    anon = ApiClient(app)
    got = anon.get(token_path)
    assert got.status_code == 200 and got.content.startswith(b"%PDF")
    assert "BOM-20261110-101500-rev1.pdf" in got.headers["content-disposition"]
    assert anon.get("/api/v1/public/bom/" + "x" * 43).status_code == 410

    # Editing reopens as a draft; finalizing issues revision 2; the rev-1 link keeps serving rev 1
    edited = tech.put(f"/api/v1/boms/{bom['id']}", json={"storeEmail": "store@example.com", "items": items[:1]}).json()
    assert edited["status"] == "draft" and edited["revision"] == 1
    fin2 = tech.post(f"/api/v1/boms/{bom['id']}/finalize").json()
    assert fin2["bom"]["revision"] == 2 and len(fin2["bom"]["links"]) == 2
    assert anon.get(token_path).status_code == 200

    # Resend issues a fresh link to the same revision
    again = tech.post(f"/api/v1/boms/{bom['id']}/resend").json()
    assert again["bom"]["revision"] == 2 and again["link"] != fin2["link"]

    # Links expire
    with SessionLocal() as db:
        for link in db.query(BomLink).all():
            link.expires_at = utcnow() - timedelta(minutes=1)
        db.commit()
    assert anon.get(token_path).status_code == 410

    # Deleting: issued BOMs only by an admin; links stop working
    assert tech.delete(f"/api/v1/boms/{bom['id']}").status_code == 403
    assert admin.delete(f"/api/v1/boms/{bom['id']}").status_code == 204
    assert tech.get(f"/api/v1/boms/{bom['id']}").status_code == 404
    assert tech.get(f"/api/v1/checklists/{cid}/bom").status_code == 404
    # ...and a new BOM can be raised for the checklist
    assert tech.post(f"/api/v1/checklists/{cid}/bom", json={"items": ITEMS}).status_code == 201

    actions = {e["action"] for e in admin.get("/api/v1/audit").json()["items"]}
    assert {"bom.created", "bom.finalized", "bom.emailed", "bom.link_downloaded", "bom.deleted"} <= actions


def test_bom_without_smtp_still_gives_a_link(ctx):
    _, tech, _, cid = ctx
    bom = tech.post(f"/api/v1/checklists/{cid}/bom", json={"storeEmail": "store@example.com", "items": ITEMS}).json()
    res = tech.post(f"/api/v1/boms/{bom['id']}/finalize").json()
    assert res["emailed"] is False and "not configured" in res["message"]
    assert res["bom"]["status"] == "final" and res["bom"]["emailError"]
    assert ApiClient(app).get(res["link"].replace("http://app.test", "")).status_code == 200


def test_bom_permissions_and_archive(ctx):
    admin, tech, tech2, cid = ctx
    bom = tech.post(f"/api/v1/checklists/{cid}/bom", json={"items": ITEMS}).json()
    # Another user can't delete someone else's draft; the creator can
    assert tech2.delete(f"/api/v1/boms/{bom['id']}").status_code == 403
    # Archived checklist → BOM read-only
    admin.post("/api/v1/checklists/archive", json={"ids": [cid]})
    assert tech.put(f"/api/v1/boms/{bom['id']}", json={"items": ITEMS}).json()["error"]["code"] == "archived"
    assert tech.get(f"/api/v1/boms/{bom['id']}").status_code == 200
    admin.post("/api/v1/checklists/unarchive", json={"ids": [cid]})
    assert tech.delete(f"/api/v1/boms/{bom['id']}").status_code == 204
    # Validation
    assert tech.post(f"/api/v1/checklists/{cid}/bom", json={"items": [{"name": "x", "quantity": 0}]}).status_code == 422
    assert tech.post(f"/api/v1/checklists/{cid}/bom", json={"items": [{"name": "x", "imageId": 999}]}).status_code == 400


def test_recipient_suggestion(ctx, monkeypatch):
    _, tech, _, cid = ctx
    tech.post(f"/api/v1/checklists/{cid}/bom", json={"storeEmail": "ne@example.com", "ccEmails": "boss@example.com", "items": ITEMS})
    cid2 = tech.post("/api/v1/checklists", json={**CHECKLIST, "refNumber": "PM-20261117-090000"}).json()["id"]
    got = tech.get(f"/api/v1/checklists/{cid2}/bom/recipient").json()
    assert got == {"storeEmail": "ne@example.com", "ccEmails": "boss@example.com"}
