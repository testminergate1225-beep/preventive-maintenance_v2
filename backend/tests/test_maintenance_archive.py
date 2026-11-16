from datetime import date, timedelta

from tests.conftest import ApiClient, app, login, make_user

MT = "/api/v1/maintenance"


def _client(email: str) -> ApiClient:
    c = ApiClient(app)
    assert login(c, email).status_code == 200
    return c


def _setup():
    make_user("admin@example.com", role="admin", name="Admin")
    make_user("tech@example.com", name="Tech")
    admin, tech = _client("admin@example.com"), _client("tech@example.com")
    today = date.today()
    ids = []
    for days_ago, task in [(400, "old PM"), (200, "mid PM"), (5, "recent PM")]:
        r = tech.post(MT, json={"task": task, "performedOn": (today - timedelta(days=days_ago)).isoformat(),
                                "nextDue": (today - timedelta(days=1)).isoformat(), "performedBy": "A / B"})
        assert r.status_code == 201, r.text
        ids.append(r.json()["id"])
    return admin, tech, ids


def test_archive_by_ids_and_views():
    admin, tech, (old, mid, recent) = _setup()
    assert tech.post(f"{MT}/archive", json={"ids": [old]}).status_code == 403  # admins only

    r = admin.post(f"{MT}/archive", json={"ids": [old, mid], "reason": "FY2025 closed"})
    assert r.status_code == 200 and r.json() == {"count": 2}
    # Archiving again is a no-op
    assert admin.post(f"{MT}/archive", json={"ids": [old]}).json() == {"count": 0}

    active = tech.get(MT).json()
    assert [i["id"] for i in active["items"]] == [recent]
    archived = tech.get(MT, params={"view": "archived", "sort": "-archivedAt"}).json()
    assert {i["id"] for i in archived["items"]} == {old, mid}
    item = archived["items"][0]
    assert item["archiveReason"] == "FY2025 closed" and item["archivedByName"] == "Admin" and item["archivedAt"]
    assert tech.get(MT, params={"view": "all"}).json()["total"] == 3
    # Anyone can still open an archived record
    assert tech.get(f"{MT}/{old}").json()["archivedAt"]

    # Read-only while archived: no edits, no attachments
    put = tech.put(f"{MT}/{old}", json={"task": "changed"})
    assert put.status_code == 409 and put.json()["error"]["code"] == "archived"
    up = tech.post("/api/v1/uploads", files={"file": ("a.png", b"\x89PNG\r\n\x1a\n" + b"0" * 32, "image/png")},
                   data={"recordId": str(old)})
    assert up.status_code == 409

    # Dashboard: archived records leave due tracking but stay in history
    dash = tech.get("/api/v1/stats/dashboard").json()
    assert dash["counts"]["maintenance"] == 1 and dash["counts"]["maintenanceArchived"] == 2
    assert dash["overdue"] == 1
    assert sum(p["count"] for p in tech.get("/api/v1/stats/performers").json()) == 3

    # Export follows the view
    csv = tech.get(f"{MT}/export.csv", params={"view": "archived"})
    assert "maintenance_archive_" in csv.headers["content-disposition"]
    assert "FY2025 closed" in csv.text and "recent PM" not in csv.text

    # Unarchive
    assert tech.post(f"{MT}/unarchive", json={"ids": [old]}).status_code == 403
    assert admin.post(f"{MT}/unarchive", json={"ids": [old]}).json() == {"count": 1}
    back = tech.get(f"{MT}/{old}").json()
    assert back["archivedAt"] is None and back["archiveReason"] is None
    assert tech.put(f"{MT}/{old}", json={"task": "editable again"}).status_code == 200

    actions = [e["action"] for e in admin.get("/api/v1/audit").json()["items"]]
    assert "maintenance.archived" in actions and "maintenance.unarchived" in actions


def test_archive_before_date_with_preview():
    admin, tech, (old, mid, recent) = _setup()
    cutoff = (date.today() - timedelta(days=100)).isoformat()
    preview = admin.post(f"{MT}/archive", json={"before": cutoff, "dryRun": True}).json()
    assert preview == {"count": 2}
    assert tech.get(MT).json()["total"] == 3  # dry run changed nothing
    assert admin.post(f"{MT}/archive", json={"before": cutoff}).json() == {"count": 2}
    assert [i["id"] for i in tech.get(MT).json()["items"]] == [recent]

    # Exactly one of ids / before
    assert admin.post(f"{MT}/archive", json={}).status_code == 422
    assert admin.post(f"{MT}/archive", json={"ids": [recent], "before": cutoff}).status_code == 422


def test_deleted_archived_records_stay_out_of_archive():
    admin, tech, (old, _, _) = _setup()
    admin.post(f"{MT}/archive", json={"ids": [old]})
    assert admin.delete(f"{MT}/{old}").status_code == 204
    assert tech.get(MT, params={"view": "archived"}).json()["total"] == 0
    assert old in [i["id"] for i in admin.get(MT, params={"deleted": "true"}).json()["items"]]
    # Restoring from the deleted bin returns it to the archive, where it was
    admin.post(f"{MT}/{old}/restore")
    assert tech.get(MT, params={"view": "archived"}).json()["total"] == 1
