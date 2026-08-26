import logging
import re
from contextlib import contextmanager
from datetime import UTC, date, datetime, time

from bson import ObjectId
from bson.errors import InvalidId
from pymongo.errors import PyMongoError

from app.db.mongo import (
    get_expense_line_items_collection,
    get_expenses_collection,
    get_mongo_client,
    get_users_collection,
)


@contextmanager
def _expense_transaction():
    """Yield a PyMongo session in a transaction; falls back to None in envs
    that don't support multi-document transactions (e.g. mongomock in tests)."""
    try:
        with get_mongo_client().start_session() as session:
            with session.start_transaction():
                yield session
    except (NotImplementedError, AttributeError):
        yield None

from app.core.plans import DEFAULT_PLAN

logger = logging.getLogger(__name__)

SESSION_EXPENSE_LIMIT = 10


class SessionExpenseLimitError(Exception):
    """Raised when a user exceeds their per-session expense limit."""

    pass


def _as_mongo_datetime(value: date) -> datetime:
    """Convert a date to a MongoDB-storable datetime at start of day."""
    return datetime.combine(value, time.min)


def add_expense(
    username: str,
    amount: float,
    category: str,
    bill_type: str,
    input_type: str,
    invoice_number: str,
    vendor: str,
    description: str,
    expense_date: date,
    llm_model: str | None = None,
    line_items: list[dict] | None = None,
    tenant_id: str | None = None,
):
    """Add a new expense for a user"""
    logger.info(
        f"Adding expense for user {username}: "
        f"${amount} - {category} - {vendor} on {expense_date}"
    )
    try:
        expenses = get_expenses_collection()
        expense_line_items = get_expense_line_items_collection()

        normalized_items = line_items or []
        normalized_invoice_number = _normalize_invoice_number(
            invoice_number,
            description,
        )
        normalized_llm_model = (llm_model or "").strip() or None

        doc: dict = {
            "username": username,
            "amount": round(float(amount), 2),
            "category": category.strip().lower(),
            "bill_type": bill_type.strip().lower(),
            "input_type": input_type.strip().lower(),
            "invoice_number": normalized_invoice_number,
            "vendor": vendor.strip(),
            "description": description.strip(),
            "expense_date": _as_mongo_datetime(expense_date),
            "llm_model": normalized_llm_model,
            "line_items_count": len(normalized_items),
            "created_at": datetime.now(UTC),
        }
        if tenant_id:
            doc["tenant_id"] = tenant_id
        with _expense_transaction() as session:
            result = expenses.insert_one(doc, session=session)
            expense_id = str(result.inserted_id)

            if normalized_items:
                line_item_docs = [
                    {
                        "expense_id": expense_id,
                        "username": username,
                        "name": item["name"],
                        "quantity": item["quantity"],
                        "unit_price": item["unit_price"],
                        "total": item["total"],
                        "created_at": datetime.now(UTC),
                    }
                    for item in normalized_items
                ]
                expense_line_items.insert_many(line_item_docs, session=session)

        logger.info(f"Expense added successfully with ID: {expense_id}")

        return {
            "id": expense_id,
            "amount": doc["amount"],
            "category": doc["category"],
            "bill_type": doc["bill_type"],
            "input_type": doc["input_type"],
            "invoice_number": doc["invoice_number"],
            "vendor": doc["vendor"],
            "description": doc["description"],
            "expense_date": expense_date.isoformat(),
            "llm_model": doc["llm_model"],
            "line_items": normalized_items,
        }
    except PyMongoError as exc:
        logger.error(
            ("Database error while adding expense for user " f"{username}: {str(exc)}"),
            exc_info=True,
        )
        raise RuntimeError("Failed to store expense due to database error") from exc
    except Exception as exc:
        logger.error(
            (
                "Unexpected error while adding expense for user "
                f"{username}: {str(exc)}"
            ),
            exc_info=True,
        )
        raise


def list_expenses(
    username: str,
    limit: int = 50,
    offset: int = 0,
    sort_dir: int = -1,
    tenant_id: str | None = None,
):
    """List expenses for a user with pagination.

    Returns a dict with 'items', 'total', 'limit', and 'offset' so callers
    can render pagination controls without a second count query.
    """
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    logger.debug("Fetching expenses for user (limit=%d, offset=%d)", limit, offset)
    try:
        expenses = get_expenses_collection()
        expense_line_items = get_expense_line_items_collection()
        base = _active_filter(username, tenant_id)
        total = expenses.count_documents(base)
        docs = list(
            expenses.find(base)
            .sort("expense_date", sort_dir)
            .skip(offset)
            .limit(limit)
        )

        expense_ids = [str(doc["_id"]) for doc in docs]
        line_items_map: dict[str, list[dict]] = {
            expense_id: [] for expense_id in expense_ids
        }

        if expense_ids:
            cursor = expense_line_items.find(
                {
                    "username": username,
                    "expense_id": {"$in": expense_ids},
                },
                {
                    "_id": 0,
                    "expense_id": 1,
                    "name": 1,
                    "quantity": 1,
                    "unit_price": 1,
                    "total": 1,
                },
            )
            for item_doc in cursor:
                expense_id = item_doc.get("expense_id")
                if expense_id in line_items_map:
                    line_items_map[expense_id].append(
                        {
                            "name": item_doc.get("name", "item"),
                            "quantity": float(item_doc.get("quantity", 1)),
                            "unit_price": round(
                                float(item_doc.get("unit_price", 0)), 2
                            ),
                            "total": round(float(item_doc.get("total", 0)), 2),
                        }
                    )

        result = [
            {
                "id": str(doc["_id"]),
                "amount": round(float(doc.get("amount", 0)), 2),
                "category": doc.get("category", "other"),
                "bill_type": doc.get("bill_type", "other"),
                "input_type": doc.get("input_type", "manual"),
                "invoice_number": doc.get("invoice_number", ""),
                "vendor": doc.get("vendor", ""),
                "description": doc.get("description", ""),
                "expense_date": doc["expense_date"].isoformat(),
                "llm_model": doc.get("llm_model"),
                "line_items": line_items_map.get(str(doc["_id"]), []),
            }
            for doc in docs
        ]
        logger.info("Retrieved %d/%d expenses (offset=%d)", len(result), total, offset)
        return {"items": result, "total": total, "limit": limit, "offset": offset}
    except PyMongoError as exc:
        logger.error(
            f"Database error while fetching expenses: {str(exc)}",
            exc_info=True,
        )
        raise RuntimeError("Failed to fetch expenses due to database error") from exc
    except Exception as exc:
        logger.error(
            (
                "Unexpected error while fetching expenses for user "
                f"{username}: {str(exc)}"
            ),
            exc_info=True,
        )
        raise


def _tenant_filter(username: str, tenant_id: str | None = None) -> dict:
    """Return a MongoDB filter scoped to username and (when available) tenant_id."""
    f: dict = {"username": username}
    if tenant_id:
        f["tenant_id"] = tenant_id
    return f


def _active_filter(username: str, tenant_id: str | None = None) -> dict:
    """Like _tenant_filter but also excludes soft-deleted documents."""
    return {**_tenant_filter(username, tenant_id), "is_deleted": {"$ne": True}}


def _parse_expense_id(expense_id: str) -> ObjectId:
    """Convert a string expense ID to ObjectId, raising ValueError on bad format."""
    try:
        return ObjectId(expense_id)
    except (InvalidId, TypeError) as exc:
        raise ValueError(f"Invalid expense ID: {expense_id}") from exc


def _serialize_expense(doc: dict, line_items: list[dict] | None = None) -> dict:
    """Serialize a single MongoDB expense document to API shape."""
    return {
        "id": str(doc["_id"]),
        "amount": round(float(doc.get("amount", 0)), 2),
        "category": doc.get("category", "other"),
        "bill_type": doc.get("bill_type", "other"),
        "input_type": doc.get("input_type", "manual"),
        "invoice_number": doc.get("invoice_number", ""),
        "vendor": doc.get("vendor", ""),
        "description": doc.get("description", ""),
        "expense_date": doc["expense_date"].isoformat(),
        "llm_model": doc.get("llm_model"),
        "line_items": line_items or [],
    }


def get_expense(username: str, expense_id: str, tenant_id: str | None = None) -> dict | None:
    """Return a single expense owned by username, or None if not found."""
    try:
        oid = _parse_expense_id(expense_id)
        expenses = get_expenses_collection()
        expense_line_items = get_expense_line_items_collection()
        doc = expenses.find_one({"_id": oid, **_active_filter(username, tenant_id)})
        if doc is None:
            return None
        items = list(
            expense_line_items.find(
                {"expense_id": expense_id, "username": username},
                {"_id": 0, "name": 1, "quantity": 1, "unit_price": 1, "total": 1},
            )
        )
        return _serialize_expense(doc, items)
    except ValueError:
        return None
    except PyMongoError as exc:
        raise RuntimeError("Failed to fetch expense") from exc


def update_expense(username: str, expense_id: str, updates: dict, tenant_id: str | None = None) -> dict | None:
    """Apply a partial update to an expense owned by username.

    Returns the updated expense dict, or None if the expense wasn't found.
    """
    try:
        oid = _parse_expense_id(expense_id)
        expenses = get_expenses_collection()
        set_fields: dict = {}
        if "amount" in updates and updates["amount"] is not None:
            set_fields["amount"] = round(float(updates["amount"]), 2)
        if "category" in updates and updates["category"] is not None:
            set_fields["category"] = updates["category"].strip().lower()
        if "bill_type" in updates and updates["bill_type"] is not None:
            set_fields["bill_type"] = updates["bill_type"]
        if "invoice_number" in updates and updates["invoice_number"] is not None:
            set_fields["invoice_number"] = updates["invoice_number"].strip()
        if "vendor" in updates and updates["vendor"] is not None:
            set_fields["vendor"] = updates["vendor"].strip()
        if "description" in updates and updates["description"] is not None:
            set_fields["description"] = updates["description"].strip()
        if "expense_date" in updates and updates["expense_date"] is not None:
            set_fields["expense_date"] = _as_mongo_datetime(updates["expense_date"])
        if not set_fields:
            return get_expense(username, expense_id, tenant_id)
        set_fields["updated_at"] = datetime.now(UTC)
        result = expenses.update_one(
            {"_id": oid, **_active_filter(username, tenant_id)},
            {"$set": set_fields},
        )
        if result.matched_count == 0:
            return None
        return get_expense(username, expense_id, tenant_id)
    except ValueError:
        return None
    except PyMongoError as exc:
        raise RuntimeError("Failed to update expense") from exc


def delete_expense(username: str, expense_id: str, tenant_id: str | None = None) -> bool:
    """Soft-delete an expense owned by username.

    Sets is_deleted=True and deleted_at timestamp instead of removing the
    document, preserving audit history. Returns True if marked deleted,
    False if not found (or already deleted).
    """
    try:
        oid = _parse_expense_id(expense_id)
        expenses = get_expenses_collection()
        result = expenses.update_one(
            {"_id": oid, **_active_filter(username, tenant_id)},
            {"$set": {"is_deleted": True, "deleted_at": datetime.now(UTC)}},
        )
        return result.matched_count > 0
    except ValueError:
        return False
    except PyMongoError as exc:
        raise RuntimeError("Failed to delete expense") from exc


def check_session_expense_limit(username: str, tenant_id: str | None = None) -> None:
    """Raise SessionExpenseLimitError if the overall expense limit is hit."""
    try:
        disable_rate_limit, effective_limit = _get_user_rate_limit_config(
            username,
        )
        if disable_rate_limit:
            return

        expenses = get_expenses_collection()
        count = expenses.count_documents(_active_filter(username, tenant_id))

        if count >= effective_limit:
            logger.warning(
                "Expense limit reached for user %s: %d/%d",
                username,
                count,
                effective_limit,
            )
            raise SessionExpenseLimitError(
                f"You have reached the maximum of "
                f"{effective_limit} expenses. "
                "Please contact our customer team to continue."
            )
    except SessionExpenseLimitError:
        raise
    except PyMongoError as exc:
        logger.error(
            "Database error while checking session expense limit: %s",
            str(exc),
            exc_info=True,
        )
        raise RuntimeError(
            "Failed to check expense limit due to database error"
        ) from exc


def get_expense_limit_status(username: str, tenant_id: str | None = None) -> dict:
    """Return expense limit status for the given user."""
    try:
        disable_rate_limit, effective_limit = _get_user_rate_limit_config(
            username,
        )
        expenses = get_expenses_collection()
        count = expenses.count_documents(_active_filter(username, tenant_id))
        reached = (not disable_rate_limit) and count >= effective_limit
        remaining = None if disable_rate_limit else max(effective_limit - count, 0)
        return {
            "limit": effective_limit,
            "count": count,
            "remaining": remaining,
            "reached": reached,
            "disable_rate_limit": disable_rate_limit,
        }
    except PyMongoError as exc:
        logger.error(
            "Database error while fetching expense limit status: %s",
            str(exc),
            exc_info=True,
        )
        raise RuntimeError(
            "Failed to fetch expense limit status due to database error"
        ) from exc


def _get_user_rate_limit_config(username: str) -> tuple[bool, int]:
    """Return per-user rate limit config with fallback defaults."""
    users = get_users_collection()
    user = users.find_one(
        {"username": username},
        {"disable_rate_limit": 1, "expense_limit": 1, "plan": 1},
    )
    if not user:
        return False, SESSION_EXPENSE_LIMIT

    default_patch: dict[str, bool | int | str] = {}
    if "plan" not in user:
        default_patch["plan"] = DEFAULT_PLAN
    if "disable_rate_limit" not in user:
        default_patch["disable_rate_limit"] = False
    if "expense_limit" not in user:
        default_patch["expense_limit"] = SESSION_EXPENSE_LIMIT
    if default_patch:
        users.update_one({"_id": user["_id"]}, {"$set": default_patch})

    disable_rate_limit = bool(user.get("disable_rate_limit", False))

    raw_limit = user.get("expense_limit", SESSION_EXPENSE_LIMIT)
    try:
        expense_limit = int(raw_limit)
    except (TypeError, ValueError):
        expense_limit = SESSION_EXPENSE_LIMIT

    if expense_limit <= 0:
        expense_limit = SESSION_EXPENSE_LIMIT

    return disable_rate_limit, expense_limit


def _normalize_invoice_number(
    raw_invoice_number: str | None,
    description: str | None,
) -> str:
    """Normalize invoice number, or derive it from free-form text."""
    if raw_invoice_number and raw_invoice_number.strip():
        return _sanitize_invoice_number(raw_invoice_number)

    if description:
        extracted = _extract_invoice_number_from_text(description)
        if extracted:
            return extracted

    return ""


def _sanitize_invoice_number(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", value).strip()
    cleaned = re.sub(r"[^A-Za-z0-9\-/]", "", cleaned)
    return cleaned[:64]


def _extract_invoice_number_from_text(text: str) -> str:
    patterns = [
        (
            r"(?:invoice|inv|bill|receipt)\s*(?:no|number|#|:)?\s*"
            r"([A-Za-z0-9\-/]{3,64})"
        ),
        r"\b([A-Za-z]{2,6}[-/][A-Za-z0-9\-/]{2,58})\b",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if not match:
            continue
        candidate = _sanitize_invoice_number(match.group(1))
        if candidate:
            return candidate

    return ""


def monthly_summary(username: str, year: int, tenant_id: str | None = None):
    """Get monthly expense summary for a user for a specific year"""
    logger.debug(f"Fetching monthly summary for year {year}")
    try:
        expenses = get_expenses_collection()
        start = _as_mongo_datetime(date(year, 1, 1))
        end = _as_mongo_datetime(date(year + 1, 1, 1))
        pipeline = [
            {
                "$match": {
                    **_tenant_filter(username, tenant_id),
                    "expense_date": {"$gte": start, "$lt": end},
                }
            },
            {
                "$group": {
                    "_id": {"month": {"$month": "$expense_date"}},
                    "total": {"$sum": "$amount"},
                }
            },
        ]
        result = list(expenses.aggregate(pipeline))
        totals = {row["_id"]["month"]: round(float(row["total"]), 2) for row in result}

        summary = [{"month": m, "total": totals.get(m, 0.0)} for m in range(1, 13)]
        total_year = sum(totals.values())
        logger.info(
            f"Monthly summary for year {year}: "
            f"Total ${total_year:.2f} across {len(totals)} months"
        )
        return summary
    except PyMongoError as exc:
        logger.error(
            f"Database error while fetching monthly summary "
            f"for user {username}, year {year}: {str(exc)}",
            exc_info=True,
        )
        raise RuntimeError(
            "Failed to fetch monthly summary due to database error"
        ) from exc
    except Exception as exc:
        logger.error(
            f"Unexpected error while fetching monthly summary "
            f"for user {username}, year {year}: {str(exc)}",
            exc_info=True,
        )
        raise


def yearly_summary(username: str, tenant_id: str | None = None):
    """Get yearly expense summary for a user"""
    logger.debug("Fetching yearly summary for user")
    try:
        expenses = get_expenses_collection()
        pipeline = [
            {"$match": _tenant_filter(username, tenant_id)},
            {
                "$group": {
                    "_id": {"year": {"$year": "$expense_date"}},
                    "total": {"$sum": "$amount"},
                }
            },
            {"$sort": {"_id.year": 1}},
        ]
        result = list(expenses.aggregate(pipeline))
        summary = [
            {
                "year": row["_id"]["year"],
                "total": round(float(row["total"]), 2),
            }
            for row in result
        ]
        logger.info(f"Yearly summary: {len(summary)} years of data")
        return summary
    except PyMongoError as exc:
        logger.error(
            f"Database error while fetching yearly summary "
            f"for user {username}: {str(exc)}",
            exc_info=True,
        )
        raise RuntimeError(
            "Failed to fetch yearly summary due to database error"
        ) from exc
    except Exception as exc:
        logger.error(
            f"Unexpected error while fetching yearly summary "
            f"for user {username}: {str(exc)}",
            exc_info=True,
        )
        raise


def daily_summary(username: str, year: int, month: int, tenant_id: str | None = None) -> list[dict]:
    """Get daily expense totals for a user for a specific year+month."""
    import calendar

    logger.debug(f"Fetching daily summary for {year}-{month}")
    try:
        expenses = get_expenses_collection()
        start = _as_mongo_datetime(date(year, month, 1))
        if month == 12:
            end = _as_mongo_datetime(date(year + 1, 1, 1))
        else:
            end = _as_mongo_datetime(date(year, month + 1, 1))
        pipeline = [
            {
                "$match": {
                    **_tenant_filter(username, tenant_id),
                    "expense_date": {"$gte": start, "$lt": end},
                }
            },
            {
                "$group": {
                    "_id": {"day": {"$dayOfMonth": "$expense_date"}},
                    "total": {"$sum": "$amount"},
                }
            },
        ]
        result = list(expenses.aggregate(pipeline))
        totals = {row["_id"]["day"]: round(float(row["total"]), 2) for row in result}
        days_in_month = calendar.monthrange(year, month)[1]
        summary = [
            {"day": d, "total": totals.get(d, 0.0)} for d in range(1, days_in_month + 1)
        ]
        logger.info(f"Daily summary for {year}-{month}: {len(totals)} days with data")
        return summary
    except PyMongoError as exc:
        logger.error(
            f"Database error while fetching daily summary for user {username}, "
            f"{year}-{month}: {str(exc)}",
            exc_info=True,
        )
        raise RuntimeError(
            "Failed to fetch daily summary due to database error"
        ) from exc
    except Exception as exc:
        logger.error(
            f"Unexpected error while fetching daily summary for user {username}, "
            f"{year}-{month}: {str(exc)}",
            exc_info=True,
        )
        raise


def categories_monthly_summary(username: str, year: int, month: int, tenant_id: str | None = None) -> list[dict]:
    """Get category-wise expense totals for a user for a specific year+month."""
    logger.debug(f"Fetching categories monthly summary for {year}-{month}")
    try:
        expenses = get_expenses_collection()
        start = _as_mongo_datetime(date(year, month, 1))
        if month == 12:
            end = _as_mongo_datetime(date(year + 1, 1, 1))
        else:
            end = _as_mongo_datetime(date(year, month + 1, 1))
        pipeline = [
            {
                "$match": {
                    **_tenant_filter(username, tenant_id),
                    "expense_date": {"$gte": start, "$lt": end},
                }
            },
            {
                "$group": {
                    "_id": {"category": "$category"},
                    "total": {"$sum": "$amount"},
                }
            },
            {"$sort": {"total": -1}},
        ]
        result = list(expenses.aggregate(pipeline))
        summary = [
            {"category": row["_id"]["category"], "total": round(float(row["total"]), 2)}
            for row in result
        ]
        logger.info(
            f"Categories monthly summary for {year}-{month}: {len(summary)} categories"
        )
        return summary
    except PyMongoError as exc:
        logger.error(
            f"Database error while fetching categories monthly summary for user {username}, "
            f"{year}-{month}: {str(exc)}",
            exc_info=True,
        )
        raise RuntimeError(
            "Failed to fetch categories monthly summary due to database error"
        ) from exc
    except Exception as exc:
        logger.error(
            f"Unexpected error while fetching categories monthly summary for user {username}, "
            f"{year}-{month}: {str(exc)}",
            exc_info=True,
        )
        raise


def vendors_monthly_summary(username: str, year: int, month: int, tenant_id: str | None = None) -> list[dict]:
    """Get vendor-wise expense totals for a user for a specific year+month."""
    logger.debug(f"Fetching vendors monthly summary for {year}-{month}")
    try:
        expenses = get_expenses_collection()
        start = _as_mongo_datetime(date(year, month, 1))
        if month == 12:
            end = _as_mongo_datetime(date(year + 1, 1, 1))
        else:
            end = _as_mongo_datetime(date(year, month + 1, 1))
        pipeline = [
            {
                "$match": {
                    **_tenant_filter(username, tenant_id),
                    "expense_date": {"$gte": start, "$lt": end},
                }
            },
            {
                "$group": {
                    "_id": {"vendor": "$vendor"},
                    "total": {"$sum": "$amount"},
                }
            },
            {"$sort": {"total": -1}},
        ]
        result = list(expenses.aggregate(pipeline))
        summary = [
            {
                "vendor": row["_id"]["vendor"] or "",
                "total": round(float(row["total"]), 2),
            }
            for row in result
        ]
        logger.info(
            f"Vendors monthly summary for {year}-{month}: {len(summary)} vendors"
        )
        return summary
    except PyMongoError as exc:
        logger.error(
            f"Database error while fetching vendors monthly summary for user {username}, "
            f"{year}-{month}: {str(exc)}",
            exc_info=True,
        )
        raise RuntimeError(
            "Failed to fetch vendors monthly summary due to database error"
        ) from exc
    except Exception as exc:
        logger.error(
            f"Unexpected error while fetching vendors monthly summary for user {username}, "
            f"{year}-{month}: {str(exc)}",
            exc_info=True,
        )
        raise


def category_summary(
    username: str,
    year: int | None = None,
    month: int | None = None,
    tenant_id: str | None = None,
):
    """Get category-wise expense summary for a user"""
    period = f"year={year}, month={month}" if year else "all time"
    logger.debug(f"Fetching category summary for period: {period}")
    try:
        expenses = get_expenses_collection()
        match: dict = _tenant_filter(username, tenant_id)
        if year is not None:
            start_month = month if month is not None else 1
            start = _as_mongo_datetime(date(year, start_month, 1))
            if month is None:
                end = _as_mongo_datetime(date(year + 1, 1, 1))
            else:
                end_date = (
                    date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
                )
                end = _as_mongo_datetime(end_date)
            match["expense_date"] = {"$gte": start, "$lt": end}

        pipeline = [
            {"$match": match},
            {
                "$group": {
                    "_id": {"category": "$category"},
                    "total": {"$sum": "$amount"},
                }
            },
            {"$sort": {"total": -1}},
        ]
        result = list(expenses.aggregate(pipeline))
        summary = [
            {
                "category": row["_id"]["category"],
                "total": round(float(row["total"]), 2),
            }
            for row in result
        ]
        logger.info(f"Category summary ({period}): " f"{len(summary)} categories")
        return summary
    except PyMongoError as exc:
        logger.error(
            f"Database error while fetching category summary "
            f"for user {username} ({period}): {str(exc)}",
            exc_info=True,
        )
        raise RuntimeError(
            "Failed to fetch category summary due to database error"
        ) from exc
    except Exception as exc:
        logger.error(
            f"Unexpected error while fetching category summary "
            f"for user {username} ({period}): {str(exc)}",
            exc_info=True,
        )
        raise
