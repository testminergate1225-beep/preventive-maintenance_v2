from datetime import date, timedelta

import pytest

from tests.conftest import ApiClient, app, login, make_user

TODAY = date.today()
OLD = (TODAY - timedelta(days=400)).isoformat()
NEW = (TODAY - timedelta(days=3)).isoformat()

# endpoint, payload builder (by date), audit entity
DOCS = [
    ("/api/v1/load-balancing", lambda d, n: {"fileName": n, "circuitType": "three_wye", "vLn": 230, "testDate": d,
                                              "loads": [{"name": "#1", "value": 10, "phase": "AN"}]}, "load_balancing"),
    ("/api/v1/megger-tests", lambda d, n: {"fileName": n, "testDate": d, "rows": []}, "megger_test"),
    ("/api/v1/checklists", lambda d, n: {"branchName": n, "checklistDate": d, "categories": []}, "pm_checklist"),
]


def _client(email: str) -> ApiClient:
    c = ApiClient(app)
    assert login(c, email).status_code == 200
    return c


@pytest.fixture
def clients():
    make_user("admin@example.com", role="admin", name="Admin")
    make_user("tech@example.com", name="Tech")
    return _client("admin@example.com"), _client("tech@example.com")


@pytest.mark.parametrize("url,payload,entity", DOCS, ids=[d[2] for d in DOCS])
def test_document_archive_flow(clients, url, payload, entity):
    admin, tech = clients
    ids = []
    for d, n in [(OLD, "old"), (OLD, "old-2"), (NEW, "new")]:
        r = tech.post(url, json=payload(d, n))
        assert r.status_code == 201, r.text
        ids.append(r.json()["id"])
    old, old2, new = ids
    # Undated records fall back to their created date (today) for the cutoff; checklists always need a date.
    undated = tech.post(url, json=payload(NEW if entity == "pm_checklist" else "", "undated")).json()["id"]

    # Admin-only
    assert tech.post(f"{url}/archive", json={"ids": [old]}).status_code == 403
    # Preview by date, then archive by date
    cutoff = (TODAY - timedelta(days=30)).isoformat()
    assert admin.post(f"{url}/archive", json={"before": cutoff, "dryRun": True}).json() == {"count": 2}
    assert tech.get(url).json()["total"] == 4
    assert admin.post(f"{url}/archive", json={"before": cutoff, "reason": "FY2025"}).json() == {"count": 2}

    active = {i["id"] for i in tech.get(url).json()["items"]}
    assert active == {new, undated}
    archived = tech.get(url, params={"view": "archived"}).json()["items"]
    assert {i["id"] for i in archived} == {old, old2}
    assert archived[0]["archiveReason"] == "FY2025" and archived[0]["archivedByName"] == "Admin"
    assert tech.get(url, params={"view": "all"}).json()["total"] == 4

    # Archived = read-only but still viewable
    full = tech.get(f"{url}/{old}").json()
    assert full["archivedAt"]
    put = tech.put(f"{url}/{old}", json=payload(OLD, "edited"))
    assert put.status_code == 409 and put.json()["error"]["code"] == "archived"

    # Dashboard counts active only
    key = {"load_balancing": "loadBalancing", "megger_test": "meggerTests", "pm_checklist": "checklists"}[entity]
    assert tech.get("/api/v1/stats/dashboard").json()["counts"][key] == 2

    # Archive by ids; unarchive
    assert admin.post(f"{url}/archive", json={"ids": [new, old]}).json() == {"count": 1}  # old already archived
    assert admin.post(f"{url}/unarchive", json={"ids": [old, new]}).json() == {"count": 2}
    assert tech.put(f"{url}/{old}", json=payload(OLD, "edited")).status_code == 200
    assert tech.post(f"{url}/unarchive", json={"ids": [old2]}).status_code == 403

    actions = {e["action"] for e in admin.get("/api/v1/audit").json()["items"]}
    assert {f"{entity}.archived", f"{entity}.unarchived"} <= actions


def test_store_lists_are_not_archivable(clients):
    admin, _ = clients
    assert admin.post("/api/v1/store-lists/archive", json={"ids": [1]}).status_code in (404, 405)
