"""Application settings, loaded from environment variables (and an optional .env file).

Every secret (database password, JWT signing key, SMTP credentials) comes from the
environment. Nothing sensitive is hard-coded here.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, computed_field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(PROJECT_DIR / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── General ──────────────────────────────────────────────────────────
    app_name: str = "EPM System"
    environment: str = Field(default="development", description="development | production | test")
    # Public URL of the frontend; used to build links in e-mails.
    app_base_url: str = "http://localhost:5173"
    # Comma-separated list of allowed CORS origins (only needed when the
    # frontend is served from a different origin than the API).
    cors_origins: str = ""

    # ── Database ─────────────────────────────────────────────────────────
    # Either set DATABASE_URL directly, or the individual DB_* parts.
    database_url: str | None = None
    db_host: str = "127.0.0.1"
    db_port: int = 3306
    db_name: str = "pm_db1"
    db_user: str = "pm_user"
    db_pass: str = ""

    # ── Auth / tokens ────────────────────────────────────────────────────
    secret_key: str = Field(default="", description="HMAC key for JWTs. REQUIRED in production.")
    access_token_minutes: int = 15
    refresh_token_days: int = 7
    refresh_token_remember_days: int = 30
    password_reset_minutes: int = 45
    invite_token_hours: int = 72
    max_failed_logins: int = 10
    lockout_minutes: int = 15
    # Cookies are marked Secure in production (HTTPS). Override if needed.
    cookie_secure: bool | None = None
    cookie_domain: str | None = None

    # ── SMTP (password reset / invite e-mails) ───────────────────────────
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = "Password Reset"
    smtp_starttls: bool = True
    smtp_timeout_seconds: int = 20

    # ── SMTP for Bill of Materials e-mails (separate mailbox) ────────────
    bom_smtp_host: str = ""
    bom_smtp_port: int = 587
    bom_smtp_username: str = ""
    bom_smtp_password: str = ""
    bom_smtp_from_email: str = ""
    bom_smtp_from_name: str = "Preventive Maintenance"
    bom_smtp_starttls: bool = True
    # How long the PDF download link in a BOM e-mail stays valid.
    bom_link_days: int = 30

    # ── Uploads ──────────────────────────────────────────────────────────
    upload_dir: Path = PROJECT_DIR / "uploads"
    max_upload_mb: int = 200

    @field_validator("upload_dir", mode="before")
    @classmethod
    def _resolve_upload_dir(cls, v: str | Path) -> Path:
        p = Path(v)
        return p if p.is_absolute() else (PROJECT_DIR / p).resolve()

    @computed_field  # type: ignore[prop-decorator]
    @property
    def sqlalchemy_url(self) -> str:
        if self.database_url:
            return self.database_url
        from urllib.parse import quote_plus

        return (
            f"mysql+pymysql://{quote_plus(self.db_user)}:{quote_plus(self.db_pass)}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}?charset=utf8mb4"
        )

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def secure_cookies(self) -> bool:
        return self.is_production if self.cookie_secure is None else self.cookie_secure

    @property
    def smtp_enabled(self) -> bool:
        return bool(self.smtp_host and self.smtp_from_email)

    @property
    def bom_smtp_enabled(self) -> bool:
        return bool(self.bom_smtp_host and self.bom_smtp_from_email)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    def validate_for_runtime(self) -> None:
        """Fail fast on dangerous configuration."""
        if self.is_production and len(self.secret_key) < 32:
            raise RuntimeError("SECRET_KEY must be set to a random string of at least 32 characters in production.")


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if not s.secret_key and not s.is_production:
        # Development convenience only: a per-process random key means tokens
        # are invalidated on every restart. Production refuses to start.
        import secrets

        s.secret_key = secrets.token_urlsafe(48)
    return s
