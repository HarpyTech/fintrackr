"""
Request tracing utilities for PII-safe logging.

This module provides trace ID management to avoid logging personally
identifiable information (PII) such as usernames, emails, etc.
"""

import logging
import uuid
from contextvars import ContextVar
from typing import Optional

# Context variable to store trace ID for the current request
_trace_id_context: ContextVar[Optional[str]] = ContextVar("trace_id", default=None)


def generate_trace_id() -> str:
    """Generate a unique trace ID for request tracking"""
    return str(uuid.uuid4())


def set_trace_id(trace_id: str) -> None:
    """Set the trace ID for the current context"""
    _trace_id_context.set(trace_id)


def get_trace_id() -> Optional[str]:
    """Get the trace ID from the current context"""
    return _trace_id_context.get()


def clear_trace_id() -> None:
    """Clear the trace ID from the current context"""
    _trace_id_context.set(None)


class TraceIDFilter(logging.Filter):
    """
    Logging filter that adds trace_id to all log records.

    This allows trace IDs to be included in log formatting without
    manually passing them to each log call.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        """Add trace_id to the log record"""
        record.trace_id = get_trace_id() or "no-trace"
        return True


_ORIGINAL_RECORD_FACTORY = logging.getLogRecordFactory()


def _trace_record_factory(*args, **kwargs) -> logging.LogRecord:
    """Ensure every LogRecord has a trace_id field."""
    record = _ORIGINAL_RECORD_FACTORY(*args, **kwargs)
    if not hasattr(record, "trace_id"):
        record.trace_id = get_trace_id() or "no-trace"
    return record


def setup_trace_logging():
    """
    Configure logging to include trace IDs in all log messages.

    Call this during application startup to enable trace ID logging.
    """
    # Ensure ALL log records (including 3rd-party libraries) carry trace_id.
    logging.setLogRecordFactory(_trace_record_factory)

    root_logger = logging.getLogger()
    trace_filter = TraceIDFilter()
    root_logger.addFilter(trace_filter)

    # Update the logging format to include trace_id
    for handler in root_logger.handlers:
        handler.addFilter(trace_filter)
        formatter = logging.Formatter(
            "%(asctime)s - [%(trace_id)s] - %(name)s - " "%(levelname)s - %(message)s"
        )
        handler.setFormatter(formatter)
