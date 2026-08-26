"""
Standard application error envelope.

All API error responses use the shape:
    {"code": "SNAKE_CASE_CODE", "message": "...", "trace_id": "..."}

Routes raise AppError (or its subclasses) for domain errors. FastAPI
HTTPException is also converted to this envelope by the handler in main.py.
"""

from typing import ClassVar


class AppError(Exception):
    """Base class for all application-level errors."""

    status_code: ClassVar[int] = 400
    default_code: ClassVar[str] = "APP_ERROR"

    def __init__(self, message: str, code: str | None = None, status_code: int | None = None):
        self.message = message
        self.code = code or self.default_code
        if status_code is not None:
            object.__setattr__(self, "status_code", status_code)
        super().__init__(message)


class NotFoundError(AppError):
    status_code = 404
    default_code = "NOT_FOUND"


class ForbiddenError(AppError):
    status_code = 403
    default_code = "FORBIDDEN"


class ConflictError(AppError):
    status_code = 409
    default_code = "CONFLICT"


class UnprocessableError(AppError):
    status_code = 422
    default_code = "UNPROCESSABLE_ENTITY"


# Maps HTTP status codes produced by FastAPI/Starlette to machine-readable codes
# used when converting HTTPException → standard envelope.
HTTP_STATUS_CODES: dict[int, str] = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    415: "UNSUPPORTED_MEDIA_TYPE",
    422: "UNPROCESSABLE_ENTITY",
    429: "RATE_LIMITED",
    500: "INTERNAL_SERVER_ERROR",
    503: "SERVICE_UNAVAILABLE",
}


def http_code(status: int) -> str:
    return HTTP_STATUS_CODES.get(status, f"HTTP_{status}")
