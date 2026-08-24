"""MongoDB-backed idempotency cache for mutating API endpoints.

Keys expire after 24 hours via a TTL index on `created_at`.
The compound index `(key, user_id)` ensures per-user isolation so
two different users can reuse the same Idempotency-Key value without
collision.
"""
import logging
from datetime import datetime, timezone

from app.db.mongo import get_idempotency_collection

logger = logging.getLogger(__name__)


def get_idempotency_response(key: str, user_id: str) -> dict | None:
    """Return the cached response body for (key, user_id), or None if absent."""
    try:
        doc = get_idempotency_collection().find_one(
            {"key": key, "user_id": user_id},
            {"_id": 0, "response_body": 1},
        )
        if doc:
            logger.debug("Idempotency cache hit for key=%s user=%s", key, user_id)
            return doc["response_body"]
        return None
    except Exception:
        logger.warning("Idempotency cache read failed — treating as miss", exc_info=True)
        return None


def store_idempotency_response(key: str, user_id: str, response_body: dict) -> None:
    """Persist a response so duplicate requests return the same body."""
    try:
        get_idempotency_collection().update_one(
            {"key": key, "user_id": user_id},
            {
                "$setOnInsert": {
                    "key": key,
                    "user_id": user_id,
                    "response_body": response_body,
                    "created_at": datetime.now(timezone.utc),
                }
            },
            upsert=True,
        )
        logger.debug("Idempotency response stored for key=%s user=%s", key, user_id)
    except Exception:
        logger.warning("Idempotency cache write failed — continuing without cache", exc_info=True)
