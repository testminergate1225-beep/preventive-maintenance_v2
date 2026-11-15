from tests.conftest import ApiClient, app, login, make_user

SNAPSHOT = {"areas": [{"id": "a1", "name": "NORTH 1", "locked": True,
                       "entries": [{"id": "e1", "storeType": "main", "branchName": "SM North"}]}]}


def _client(email: str) -> ApiClient:
    c = ApiClient(app)
    assert login(c, email).status_code == 200
    return c


def _setup():
    make_user("admin@example.com", role="admin", name="Admin")
    alice = make_user("alice@example.com", name="Alice")
    bob = make_user("bob@example.com", name="Bob")
    return _client("admin@example.com"), _client("alice@example.com"), _client("bob@example.com"), alice, bob


def test_only_admins_see_unshared_store_lists():
    admin, alice, _, _, _ = _setup()
    rec = admin.post("/api/v1/store-lists", json={"fileName": "March", "snapshot": SNAPSHOT}).json()
    assert admin.get("/api/v1/store-lists").json()["total"] == 1
    assert alice.get("/api/v1/store-lists").json()["total"] == 0
    # Not shared: indistinguishable from a missing list
    assert alice.get(f"/api/v1/store-lists/{rec['id']}").status_code == 404
    assert alice.put(f"/api/v1/store-lists/{rec['id']}", json={"fileName": "x", "snapshot": SNAPSHOT}).status_code == 404
    # Users can't create store lists or manage sharing
    assert alice.post("/api/v1/store-lists", json={"fileName": "Mine", "snapshot": SNAPSHOT}).status_code == 403
    assert alice.put(f"/api/v1/store-lists/{rec['id']}/shares", json={"userIds": []}).status_code == 403


def test_shared_user_can_view_and_edit_but_others_cannot():
    admin, alice, bob, a, _ = _setup()
    rec = admin.post("/api/v1/store-lists", json={"fileName": "March", "snapshot": SNAPSHOT}).json()
    shared = admin.put(f"/api/v1/store-lists/{rec['id']}/shares", json={"userIds": [a.id]})
    assert shared.status_code == 200 and [u["email"] for u in shared.json()] == ["alice@example.com"]

    listed = alice.get("/api/v1/store-lists").json()
    assert listed["total"] == 1 and listed["items"][0]["sharedWith"] == []  # who-else-has-access is admin-only
    assert admin.get("/api/v1/store-lists").json()["items"][0]["sharedWith"][0]["email"] == "alice@example.com"

    edited = alice.put(f"/api/v1/store-lists/{rec['id']}", json={"fileName": "March (Alice)", "snapshot": SNAPSHOT})
    assert edited.status_code == 200 and edited.json()["fileName"] == "March (Alice)"
    assert bob.get(f"/api/v1/store-lists/{rec['id']}").status_code == 404
    assert bob.get("/api/v1/store-lists").json()["total"] == 0
    # Shared users still can't delete
    assert alice.delete(f"/api/v1/store-lists/{rec['id']}").status_code == 403
    # Dashboard counts only what each person can see
    assert alice.get("/api/v1/stats/dashboard").json()["counts"]["storeLists"] == 1
    assert bob.get("/api/v1/stats/dashboard").json()["counts"]["storeLists"] == 0

    # Unshare -> access removed
    assert admin.put(f"/api/v1/store-lists/{rec['id']}/shares", json={"userIds": []}).json() == []
    assert alice.get(f"/api/v1/store-lists/{rec['id']}").status_code == 404
    actions = [e["action"] for e in admin.get("/api/v1/audit", params={"action": "store_list"}).json()["items"]]
    assert actions.count("store_list.shared") == 2


def test_share_validation():
    admin, _, _, a, _ = _setup()
    rec = admin.post("/api/v1/store-lists", json={"fileName": "March", "snapshot": SNAPSHOT}).json()
    url = f"/api/v1/store-lists/{rec['id']}/shares"
    assert admin.put(url, json={"userIds": [9999]}).status_code == 400
    me = admin.get("/api/v1/auth/me").json()
    assert admin.put(url, json={"userIds": [me["id"]]}).status_code == 400  # admins already see everything
    admin.patch(f"/api/v1/users/{a.id}", json={"isActive": False})
    assert admin.put(url, json={"userIds": [a.id]}).status_code == 400
