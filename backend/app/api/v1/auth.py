from fastapi import APIRouter, BackgroundTasks, Query, Request, Response, status
from fastapi.responses import JSONResponse

from app.api.deps import (
    CSRF_COOKIE,
    DB,
    REFRESH_COOKIE,
    CurrentUser,
    check_csrf,
    clear_session_cookies,
    client_ip,
    set_session_cookies,
    user_agent,
)
from app.core.errors import Unauthorized
from app.core.rate_limit import limiter
from app.core.security import verify_password
from app.schemas import (
    ChangePasswordIn,
    ForgotPasswordIn,
    LoginIn,
    Message,
    ProfileUpdateIn,
    ResetPasswordIn,
    ResetTokenInfo,
    SessionOut,
    UserOut,
    VerifyPasswordIn,
)
from app.services import auth as auth_service
from app.services.audit import audit

router = APIRouter(prefix="/auth", tags=["auth"])


def _session_response(response: Response, s: auth_service.IssuedSession, csrf: str | None = None) -> SessionOut:
    set_session_cookies(
        response, access=s.access_token, refresh=s.refresh_token, refresh_expires=s.refresh_expires_at,
        remember=s.remember, csrf=csrf,
    )
    response.headers["Cache-Control"] = "no-store"
    return SessionOut(user=UserOut.model_validate(s.user), access_expires_at=s.access_expires_at)


@router.post("/login", response_model=SessionOut, summary="Sign in with e-mail and password")
def login(body: LoginIn, request: Request, response: Response, db: DB):
    ip = client_ip(request)
    limiter.hit(f"login-ip:{ip}", limit=30, window_seconds=300)
    limiter.hit(f"login:{ip}:{body.email.lower()}", limit=8, window_seconds=300)
    session = auth_service.login(
        db, email=body.email, password=body.password, remember=body.remember, ip=ip, ua=user_agent(request)
    )
    return _session_response(response, session)


@router.post("/refresh", response_model=SessionOut, summary="Rotate the refresh token and issue a new access token")
def refresh(request: Request, response: Response, db: DB):
    check_csrf(request)
    try:
        session = auth_service.refresh(
            db, raw_token=request.cookies.get(REFRESH_COOKIE), ip=client_ip(request), ua=user_agent(request)
        )
    except Unauthorized as e:
        # Build the error response here so dead session cookies get cleared with it.
        failed = JSONResponse({"error": {"code": e.code, "message": e.message}}, status_code=401)
        if e.code != "session_stale":
            clear_session_cookies(failed)
        return failed
    return _session_response(response, session, csrf=request.cookies.get(CSRF_COOKIE))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, summary="Sign out this session")
def logout(request: Request, response: Response, db: DB):
    check_csrf(request)
    auth_service.logout(db, raw_token=request.cookies.get(REFRESH_COOKIE), user=None, ip=client_ip(request))
    clear_session_cookies(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(body: ProfileUpdateIn, user: CurrentUser, request: Request, db: DB):
    user.full_name = body.full_name
    audit(db, "user.profile_updated", user=user, entity_type="user", entity_id=user.id, ip=client_ip(request))
    db.commit()
    return user


@router.post("/verify-password", status_code=status.HTTP_204_NO_CONTENT,
             summary="Re-confirm the current user's password (step-up check before sensitive actions)")
def verify_current_password(body: VerifyPasswordIn, user: CurrentUser, request: Request):
    limiter.hit(f"verify:{user.id}", limit=10, window_seconds=300)
    if not verify_password(body.password, user.password_hash):
        raise Unauthorized("Incorrect password.", code="invalid_password")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/change-password", response_model=SessionOut)
def change_password(body: ChangePasswordIn, user: CurrentUser, request: Request, response: Response, db: DB):
    limiter.hit(f"change-pw:{user.id}", limit=10, window_seconds=300)
    if not verify_password(body.current_password, user.password_hash):
        raise Unauthorized("Current password is incorrect.", code="invalid_password")
    auth_service.set_password(db, user, body.new_password)  # also signs out every other session
    audit(db, "auth.password_changed", user=user, ip=client_ip(request))
    session = auth_service._issue(db, user, remember=False, family_id=None, ip=client_ip(request), ua=user_agent(request))
    db.commit()
    return _session_response(response, session)


@router.post("/forgot-password", response_model=Message, status_code=status.HTTP_202_ACCEPTED,
             summary="E-mail a time-limited password reset link")
def forgot_password(body: ForgotPasswordIn, request: Request, background: BackgroundTasks, db: DB):
    ip = client_ip(request)
    limiter.hit(f"forgot-ip:{ip}", limit=10, window_seconds=900)
    limiter.hit(f"forgot:{body.email.lower()}", limit=3, window_seconds=900)
    result = auth_service.request_password_reset(db, body.email, ip)
    if result:
        link, to = result
        user = auth_service.get_user_by_email(db, to)
        background.add_task(auth_service.send_reset_email, link, to, user.full_name if user else None)
    # Identical response whether or not the account exists.
    return Message(message="If an account exists for that e-mail, a reset link is on its way.")


@router.get("/reset-password/validate", response_model=ResetTokenInfo)
def validate_reset_token(request: Request, db: DB, token: str = Query(min_length=20, max_length=200)):
    limiter.hit(f"reset-validate:{client_ip(request)}", limit=30, window_seconds=300)
    t = auth_service.get_valid_auth_token(db, token)
    return ResetTokenInfo(email=t.user.email, full_name=t.user.full_name, purpose=t.purpose, expires_at=t.expires_at)


@router.post("/reset-password", response_model=Message)
def reset_password(body: ResetPasswordIn, request: Request, db: DB):
    limiter.hit(f"reset:{client_ip(request)}", limit=10, window_seconds=300)
    auth_service.complete_password_reset(db, body.token, body.password, client_ip(request))
    return Message(message="Your password has been set. You can now sign in.")
