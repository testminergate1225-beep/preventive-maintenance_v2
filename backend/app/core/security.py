"""Password hashing (Argon2id), JWT access tokens and opaque one-time tokens."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import get_settings

_hasher = PasswordHasher()  # Argon2id with library-recommended parameters
JWT_ALGORITHM = "HS256"

# A real hash of a random value, used to equalise timing when the user does not exist.
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(16))


def utcnow() -> datetime:
    """Naive UTC 'now' — all DATETIME columns store naive UTC."""
    return datetime.now(UTC).replace(tzinfo=None)


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash or not password_hash.startswith("$argon2"):
        # Burn comparable CPU time so missing users / legacy hashes aren't distinguishable by timing.
        try:
            _hasher.verify(_DUMMY_HASH, password)
        except VerificationError:
            pass
        return False
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


def create_access_token(*, subject: str, role: str, extra: dict[str, Any] | None = None) -> tuple[str, datetime]:
    s = get_settings()
    now = datetime.now(UTC)
    exp = now + timedelta(minutes=s.access_token_minutes)
    payload = {"sub": subject, "role": role, "type": "access", "iat": now, "exp": exp, **(extra or {})}
    return jwt.encode(payload, s.secret_key, algorithm=JWT_ALGORITHM), exp


def decode_access_token(token: str) -> dict[str, Any]:
    """Raises jwt.PyJWTError on any problem (expired, bad signature, wrong type)."""
    payload = jwt.decode(
        token, get_settings().secret_key, algorithms=[JWT_ALGORITHM], options={"require": ["sub", "exp", "iat"]}
    )
    if payload.get("type") != "access":
        raise jwt.InvalidTokenError("wrong token type")
    return payload


def new_opaque_token() -> tuple[str, str]:
    """Return (raw_token, sha256_hex). Only the hash is ever stored."""
    raw = secrets.token_urlsafe(32)
    return raw, hash_token(raw)


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
