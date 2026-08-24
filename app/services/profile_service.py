"""User profile operations.

Functions
---------
get_user(username)                        — minimal identity dict
get_user_profile(username)                — full editable PII profile dict
update_user_profile(username, **fields)   — apply PII updates, return profile
"""
from __future__ import annotations

import logging

from pymongo.errors import PyMongoError

from app.core.plans import DEFAULT_PLAN
from app.repositories import user_repository

logger = logging.getLogger(__name__)


def get_user(username: str):
    """Get minimal user information by username."""
    logger.debug("Fetching user information")
    try:
        user = user_repository.find_by_username(username)
        if not user:
            logger.warning(f"User not found: {username}")
            return None

        logger.debug(f"User found: {username}")
        return {
            "username": user["username"],
            "role": user.get("role", "user"),
        }
    except PyMongoError as exc:
        logger.error(
            f"Database error while fetching user {username}: {str(exc)}",
            exc_info=True,
        )
        raise RuntimeError("Failed to fetch user due to database error") from exc
    except Exception as exc:
        logger.error(
            f"Unexpected error while fetching user {username}: {str(exc)}",
            exc_info=True,
        )
        raise


def get_user_profile(username: str):
    """Get user profile with editable PII fields."""
    logger.debug("Fetching user profile")
    try:
        user = user_repository.find_by_username(username)
        if not user:
            logger.warning(f"User profile not found: {username}")
            return None

        logger.debug(f"User profile found: {username}")
        return {
            "username": user["username"],
            "role": user.get("role", "user"),
            "first_name": user.get("first_name"),
            "last_name": user.get("last_name"),
            "phone": user.get("phone"),
            "address": user.get("address"),
            "plan": user.get("plan", DEFAULT_PLAN),
            "expense_limit": user.get("expense_limit", 10),
            "disable_rate_limit": user.get("disable_rate_limit", False),
        }
    except PyMongoError as exc:
        logger.error(
            f"Database error while fetching profile {username}: {str(exc)}",
            exc_info=True,
        )
        raise RuntimeError(
            "Failed to fetch user profile due to database error"
        ) from exc
    except Exception as exc:
        logger.error(
            f"Unexpected error while fetching profile {username}: {str(exc)}",
            exc_info=True,
        )
        raise


def update_user_profile(
    username: str,
    first_name: str | None = None,
    last_name: str | None = None,
    phone: str | None = None,
    address: str | None = None,
):
    """Update editable user PII profile fields."""
    logger.info(f"Updating user profile: {username}")

    def _clean(value: str | None):
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed if trimmed else None

    try:
        update_doc = {
            "first_name": _clean(first_name),
            "last_name": _clean(last_name),
            "phone": _clean(phone),
            "address": _clean(address),
        }

        matched = user_repository.update_by_username(username, update_doc)
        if not matched:
            logger.warning(f"User not found for profile update: {username}")
            return None

        return get_user_profile(username)
    except PyMongoError as exc:
        logger.error(
            f"Database error while updating profile {username}: {str(exc)}",
            exc_info=True,
        )
        raise RuntimeError(
            "Failed to update user profile due to database error"
        ) from exc
    except Exception as exc:
        logger.error(
            f"Unexpected error while updating profile {username}: {str(exc)}",
            exc_info=True,
        )
        raise
