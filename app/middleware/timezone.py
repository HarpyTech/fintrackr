from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.core.timeutil import current_timezone, resolve_zone


class TimezoneMiddleware(BaseHTTPMiddleware):
    """Expose the caller's X-Timezone header to app.core.timeutil.local_today()."""

    HEADER_NAME = "x-timezone"

    async def dispatch(self, request: Request, call_next):
        zone = resolve_zone(request.headers.get(self.HEADER_NAME))
        token = current_timezone.set(zone)
        try:
            return await call_next(request)
        finally:
            current_timezone.reset(token)
