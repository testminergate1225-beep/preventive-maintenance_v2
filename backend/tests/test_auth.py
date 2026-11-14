from datetime import timedelta

from sqlalchemy import select

from app.core.security import utcnow
from app.models import AuthToken, RefreshToken, User
from tests.conftest import PASSWORD, ApiClient, app, login, make_user

ME = "/api/v1/auth/me"


def test_login_sets_httponly_cookies_and_returns_user(client):
    make_user()
    r = login(client, "TECH@example.com")  # e-mail is case-insensitive
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["email"] == "tech@example.com"
    assert "passwordHash" not in body["user"]
    set_cookie = r.headers.get_list("set-cookie")
    access = next(c for c in set_cookie if c.startswith("epm_access="))
    refresh = next(c for c in set_cookie if c.startswith("epm_refresh="))
    assert "HttpOnly" in access and "HttpOnly" in refresh
    assert "Path=/api/v1/auth" in refresh
    assert client.get(ME).status_code == 200


def test_wrong_password_and_unknown_user_get_same_error(client):
    make_user()
    a = login(client, "tech@example.com", "wrong-password")
    b = login(client, "nobody@example.com", "wrong-password")
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json()
    assert a.json()["error"]["code"] == "invalid_credentials"


def test_user_without_password_cannot_log_in(client):
    make_user(password=None)
    assert login(client, "tech@example.com", "anything-at-all").status_code == 401


def test_account_locks_after_repeated_failures(client, db):
    from app.core.config import get_settings
    from app.core.rate_limit import limiter

    make_user()
    for _ in range(get_settings().max_failed_logins):
        login(client, "tech@example.com", "bad-password")
        limiter.reset()  # isolate the lockout logic from IP rate limiting
    r = login(client, "tech@example.com")  # correct password, but locked
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "account_locked"


def test_login_is_rate_limited(client):
    make_user()
    codes = [login(client, "tech@example.com", "bad-password").status_code for _ in range(9)]
    assert codes[-1] == 429


def test_protected_endpoint_requires_auth(client):
    assert client.get(ME).status_code == 401
    assert client.get("/api/v1/maintenance").status_code == 401


def test_csrf_header_required_for_state_changes(user_client):
    payload = {"task": "Inspect panel"}
    r = user_client.post("/api/v1/maintenance", json=payload, headers={"X-CSRF-Token": "forged"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "csrf_failed"
    r = user_client.post("/api/v1/maintenance", json=payload, headers={"X-CSRF-Token": ""})
    assert r.status_code == 403
    assert user_client.post("/api/v1/maintenance", json=payload).status_code == 201


def test_refresh_rotates_and_detects_reuse(client, db):
    make_user()
    login(client, "tech@example.com")
    old_refresh = client.cookies.get("epm_refresh", path="/api/v1/auth")
    r = client.post("/api/v1/auth/refresh")
    assert r.status_code == 200
    new_refresh = client.cookies.get("epm_refresh", path="/api/v1/auth")
    assert new_refresh and new_refresh != old_refresh

    # Replaying the rotated token after the grace window revokes the whole family.
    tok = db.scalar(select(RefreshToken).where(RefreshToken.rotated_at.is_not(None)))
    tok.rotated_at = utcnow() - timedelta(minutes=5)
    db.commit()
    attacker = ApiClient(app)
    attacker.cookies.set("epm_refresh", old_refresh, path="/api/v1/auth")
    attacker.cookies.set("epm_csrf", "x")
    assert attacker.post("/api/v1/auth/refresh").status_code == 401
    # The legitimate session's current refresh token is now revoked too.
    assert client.post("/api/v1/auth/refresh").status_code == 401


def test_logout_revokes_refresh_token(user_client):
    stolen = user_client.cookies.get("epm_refresh", path="/api/v1/auth")
    assert user_client.post("/api/v1/auth/logout").status_code == 204
    assert user_client.get(ME).status_code == 401  # cookies cleared
    replay = ApiClient(app)
    replay.cookies.set("epm_refresh", stolen, path="/api/v1/auth")
    replay.cookies.set("epm_csrf", "x")
    assert replay.post("/api/v1/auth/refresh").status_code == 401  # token revoked server-side


def test_forgot_password_does_not_reveal_accounts(client, db):
    make_user()
    a = client.post("/api/v1/auth/forgot-password", json={"email": "tech@example.com"})
    b = client.post("/api/v1/auth/forgot-password", json={"email": "ghost@example.com"})
    assert a.status_code == b.status_code == 202
    assert a.json() == b.json()
    assert db.scalar(select(AuthToken)).purpose == "reset"


def _issue_reset(email: str, purpose: str = "reset") -> str:
    from app.db import SessionLocal
    from app.services import auth as auth_service

    with SessionLocal() as s:
        user = auth_service.get_user_by_email(s, email)
        raw = auth_service.create_auth_token(s, user, purpose)
        s.commit()
        return raw


def test_reset_password_flow(client):
    make_user()
    other_device = ApiClient(app)
    login(other_device, "tech@example.com")

    raw = _issue_reset("tech@example.com")
    info = client.get("/api/v1/auth/reset-password/validate", params={"token": raw})
    assert info.status_code == 200 and info.json()["email"] == "tech@example.com"

    r = client.post("/api/v1/auth/reset-password", json={"token": raw, "password": "brand-new-pass"})
    assert r.status_code == 200
    # Single use
    again = client.post("/api/v1/auth/reset-password", json={"token": raw, "password": "another-pass1"})
    assert again.status_code == 400 and again.json()["error"]["code"] == "invalid_token"
    # Old password gone, new one works, other sessions signed out
    assert login(client, "tech@example.com", PASSWORD).status_code == 401
    assert login(client, "tech@example.com", "brand-new-pass").status_code == 200
    assert other_device.post("/api/v1/auth/refresh").status_code == 401


def test_expired_reset_token_rejected(client, db):
    make_user()
    raw = _issue_reset("tech@example.com")
    t = db.scalar(select(AuthToken))
    t.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    r = client.post("/api/v1/auth/reset-password", json={"token": raw, "password": "brand-new-pass"})
    assert r.status_code == 400


def test_new_reset_link_invalidates_previous(client):
    make_user()
    first = _issue_reset("tech@example.com")
    _issue_reset("tech@example.com")
    r = client.post("/api/v1/auth/reset-password", json={"token": first, "password": "brand-new-pass"})
    assert r.status_code == 400


def test_reset_rejects_short_password(client):
    make_user()
    raw = _issue_reset("tech@example.com")
    r = client.post("/api/v1/auth/reset-password", json={"token": raw, "password": "short"})
    assert r.status_code == 422


def test_change_password_keeps_current_session(user_client):
    r = user_client.post("/api/v1/auth/change-password",
                         json={"currentPassword": PASSWORD, "newPassword": "changed-pass-1"})
    assert r.status_code == 200
    assert user_client.get(ME).status_code == 200
    bad = user_client.post("/api/v1/auth/change-password",
                           json={"currentPassword": "nope-nope", "newPassword": "changed-pass-2"})
    assert bad.status_code == 401


def test_verify_password(user_client):
    assert user_client.post("/api/v1/auth/verify-password", json={"password": PASSWORD}).status_code == 204
    assert user_client.post("/api/v1/auth/verify-password", json={"password": "wrong"}).status_code == 401


def test_deactivated_user_loses_access_immediately(user_client, db):
    u = db.scalar(select(User))
    u.is_active = False
    db.commit()
    assert user_client.get(ME).status_code == 401
