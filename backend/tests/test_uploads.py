from tests.conftest import ApiClient, app, login, make_user

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def _upload(c, name="photo.png", data=PNG, record_id=None):
    form = {"recordId": str(record_id)} if record_id else {}
    return c.post("/api/v1/uploads", files={"file": (name, data, "image/png")}, data=form)


def test_upload_view_trash_restore_purge(user_client):
    rec = user_client.post("/api/v1/maintenance", json={"task": "Panel photos", "branchCode": "FH-2"}).json()
    r = _upload(user_client, record_id=rec["id"])
    assert r.status_code == 201, r.text
    up = r.json()
    assert up["recordId"] == rec["id"] and up["contentType"] == "image/png" and up["sizeBytes"] == len(PNG)

    f = user_client.get(up["url"])
    assert f.status_code == 200 and f.content == PNG
    assert user_client.get(f"/api/v1/maintenance/{rec['id']}").json()["uploadCount"] == 1
    assert user_client.get("/api/v1/uploads", params={"q": "FH-2"}).json()["total"] == 1

    assert user_client.delete(f"/api/v1/uploads/{up['id']}").status_code == 204
    assert user_client.get("/api/v1/uploads").json()["total"] == 0
    assert user_client.get(up["url"]).status_code == 404  # trashed files hidden from non-admins
    assert user_client.post("/api/v1/uploads/restore", json={"ids": [up["id"]]}).status_code == 204
    assert user_client.get("/api/v1/uploads").json()["total"] == 1

    user_client.delete(f"/api/v1/uploads/{up['id']}")
    assert user_client.post("/api/v1/uploads/purge", json={"ids": [up["id"]]}).status_code == 403  # admin only
    make_user("admin@example.com", role="admin")
    admin = ApiClient(app)
    login(admin, "admin@example.com")
    assert admin.post("/api/v1/uploads/purge", json={"ids": [up["id"]]}).status_code == 204
    assert admin.get(up["url"]).status_code == 404


def test_upload_rejects_disguised_or_disallowed_files(user_client):
    assert _upload(user_client, "evil.png", b"<html><script>alert(1)</script>").status_code == 415
    assert _upload(user_client, "script.php", b"<?php echo 1;").status_code == 415


def test_upload_to_unknown_record_rejected(user_client):
    assert _upload(user_client, record_id=9999).status_code == 400


def test_files_require_authentication(user_client, client):
    up = _upload(user_client).json()
    anon = ApiClient(app)
    assert anon.get(up["url"]).status_code == 401
