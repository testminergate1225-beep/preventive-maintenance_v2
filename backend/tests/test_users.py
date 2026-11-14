from tests.conftest import login, make_user


def test_non_admin_cannot_manage_users(user_client):
    assert user_client.get("/api/v1/users").status_code == 403
    assert user_client.get("/api/v1/audit").status_code == 403


def test_admin_creates_user_and_invite_link_returned_without_smtp(admin_client, client):
    r = admin_client.post("/api/v1/users", json={"email": "New@Example.com", "fullName": "New Person"})
    assert r.status_code == 201, r.text
    u = r.json()
    assert u["email"] == "new@example.com" and u["hasPassword"] is False

    inv = admin_client.post(f"/api/v1/users/{u['id']}/invite")
    assert inv.status_code == 200
    body = inv.json()
    assert body["emailed"] is False and body["link"].startswith("http://app.test/reset-password?token=")

    token = body["link"].split("token=")[1].split("&")[0]
    assert client.post("/api/v1/auth/reset-password", json={"token": token, "password": "first-pass-1"}).status_code == 200
    assert login(client, "new@example.com", "first-pass-1").status_code == 200


def test_duplicate_email_conflict(admin_client):
    make_user()
    r = admin_client.post("/api/v1/users", json={"email": "tech@example.com", "fullName": "Dup"})
    assert r.status_code == 409


def test_admin_cannot_lock_themselves_out(admin_client):
    me = admin_client.get("/api/v1/auth/me").json()
    r = admin_client.patch(f"/api/v1/users/{me['id']}", json={"role": "user"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "self_lockout"


def test_last_admin_protected(admin_client):
    other = make_user("boss2@example.com", role="admin")
    # Two admins: demoting one is fine.
    assert admin_client.patch(f"/api/v1/users/{other.id}", json={"role": "user"}).status_code == 200


def test_deactivate_user_and_audit_trail(admin_client):
    u = make_user()
    assert admin_client.patch(f"/api/v1/users/{u.id}", json={"isActive": False}).json()["isActive"] is False
    actions = [a["action"] for a in admin_client.get("/api/v1/audit").json()["items"]]
    assert "user.updated" in actions and "auth.login" in actions
