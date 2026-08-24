import secrets

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
import logging

from app.core.config import settings
from app.core.security import create_access_token
from app.core.ratelimit import OtpRateLimitError
from app.services.auth_service import (
    authenticate_user,
    build_google_auth_url,
    exchange_google_code,
    oauth_login_or_create,
    register_user,
    resend_signup_otp,
    verify_user_signup_otp,
    request_password_reset,
    reset_password_with_otp,
)
from app.models.user import (
    UserCreate,
    UserLogin,
    UserResendOtp,
    UserVerifySignup,
    ForgotPasswordRequest,
    ResetPasswordPayload,
)

router = APIRouter()
logger = logging.getLogger(__name__)


COOKIE_NAME = "access_token"
REFRESH_COOKIE_NAME = "refresh_token"


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=60 * 60 * 24,
    )


@router.post("/register", status_code=status.HTTP_201_CREATED)
def api_register(payload: UserCreate):
    """Start registration by generating OTP and sending it to email"""
    logger.info("Registration OTP request received")
    try:
        user = register_user(payload.username, payload.password)
    except OtpRateLimitError as exc:
        logger.warning(f"Rate limit exceeded for registration: {payload.username}")
        response = Response(status_code=429)
        response.headers["Retry-After"] = str(exc.retry_after_seconds)
        return response
    except RuntimeError as exc:
        logger.error(f"Service unavailable during registration: {str(exc)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    if not user:
        logger.warning("Registration failed: User already exists and verified")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User already exists",
        )

    logger.info("Registration OTP sent successfully")
    return {
        "message": "OTP sent to your email. Verify to complete registration.",
        "user": user,
    }


@router.post("/register/verify", status_code=status.HTTP_200_OK)
def api_verify_register(payload: UserVerifySignup):
    """Verify OTP and activate user account"""
    logger.info("Registration OTP verification request received")
    try:
        result = verify_user_signup_otp(payload.username, payload.otp)
    except RuntimeError as exc:
        logger.error(f"Service unavailable during OTP verification: {str(exc)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if result.get("error") == "OTP expired":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP expired. Please register again to receive a new OTP.",
        )

    if result.get("error") == "Invalid OTP":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OTP",
        )

    return {
        "message": "Email verified successfully. You can now log in.",
        "user": result,
    }


@router.post("/register/resend-otp", status_code=status.HTTP_200_OK)
def api_resend_register_otp(payload: UserResendOtp):
    """Resend OTP for existing users that are not verified yet."""
    logger.info("Registration OTP resend request received")
    try:
        result = resend_signup_otp(payload.username)
    except OtpRateLimitError as exc:
        logger.warning(f"Rate limit exceeded for OTP resend: {payload.username}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc
    except RuntimeError as exc:
        logger.error(f"Service unavailable during OTP resend: {str(exc)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if result.get("error") == "already_verified":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is already verified. Please log in.",
        )

    return {
        "message": "A new OTP has been sent to your email.",
        "user": result,
    }


@router.post("/login")
async def api_login(request: Request, response: Response):
    """
    API login endpoint
    - Used by UI or API clients
    - Supports form and JSON requests
    - Returns JWT and sets session cookie
    """
    logger.info("Login request received")
    content_type = request.headers.get("content-type", "")
    username = ""
    password = ""

    if "application/json" in content_type:
        body = await request.json()
        payload = UserLogin(**body)
        username = payload.username
        password = payload.password
        logger.debug("JSON login attempt received")
    else:
        form = await request.form()
        username = form.get("username", "")
        password = form.get("password", "")
        logger.debug("Form login attempt received")

    if not username or not password:
        logger.warning("Login failed: Missing username or password")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="username and password are required",
        )

    try:
        user = authenticate_user(username, password)
    except RuntimeError as exc:
        logger.error(f"Service unavailable during login: {str(exc)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    if not user:
        logger.warning("Login failed: Invalid credentials")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if user.get("requires_verification"):
        logger.warning("Login failed: User email not verified")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Please verify your email using OTP.",
        )

    token = create_access_token({
        "username": user["username"],
        "role": user["role"],
        "tenant_id": user.get("tenant_id", user["username"]),
    })

    _set_session_cookie(response, token)

    logger.info(f"User logged in successfully: {username}")
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user["role"],
    }


@router.post("/logout")
def api_logout(request: Request, response: Response):
    """Log out the current user. Also revokes any active refresh token."""
    from app.services.webauthn_service import revoke_refresh_token

    user = getattr(request.state, "user", "unknown")
    logger.info(f"User logged out: {user}")
    refresh_token = request.cookies.get(REFRESH_COOKIE_NAME)
    if refresh_token:
        try:
            revoke_refresh_token(refresh_token)
        except Exception:
            pass
    response.delete_cookie(key=COOKIE_NAME)
    response.delete_cookie(key=REFRESH_COOKIE_NAME)
    return {"message": "Logged out"}


@router.post("/refresh", status_code=status.HTTP_200_OK)
def api_refresh_token(request: Request, response: Response):
    """
    Exchange a valid refresh token for a new access token (PWA sessions only).
    Uses sliding expiration: a new refresh token is also issued and the old one revoked.
    Browser sessions are NOT issued refresh tokens and must re-authenticate via login.
    """
    from app.services.webauthn_service import exchange_refresh_token

    token = request.cookies.get(REFRESH_COOKIE_NAME)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token present. Please log in.",
        )
    try:
        result = exchange_refresh_token(token, response)
    except ValueError as exc:
        response.delete_cookie(key=REFRESH_COOKIE_NAME)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))
    return result


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
def api_forgot_password(payload: ForgotPasswordRequest):
    """Request a password-reset OTP. Always returns 200 to prevent user enumeration."""
    logger.info("Password reset OTP request received")
    try:
        request_password_reset(payload.username)
    except OtpRateLimitError as exc:
        logger.warning(f"Rate limit exceeded for password reset: {payload.username}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many password reset attempts. Please try again later.",
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from exc
    except RuntimeError as exc:
        logger.error(f"Service unavailable during password reset: {str(exc)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    return {"message": "If that email is registered, a reset code has been sent."}


@router.post("/reset-password", status_code=status.HTTP_200_OK)
def api_reset_password(payload: ResetPasswordPayload):
    """Verify OTP and set a new password."""
    logger.info("Password reset attempt received")
    try:
        result = reset_password_with_otp(
            payload.username, payload.otp, payload.new_password
        )
    except RuntimeError as exc:
        logger.error(f"Service unavailable during password reset: {str(exc)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    if not result or result.get("error") == "not_found":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if result.get("error") == "OTP expired":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP expired. Please request a new password reset code.",
        )

    if result.get("error") == "Invalid OTP":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OTP. Please check the code and try again.",
        )

    return {"message": "Password has been reset successfully. You can now log in."}


@router.get("/session")
def api_session(request: Request):
    """Get current session information"""
    user = getattr(request.state, "user", None)
    role = getattr(request.state, "role", None)
    if not user:
        logger.debug("Session check failed: Not authenticated")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    logger.debug(f"Session check successful for user: {user}")
    return {
        "authenticated": True,
        "user": user,
        "role": role,
    }


@router.get("/csrf")
def get_csrf_token(request: Request):
    """Get CSRF token for the current session"""
    token = request.cookies.get("csrf_token")
    logger.debug("CSRF token requested")
    return {"csrf_token": token}


# ---------------------------------------------------------------------------
# Google OAuth2
# ---------------------------------------------------------------------------

@router.get("/google")
def google_auth_redirect(response: Response):
    """Redirect the browser to Google's OAuth2 consent screen."""
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured",
        )
    state = secrets.token_urlsafe(16)
    url = build_google_auth_url(state)
    resp = RedirectResponse(url=url, status_code=302)
    resp.set_cookie(
        "oauth_state",
        state,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=300,
    )
    return resp


@router.get("/google/callback")
def google_auth_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    """Handle the OAuth2 callback: exchange code, issue JWT, set cookie."""
    if error:
        logger.warning("Google OAuth error: %s", error)
        return RedirectResponse(url="/?error=oauth_denied", status_code=302)

    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing authorization code",
        )

    stored_state = request.cookies.get("oauth_state")
    if not state or state != stored_state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OAuth state — possible CSRF",
        )

    try:
        userinfo = exchange_google_code(code)
        user = oauth_login_or_create(userinfo)
    except PermissionError as exc:
        logger.warning("Google OAuth domain not allowed: %s", str(exc))
        return RedirectResponse(
            url=f"/?error=domain_not_allowed",
            status_code=302,
        )
    except Exception as exc:
        logger.error("Google OAuth callback failed: %s", str(exc), exc_info=True)
        return RedirectResponse(url="/?error=oauth_failed", status_code=302)

    token = create_access_token({
        "username": user["username"],
        "role": user.get("role", "user"),
        "tenant_id": user.get("tenant_id", user["username"]),
    })

    resp = RedirectResponse(url="/dashboard", status_code=302)
    resp.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    resp.delete_cookie("oauth_state")
    logger.info("Google OAuth login successful for %s", user["username"])
    return resp
