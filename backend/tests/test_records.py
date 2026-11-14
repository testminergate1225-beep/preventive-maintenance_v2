import math
from datetime import date, timedelta

from tests.conftest import ApiClient, app, login, make_user


def test_maintenance_crud_and_filters(user_client):
    base = "/api/v1/maintenance"
    r = user_client.post(base, json={
        "branchCode": "TW-01", "branchName": "TOMSWORLD", "equipment": "Panel Board", "task": "Tighten lugs",
        "status": "Completed", "performedBy": "Johny Austria / Joseph Cristal", "performedOn": "2026-03-04T10:30:45.789Z",
        "nextDue": "", "notes": "",
    })
    assert r.status_code == 201, r.text
    rec = r.json()
    assert rec["performedOn"] == "2026-03-04" and rec["nextDue"] is None and rec["notes"] is None
    assert rec["createdByName"] == "Tech User"

    user_client.post(base, json={"task": "Replace tube", "equipment": "Lighting", "status": "Replaced",
                                 "nextDue": (date.today() - timedelta(days=1)).isoformat()})

    assert user_client.get(base).json()["total"] == 2
    assert user_client.get(base, params={"q": "lugs"}).json()["total"] == 1
    assert user_client.get(base, params={"status": "Replaced"}).json()["total"] == 1
    assert user_client.get(base, params={"due": "overdue"}).json()["total"] == 1
    assert user_client.get(base, params={"dateFrom": "2026-03-01", "dateTo": "2026-03-31"}).json()["total"] == 1

    # Update via PUT /{id} (the old PHP endpoint ignored the id and always failed)
    upd = user_client.put(f"{base}/{rec['id']}", json={**rec, "task": "Tighten lugs and torque check"})
    assert upd.status_code == 200 and upd.json()["task"] == "Tighten lugs and torque check"

    csv = user_client.get(f"{base}/export.csv")
    assert csv.status_code == 200 and "Tighten lugs and torque check" in csv.text


def test_maintenance_validation(user_client):
    r = user_client.post("/api/v1/maintenance", json={"task": ""})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"
    assert r.json()["error"]["details"][0]["field"] == "task"


def test_delete_is_admin_only_soft_and_restorable(user_client):
    rec = user_client.post("/api/v1/maintenance", json={"task": "Check UPS"}).json()
    assert user_client.delete(f"/api/v1/maintenance/{rec['id']}").status_code == 403

    make_user("admin@example.com", role="admin")
    admin = ApiClient(app)
    login(admin, "admin@example.com")
    assert admin.delete(f"/api/v1/maintenance/{rec['id']}").status_code == 204
    assert user_client.get(f"/api/v1/maintenance/{rec['id']}").status_code == 404
    assert user_client.get("/api/v1/maintenance").json()["total"] == 0
    assert admin.get("/api/v1/maintenance", params={"deleted": True}).json()["total"] == 1
    assert admin.post(f"/api/v1/maintenance/{rec['id']}/restore").status_code == 200
    assert user_client.get("/api/v1/maintenance").json()["total"] == 1


def test_load_balancing_totals_computed_on_server(user_client):
    payload = {
        "fileName": "LB_2026-03-04", "circuitType": "three_wye", "vLl": "400", "vLn": 230, "branchCode": "TW-01",
        "testDate": "2026-03-04", "testTime": "2:30 PM", "pfA": "0.95",
        "loads": [{"name": "#1", "value": 10, "phase": "AN"}, {"name": "#2", "value": 12.5, "phase": "BN"},
                  {"name": "#3", "value": 7.5, "phase": "CN"}, {"name": "Neutral Current", "value": 2, "phase": "N"}],
        # Client-sent totals are ignored in favour of server calculation:
        "totalLoad": 999, "kvaTotal": 999,
    }
    r = user_client.post("/api/v1/load-balancing", json=payload)
    assert r.status_code == 201, r.text
    rec = r.json()
    assert (rec["phaseA"], rec["phaseB"], rec["phaseC"]) == (10, 12.5, 7.5)
    assert rec["totalLoad"] == 32  # includes the neutral bucket, as the original form did
    assert rec["kvaTotal"] == round(math.sqrt(3) * 400 * 32 / 1000, 3)
    assert rec["testTime"] == "14:30:00"
    assert user_client.get("/api/v1/load-balancing", params={"q": "TW-01"}).json()["total"] == 1

    bad = user_client.post("/api/v1/load-balancing", json={**payload, "circuitType": "bogus"})
    assert bad.status_code == 422
    bad_pf = user_client.post("/api/v1/load-balancing", json={**payload, "pfA": 1.5})
    assert bad_pf.status_code == 422


def test_megger_rows_round_trip_with_original_keys(user_client):
    r = user_client.post("/api/v1/megger-tests", json={
        "fileName": "MTR-1", "company": "Tom & Joy Inc", "circuitType": "3phase-wye", "testDate": "2026-03-04",
        "rows": [
            {"panel": "LP-1", "branch": "1", "L1-L2": "550", "L1-N": "", "wire": "3.5 SQ MM, THHN", "remarks": "Passed"},
            {"panel": "LP-1", "branch": "2", "L1-L2": "120", "remarks": "Failed"},
        ],
    })
    assert r.status_code == 201, r.text
    rec = user_client.get(f"/api/v1/megger-tests/{r.json()['id']}").json()
    assert rec["rows"][0]["L1-L2"] == 550 and rec["rows"][0]["L1-N"] is None
    summary = user_client.get("/api/v1/megger-tests").json()["items"][0]
    assert summary["rowCount"] == 2 and summary["failedCount"] == 1


def test_checklist_requires_branch_and_date(user_client):
    assert user_client.post("/api/v1/checklists", json={"branchName": "TOMSWORLD"}).status_code == 422
    r = user_client.post("/api/v1/checklists", json={
        "branchName": "TOMSWORLD", "checklistDate": "2026-03-04", "refNumber": "PM-20260304101010",
        "categories": [{"category": "1. Panel Boards", "subtitle": "", "items": [
            {"desc": "a. Breaker temp", "status": "ok"}, {"desc": "b. Bolts", "status": "not_ok", "remarks": "loose"}]}],
    })
    assert r.status_code == 201, r.text
    s = user_client.get("/api/v1/checklists").json()["items"][0]
    assert (s["okCount"], s["notOkCount"]) == (1, 1)
    bad = user_client.post("/api/v1/checklists", json={"branchName": "X", "checklistDate": "2026-03-04",
                                                       "categories": [{"category": "c", "items": [{"status": "maybe"}]}]})
    assert bad.status_code == 422


def test_store_list_totals_follow_counting_rules(user_client):
    entry = lambda i, **kw: {"id": f"e{i}", "storeType": "", "noRedemption": False, **kw}  # noqa: E731
    snapshot = {"areas": [
        {"id": "a1", "name": "NORTH 1", "locked": True,
         "entries": [entry(1, storeType="main"), entry(2, storeType="sat"), entry(3, noRedemption=True)]},
        {"id": "a2", "name": "SOUTH 1", "locked": True, "entries": [entry(4, storeType="main", branchName=None)]},
    ]}
    r = user_client.post("/api/v1/store-lists", json={"fileName": "Store List - March 2026", "snapshot": snapshot,
                                                     "totalMain": 99})
    assert r.status_code == 201, r.text
    rec = r.json()
    assert (rec["totalMain"], rec["totalSat"], rec["totalRedemption"], rec["totalAreas"]) == (2, 1, 3, 2)


def test_dashboard_and_performers(user_client):
    today = date.today().isoformat()
    for who in ["Johny Austria / Joseph Cristal", "Johny Austria / Joseph Cristal", "Chris Neri"]:
        user_client.post("/api/v1/maintenance", json={"task": "t", "performedBy": who, "performedOn": today,
                                                      "status": "OK"})
    d = user_client.get("/api/v1/stats/dashboard").json()
    assert d["counts"]["maintenance"] == 3 and d["completedThisMonth"] == 3
    assert d["monthly"][-1]["count"] == 3 and len(d["monthly"]) == 12
    p = user_client.get("/api/v1/stats/performers").json()
    assert p[0] == {"performedBy": "Johny Austria / Joseph Cristal", "count": 2}
