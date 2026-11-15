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
    # Wye: each phase load × its own L-N voltage (230 V here); the 2 A neutral has no kVA.
    assert rec["kvaTotal"] == round((10 + 12.5 + 7.5) * 230 / 1000, 3)
    per_line = user_client.post("/api/v1/load-balancing", json={**payload, "vL1n": 231, "vL2n": "229", "vL3n": ""}).json()
    assert per_line["kvaTotal"] == round((10 * 231 + 12.5 * 229 + 7.5 * 230) / 1000, 3)
    # Per-line voltages round-trip with the exact keys the frontend uses.
    saved = user_client.get(f"/api/v1/load-balancing/{per_line['id']}").json()
    assert (saved["vL1n"], saved["vL2n"], saved["vL3n"]) == (231, 229, None)
    both = user_client.post("/api/v1/load-balancing", json={**payload, "vL1l2": 401, "vL1l3": 399, "vL2l3": 400}).json()
    assert (both["vL1l2"], both["vL1l3"], both["vL2l3"]) == (401, 399, 400)
    delta = user_client.post("/api/v1/load-balancing", json={**payload, "circuitType": "three_delta",
                                                             "loads": [{"name": "#1", "value": 10, "phase": "AB"}]}).json()
    assert delta["kvaTotal"] == round(math.sqrt(3) * 400 * 10 / 1000, 3)
    assert rec["testTime"] == "14:30:00"
    assert user_client.get("/api/v1/load-balancing", params={"q": "TW-01"}).json()["total"] == 4

    bad = user_client.post("/api/v1/load-balancing", json={**payload, "circuitType": "bogus"})
    assert bad.status_code == 422
    bad_pf = user_client.post("/api/v1/load-balancing", json={**payload, "pfA": 1.5})
    assert bad_pf.status_code == 422


def test_three_phase_loads(user_client):
    base = {"fileName": "LB-3PH", "vLl": 400, "vLn": 230}
    motor = {"name": "ACCU-1", "phase": "3PH", "ia": 10, "ib": 12, "ic": ""}
    wye = user_client.post("/api/v1/load-balancing", json={**base, "circuitType": "three_wye", "vL2n": 231,
                                                          "loads": [motor, {"name": "#1", "value": 5, "phase": "AN"}]})
    assert wye.status_code == 201, wye.text
    rec = wye.json()
    assert rec["loads"][0] == {"name": "ACCU-1", "value": 22, "phase": "3PH", "ia": 10, "ib": 12, "ic": 0}
    assert "ia" not in rec["loads"][1]
    assert (rec["phaseA"], rec["phaseB"], rec["phaseC"]) == (15, 12, 0)
    assert rec["kvaTotal"] == round((10 * 230 + 12 * 231 + 5 * 230) / 1000, 3)

    delta = user_client.post("/api/v1/load-balancing", json={**base, "circuitType": "three_delta",
                                                            "loads": [{"name": "M", "phase": "3PH", "ia": 10, "ib": 10, "ic": 10}]}).json()
    assert delta["kvaTotal"] == round(math.sqrt(3) * 400 * 10 / 1000, 3)  # balanced: √3·V·I
    # L1-L2 -> AB, L1-L3 -> CA, L2-L3 -> BC
    assert (delta["phaseA"], delta["phaseB"], delta["phaseC"]) == (10, 10, 10)

    # Only allowed on three-phase systems, and needs a current
    single = user_client.post("/api/v1/load-balancing", json={**base, "circuitType": "single_ln", "loads": [motor]})
    assert single.status_code == 422
    empty = user_client.post("/api/v1/load-balancing", json={**base, "circuitType": "three_wye",
                                                            "loads": [{"name": "x", "phase": "3PH", "ia": 0}]})
    assert empty.status_code == 422


def test_load_balancing_accepts_new_blank_form(user_client):
    """Payload shape the editor sends for a fresh form (all numbers null, texts empty)."""
    nums = ["mcb", "mainVoltage", "vLl", "vLn", "vPh", "vL1l2", "vL1l3", "vL2l3", "vL1n", "vL2n", "vL3n", "nameplateKw",
            "measVan", "measVbn", "measVcn", "measIa", "measIb", "measIc", "pfA", "pfB", "pfC"]
    texts = ["refId", "branchCode", "company", "location", "panel", "wires", "testDate", "testTime", "conductedBy",
             "witnessBy", "certifiedBy", "witnessTenant", "remarks"]
    payload = {"fileName": "LB_2026-11-15", "circuitType": "three_wye", "loads": [],
               **{k: None for k in nums}, **{k: "" for k in texts}}
    r = user_client.post("/api/v1/load-balancing", json=payload)
    assert r.status_code == 201, r.text
    assert r.json()["pfA"] is None and r.json()["kvaTotal"] is None
    # Blank strings for power factors are also fine; out-of-range still rejected with 422 (not 500).
    assert user_client.post("/api/v1/load-balancing", json={**payload, "pfA": "", "pfB": "0.9"}).status_code == 201
    assert user_client.post("/api/v1/load-balancing", json={**payload, "pfC": 2}).status_code == 422


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


def test_store_list_totals_follow_counting_rules(admin_client):
    entry = lambda i, **kw: {"id": f"e{i}", "storeType": "", "noRedemption": False, **kw}  # noqa: E731
    snapshot = {"areas": [
        {"id": "a1", "name": "NORTH 1", "locked": True,
         "entries": [entry(1, storeType="main"), entry(2, storeType="sat"), entry(3, noRedemption=True)]},
        {"id": "a2", "name": "SOUTH 1", "locked": True, "entries": [entry(4, storeType="main", branchName=None)]},
    ]}
    r = admin_client.post("/api/v1/store-lists", json={"fileName": "Store List - March 2026", "snapshot": snapshot,
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
