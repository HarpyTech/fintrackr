"""
The analytics agent: one orchestrator, several tools and one LLM sub-agent.

Flow for a question:

    intent_router      (no LLM)  fast path for common asks
    schema_context     (no LLM)  what fields and values exist, for grounding
    query_author       (LLM)     natural language -> MongoQueryEnvelope
    query_guard        (no LLM)  allow-list validation + username scoping
    query_executor     (no LLM)  run it
    chart_builder      (no LLM)  rows -> visual spec
    narrator           (no LLM)  rows -> prose with real numbers
    clarifier          (no LLM)  ambiguous question -> ask, don't guess

Only `query_author` calls a model, and it returns the query and the chart hint
in one response, so the normal path costs a single round-trip. A guard
rejection buys exactly one repair attempt; after that the request falls back to
the deterministic regex analytics in expense_chat_service.

Steps after the author are deliberately not model-backed: executing a
validated query and picking a chart from a result shape are decisions with
right answers, and putting a model in that path would add latency, cost, and a
chance of mutating a query that already passed validation.
"""

from __future__ import annotations

import logging
import time
import uuid
from datetime import date, datetime, timezone
from typing import Any, Callable

from pydantic import ValidationError

from app.core.config import settings
from app.core.ratelimit import LlmRateLimitError
from app.db.mongo import (
    get_expense_line_items_collection,
    get_expenses_collection,
)
from app.models.mongo_query import (
    ChartHint,
    MongoQueryEnvelope,
    MongoQueryEnvelopeLLM,
)
from app.services import analytics_narrative as narrative
from app.services import chart_builder
from app.services.gemini_client import (
    GeminiUnavailable,
    LlmBudget,
    LlmBudgetExhausted,
    generate_structured,
    is_configured,
)
from app.services.mongo_guard import (
    COLLECTION_FIELDS,
    QueryRejected,
    validate_and_compile,
)

logger = logging.getLogger(__name__)

# Cache of per-user grounding context, so repeated questions don't re-scan.
_context_cache: dict[str, tuple[float, dict]] = {}
_CONTEXT_TTL_SECONDS = 600

PhaseCallback = Callable[[str, str], None]


def _noop_phase(name: str, label: str) -> None:
    return None


# --------------------------------------------------------------------------
# Tool: schema_context
# --------------------------------------------------------------------------

def build_schema_context(username: str) -> dict:
    """
    Grounding facts for the author prompt.

    Without the user's actual category and vendor spellings the model invents
    them, and a filter on a value that does not exist returns zero rows. Both
    fields are free text (vendor is not even lowercased, so "Walmart" and
    "walmart" are distinct keys), which makes this necessary rather than nice.
    """
    cached = _context_cache.get(username)
    now = time.monotonic()
    if cached and (now - cached[0]) < _CONTEXT_TTL_SECONDS:
        return cached[1]

    collection = get_expenses_collection()

    def _top(field: str, limit: int = 25) -> list[str]:
        try:
            rows = collection.aggregate(
                [
                    {"$match": {"username": username}},
                    {"$group": {"_id": f"${field}", "n": {"$sum": 1}}},
                    {"$sort": {"n": -1}},
                    {"$limit": limit},
                ],
                maxTimeMS=3000,
            )
            return [str(r["_id"]) for r in rows if r.get("_id") not in (None, "")]
        except Exception as exc:  # noqa: BLE001
            logger.warning("schema_context %s lookup failed: %s", field, exc)
            return []

    bounds: dict[str, str] = {}
    try:
        oldest = collection.find_one(
            {"username": username}, sort=[("expense_date", 1)],
            projection={"expense_date": 1},
        )
        newest = collection.find_one(
            {"username": username}, sort=[("expense_date", -1)],
            projection={"expense_date": 1},
        )
        if oldest and oldest.get("expense_date"):
            bounds["earliest"] = oldest["expense_date"].date().isoformat()
        if newest and newest.get("expense_date"):
            bounds["latest"] = newest["expense_date"].date().isoformat()
    except Exception as exc:  # noqa: BLE001
        logger.warning("schema_context date bounds failed: %s", exc)

    context = {
        "categories": _top("category"),
        "vendors": _top("vendor"),
        "bill_types": _top("bill_type", 8),
        "date_bounds": bounds,
    }
    _context_cache[username] = (now, context)
    return context


def invalidate_schema_context(username: str) -> None:
    """Drop cached grounding after the user adds or edits expenses."""
    _context_cache.pop(username, None)


# --------------------------------------------------------------------------
# Sub-agent: query_author
# --------------------------------------------------------------------------

_AUTHOR_RULES = """
You write MongoDB read queries for a personal finance app. Return JSON only.

COLLECTIONS AND FIELDS — you may use nothing else:
  expenses: amount (number), category (string, lowercase), bill_type
    (grocery|restaurant|service|utility|other), input_type
    (manual|text|image|camera|mixed), invoice_number (string), vendor
    (string, original casing preserved), description (string), expense_date
    (BSON date at midnight, no timezone), line_items_count (number),
    created_at (date), llm_model (string), _id
  expense_line_items: expense_id (string), name (string), quantity (number),
    unit_price (number), total (number), created_at (date), _id

ABSOLUTE RULES:
  1. NEVER mention `username` anywhere. Data is scoped to the caller by the
     server. A query containing `username` is rejected outright.
  2. No $lookup, $graphLookup, $unionWith, $out, $merge, $where, $function,
     $accumulator. To read line items set collection to expense_line_items.
  3. Reference only the fields listed above. No $$ROOT or other system
     variables.
  4. Filter dates on expense_date using {"$gte": "YYYY-MM-DD", "$lt":
     "YYYY-MM-DD"} — half-open, end exclusive.
  5. Put the expense_date filter in the FIRST $match stage; it is the indexed
     field and the query is much faster that way.
  6. At most 12 pipeline stages.
  7. $regex must be short and use "$options": "i" only.

CHART: pick the chart that suits the result shape.
  trend_bar      time series (grouped by day/week/month/year)
  breakdown      share of a total across categories or vendors
  category_trend two grouping dimensions plus a measure
  kpi            one row, one number
  table          anything else
Set encoding to the RESULT field names your query produces, not the source
fields. Do not choose colours or sizes.

If the question is too vague to answer, leave pipeline empty and put a single
question in `clarification`.

Set confidence honestly: below 0.5 means you are guessing.
"""


def _author_prompt(message: str, context: dict, repair: str = "") -> str:
    today = date.today().isoformat()
    categories = ", ".join(context.get("categories") or []) or "(none recorded)"
    vendors = ", ".join(context.get("vendors") or []) or "(none recorded)"
    bounds = context.get("date_bounds") or {}
    span = (
        f"{bounds.get('earliest', '?')} to {bounds.get('latest', '?')}"
        if bounds else "(no expenses recorded)"
    )

    prompt = f"""{_AUTHOR_RULES}

Today is {today}. The user's expenses span {span}.

Their existing categories: {categories}
Their existing vendors: {vendors}

Match filters against those exact spellings; use $regex with "$options": "i"
when the user's wording differs in case.

QUESTION: {message}
"""

    if repair:
        prompt += f"""
Your previous attempt was REJECTED by the query validator:

    {repair}

Fix that specific problem and return a corrected query.
"""
    return prompt


def author_query(
    message: str,
    context: dict,
    *,
    username: str,
    budget: LlmBudget,
    repair: str = "",
) -> MongoQueryEnvelope:
    """Ask the model for a query envelope. Raises on model or schema failure."""
    result = generate_structured(
        _author_prompt(message, context, repair),
        MongoQueryEnvelopeLLM,
        username=username,
        feature="analytics",
        budget=budget,
        label="repair" if repair else "author",
    )
    # to_envelope raises ValueError on malformed embedded JSON, which the
    # orchestrator treats the same as a guard rejection.
    return result.to_envelope()


# --------------------------------------------------------------------------
# Tool: query_executor
# --------------------------------------------------------------------------

def _collection_for(name: str):
    if name == "expenses":
        return get_expenses_collection()
    if name == "expense_line_items":
        return get_expense_line_items_collection()
    # Unreachable: the guard validates `collection` first.
    raise QueryRejected(f"collection '{name}' is not permitted")


def execute_query(compiled) -> tuple[list[dict], int]:
    """Run a validated query. Returns (rows, elapsed_ms)."""
    collection = _collection_for(compiled.collection)
    started = time.perf_counter()

    if compiled.op == "find":
        cursor = collection.find(
            compiled.filter,
            compiled.projection,
            max_time_ms=compiled.max_time_ms,
        )
        if compiled.sort:
            cursor = cursor.sort(compiled.sort)
        cursor = cursor.limit(compiled.limit)
        rows = list(cursor)
    else:
        rows = list(
            collection.aggregate(
                compiled.pipeline,
                maxTimeMS=compiled.max_time_ms,
                allowDiskUse=False,
            )
        )

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    return [_jsonable(row) for row in rows], elapsed_ms


def _jsonable(value: Any) -> Any:
    """Convert BSON/date values into JSON-serialisable equivalents."""
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


# --------------------------------------------------------------------------
# Orchestrator
# --------------------------------------------------------------------------

def _answer_envelope(**kwargs) -> dict:
    """Build the response envelope with every key always present."""
    base = {
        "answer_id": f"ans_{uuid.uuid4().hex[:16]}",
        "session_id": "",
        "question": "",
        "status": "ok",
        "narrative": {"headline": "", "body_md": "", "highlights": []},
        "datasets": [],
        "visuals": [],
        "query": None,
        "confidence": {"score": 0.0, "level": "low", "caveats": []},
        "followups": [],
        "degraded": False,
        "error": None,
        "meta": {},
    }
    base.update(kwargs)
    return base


def _confidence_level(score: float) -> str:
    if score >= 0.75:
        return "high"
    if score >= 0.5:
        return "medium"
    return "low"


def _fallback(username: str, message: str, reason: str) -> dict:
    """
    Degrade to the deterministic regex analytics.

    Imported lazily so a problem in that legacy module cannot break agent
    startup.
    """
    try:
        from app.services.expense_chat_service import answer_expense_analysis_query

        legacy = answer_expense_analysis_query(username, message)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Deterministic fallback failed: %s", exc)
        return _answer_envelope(
            question=message,
            status="refused",
            degraded=True,
            narrative={
                "headline": "I could not answer that",
                "body_md": (
                    "Try rephrasing — for example \"how much did I spend last "
                    "month\" or \"top 5 vendors this year\"."
                ),
                "highlights": [],
            },
            error={"reason": reason},
        )

    analysis = legacy.get("analysis") or {}
    rows = analysis.get("results") or []
    dataset = chart_builder.build_dataset(rows, title="Result")
    visual = chart_builder.build_visual(
        rows, ChartHint(), dataset_id=dataset["id"], fallback_title="Result"
    )

    return _answer_envelope(
        question=message,
        status="ok" if rows else "partial",
        degraded=True,
        narrative={
            "headline": legacy.get("message", "").split("\n")[0][:120] or "Result",
            "body_md": legacy.get("message", ""),
            "highlights": [],
        },
        datasets=[dataset] if rows else [],
        visuals=[visual] if rows else [],
        query=legacy.get("query"),
        confidence={
            "score": 0.5,
            "level": "medium",
            "caveats": ["Answered without AI query planning."],
        },
        error={"reason": reason} if reason else None,
    )


def run_analytics_agent(
    username: str,
    message: str,
    *,
    session_id: str = "",
    on_phase: PhaseCallback | None = None,
) -> dict:
    """
    Answer a natural-language question about the caller's expenses.

    Never raises for expected conditions — an unanswerable question comes back
    as status "refused", and infrastructure problems degrade to the
    deterministic path. Callers can render the envelope unconditionally.
    """
    phase = on_phase or _noop_phase
    started = time.perf_counter()
    question = (message or "").strip()

    if not question:
        return _answer_envelope(
            question="", status="refused",
            narrative={
                "headline": "Ask a question to get started",
                "body_md": "", "highlights": [],
            },
        )

    if not settings.ANALYTICS_AGENT_ENABLED or not is_configured():
        phase("fallback", "Using offline analytics")
        return _fallback(username, question, "AI analytics is not enabled")

    budget = LlmBudget(max_calls=settings.ANALYTICS_MAX_LLM_CALLS_PER_MESSAGE)

    phase("context", "Reading your expense profile")
    try:
        context = build_schema_context(username)
    except Exception as exc:  # noqa: BLE001
        logger.warning("schema_context failed: %s", exc)
        context = {}

    phase("planning", "Understanding your question")

    envelope: MongoQueryEnvelope | None = None
    compiled = None
    repair_hint = ""
    repaired = False
    guard_error = ""

    # One authoring attempt, then at most one repair.
    for attempt in range(2):
        try:
            envelope = author_query(
                question, context,
                username=username, budget=budget, repair=repair_hint,
            )
        except (LlmRateLimitError, LlmBudgetExhausted) as exc:
            phase("fallback", "Using offline analytics")
            return _fallback(username, question, str(exc))
        except (GeminiUnavailable, ValidationError, ValueError) as exc:
            if attempt == 0 and budget.remaining > 0 and not isinstance(exc, GeminiUnavailable):
                repair_hint = str(exc)[:400]
                repaired = True
                phase("planning", "Refining the query")
                continue
            phase("fallback", "Using offline analytics")
            return _fallback(username, question, str(exc))

        # Model chose to ask rather than guess.
        if envelope.clarification and not envelope.pipeline and not envelope.filter:
            return _answer_envelope(
                question=question, session_id=session_id, status="refused",
                narrative={
                    "headline": "I need a bit more detail",
                    "body_md": envelope.clarification,
                    "highlights": [],
                },
                confidence={
                    "score": envelope.confidence,
                    "level": _confidence_level(envelope.confidence),
                    "caveats": [],
                },
                followups=[
                    "How much did I spend last month?",
                    "Top 5 vendors this year",
                    "Compare this month to last month",
                ],
                meta={"llm_calls": budget.used},
            )

        phase("validating", "Checking the query is safe")
        try:
            compiled = validate_and_compile(envelope, username)
            break
        except QueryRejected as exc:
            guard_error = str(exc)
            # Rejected queries are logged, never executed.
            logger.warning(
                "Guard rejected generated query for %s: %s | envelope=%r",
                username, guard_error, envelope.pipeline or envelope.filter,
            )
            if attempt == 0 and budget.remaining > 0:
                repair_hint = guard_error
                repaired = True
                phase("planning", "Refining the query")
                continue
            phase("fallback", "Using offline analytics")
            return _fallback(username, question, guard_error)

    if compiled is None or envelope is None:
        phase("fallback", "Using offline analytics")
        return _fallback(username, question, guard_error or "no valid query")

    phase("executing", "Querying your expenses")
    try:
        rows, elapsed_ms = execute_query(compiled)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Query execution failed for %s: %s", username, exc)
        text = str(exc).lower()
        if "exceeded time limit" in text or "maxtimems" in text:
            return _answer_envelope(
                question=question, session_id=session_id, status="refused",
                narrative={
                    "headline": "That query was too broad",
                    "body_md": (
                        "It took too long to run. Try narrowing the date range "
                        "or filtering to a specific category."
                    ),
                    "highlights": [],
                },
                error={"reason": "query timeout"},
                meta={"llm_calls": budget.used},
            )
        phase("fallback", "Using offline analytics")
        return _fallback(username, question, str(exc))

    phase("charting", "Preparing the answer")

    truncated = len(rows) >= compiled.limit
    dataset = chart_builder.build_dataset(
        rows,
        dataset_id="ds_1",
        title=envelope.chart_hint.title or "Result",
        truncated=truncated,
    )
    visual = chart_builder.build_visual(
        rows,
        envelope.chart_hint,
        dataset_id=dataset["id"],
        fallback_title=envelope.chart_hint.title or "Result",
    )
    story = narrative.build_narrative(
        rows, visual, question=question, explain=envelope.explain
    )

    caveats: list[str] = list(envelope.assumptions)
    if truncated:
        caveats.append(f"Showing the first {compiled.limit} rows.")
    if repaired:
        caveats.append("The first generated query was rejected and rebuilt.")

    query_view = {
        "op": compiled.op,
        "collection": compiled.collection,
        "pipeline": compiled.pipeline if compiled.op == "aggregate" else None,
        "filter": compiled.filter if compiled.op == "find" else None,
        "projection": compiled.projection,
        "explain": envelope.explain,
        "executed_ms": elapsed_ms,
        "row_count": len(rows),
        "repaired": repaired,
    }

    return _answer_envelope(
        question=question,
        session_id=session_id,
        status="ok" if rows else "partial",
        narrative=story,
        datasets=[dataset],
        visuals=[visual],
        query=query_view,
        confidence={
            "score": envelope.confidence,
            "level": _confidence_level(envelope.confidence),
            "caveats": caveats,
        },
        followups=narrative.build_followups(visual, rows),
        meta={
            "llm_calls": budget.used,
            "latency_ms": int((time.perf_counter() - started) * 1000),
            "model": settings.GEMINI_MODEL,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
    )


# --------------------------------------------------------------------------
# Overview (KPI strip)
# --------------------------------------------------------------------------

def build_overview(username: str) -> dict:
    """
    Real figures for the Insights KPI strip.

    Replaces `deriveInsightData()` on the client, which fetched every expense
    and recomputed this in the browser.
    """
    collection = get_expenses_collection()
    today = date.today()
    month_start = datetime(today.year, today.month, 1)
    prev_year, prev_month = (
        (today.year - 1, 12) if today.month == 1 else (today.year, today.month - 1)
    )
    prev_start = datetime(prev_year, prev_month, 1)

    def _total(match: dict) -> tuple[float, int]:
        rows = list(collection.aggregate(
            [
                {"$match": match},
                {"$group": {"_id": None, "total": {"$sum": "$amount"},
                            "n": {"$sum": 1}}},
            ],
            maxTimeMS=3000,
        ))
        if not rows:
            return 0.0, 0
        return round(float(rows[0].get("total") or 0), 2), int(rows[0].get("n") or 0)

    scope = {"username": username}
    all_total, all_count = _total(scope)
    this_month, this_count = _total(
        {**scope, "expense_date": {"$gte": month_start}}
    )
    last_month, _ = _total(
        {**scope, "expense_date": {"$gte": prev_start, "$lt": month_start}}
    )

    categories = list(collection.aggregate(
        [
            {"$match": scope},
            {"$group": {"_id": "$category", "total": {"$sum": "$amount"}}},
            {"$sort": {"total": -1}},
        ],
        maxTimeMS=3000,
    ))

    delta_pct = None
    if last_month > 0:
        delta_pct = round(((this_month - last_month) / last_month) * 100.0, 1)

    return {
        "total_spend": all_total,
        "total_transactions": all_count,
        "this_month": this_month,
        "this_month_transactions": this_count,
        "last_month": last_month,
        "month_delta_pct": delta_pct,
        "active_categories": len([c for c in categories if c.get("_id")]),
        "top_category": (
            {"name": categories[0]["_id"], "total": round(float(categories[0]["total"]), 2)}
            if categories and categories[0].get("_id") else None
        ),
    }
