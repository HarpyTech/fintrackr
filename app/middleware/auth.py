from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from jose import jwt, JWTError
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

# Public endpoints that don't require authentication
PUBLIC_PATHS = {
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/register/verify",
    "/api/v1/auth/register/resend-otp",
    "/api/v1/auth/logout",
    "/api/v1/auth/csrf",
    "/api/v1/health",
    "/api/v1/health/build",
    "/api/v1/auth/test-email",
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

                if not username:
                    raise JWTError("Username not found in token")

                # Attach user info to request state for use in endpoints
                request.state.user = username
                request.state.role = role
                logger.debug("User authenticated successfully")

            except JWTError as e:
                logger.warning(f"Invalid token: {str(e)}")
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={"detail": "Invalid or expired token"},
                )

            response = await call_next(request)
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
