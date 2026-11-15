"""SQLAlchemy engine, session factory and declarative base."""

from collections.abc import Iterator
from datetime import datetime

from sqlalchemy import DateTime, MetaData, create_engine, func
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from app.core.config import get_settings

NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_name)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )


def _make_engine(url: str):
    kwargs: dict = {"pool_pre_ping": True, "future": True}
    if url.startswith("sqlite"):
        from sqlalchemy.pool import StaticPool

        kwargs = {"connect_args": {"check_same_thread": False}, "poolclass": StaticPool}
    else:
        kwargs.update(pool_recycle=1800, pool_size=10, max_overflow=20)
    return create_engine(url, **kwargs)


engine = _make_engine(get_settings().sqlalchemy_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def explain_connection_error(exc: BaseException) -> str | None:
    """Human-friendly hint for common MySQL connection failures (None if not one of them)."""
    s = get_settings()
    target = f"{s.db_user}@{s.db_host}:{s.db_port}/{s.db_name}" if not s.database_url else "DATABASE_URL"
    code = getattr(getattr(exc, "orig", None), "args", [None])[0]
    if code == 1045:
        return (f"MySQL rejected the login for {target} (wrong password or the user doesn't exist on this server).\n"
                "Fix DB_USER / DB_PASS / DB_PORT in .env, or create the user - see README 'Database user'.")
    if code == 1049:
        return f"Database '{s.db_name}' does not exist on {s.db_host}:{s.db_port}. Create it or fix DB_NAME in .env."
    if code in (2003, 2005):
        return f"Can't reach MySQL at {s.db_host}:{s.db_port}. Is the server running, and is DB_PORT correct?"
    return None


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def migration_status() -> tuple[str | None, str | None]:
    """(database revision, latest code revision) — differ when `alembic upgrade head` is pending."""
    from alembic.config import Config
    from alembic.runtime.migration import MigrationContext
    from alembic.script import ScriptDirectory

    from app.core.config import BACKEND_DIR

    head = ScriptDirectory.from_config(Config(str(BACKEND_DIR / "alembic.ini"))).get_current_head()
    with engine.connect() as conn:
        current = MigrationContext.configure(conn).get_current_revision()
    return current, head
