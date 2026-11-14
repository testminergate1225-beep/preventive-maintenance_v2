from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlalchemy.exc import OperationalError

from app.core.config import get_settings
from app.db import Base, explain_connection_error
import app.models  # noqa: F401 — register models on Base.metadata

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# The database URL always comes from the application settings (environment / .env).
config.set_main_option("sqlalchemy.url", get_settings().sqlalchemy_url.replace("%", "%%"))
target_metadata = Base.metadata


def include_name(name, type_, parent_names):
    # legacy_* tables are the preserved pre-v2 backup; never manage them via autogenerate.
    return not (type_ == "table" and name and name.startswith("legacy_"))


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}), prefix="sqlalchemy.", poolclass=pool.NullPool
    )
    try:
        connection_cm = connectable.connect()
    except OperationalError as e:
        hint = explain_connection_error(e)
        if not hint:
            raise
        raise SystemExit(f"ERROR: {hint}") from None
    with connection_cm as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata, compare_type=True, include_name=include_name
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
