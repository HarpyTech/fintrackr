"""Self-service data export and account deletion (DPDP / GDPR data-subject rights)."""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime

from app.db.mongo import get_database

logger = logging.getLogger(__name__)

_SECRET_USER_FIELDS = {
    "_id",
    "password_hash",
    "signup_otp_hash",
    "signup_otp_expires_at",
    "signup_otp_attempts",
    "reset_otp_hash",
    "reset_otp_expires_at",
    "reset_otp_attempts",
}

_SOFT_DELETE_COLLECTIONS = (
    "expenses",
    "expense_line_items",
    "insight_history",
)

_HARD_DELETE_COLLECTIONS = (
    "webauthn_credentials",
    "webauthn_challenges",
    "refresh_tokens",
)


def _utcnow() -> datetime:
    return datetime.now(UTC)


def is_deleted_account(username: str) -> bool:
    """Return True if a soft-deleted user record exists for *username*."""
    db = get_database()
    return bool(db["users"].find_one({"username": username, "is_deleted": True}))


def export_account(username: str) -> dict:
    """Return everything stored about *username*, minus credentials.

    Raises PermissionError if the account has been soft-deleted.
    """
    db = get_database()
    user = db["users"].find_one({"username": username})
    if user is None:
        return {}
    if user.get("is_deleted"):
        raise PermissionError(
            "Your account has been deleted and data export is no longer available. "
            "To recover your data, reactivate your account within the allowed window."
        )
    data: dict = {
        "profile": {k: v for k, v in user.items() if k not in _SECRET_USER_FIELDS}
    }
    for name in ("expenses", "expense_line_items", "insight_history"):
        data[name] = list(
            db[name].find({"username": username, "is_deleted": {"$ne": True}})
        )
    data["passkeys"] = list(
        db["webauthn_credentials"].find(
            {"username": username}, {"_id": 0, "public_key": 0}
        )
    )
    return data


def delete_account(username: str) -> dict[str, int]:
    """Soft-delete the user and all associated data.

    The user document is retained with is_deleted=True so that:
    - Re-registration with the same email is blocked with a reactivation prompt.
    - The 30-day reactivation window can restore all data.
    Refresh tokens and WebAuthn credentials are hard-deleted immediately
    (device-bound credentials are useless without an active account).
    """
    db = get_database()
    now = _utcnow()
    counts: dict[str, int] = {}

    # 1. Soft-delete associated data collections.
    for name in _SOFT_DELETE_COLLECTIONS:
        result = db[name].update_many(
            {"username": username, "is_deleted": {"$ne": True}},
            {"$set": {"is_deleted": True, "deleted_at": now}},
        )
        counts[name] = result.modified_count

    # 2. Hard-delete credentials and tokens — they cannot be reused.
    for name in _HARD_DELETE_COLLECTIONS:
        counts[name] = db[name].delete_many({"username": username}).deleted_count

    # 3. Hard-delete rate-limit and idempotency records.
    db["idempotency_keys"].delete_many({"user_id": username})
    db["signup_otp_attempts"].delete_many({"email": username})
    db["login_attempts"].delete_many({"key": username})
    db["webauthn_attempts"].delete_many({"key": {"$regex": f"^{re.escape(username)}:"}})
    db["llm_call_attempts"].delete_many({"key": {"$regex": f"^{re.escape(username)}:"}})

    # 4. Soft-delete the user document last (source of truth).
    result = db["users"].update_one(
        {"username": username},
        {"$set": {"is_deleted": True, "deleted_at": now, "deleted_by": "self"}},
    )
    counts["users"] = result.modified_count

    logger.info("Account soft-deleted: counts=%s", counts)
    return counts


def reactivate_account(username: str) -> bool:
    """Restore a soft-deleted account and all its associated data.

    Returns True if the account was reactivated, False if not found or not deleted.
    """
    db = get_database()
    user = db["users"].find_one({"username": username, "is_deleted": True})
    if not user:
        return False

    now = _utcnow()

    # Restore associated data.
    for name in _SOFT_DELETE_COLLECTIONS:
        db[name].update_many(
            {"username": username, "is_deleted": True},
            {
                "$unset": {"is_deleted": "", "deleted_at": ""},
                "$set": {"updated_at": now},
            },
        )

    # Restore user document.
    db["users"].update_one(
        {"username": username},
        {
            "$unset": {"is_deleted": "", "deleted_at": "", "deleted_by": ""},
            "$set": {"updated_at": now},
        },
    )

    logger.info("Account reactivated for user")
    return True
