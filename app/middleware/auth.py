import logging
import time

from fastapi import Request, status
from fastapi.responses import JSONResponse
import jwt
from jwt.exceptions import InvalidTokenError
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.core.security import create_access_token

logger = logging.getLogger(__name__)

# Public endpoints that don't require authentication
PUBLIC_PATHS = {
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/register/verify",
    "/api/v1/auth/register/resend-otp",
    "/api/v1/auth/logout",
    "/api/v1/auth/csrf",
    "/api/v1/auth/forgot-password",
    "/api/v1/auth/reset-password",
    "/api/v1/auth/refresh",
    "/api/v1/auth/google",
    "/api/v1/auth/google/callback",
    "/api/v1/health",
    "/api/v1/health/build",
    # Only the sign-in ceremony is public. Enrolling a passkey needs a session:
    # routes/webauthn.py binds it to request.state.user.
    "/api/v1/webauthn/authenticate",
    "/api/v1/webauthn/authenticate/verify",
    "/health",
    "/",
    "/docs",
    "/openapi.json",
    "/redoc",
}


class AuthenticationMiddleware(BaseHTTPMiddleware):
    """
    Middleware to authenticate and authorize API requests.

    Supports two authentication methods:
    1. Cookie-based: JWT token in 'access_token' cookie
    2. Header-based: JWT token in 'Authorization: Bearer <token>' header

    - Validates token and attaches user info to request state
    - Allows public endpoints to bypass authentication
    - Returns 401 for invalid/missing tokens on protected endpoints
    """

    TOKEN_COOKIE_NAME = "access_token"

    async def dispatch(self, request: Request, call_next):
        """Process authentication for each request"""
        try:
            # Enforce authentication only for API routes.
            if not request.url.path.startswith(settings.API_V1_STR):
                return await call_next(request)

            # Check if path is public
            if self._is_public_path(request.url.path):
                return await call_next(request)

            # Try to extract token from cookie first,
            # then from Authorization header.
            token = self._extract_token(request)
            from_cookie = token is not None and token == request.cookies.get(
                self.TOKEN_COOKIE_NAME
            )

            if not token:
                logger.warning("Missing authentication token")
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={"detail": "Missing authentication token"},
                )

            # Validate and decode token
            try:
                payload = jwt.decode(
                    token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
                )
                username = payload.get("username")
                role = payload.get("role")
                tenant_id = payload.get("tenant_id", username)

                # Refresh tokens share the signing key; only access tokens
                # may authenticate a request.
                if payload.get("type") != "access":
                    raise InvalidTokenError("Not an access token")

                if not username:
                    raise InvalidTokenError("Username not found in token")

                # Attach user info to request state for use in endpoints
                request.state.user = username
                request.state.role = role
                request.state.tenant_id = tenant_id
                logger.debug("User authenticated successfully")
                renewed = self._renewed_token(payload) if from_cookie else None

            except InvalidTokenError as e:
                logger.warning(f"Invalid token: {str(e)}")
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={"detail": "Invalid or expired token"},
                )

            response = await call_next(request)
            if renewed:
                response.set_cookie(
                    key=self.TOKEN_COOKIE_NAME,
                    value=renewed,
                    httponly=True,
                    secure=settings.COOKIE_SECURE,
                    samesite="lax",
                    max_age=60 * 60 * 24,
                )
            return response

        except Exception as exc:
            logger.error(
                f"Unexpected error in authentication middleware: {str(exc)}",
                exc_info=True,
            )
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={"detail": "Internal server error during authentication"},
            )

    @staticmethod
    def _renewed_token(payload: dict) -> str | None:
        """Slide an active cookie session: re-issue the token once it is past
        half its lifetime, until SESSION_MAX_HOURS after the original sign-in."""
        now = int(time.time())
        if payload.get("exp", 0) - now > settings.ACCESS_TOKEN_EXPIRE_MINUTES * 30:
            return None
        auth_time = int(payload.get("auth_time", now))
        if now - auth_time > settings.SESSION_MAX_HOURS * 3600:
            return None
        claims = ("username", "role", "tenant_id", "auth_time")
        return create_access_token({k: payload[k] for k in claims if k in payload})

    def _extract_token(self, request: Request) -> str | None:
        """
        Extract JWT token from request.
        Tries cookie first, then Authorization header.

        Returns:
            Token string if found, None otherwise
        """
        # Try to get token from cookie
        token = request.cookies.get(self.TOKEN_COOKIE_NAME)
        if token:
            return token

        # Try to get token from Authorization header
        auth_header = request.headers.get("Authorization")
        if auth_header:
            try:
                # Expected format: "Bearer <token>"
                scheme, token = auth_header.split()
                if scheme.lower() == "bearer":
                    return token
            except (ValueError, IndexError):
                pass

        return None

    @staticmethod
    def _is_public_path(path: str) -> bool:
        """Check if a path is in the public paths list."""
        return (
            path in PUBLIC_PATHS
            or path.startswith("/static/")
            or path.startswith("/assets/")
            or path.startswith("/pwa/")
            or path
            in {
                "/favicon.ico",
                "/manifest.json",
                "/service-worker.js",
                "/browserconfig.xml",
                "/offline.html",
            }
        )
