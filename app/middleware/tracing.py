"""
Trace ID middleware for request tracking.

This middleware generates a unique trace ID for each request
and makes it available throughout the request lifecycle.
"""

import logging

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.tracing import (
    clear_trace_id,
    generate_trace_id,
    set_trace_id,
)

logger = logging.getLogger(__name__)


class TraceIDMiddleware(BaseHTTPMiddleware):
    """
    Middleware that generates and manages trace IDs for each request.

    The trace ID is:
    - Generated at the start of each request
    - Added to the request state for access in endpoints
    - Included in response headers for client-side tracking
    - Cleared at the end of the request
    """

    HEADER_NAME = "X-Trace-ID"

    async def dispatch(self, request: Request, call_next):
        """Process each request with a unique trace ID"""
        # Generate new trace ID for this request
        trace_id = generate_trace_id()
        set_trace_id(trace_id)

        # Add trace ID to request state for access in endpoints
        request.state.trace_id = trace_id

        logger.info(f"Request started: {request.method} {request.url.path}")

        try:
            # Process the request
            response = await call_next(request)

            # Add trace ID to response headers for client tracking
            response.headers[self.HEADER_NAME] = trace_id

            logger.info(
                f"Request completed: {request.method} {request.url.path} "
                f"- Status: {response.status_code}"
            )

            return response

        except Exception as exc:
            logger.error(
                f"Request failed: {request.method} {request.url.path} "
                f"- Error: {type(exc).__name__}",
                exc_info=True,
            )
            raise

        finally:
            # Clean up trace ID from context
            clear_trace_id()
