"""MongoDB-backed idempotency for mutating API endpoints.

A request with an ``Idempotency-Key`` first *reserves* the key by inserting a
pending document. The unique index on ``(key, user_id)`` makes the insert the
atomic gate: of two concurrent retries only one gets to run, the other sees a
conflict (or, once the first has finished, its stored response).

Keys expire after 24 hours via a TTL index on ``created_at``. Keys are scoped
per user, so two users can reuse the same value without collision.
"""

import logging
from datetime import UTC, datetime

from pymongo.errors import DuplicateKeyError

from app.db.mongo import get_idempotency_collection

logger = logging.getLogger(__name__)

_PENDING = "pending"
_DONE = "done"


class IdempotencyInProgressError(Exception):
    """Another request with the same key is still running."""


def reserve(key: str, user_id: str) -> dict | None:
    """Claim *key* for *user_id*.

    Returns None when the caller now owns the key and should do the work, or
    the stored response body when an earlier request already completed.
    Raises IdempotencyInProgressError while an earlier request is still running.
    """
    collection = get_idempotency_collection()
    try:
        collection.insert_one(
            {
                "key": key,
                "user_id": user_id,
                "status": _PENDING,
                "created_at": datetime.now(UTC),
            }
        )
        return None
    except DuplicateKeyError:
        doc = collection.find_one({"key": key, "user_id": user_id})
        if doc and doc.get("status", _DONE) == _DONE and "response_body" in doc:
            logger.debug("Idempotency replay for key=%s user=%s", key, user_id)
            return doc["response_body"]
        raise IdempotencyInProgressError(key) from None


def complete(key: str, user_id: str, response_body: dict) -> None:
    """Store the response so later retries with *key* get the same body."""
    try:
        get_idempotency_collection().update_one(
            {"key": key, "user_id": user_id},
            {"$set": {"status": _DONE, "response_body": response_body}},
        )
    except Exception:
        # The work succeeded; failing here would make the client retry and
        # duplicate it. Log and leave the pending marker to expire.
        logger.warning("Idempotency completion failed for key=%s", key, exc_info=True)


def release(key: str, user_id: str) -> None:
    """Drop a pending reservation after a failure so the client can retry."""
    try:
        get_idempotency_collection().delete_one(
            {"key": key, "user_id": user_id, "status": _PENDING}
        )
    except Exception:
        logger.warning("Idempotency release failed for key=%s", key, exc_info=True)
