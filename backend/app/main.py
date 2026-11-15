import logging

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.v1 import auth, maintenance, stats, uploads, users
from app.api.v1 import store_lists
from app.api.v1.documents import checklist_router, load_balancing_router, megger_router
from app.core.config import get_settings
from app.core.errors import install_error_handlers
from app.db import engine, migration_status

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def create_app() -> FastAPI:
    settings = get_settings()
    settings.validate_for_runtime()

    docs = not settings.is_production
    app = FastAPI(
        title=f"{settings.app_name} API",
        version="2.0.0",
        docs_url="/api/docs" if docs else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if docs else None,
    )
    install_error_handlers(app)

    if settings.cors_origin_list:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origin_list,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
            allow_headers=["Content-Type", "X-CSRF-Token", "Authorization"],
        )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        if request.url.path.startswith("/api/v1/auth"):
            response.headers["Cache-Control"] = "no-store"
        return response

    v1 = APIRouter(prefix="/api/v1")
    for r in (auth.router, users.router, maintenance.router, uploads.router, stats.router,
              load_balancing_router, megger_router, checklist_router, store_lists.router):
        v1.include_router(r)
    app.include_router(v1)

    @app.on_event("startup")
    def warn_if_migrations_pending():
        if settings.sqlalchemy_url.startswith("sqlite"):
            return  # tests create tables directly
        try:
            current, head = migration_status()
        except Exception as e:  # noqa: BLE001 — never block startup on this check
            logging.getLogger("app").warning("Could not check database migrations: %s", e)
            return
        if current != head:
            logging.getLogger("app").error(
                "DATABASE IS NOT UP TO DATE (at %s, code expects %s). Run:  alembic upgrade head", current, head
            )

    @app.get("/api/health", tags=["health"])
    def health():
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            db_ok = True
        except Exception:  # noqa: BLE001
            db_ok = False
        migrations = "unknown"
        if db_ok and not settings.sqlalchemy_url.startswith("sqlite"):
            try:
                current, head = migration_status()
                migrations = "ok" if current == head else f"pending ({current} -> {head})"
            except Exception:  # noqa: BLE001
                pass
        ok = db_ok and migrations in ("ok", "unknown")
        return {"status": "ok" if ok else "degraded", "database": db_ok, "migrations": migrations}

    return app


app = create_app()
