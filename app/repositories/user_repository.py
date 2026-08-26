"""Thin CRUD seam over the users MongoDB collection.

All callers are responsible for catching PyMongoError — this layer stays thin
and does not wrap errors.
"""
from __future__ import annotations

import logging
from typing import Any

from app.db.mongo import get_users_collection

logger = logging.getLogger(__name__)


def find_by_username(username: str) -> dict | None:
    """Return the raw user document for *username*, or None if not found."""
    return get_users_collection().find_one({"username": username})


def create(doc: dict) -> str:
    """Insert *doc* into the collection and return the inserted _id as a string."""
    result = get_users_collection().insert_one(doc)
    return str(result.inserted_id)


def update_by_username(username: str, fields: dict) -> bool:
    """Apply a ``$set`` of *fields* to the user document with matching username.

    Returns True when at least one document was matched, False otherwise.
    """
    result = get_users_collection().update_one(
        {"username": username},
        {"$set": fields},
    )
    return result.matched_count > 0


def update_by_id(
    user_id: Any,
    set_fields: dict,
    unset_fields: dict | None = None,
) -> bool:
    """Apply ``$set`` (and optional ``$unset``) to the user document with *user_id*.

    *user_id* may be an ObjectId or any value already stored as ``_id``.
    Returns True when at least one document was matched, False otherwise.
    """
    update: dict = {"$set": set_fields}
    if unset_fields:
        update["$unset"] = unset_fields

    result = get_users_collection().update_one(
        {"_id": user_id},
        update,
    )
    return result.matched_count > 0
