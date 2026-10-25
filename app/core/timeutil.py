"""Per-request user timezone.

The browser sends its IANA zone in ``X-Timezone`` (TimezoneMiddleware puts it
in ``current_timezone``). Anything that asks "what is today?" on the server
must use ``local_today()`` so month and day boundaries follow the user, not the
container's UTC clock.
"""

from __future__ import annotations

import logging
from contextvars import ContextVar
from datetime import UTC, date, datetime, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.core.config import settings

logger = logging.getLogger(__name__)

current_timezone: ContextVar[tzinfo | None] = ContextVar("current_timezone", default=None)

_UTC_NAMES = {"UTC", "Etc/UTC", "GMT", "Etc/GMT"}
_warned_default = False


def resolve_zone(name: str | None) -> tzinfo | None:
    """Return the tzinfo for an IANA *name*, or None if it is unknown/invalid."""
    if not name:
        return None
    name = name.strip()
    if name in _UTC_NAMES:
        return UTC
    if len(name) > 64 or "\\" in name or ".." in name:
        return None
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return None


def _default_zone() -> tzinfo:
    global _warned_default
    zone = resolve_zone(settings.DEFAULT_TIMEZONE)
    if zone is None:
        if not _warned_default:
            logger.warning(
                "DEFAULT_TIMEZONE %r cannot be resolved (is tzdata installed?); using UTC",
                settings.DEFAULT_TIMEZONE,
            )
            _warned_default = True
        return UTC
    return zone


def user_zone() -> tzinfo:
    """The caller's timezone, falling back to DEFAULT_TIMEZONE."""
    return current_timezone.get() or _default_zone()


def local_today() -> date:
    """Today's date in the caller's timezone."""
    return datetime.now(UTC).astimezone(user_zone()).date()
