import os
import tempfile

# Configure an isolated environment BEFORE the app is imported.
# Set TEST_DATABASE_URL to run the suite against MySQL (the DB is wiped).
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "sqlite://")
os.environ["ENVIRONMENT"] = "test"
os.environ["SECRET_KEY"] = "test-secret-key-that-is-long-enough-1234567890"
os.environ["SMTP_HOST"] = ""
os.environ["UPLOAD_DIR"] = tempfile.mkdtemp(prefix="epm-uploads-")
os.environ["APP_BASE_URL"] = "http://app.test"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.rate_limit import limiter  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402

PASSWORD = "Sup3r-secret!"


class ApiClient(TestClient):
    """TestClient that echoes the CSRF cookie back as a header, like the real frontend."""

    def request(self, method, url, **kwargs):  # type: ignore[override]
        headers = dict(kwargs.pop("headers", None) or {})
        csrf = self.cookies.get("epm_csrf")
        if csrf and "X-CSRF-Token" not in headers:
            headers["X-CSRF-Token"] = csrf
        return super().request(method, url, headers=headers, **kwargs)


@pytest.fixture(autouse=True)
def _db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    limiter.reset()
    yield


@pytest.fixture
def db():
    with SessionLocal() as s:
        yield s


def make_user(email="tech@example.com", role="user", password=PASSWORD, active=True, name="Tech User") -> User:
    with SessionLocal() as s:
        u = User(email=email, full_name=name, role=role, is_active=active,
                 password_hash=hash_password(password) if password else None)
        s.add(u)
        s.commit()
        s.refresh(u)
        return u


def login(client: ApiClient, email: str, password: str = PASSWORD, remember: bool = False):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password, "remember": remember})


@pytest.fixture
def client():
    with ApiClient(app) as c:
        yield c


@pytest.fixture
def user_client(client):
    make_user()
    r = login(client, "tech@example.com")
    assert r.status_code == 200, r.text
    return client


@pytest.fixture
def admin_client():
    make_user("admin@example.com", role="admin", name="Admin")
    with ApiClient(app) as c:
        assert login(c, "admin@example.com").status_code == 200
        yield c
