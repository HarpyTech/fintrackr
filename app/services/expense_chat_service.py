from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
import json
import logging
import re

from pymongo.errors import PyMongoError

from app.db.mongo import (
    get_expense_line_items_collection,
    get_expenses_collection,
)

logger = logging.getLogger(__name__)

_MONTH_ALIASES = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}
_MONTH_NAMES = {
    1: "Jan",
    2: "Feb",
    3: "Mar",
    4: "Apr",
    5: "May",
    6: "Jun",
    7: "Jul",
    8: "Aug",
    9: "Sep",
    10: "Oct",
    11: "Nov",
    12: "Dec",
}
_TOP_PATTERN = re.compile(r"\btop\s+(\d{1,2})\b", re.IGNORECASE)
_YEAR_PATTERN = re.compile(r"\b(20\d{2})\b")
_MONTH_PATTERN = re.compile(
    r"\b(" + "|".join(sorted(_MONTH_ALIASES.keys(), key=len, reverse=True)) + r")\b",
    re.IGNORECASE,
)
_ANALYSIS_HINTS = (
    "top",
    "summary",
    "summarize",
    "analysis",
    "analyze",
    "highest",
    "breakdown",
    "report",
    "show me",
    "list",
    "how much",
)


@dataclass(frozen=True)
class TimeWindow:
    start: datetime | None
    end: datetime | None
    label: str


def looks_like_expense_analysis_request(message: str) -> bool:
    text = (message or "").strip().lower()
    if not text:
        return False

    if any(hint in text for hint in _ANALYSIS_HINTS):
        return True

    if ("spent" in text or "spend" in text) and any(
        phrase in text
        for phrase in (
            "what",
            "which",
            "where",
            "give me",
            "tell me",
            "most",
            "total",
        )
    ):
        return True

    return False


def answer_expense_analysis_query(username: str, message: str) -> dict:
    """Run a read-only expense analysis based on a chat message."""
    if not message or not message.strip():
        raise ValueError("message is required")

    try:
        spec = _parse_analysis_request(message)
        if spec["view"] == "ranking":
            if spec["subject"] == "item":
                return _run_item_ranking(
                    username=username,
                    window=spec["window"],
                    limit=spec["limit"],
                    original_message=message,
                )

            return _run_expense_ranking(
                username=username,
                subject=spec["subject"],
                window=spec["window"],
                limit=spec["limit"],
                original_message=message,
            )

        return _run_overview(
            username=username,
            window=spec["window"],
            original_message=message,
        )
    except PyMongoError as exc:
        logger.error(
            "Database error while answering expense chat query: %s",
            str(exc),
            exc_info=True,
        )
        raise RuntimeError(
            "Failed to analyze expenses due to a database error"
        ) from exc


def _parse_analysis_request(message: str) -> dict:
    lower_message = message.lower()
    is_ranking = any(token in lower_message for token in ("top", "most", "highest"))

    if re.search(r"\bitems?\b|\bproducts?\b", lower_message):
        subject = "item"
    elif re.search(
        r"\bvendors?\b|\bmerchants?\b|\bstores?\b",
        lower_message,
    ):
        subject = "vendor"
    elif re.search(r"\bcategor(?:y|ies)\b|\btypes?\b", lower_message):
        subject = "category"
    elif is_ranking:
        subject = "item"
    else:
        subject = "overview"

    top_match = _TOP_PATTERN.search(lower_message)
    limit = int(top_match.group(1)) if top_match else 5

    return {
        "view": "ranking" if is_ranking else "overview",
        "subject": subject,
        "limit": max(1, min(limit, 20)),
        "window": _resolve_time_window(lower_message),
    }


def _resolve_time_window(message: str) -> TimeWindow:
    today = date.today()

    if "today" in message:
        start_date = today
        return TimeWindow(
            start=_start_of_day(start_date),
            end=_start_of_day(start_date + timedelta(days=1)),
            label=start_date.isoformat(),
        )

    if "this month" in message:
        return _month_window(today.year, today.month)

    if "last month" in message:
        previous_month_anchor = today.replace(day=1) - timedelta(days=1)
        return _month_window(
            previous_month_anchor.year,
            previous_month_anchor.month,
        )

    if "this year" in message:
        return _year_window(today.year)

    month_match = _MONTH_PATTERN.search(message)
    year_match = _YEAR_PATTERN.search(message)

    if month_match:
        month_key = month_match.group(1).lower()
        month = _MONTH_ALIASES[month_key]
        year = int(year_match.group(1)) if year_match else today.year
        return _month_window(year, month)

    if year_match:
        return _year_window(int(year_match.group(1)))

    return TimeWindow(start=None, end=None, label="all time")


def _year_window(year: int) -> TimeWindow:
    return TimeWindow(
        start=_start_of_day(date(year, 1, 1)),
        end=_start_of_day(date(year + 1, 1, 1)),
        label=str(year),
    )


def _month_window(year: int, month: int) -> TimeWindow:
    next_year = year + 1 if month == 12 else year
    next_month = 1 if month == 12 else month + 1
    return TimeWindow(
        start=_start_of_day(date(year, month, 1)),
        end=_start_of_day(date(next_year, next_month, 1)),
        label=f"{_MONTH_NAMES[month]} {year}",
    )


def _start_of_day(value: date) -> datetime:
    return datetime.combine(value, time.min)


def _build_expense_match(username: str, window: TimeWindow) -> dict:
    match: dict = {"username": username}
    if window.start and window.end:
        match["expense_date"] = {
            "$gte": window.start,
            "$lt": window.end,
        }
    return match


def _run_item_ranking(
    username: str,
    window: TimeWindow,
    limit: int,
    original_message: str,
) -> dict:
    line_items = get_expense_line_items_collection()
    pipeline = [
        {"$match": {"username": username}},
        {
            "$lookup": {
                "from": "expenses",
                "let": {
                    "expense_id": "$expense_id",
                    "username": "$username",
                },
                "pipeline": [
                    {
                        "$match": {
                            "$expr": {
                                "$and": [
                                    {
                                        "$eq": [
                                            {"$toString": "$_id"},
                                            "$$expense_id",
                                        ]
                                    },
                                    {"$eq": ["$username", "$$username"]},
                                ]
                            }
                        }
                    },
                    {
                        "$project": {
                            "expense_date": 1,
                            "vendor": 1,
                            "category": 1,
                        }
                    },
                ],
                "as": "expense",
            }
        },
        {"$unwind": "$expense"},
    ]
    if window.start and window.end:
        pipeline.append(
            {
                "$match": {
                    "expense.expense_date": {
                        "$gte": window.start,
                        "$lt": window.end,
                    }
                }
            }
        )

    pipeline.extend(
        [
            {
                "$group": {
                    "_id": "$name",
                    "total": {"$sum": "$total"},
                    "entries": {"$sum": 1},
                }
            },
            {"$sort": {"total": -1, "_id": 1}},
            {"$limit": limit},
        ]
    )

    result = list(line_items.aggregate(pipeline))
    if not result:
        return {
            "mode": "analysis",
            "message": (
                f"I couldn't find item-level expense data for {window.label}. "
                "Item summaries only work for expenses that stored "
                "line items. "
                "Try asking for top vendors or top categories instead."
            ),
            "analysis": {
                "request": original_message,
                "subject": "item",
                "period": window.label,
                "results": [],
            },
            "query": {
                "type": "aggregate",
                "collection": "expense_line_items",
                "pipeline": _serialize_pipeline(pipeline),
            },
        }

    ranked_items = [
        {
            "name": row.get("_id") or "Unknown item",
            "total": round(float(row.get("total", 0)), 2),
            "entries": int(row.get("entries", 0)),
        }
        for row in result
    ]
    total_spend = round(sum(row["total"] for row in ranked_items), 2)

    message_lines = [f"Top {len(ranked_items)} items by spend for {window.label}:"]
    for index, row in enumerate(ranked_items, start=1):
        message_lines.append(
            f"{index}. {row['name']} - ${row['total']:.2f} "
            f"across {row['entries']} logged item(s)"
        )
    message_lines.append(f"Tracked spend across those items: ${total_spend:.2f}.")

    return {
        "mode": "analysis",
        "message": "\n".join(message_lines),
        "analysis": {
            "request": original_message,
            "subject": "item",
            "period": window.label,
            "results": ranked_items,
            "total": total_spend,
        },
        "query": {
            "type": "aggregate",
            "collection": "expense_line_items",
            "pipeline": _serialize_pipeline(pipeline),
        },
    }


def _run_expense_ranking(
    username: str,
    subject: str,
    window: TimeWindow,
    limit: int,
    original_message: str,
) -> dict:
    expenses = get_expenses_collection()
    field_name = "vendor" if subject == "vendor" else "category"
    label_name = "vendor" if subject == "vendor" else "category"
    pipeline = [
        {"$match": _build_expense_match(username, window)},
        {
            "$group": {
                "_id": f"${field_name}",
                "total": {"$sum": "$amount"},
                "expenses_count": {"$sum": 1},
            }
        },
        {"$sort": {"total": -1, "_id": 1}},
        {"$limit": limit},
    ]
    result = list(expenses.aggregate(pipeline))

    ranked_rows = [
        {
            label_name: (row.get("_id") or "Unknown").strip() or "Unknown",
            "total": round(float(row.get("total", 0)), 2),
            "expenses_count": int(row.get("expenses_count", 0)),
        }
        for row in result
    ]
    if not ranked_rows:
        return {
            "mode": "analysis",
            "message": f"No expenses matched {window.label} for this summary.",
            "analysis": {
                "request": original_message,
                "subject": subject,
                "period": window.label,
                "results": [],
            },
            "query": {
                "type": "aggregate",
                "collection": "expenses",
                "pipeline": _serialize_pipeline(pipeline),
            },
        }

    total_spend = round(sum(row["total"] for row in ranked_rows), 2)
    message_lines = [f"Top {len(ranked_rows)} {subject}s by spend for {window.label}:"]
    for index, row in enumerate(ranked_rows, start=1):
        message_lines.append(
            f"{index}. {row[label_name]} - ${row['total']:.2f} "
            f"across {row['expenses_count']} expense(s)"
        )
    message_lines.append(f"Tracked spend across those {subject}s: ${total_spend:.2f}.")

    return {
        "mode": "analysis",
        "message": "\n".join(message_lines),
        "analysis": {
            "request": original_message,
            "subject": subject,
            "period": window.label,
            "results": ranked_rows,
            "total": total_spend,
        },
        "query": {
            "type": "aggregate",
            "collection": "expenses",
            "pipeline": _serialize_pipeline(pipeline),
        },
    }


def _run_overview(
    username: str,
    window: TimeWindow,
    original_message: str,
) -> dict:
    expenses = get_expenses_collection()
    match = _build_expense_match(username, window)
    overview_pipeline = [
        {"$match": match},
        {
            "$group": {
                "_id": None,
                "total": {"$sum": "$amount"},
                "expenses_count": {"$sum": 1},
                "average": {"$avg": "$amount"},
            }
        },
    ]
    overview_rows = list(expenses.aggregate(overview_pipeline))
    if not overview_rows:
        return {
            "mode": "analysis",
            "message": f"No expenses matched {window.label} for this summary.",
            "analysis": {
                "request": original_message,
                "subject": "overview",
                "period": window.label,
                "results": [],
            },
            "query": {
                "type": "aggregate",
                "collection": "expenses",
                "pipeline": _serialize_pipeline(overview_pipeline),
            },
        }

    overview = overview_rows[0]
    top_category = _run_top_dimension(match, "category")
    top_vendor = _run_top_dimension(match, "vendor")

    message_lines = [f"Expense summary for {window.label}:"]
    message_lines.append(
        f"Total spend: ${float(overview['total']):.2f} across "
        f"{int(overview['expenses_count'])} expense(s)."
    )
    message_lines.append(f"Average expense: ${float(overview['average']):.2f}.")
    if top_category:
        message_lines.append(
            f"Top category: {top_category['name']} " f"(${top_category['total']:.2f})."
        )
    if top_vendor:
        message_lines.append(
            f"Top vendor: {top_vendor['name']} " f"(${top_vendor['total']:.2f})."
        )

    return {
        "mode": "analysis",
        "message": "\n".join(message_lines),
        "analysis": {
            "request": original_message,
            "subject": "overview",
            "period": window.label,
            "results": [
                {
                    "total": round(float(overview["total"]), 2),
                    "expenses_count": int(overview["expenses_count"]),
                    "average": round(float(overview["average"]), 2),
                    "top_category": top_category,
                    "top_vendor": top_vendor,
                }
            ],
        },
        "query": {
            "type": "aggregate",
            "collection": "expenses",
            "pipeline": _serialize_pipeline(overview_pipeline),
        },
    }


def _run_top_dimension(match: dict, field_name: str) -> dict | None:
    expenses = get_expenses_collection()
    pipeline = [
        {"$match": match},
        {
            "$group": {
                "_id": f"${field_name}",
                "total": {"$sum": "$amount"},
            }
        },
        {"$sort": {"total": -1, "_id": 1}},
        {"$limit": 1},
    ]
    rows = list(expenses.aggregate(pipeline))
    if not rows:
        return None

    top_row = rows[0]
    return {
        "name": (top_row.get("_id") or "Unknown").strip() or "Unknown",
        "total": round(float(top_row.get("total", 0)), 2),
    }


def _serialize_pipeline(pipeline: list[dict]) -> str:
    return json.dumps(_normalize_for_json(pipeline), ensure_ascii=True)


def _normalize_for_json(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, list):
        return [_normalize_for_json(item) for item in value]
    if isinstance(value, dict):
        return {key: _normalize_for_json(item) for key, item in value.items()}
    return value
