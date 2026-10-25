"""Self-service data export and account deletion (DPDP / GDPR data-subject rights)."""

from __future__ import annotations

import logging
import re

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

# Collections whose documents are keyed by `username` and die with the account.
_OWNED_COLLECTIONS = (
    "expenses",
    "expense_line_items",
    "webauthn_credentials",
    "webauthn_challenges",
    "refresh_tokens",
    "insight_history",
)


def export_account(username: str) -> dict:
    """Return everything stored about *username*, minus credentials."""
    db = get_database()
    user = db["users"].find_one({"username": username})
    if user is None:
        return {}
    data: dict = {
        "profile": {k: v for k, v in user.items() if k not in _SECRET_USER_FIELDS}
    }
    for name in ("expenses", "expense_line_items", "insight_history"):
        data[name] = list(db[name].find({"username": username}))
    data["passkeys"] = list(
        db["webauthn_credentials"].find(
            {"username": username}, {"_id": 0, "public_key": 0}
        )
    )
    return data


def delete_account(username: str) -> dict[str, int]:
    """Hard-delete the user and everything keyed to them; return per-collection counts."""
    db = get_database()
    counts = {
        name: db[name].delete_many({"username": username}).deleted_count
        for name in _OWNED_COLLECTIONS
    }
    db["idempotency_keys"].delete_many({"user_id": username})
    db["signup_otp_attempts"].delete_many({"email": username})
    db["login_attempts"].delete_many({"key": username})
    db["webauthn_attempts"].delete_many(
        {"key": {"$regex": f"^{re.escape(username)}:"}}
    )
    db["llm_call_attempts"].delete_many(
        {"key": {"$regex": f"^{re.escape(username)}:"}}
    )
    counts["users"] = db["users"].delete_one({"username": username}).deleted_count
    # No username here: the log line must not outlive the data it describes.
    logger.info("Account deleted: %s", counts)
    return counts
