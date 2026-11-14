"""Shared request dependencies: DB session, current user, admin guard, CSRF protection."""

import hmac
import secrets
from datetime import UTC, datetime
from typing import Annotated

import jwt
from fastapi import Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import Forbidden, Unauthorized
from app.core.security import decode_access_token
from app.db import get_db
from app.models import User

ACCESS_COOKIE = "epm_access"
REFRESH_COOKIE = "epm_refresh"
CSRF_COOKIE = "epm_csrf"
CSRF_HEADER = "X-CSRF-Token"
REFRESH_COOKIE_PATH = "/api/v1/auth"

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

DB = Annotated[Session, Depends(get_db)]


def client_ip(request: Request) -> str | None:
    # uvicorn's --proxy-headers populates request.client from X-Forwarded-For
    # when the request comes from a trusted proxy (see Dockerfile / README).
    return request.client.host if request.client else None


def user_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


def _bearer(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip() or None
    return None


def check_csrf(request: Request) -> None:
    """Double-submit cookie check for cookie-authenticated, state-changing requests."""
    if request.method in SAFE_METHODS or _bearer(request):
        return
    cookie = request.cookies.get(CSRF_COOKIE)
    header = request.headers.get(CSRF_HEADER)
    if not cookie or not header or not hmac.compare_digest(cookie, header):
        raise Forbidden("Missing or invalid CSRF token. Reload the page and try again.", code="csrf_failed")


def get_current_user(request: Request, db: DB) -> User:
    token = _bearer(request) or request.cookies.get(ACCESS_COOKIE)
    if not token:
        raise Unauthorized("Not signed in.", code="not_authenticated")
    try:
        payload = decode_access_token(token)
    except jwt.ExpiredSignatureError:
        raise Unauthorized("Session expired.", code="token_expired") from None
    except jwt.PyJWTError:
        raise Unauthorized("Invalid session.", code="invalid_token") from None

    user = db.scalar(select(User).where(User.uuid == payload["sub"]))
    if not user or not user.is_active:
        raise Unauthorized("Account is disabled or no longer exists.", code="account_disabled")
    if user.password_changed_at:
        issued = datetime.fromtimestamp(int(payload["iat"]), UTC).replace(tzinfo=None)
        if issued < user.password_changed_at:
            raise Unauthorized("Password was changed. Please sign in again.", code="token_revoked")

    check_csrf(request)
    request.state.user = user
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_admin(user: CurrentUser) -> User:
    if not user.is_admin:
        raise Forbidden("Administrator access is required.")
    return user


AdminUser = Annotated[User, Depends(require_admin)]


# ───────────────────────── Cookie helpers ─────────────────────────


def set_session_cookies(
    response: Response, *, access: str, refresh: str, refresh_expires: datetime, remember: bool, csrf: str | None = None
) -> None:
    """Set the three session cookies. Pass the existing `csrf` value on refresh so
    in-flight requests carrying the old header don't fail."""
    s = get_settings()
    common = {"secure": s.secure_cookies, "domain": s.cookie_domain}
    refresh_max_age = int((refresh_expires - datetime.now(UTC).replace(tzinfo=None)).total_seconds())
    # Access token: short-lived, sent to every API call.
    response.set_cookie(
        ACCESS_COOKIE, access, httponly=True, samesite="lax", path="/api",
        max_age=s.access_token_minutes * 60, **common,
    )
    # Refresh token: only ever sent to the auth endpoints. Session cookie unless "remember me".
    response.set_cookie(
        REFRESH_COOKIE, refresh, httponly=True, samesite="strict", path=REFRESH_COOKIE_PATH,
        max_age=refresh_max_age if remember else None, **common,
    )
    # CSRF token: readable by JS, echoed back in the X-CSRF-Token header.
    response.set_cookie(
        CSRF_COOKIE, csrf or secrets.token_urlsafe(24), httponly=False, samesite="strict", path="/",
        max_age=refresh_max_age if remember else None, **common,
    )


def clear_session_cookies(response: Response) -> None:
    s = get_settings()
    for name, path in ((ACCESS_COOKIE, "/api"), (REFRESH_COOKIE, REFRESH_COOKIE_PATH), (CSRF_COOKIE, "/")):
        response.delete_cookie(name, path=path, domain=s.cookie_domain, secure=s.secure_cookies)
