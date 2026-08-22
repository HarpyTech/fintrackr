from datetime import date, datetime, time, timezone
import re
from pymongo.errors import PyMongoError
import logging

from app.db.mongo import (
    get_expense_line_items_collection,
    get_expenses_collection,
    get_users_collection,
)

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

        doc = {
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
            "created_at": datetime.now(timezone.utc),
        }
        result = expenses.insert_one(doc)

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
                    "created_at": datetime.now(timezone.utc),
                }
                for item in normalized_items
            ]
            expense_line_items.insert_many(line_item_docs)

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


def list_expenses(username: str):
    """List all expenses for a user"""
    logger.debug("Fetching all expenses for user")
    try:
        expenses = get_expenses_collection()
        expense_line_items = get_expense_line_items_collection()
        docs = list(expenses.find({"username": username}).sort("expense_date", -1))

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
        logger.info(f"Retrieved {len(result)} expenses")
        return result
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


def check_session_expense_limit(username: str) -> None:
    """Raise SessionExpenseLimitError if the overall expense limit is hit."""
    try:
        disable_rate_limit, effective_limit = _get_user_rate_limit_config(
            username,
        )
        if disable_rate_limit:
            return

        expenses = get_expenses_collection()
        count = expenses.count_documents({"username": username})

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


def get_expense_limit_status(username: str) -> dict:
    """Return expense limit status for the given user."""
    try:
        disable_rate_limit, effective_limit = _get_user_rate_limit_config(
            username,
        )
        expenses = get_expenses_collection()
        count = expenses.count_documents({"username": username})
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


def monthly_summary(username: str, year: int):
    """Get monthly expense summary for a user for a specific year"""
    logger.debug(f"Fetching monthly summary for year {year}")
    try:
        expenses = get_expenses_collection()
        start = _as_mongo_datetime(date(year, 1, 1))
        end = _as_mongo_datetime(date(year + 1, 1, 1))
        pipeline = [
            {
                "$match": {
                    "username": username,
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


def yearly_summary(username: str):
    """Get yearly expense summary for a user"""
    logger.debug("Fetching yearly summary for user")
    try:
        expenses = get_expenses_collection()
        pipeline = [
            {"$match": {"username": username}},
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


def daily_summary(username: str, year: int, month: int) -> list[dict]:
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
                    "username": username,
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


def categories_monthly_summary(username: str, year: int, month: int) -> list[dict]:
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
                    "username": username,
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


def vendors_monthly_summary(username: str, year: int, month: int) -> list[dict]:
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
                    "username": username,
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
):
    """Get category-wise expense summary for a user"""
    period = f"year={year}, month={month}" if year else "all time"
    logger.debug(f"Fetching category summary for period: {period}")
    try:
        expenses = get_expenses_collection()
        match: dict = {"username": username}
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
