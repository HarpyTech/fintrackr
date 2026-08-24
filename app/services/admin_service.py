"""Admin-only user management: listing users and managing plans / limits."""

from datetime import datetime, timezone
import logging

from pymongo.errors import PyMongoError

from app.core.plans import DEFAULT_PLAN, plan_user_fields
from app.db.mongo import get_expenses_collection, get_users_collection

logger = logging.getLogger(__name__)


class UserNotFoundError(Exception):
    """Raised when an admin action targets a user that does not exist."""

    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _serialize_user(user: dict, expense_count: int) -> dict:
    return {
        "username": user["username"],
        "role": user.get("role", "user"),
        "plan": user.get("plan", DEFAULT_PLAN),
        "expense_limit": int(user.get("expense_limit", 0) or 0),
        "disable_rate_limit": bool(user.get("disable_rate_limit", False)),
        "email_verified": bool(user.get("email_verified", False)),
        "expense_count": expense_count,
    }


def list_users(
    skip: int = 0,
    limit: int = 50,
    search: str | None = None,
    tenant_id: str | None = None,
) -> dict:
    """Return a paginated list of users with their plan and usage."""
    try:
        users = get_users_collection()
        expenses = get_expenses_collection()

        query: dict = {}
        if tenant_id:
            query["tenant_id"] = tenant_id
        if search:
            query["username"] = {"$regex": search.strip(), "$options": "i"}

        total = users.count_documents(query)
        cursor = (
            users.find(query)
            .sort("username", 1)
            .skip(max(skip, 0))
            .limit(max(min(limit, 200), 1))
        )

        items = []
        for user in cursor:
            expense_filter: dict = {"username": user["username"]}
            if tenant_id:
                expense_filter["tenant_id"] = tenant_id
            count = expenses.count_documents(expense_filter)
            items.append(_serialize_user(user, count))

        return {"total": total, "skip": skip, "limit": limit, "items": items}
    except PyMongoError as exc:
        logger.error("Database error while listing users: %s", str(exc), exc_info=True)
        raise RuntimeError("Failed to list users due to database error") from exc


def get_user(username: str, tenant_id: str | None = None) -> dict:
    """Return a single user's admin view or raise UserNotFoundError."""
    try:
        users = get_users_collection()
        user_filter: dict = {"username": username}
        if tenant_id:
            user_filter["tenant_id"] = tenant_id
        user = users.find_one(user_filter)
        if not user:
            raise UserNotFoundError(username)
        expense_filter: dict = {"username": username}
        if tenant_id:
            expense_filter["tenant_id"] = tenant_id
        count = get_expenses_collection().count_documents(expense_filter)
        return _serialize_user(user, count)
    except UserNotFoundError:
        raise
    except PyMongoError as exc:
        logger.error("Database error while fetching user: %s", str(exc), exc_info=True)
        raise RuntimeError("Failed to fetch user due to database error") from exc


def update_user(
    username: str,
    *,
    role: str | None = None,
    plan: str | None = None,
    expense_limit: int | None = None,
    disable_rate_limit: bool | None = None,
    tenant_id: str | None = None,
) -> dict:
    """Apply admin edits to a user.

    Assigning a ``plan`` sets the derived limit fields; an explicit
    ``expense_limit`` / ``disable_rate_limit`` then overrides them.
    """
    try:
        users = get_users_collection()
        user_filter: dict = {"username": username}
        if tenant_id:
            user_filter["tenant_id"] = tenant_id
        if not users.find_one(user_filter, {"_id": 1}):
            raise UserNotFoundError(username)

        update: dict = {}
        if plan is not None:
            update.update(plan_user_fields(plan))
        if role is not None:
            update["role"] = role
        if expense_limit is not None:
            update["expense_limit"] = int(expense_limit)
            update["disable_rate_limit"] = False
        if disable_rate_limit is not None:
            update["disable_rate_limit"] = bool(disable_rate_limit)

        update["updated_at"] = _utcnow()
        users.update_one(user_filter, {"$set": update})
        logger.info("Admin updated user %s: %s", username, sorted(update.keys()))
        return get_user(username, tenant_id=tenant_id)
    except UserNotFoundError:
        raise
    except PyMongoError as exc:
        logger.error("Database error while updating user: %s", str(exc), exc_info=True)
        raise RuntimeError("Failed to update user due to database error") from exc
