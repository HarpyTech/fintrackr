"""
Security response headers.

Applies a baseline set of browser-enforced protections to every response.
No infrastructure required — these are plain response headers, so they work
identically behind any reverse proxy or ingress.
"""

import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.core.config import settings

logger = logging.getLogger(__name__)


def _build_csp() -> str:
    """
    Content Security Policy for the served SPA.

    Vite injects hashed <script>/<link> tags and Recharts writes inline
    styles, so 'unsafe-inline' is required for style-src. Script-src stays
    strict: only same-origin bundles are allowed to execute.
    """
    connect_src = ["'self'"]

    # Allow the configured API/CORS origins so the SPA can call the backend
    # when it is served from a different host than the API.
    for origin in settings.CORS_ORIGINS:
        if origin and origin not in connect_src:
            connect_src.append(origin)

    directives = [
        "default-src 'self'",
        "script-src 'self'",
        # Recharts and the theme system set inline styles at runtime.
        "style-src 'self' 'unsafe-inline'",
        # data: covers inline SVG icons; blob: covers local receipt previews
        # created via URL.createObjectURL before upload.
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        f"connect-src {' '.join(connect_src)}",
        "manifest-src 'self'",
        "worker-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ]

    if settings.is_production:
        directives.append("upgrade-insecure-requests")

    return "; ".join(directives)


_CSP_VALUE = _build_csp()


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Attach security headers to every outgoing response."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "same-origin"

        # Disable browser features this app never uses. Camera is kept
        # enabled for same-origin because receipt capture depends on it.
        response.headers["Permissions-Policy"] = (
            "accelerometer=(), autoplay=(), camera=(self), display-capture=(), "
            "encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), "
            "magnetometer=(), microphone=(), midi=(), payment=(), usb=()"
        )

        response.headers["Content-Security-Policy"] = _CSP_VALUE

        # HSTS is only meaningful over HTTPS, and only safe once the
        # deployment is confirmed TLS-terminated.
        if settings.is_production and settings.COOKIE_SECURE:
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )

        # Never let API responses sit in a shared cache.
        if request.url.path.startswith(settings.API_V1_STR):
            response.headers["Cache-Control"] = "no-store"

        return response
