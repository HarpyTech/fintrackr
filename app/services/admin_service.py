"""Admin-only user management: listing users and managing plans / limits."""

import logging
from datetime import UTC, datetime
from uuid import uuid4

from pymongo.errors import PyMongoError

from app.core.plans import DEFAULT_PLAN, plan_user_fields
from app.db.mongo import (
    get_expenses_collection,
    get_upgrade_requests_collection,
    get_users_collection,
)

logger = logging.getLogger(__name__)


class UserNotFoundError(Exception):
    """Raised when an admin action targets a user that does not exist."""

    pass


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _serialize_upgrade_request(request: dict) -> dict:
    def iso(value):
        return value.isoformat() if value else None

    return {
        "request_id": request["request_id"],
        "username": request["username"],
        "first_name": request.get("first_name"),
        "last_name": request.get("last_name"),
        "current_plan": request.get("current_plan", DEFAULT_PLAN),
        "requested_plan": request.get("requested_plan", "go"),
        "status": request.get("status", "pending"),
        "tenant_id": request.get("tenant_id"),
        "created_at": iso(request.get("created_at")),
        "approved_at": iso(request.get("approved_at")),
        "approved_by": request.get("approved_by"),
    }


def create_upgrade_request(
    username: str,
    *,
    current_plan: str,
    first_name: str | None = None,
    last_name: str | None = None,
    tenant_id: str | None = None,
) -> dict:
    """Create or return the user's existing pending Go upgrade request."""
    try:
        requests = get_upgrade_requests_collection()
        request_filter = {
            "username": username,
            "requested_plan": "go",
            "status": "pending",
        }
        if tenant_id:
            request_filter["tenant_id"] = tenant_id
        existing = requests.find_one(request_filter)
        if existing:
            return _serialize_upgrade_request(existing)

        request = {
            "request_id": str(uuid4()),
            "username": username,
            "first_name": first_name,
            "last_name": last_name,
            "current_plan": current_plan,
            "requested_plan": "go",
            "status": "pending",
            "tenant_id": tenant_id or username,
            "created_at": _utcnow(),
        }
        requests.insert_one(request)
        return _serialize_upgrade_request(request)
    except PyMongoError as exc:
        logger.error("Database error while creating upgrade request: %s", str(exc), exc_info=True)
        raise RuntimeError("Failed to create upgrade request") from exc


def list_upgrade_requests(
    *,
    status_filter: str = "pending",
    tenant_id: str | None = None,
    limit: int = 200,
) -> list[dict]:
    """Return upgrade requests for the admin review queue."""
    try:
        request_filter = {"status": status_filter}
        if tenant_id:
            request_filter["tenant_id"] = tenant_id
        requests = get_upgrade_requests_collection().find(request_filter).sort(
            "created_at", -1
        ).limit(max(min(limit, 200), 1))
        return [_serialize_upgrade_request(request) for request in requests]
    except PyMongoError as exc:
        logger.error("Database error while listing upgrade requests: %s", str(exc), exc_info=True)
        raise RuntimeError("Failed to list upgrade requests") from exc


def approve_upgrade_request(
    request_id: str,
    *,
    approved_by: str,
    tenant_id: str | None = None,
) -> dict:
    """Approve a pending request and apply its requested plan to the user."""
    try:
        requests = get_upgrade_requests_collection()
        request_filter = {"request_id": request_id, "status": "pending"}
        if tenant_id:
            request_filter["tenant_id"] = tenant_id
        request = requests.find_one(request_filter)
        if not request:
            raise UserNotFoundError(request_id)

        user_filter = {"username": request["username"]}
        if tenant_id:
            user_filter["tenant_id"] = tenant_id
        get_users_collection().update_one(
            user_filter,
            {"$set": {**plan_user_fields(request["requested_plan"]), "updated_at": _utcnow()}},
        )
        approved_at = _utcnow()
        requests.update_one(
            request_filter,
            {"$set": {"status": "approved", "approved_at": approved_at, "approved_by": approved_by}},
        )
        request.update({"status": "approved", "approved_at": approved_at, "approved_by": approved_by})
        return _serialize_upgrade_request(request)
    except UserNotFoundError:
        raise
    except PyMongoError as exc:
        logger.error("Database error while approving upgrade request: %s", str(exc), exc_info=True)
        raise RuntimeError("Failed to approve upgrade request") from exc


def _serialize_user(user: dict, expense_count: int) -> dict:
    created_at = user.get("created_at")
    last_login_at = user.get("last_login_at")
    return {
        "username": user["username"],
        "first_name": user.get("first_name"),
        "last_name": user.get("last_name"),
        "phone": user.get("phone"),
        "address": user.get("address"),
        "role": user.get("role", "user"),
        "plan": user.get("plan", DEFAULT_PLAN),
        "expense_limit": int(user.get("expense_limit", 0) or 0),
        "disable_rate_limit": bool(user.get("disable_rate_limit", False)),
        "email_verified": bool(user.get("email_verified", False)),
        "expense_count": expense_count,
        "tenant_id": user.get("tenant_id") or None,
        "created_at": created_at.isoformat() if created_at else None,
        "last_login_at": last_login_at.isoformat() if last_login_at else None,
    }


def list_users(
    skip: int = 0,
    limit: int = 50,
    search: str | None = None,
    tenant_id: str | None = None,
) -> dict:
    """Return a paginated list of users with their plan and usage.

    Uses a single $lookup aggregation to fetch expense counts for all users
    in one query rather than issuing one count per user (N+1 pattern).
    """
    try:
        users_col = get_users_collection()

        match_stage: dict = {}
        if tenant_id:
            match_stage["tenant_id"] = tenant_id
        if search:
            match_stage["username"] = {"$regex": search.strip(), "$options": "i"}

        pipeline = [
            *([ {"$match": match_stage} ] if match_stage else []),
            {"$sort": {"username": 1}},
            {"$facet": {
                "metadata": [{"$count": "total"}],
                "data": [
                    {"$skip": max(skip, 0)},
                    {"$limit": max(min(limit, 200), 1)},
                    {
                        "$lookup": {
                            "from": "expenses",
                            "localField": "username",
                            "foreignField": "username",
                            "as": "_expense_agg",
                        }
                    },
                    {
                        "$addFields": {
                            "_expense_count": {"$size": "$_expense_agg"}
                        }
                    },
                ],
            }},
        ]

        result = list(users_col.aggregate(pipeline))
        facet = result[0] if result else {}
        total = (facet.get("metadata") or [{}])[0].get("total", 0)
        items = [
            _serialize_user(user, int(user.get("_expense_count", 0)))
            for user in facet.get("data", [])
        ]

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
