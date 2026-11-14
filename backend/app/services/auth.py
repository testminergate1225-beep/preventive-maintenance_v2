"""Authentication flows: login, refresh-token rotation, logout, password reset and invites."""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from urllib.parse import urlencode

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError, Unauthorized
from app.core.security import (
    create_access_token,
    hash_password,
    hash_token,
    needs_rehash,
    new_opaque_token,
    utcnow,
    verify_password,
)
from app.models import TOKEN_PURPOSE_INVITE, TOKEN_PURPOSE_RESET, AuthToken, RefreshToken, User
from app.services import email as mailer
from app.services.audit import audit

# Rotated refresh tokens presented again within this window are treated as a
# benign race (two tabs refreshing at once) instead of token theft.
REUSE_GRACE_SECONDS = 20


@dataclass
class IssuedSession:
    user: User
    access_token: str
    access_expires_at: datetime
    refresh_token: str
    refresh_expires_at: datetime
    remember: bool


def normalize_email(email: str) -> str:
    return email.strip().lower()


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == normalize_email(email)))


def _issue(db: Session, user: User, *, remember: bool, family_id: str | None, ip: str | None, ua: str | None) -> IssuedSession:
    s = get_settings()
    access, access_exp = create_access_token(subject=user.uuid, role=user.role)
    raw, digest = new_opaque_token()
    days = s.refresh_token_remember_days if remember else s.refresh_token_days
    expires = utcnow() + timedelta(days=days)
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=digest,
            family_id=family_id or str(uuid.uuid4()),
            remember=remember,
            expires_at=expires,
            ip_address=ip,
            user_agent=(ua or "")[:255] or None,
        )
    )
    return IssuedSession(user, access, access_exp.replace(tzinfo=None), raw, expires, remember)


def login(db: Session, *, email: str, password: str, remember: bool, ip: str | None, ua: str | None) -> IssuedSession:
    s = get_settings()
    user = get_user_by_email(db, email)
    now = utcnow()

    if user and user.locked_until and user.locked_until > now:
        verify_password(password, None)  # keep timing uniform
        minutes = max(1, int((user.locked_until - now).total_seconds() // 60) + 1)
        raise AppError(
            f"Too many failed sign-in attempts. Try again in about {minutes} minute(s), or reset your password.",
            code="account_locked",
            status_code=429,
        )

    ok = verify_password(password, user.password_hash if user else None)
    if not ok or not user or not user.is_active:
        if user:
            user.failed_login_count = (user.failed_login_count or 0) + 1
            if user.failed_login_count >= s.max_failed_logins:
                user.locked_until = now + timedelta(minutes=s.lockout_minutes)
                user.failed_login_count = 0
                audit(db, "auth.locked", user=user, ip=ip)
            audit(db, "auth.login_failed", user=user, ip=ip)
            db.commit()
        raise Unauthorized("Invalid email or password.", code="invalid_credentials")

    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = now
    if needs_rehash(user.password_hash or ""):
        user.password_hash = hash_password(password)
    session = _issue(db, user, remember=remember, family_id=None, ip=ip, ua=ua)
    audit(db, "auth.login", user=user, ip=ip)
    db.commit()
    return session


def refresh(db: Session, *, raw_token: str | None, ip: str | None, ua: str | None) -> IssuedSession:
    if not raw_token:
        raise Unauthorized("Session expired. Please sign in again.", code="session_expired")
    token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw_token)))
    now = utcnow()
    if not token:
        raise Unauthorized("Session expired. Please sign in again.", code="session_expired")

    if token.revoked_at or token.rotated_at:
        if token.rotated_at and not token.revoked_at and (now - token.rotated_at).total_seconds() <= REUSE_GRACE_SECONDS:
            raise Unauthorized("Session was refreshed elsewhere; retry.", code="session_stale")
        # A rotated token was replayed: assume theft and kill the whole family.
        db.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == token.family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        audit(db, "auth.refresh_reuse_detected", user_id=token.user_id, ip=ip)
        db.commit()
        raise Unauthorized("Session expired. Please sign in again.", code="session_expired")

    if token.expires_at <= now or not token.user.is_active:
        raise Unauthorized("Session expired. Please sign in again.", code="session_expired")

    token.rotated_at = now
    session = _issue(db, token.user, remember=token.remember, family_id=token.family_id, ip=ip, ua=ua)
    db.commit()
    return session


def logout(db: Session, *, raw_token: str | None, user: User | None, ip: str | None) -> None:
    if raw_token:
        token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw_token)))
        if token and not token.revoked_at:
            db.execute(
                update(RefreshToken)
                .where(RefreshToken.family_id == token.family_id, RefreshToken.revoked_at.is_(None))
                .values(revoked_at=utcnow())
            )
            user = user or token.user
    if user:
        audit(db, "auth.logout", user=user, ip=ip)
    db.commit()


def revoke_all_sessions(db: Session, user: User) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )


def set_password(db: Session, user: User, new_password: str) -> None:
    user.password_hash = hash_password(new_password)
    # Truncate to whole seconds: JWT 'iat' has second resolution.
    user.password_changed_at = utcnow().replace(microsecond=0)
    user.failed_login_count = 0
    user.locked_until = None
    revoke_all_sessions(db, user)


# ───────────────────────── One-time tokens (reset / invite) ─────────────────────────


def create_auth_token(db: Session, user: User, purpose: str, ip: str | None = None) -> str:
    s = get_settings()
    now = utcnow()
    # Only the newest link of a given purpose stays valid.
    db.execute(
        update(AuthToken)
        .where(AuthToken.user_id == user.id, AuthToken.purpose == purpose, AuthToken.used_at.is_(None))
        .values(used_at=now)
    )
    lifetime = (
        timedelta(hours=s.invite_token_hours) if purpose == TOKEN_PURPOSE_INVITE else timedelta(minutes=s.password_reset_minutes)
    )
    raw, digest = new_opaque_token()
    db.add(AuthToken(user_id=user.id, token_hash=digest, purpose=purpose, expires_at=now + lifetime, requested_ip=ip))
    return raw


def build_link(raw_token: str, purpose: str) -> str:
    base = get_settings().app_base_url.rstrip("/")
    params = {"token": raw_token}
    if purpose == TOKEN_PURPOSE_INVITE:
        params["invite"] = "1"
    return f"{base}/reset-password?{urlencode(params)}"


def get_valid_auth_token(db: Session, raw_token: str) -> AuthToken:
    token = db.scalar(select(AuthToken).where(AuthToken.token_hash == hash_token(raw_token)))
    if not token or token.used_at or token.expires_at <= utcnow() or not token.user.is_active:
        raise AppError(
            "This link is invalid or has expired. Please request a new one.", code="invalid_token", status_code=400
        )
    return token


def request_password_reset(db: Session, email: str, ip: str | None) -> tuple[str, str] | None:
    """Create a reset token if the account exists. Returns (link, recipient) or None.

    The caller must respond identically either way, so account existence never leaks.
    """
    user = get_user_by_email(db, email)
    if not user or not user.is_active:
        return None
    raw = create_auth_token(db, user, TOKEN_PURPOSE_RESET, ip)
    audit(db, "auth.password_reset_requested", user=user, ip=ip)
    db.commit()
    return build_link(raw, TOKEN_PURPOSE_RESET), user.email


def send_reset_email(link: str, to: str, name: str | None) -> None:
    mailer.send_password_reset(to, name, link, get_settings().password_reset_minutes)


def complete_password_reset(db: Session, raw_token: str, new_password: str, ip: str | None) -> User:
    token = get_valid_auth_token(db, raw_token)
    user = token.user
    set_password(db, user, new_password)
    token.used_at = utcnow()
    audit(db, "auth.password_reset" if token.purpose == TOKEN_PURPOSE_RESET else "auth.invite_accepted", user=user, ip=ip)
    db.commit()
    return user


def invite_user(db: Session, user: User, ip: str | None) -> tuple[str, bool]:
    """Create an invite link and try to e-mail it. Returns (link, emailed)."""
    raw = create_auth_token(db, user, TOKEN_PURPOSE_INVITE, ip)
    db.commit()
    link = build_link(raw, TOKEN_PURPOSE_INVITE)
    emailed = mailer.send_invite(user.email, user.full_name, link, get_settings().invite_token_hours)
    return link, emailed
