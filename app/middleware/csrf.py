import logging

from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.core.security import create_csrf_token

logger = logging.getLogger(__name__)

# HTTP methods that require CSRF protection
PROTECTED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# Paths that don't require CSRF protection (e.g., login, API tokens)
CSRF_EXEMPT_PATHS = {
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/logout",
    "/api/v1/auth/csrf",
}


class CSRFProtectionMiddleware(BaseHTTPMiddleware):
    """
    Middleware to protect against Cross-Site Request Forgery (CSRF) attacks.

    - Generates CSRF token for GET requests and stores in session/cookie
    - Validates CSRF token from form data or headers for state-changing requests
    - Protects POST, PUT, PATCH, DELETE methods
    - Allows exemptions for specific API endpoints
    """

    CSRF_COOKIE_NAME = "csrf_token"
    CSRF_HEADER_NAME = "x-csrf-token"
    CSRF_FORM_NAME = "csrf_token"

    async def dispatch(self, request: Request, call_next):
        """Process CSRF protection for each request"""
        try:
            # Do not enforce CSRF checks on non-API routes.
            if not request.url.path.startswith(settings.API_V1_STR):
                response = await call_next(request)
                self._set_csrf_token(request, response)
                return response

            # Validate CSRF token for protected methods
            if request.method in PROTECTED_METHODS:
                # Skip validation for exempt paths
                if request.url.path in CSRF_EXEMPT_PATHS:
                    logger.debug(
                        f"CSRF validation skipped for exempt path: {request.url.path}"
                    )
                    return await call_next(request)

                # Validate CSRF token
                valid = self._validate_csrf_token(request)
                if not valid:
                    logger.warning(
                        f"CSRF token validation failed for "
                        f"{request.method} {request.url.path}"
                    )
                    return JSONResponse(
                        status_code=status.HTTP_403_FORBIDDEN,
                        content={"detail": "CSRF token validation failed"},
                    )
                logger.debug(
                    f"CSRF token validated for {request.method} {request.url.path}"
                )

            response = await call_next(request)
            self._set_csrf_token(request, response)
            return response

        except Exception as exc:
            logger.error(
                f"Unexpected error in CSRF middleware: {str(exc)}", exc_info=True
            )
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={"detail": "Internal server error during CSRF validation"},
            )

    def _get_csrf_token_from_cookie(self, request: Request) -> str | None:
        """Get CSRF token from cookie."""
        return request.cookies.get(self.CSRF_COOKIE_NAME)

    def _set_csrf_token(self, request: Request, response) -> None:
        """Set CSRF token in cookie if not already present."""
        existing_token = self._get_csrf_token_from_cookie(request)
        if not existing_token:
            token = create_csrf_token()
            response.set_cookie(
                key=self.CSRF_COOKIE_NAME,
                value=token,
                httponly=False,  # JavaScript needs to read it for forms
                secure=False,
                samesite="lax",  # CSRF protection
                max_age=3600,  # 1 hour
            )

    def _validate_csrf_token(self, request: Request) -> bool:
        """
        Validate CSRF token from request using double-submit cookie.
        Checks the X-CSRF-Token header against csrf_token cookie.
        """
        cookie_token = self._get_csrf_token_from_cookie(request)
        if not cookie_token:
            logger.warning("CSRF token not found in cookie")
            return False

        request_token = request.headers.get(self.CSRF_HEADER_NAME)

        if not request_token:
            logger.warning("CSRF token not found in request")
            return False

        # Compare tokens (constant-time comparison)
        is_valid = self._constant_time_compare(cookie_token, request_token)
        return is_valid

    @staticmethod
    def _constant_time_compare(a: str, b: str) -> bool:
        """
        Compare two strings using constant-time comparison
        to prevent timing attacks.
        """
        if len(a) != len(b):
            return False
        result = 0
        for x, y in zip(a, b):
            result |= ord(x) ^ ord(y)
        return result == 0
