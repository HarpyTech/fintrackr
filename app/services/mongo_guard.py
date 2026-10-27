"""
Allow-list validator for LLM-authored MongoDB queries.

This is the security boundary of the analytics agent. A language model writes
real Mongo here, so nothing downstream may assume the query is benign.

Design rule: ALLOW-LIST, NEVER DENYLIST.
Every stage, operator and field name must appear on an explicit list or the
query is rejected. A denylist cannot be complete — it has to be updated for
every operator MongoDB adds, and one omission is a data breach. With an
allow-list, an operator nobody has heard of yet fails closed automatically.

Guarantees provided by validate_and_compile():
  1. The query runs against the caller's own data only. Stage 0 is always
     replaced with {"$match": {"username": <session user>}}; the model is
     forbidden from mentioning `username` at all, so it cannot widen, alias
     or $or its way out.
  2. It cannot write. No write stage ($out, $merge) is on the allow-list.
  3. It cannot reach another collection. $lookup, $graphLookup and $unionWith
     are not on the allow-list, and `collection` is a Literal of two values.
  4. It cannot execute JavaScript. $where, $function and $accumulator are not
     on the allow-list.
  5. It is bounded — stage count, nesting depth, payload size, result limit
     and server-side execution time all have hard caps.
"""

from __future__ import annotations  # noqa: I001

# MongoDB query documents remain intentionally dynamic after validation.
# mypy: disable-error-code="arg-type, assignment"

import re
from dataclasses import dataclass, field
from typing import Any

from app.models.mongo_query import MongoQueryEnvelope

# --------------------------------------------------------------------------
# Limits
# --------------------------------------------------------------------------

MAX_STAGES = 12
MAX_DEPTH = 8
MAX_SERIALIZED_BYTES = 8192
MAX_RESULT_LIMIT = 200
MAX_REGEX_LENGTH = 64
MAX_TIME_MS = 5000

# --------------------------------------------------------------------------
# Allow-lists
# --------------------------------------------------------------------------

# Aggregation stages. Note the absences: $lookup, $graphLookup, $unionWith,
# $out, $merge, $collStats, $indexStats, $planCacheStats, $currentOp,
# $listSessions, $documents, $changeStream. They are not "denied" — they are
# simply not present, which is what makes this list safe against additions.
ALLOWED_STAGES = frozenset(
    {
        "$match",
        "$group",
        "$sort",
        "$limit",
        "$skip",
        "$project",
        "$addFields",
        "$set",
        "$unwind",
        "$count",
        "$sortByCount",
        "$bucket",
        "$facet",
        "$replaceRoot",
    }
)

# Operators valid inside a query predicate ($match / find filter).
ALLOWED_QUERY_OPERATORS = frozenset(
    {
        "$eq",
        "$ne",
        "$gt",
        "$gte",
        "$lt",
        "$lte",
        "$in",
        "$nin",
        "$and",
        "$or",
        "$not",
        "$nor",
        "$exists",
        "$type",
        "$regex",
        "$options",
        "$elemMatch",
        "$size",
        "$all",
    }
)

# Operators valid inside an aggregation expression ($group / $project /
# $addFields). $function and $accumulator are absent by design.
ALLOWED_EXPRESSION_OPERATORS = frozenset(
    {
        # accumulators
        "$sum",
        "$avg",
        "$min",
        "$max",
        "$count",
        "$first",
        "$last",
        "$push",
        "$addToSet",
        # date
        "$year",
        "$month",
        "$dayOfMonth",
        "$dayOfWeek",
        "$dayOfYear",
        "$week",
        "$hour",
        "$dateToString",
        "$dateTrunc",
        "$dateFromParts",
        # arithmetic
        "$add",
        "$subtract",
        "$multiply",
        "$divide",
        "$mod",
        "$abs",
        "$round",
        "$trunc",
        "$ceil",
        "$floor",
        # comparison (valid inside expressions too)
        "$eq",
        "$ne",
        "$gt",
        "$gte",
        "$lt",
        "$lte",
        "$cmp",
        # logical
        "$and",
        "$or",
        "$not",
        # conditional
        "$cond",
        "$ifNull",
        "$switch",
        "$case",
        "$then",
        "$default",
        "$branches",
        # string
        "$toLower",
        "$toUpper",
        "$concat",
        "$substr",
        "$substrBytes",
        "$strLenCP",
        "$split",
        "$trim",
        "$ltrim",
        "$rtrim",
        # type conversion (no $toObjectId — no cross-collection use for it here)
        "$toString",
        "$toDouble",
        "$toInt",
        "$toLong",
        "$toDecimal",
        # array (read-only shaping)
        "$size",
        "$arrayElemAt",
        "$slice",
        "$in",
        "$filter",
        # literal escape hatch, still walked
        "$literal",
        # $expr is allowed as a bridge into expression context
        "$expr",
    }
)

# Fields that exist on each collection. Any other field reference — whether as
# a key or as a "$fieldPath" — is rejected, so the model cannot probe for
# columns it was not told about.
COLLECTION_FIELDS: dict[str, frozenset[str]] = {
    "expenses": frozenset(
        {
            "_id",
            "amount",
            "category",
            "bill_type",
            "input_type",
            "invoice_number",
            "vendor",
            "description",
            "expense_date",
            "line_items_count",
            "created_at",
            "llm_model",
        }
    ),
    "expense_line_items": frozenset(
        {
            "_id",
            "expense_id",
            "name",
            "quantity",
            "unit_price",
            "total",
            "created_at",
        }
    ),
}

# The scoping field. The model must never mention it; the guard owns it.
SCOPE_FIELD = "username"

# Regex constructs with catastrophic backtracking potential.
_REDOS_PATTERNS = (
    re.compile(r"\([^)]*[+*]\)[+*]"),  # (a+)+ / (a*)*
    re.compile(r"\([^)]*\{\d+,\}\)[+*]"),  # (a{2,})+
)

# Output names that may be introduced by $group / $project / $addFields
# without being real document fields.
_SAFE_ALIAS = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,39}$")


def _is_alias(name: str) -> bool:
    """
    True for a permissible output name.

    `_id` is special-cased because every $group stage declares it and
    $project commonly suppresses it, but it does not match the general alias
    pattern (which excludes leading underscores to keep operator-like and
    internal names out).
    """
    return name == "_id" or bool(_SAFE_ALIAS.match(name))


class QueryRejectedError(ValueError):
    """Raised when a generated query fails validation. Never executed."""

    def __init__(self, reason: str, path: str = ""):
        self.reason = reason
        self.path = path
        super().__init__(f"{reason}{f' (at {path})' if path else ''}")


@dataclass
class CompiledQuery:
    """A validated, scoped, capped query, ready to execute."""

    op: str
    collection: str
    pipeline: list[dict] = field(default_factory=list)
    filter: dict = field(default_factory=dict)
    projection: dict | None = None
    sort: list[tuple[str, int]] | None = None
    limit: int = 50
    max_time_ms: int = MAX_TIME_MS


# --------------------------------------------------------------------------
# Recursive walkers
# --------------------------------------------------------------------------


def _fail(reason: str, path: str = "") -> None:
    raise QueryRejectedError(reason, path)


def _check_depth(depth: int, path: str) -> None:
    if depth > MAX_DEPTH:
        _fail(f"nesting deeper than {MAX_DEPTH} levels", path)


def _check_field_name(name: str, fields: frozenset[str], path: str) -> None:
    """
    Validate a bare field reference.

    Dotted paths are checked on their first segment so `line_items.name` style
    access still resolves to a known root field.
    """
    if not name:
        _fail("empty field name", path)

    if name == SCOPE_FIELD:
        _fail(
            "queries must not reference 'username' — scoping is applied by the server",
            path,
        )

    root = name.split(".", 1)[0]
    if root not in fields:
        _fail(f"unknown field '{name}'", path)


def _check_field_path(value: str, fields: frozenset[str], path: str) -> None:
    """Validate a "$field" style expression operand."""
    ref = value[1:]
    if ref.startswith("$"):
        # "$$ROOT", "$$NOW" and friends expose more than we want to reason
        # about, so they are not permitted.
        _fail(f"system variable '{value}' is not permitted", path)
    _check_field_name(ref, fields, path)


def _check_regex(value: Any, path: str) -> None:
    if not isinstance(value, str):
        _fail("$regex must be a string", path)
    if len(value) > MAX_REGEX_LENGTH:
        _fail(f"$regex longer than {MAX_REGEX_LENGTH} characters", path)
    for pattern in _REDOS_PATTERNS:
        if pattern.search(value):
            _fail("$regex contains a nested quantifier (ReDoS risk)", path)
    try:
        re.compile(value)
    except re.error as exc:
        _fail(f"$regex is not a valid pattern: {exc}", path)


def _walk_expression(node: Any, fields: frozenset[str], path: str, depth: int) -> None:
    """Validate an aggregation expression ($group/$project/$addFields value)."""
    _check_depth(depth, path)

    if isinstance(node, str):
        if node.startswith("$"):
            _check_field_path(node, fields, path)
        return

    if isinstance(node, int | float | bool) or node is None:
        return

    if isinstance(node, list):
        for index, item in enumerate(node):
            _walk_expression(item, fields, f"{path}[{index}]", depth + 1)
        return

    if not isinstance(node, dict):
        _fail(f"unsupported value type {type(node).__name__}", path)

    for key, value in node.items():
        child = f"{path}.{key}" if path else key

        if key.startswith("$"):
            if key not in ALLOWED_EXPRESSION_OPERATORS:
                _fail(f"operator '{key}' is not permitted", child)
            if key == "$literal":
                continue  # value is data, not an expression
            _walk_expression(value, fields, child, depth + 1)
            continue

        # A non-$ key inside an expression is an output name — the shape of a
        # $group _id, an $addFields key, a $dateToString option. These are
        # names being created, not document fields, so they only need to be
        # sane. ($project is different and uses _walk_projection.)
        if not _is_alias(key):
            _fail(f"invalid output name '{key}'", child)
        _walk_expression(value, fields, child, depth + 1)


def _walk_projection(node: Any, fields: frozenset[str], path: str, depth: int) -> None:
    """
    Validate a $project body.

    $project is the one stage where a plain key can mean two different things:

        {"vendor": 1}                        include an EXISTING field
        {"spend": {"$multiply": [...]}}      define a NEW output name

    Inclusion/exclusion keys are therefore checked against the collection's
    field list, which stops `{"$project": {"password_hash": 1}}` from being
    waved through as a harmless alias.
    """
    _check_depth(depth, path)

    if not isinstance(node, dict) or not node:
        _fail("$project expects a non-empty object", path)

    for key, value in node.items():
        child = f"{path}.{key}" if path else key

        if key.startswith("$"):
            _fail(f"operator '{key}' is not permitted as a projection key", child)

        if isinstance(value, bool) or value in (0, 1):
            # Referencing an existing field.
            if key != "_id":
                _check_field_name(key, fields, child)
            continue

        # Computing a new value: the key is a new name, the value an expression.
        if not _is_alias(key):
            _fail(f"invalid output name '{key}'", child)
        _walk_expression(value, fields, child, depth + 1)


def _walk_predicate(node: Any, fields: frozenset[str], path: str, depth: int) -> None:
    """Validate a query predicate ($match body or find filter)."""
    _check_depth(depth, path)

    if not isinstance(node, dict):
        _fail("query predicate must be an object", path)

    for key, value in node.items():
        child = f"{path}.{key}" if path else key

        if key.startswith("$"):
            if key not in ALLOWED_QUERY_OPERATORS and key != "$expr":
                _fail(f"operator '{key}' is not permitted", child)

            if key == "$expr":
                _walk_expression(value, fields, child, depth + 1)
                continue

            if key in {"$and", "$or", "$nor"}:
                if not isinstance(value, list):
                    _fail(f"'{key}' expects an array", child)
                for index, item in enumerate(value):
                    _walk_predicate(item, fields, f"{child}[{index}]", depth + 1)
                continue

            if key == "$regex":
                _check_regex(value, child)
                continue

            if key == "$options":
                if not isinstance(value, str) or set(value) - {"i"}:
                    _fail("$options may only contain 'i'", child)
                continue

            if key == "$not":
                _walk_predicate_value(value, fields, child, depth + 1)
                continue

            _walk_predicate_value(value, fields, child, depth + 1)
            continue

        # A plain key is a field name.
        _check_field_name(key, fields, child)
        _walk_predicate_value(value, fields, child, depth + 1)


def _walk_predicate_value(
    node: Any, fields: frozenset[str], path: str, depth: int
) -> None:
    """Validate the right-hand side of a predicate."""
    _check_depth(depth, path)

    if isinstance(node, dict):
        # Nested operator document, e.g. {"$gte": 100, "$lt": 500}
        for key, value in node.items():
            child = f"{path}.{key}" if path else key
            if key.startswith("$"):
                if key not in ALLOWED_QUERY_OPERATORS:
                    _fail(f"operator '{key}' is not permitted", child)
                if key == "$regex":
                    _check_regex(value, child)
                elif key == "$options":
                    if not isinstance(value, str) or set(value) - {"i"}:
                        _fail("$options may only contain 'i'", child)
                elif key == "$elemMatch":
                    _walk_predicate(value, fields, child, depth + 1)
                else:
                    _walk_predicate_value(value, fields, child, depth + 1)
            else:
                _fail(f"unexpected key '{key}' in operator document", child)
        return

    if isinstance(node, list):
        for index, item in enumerate(node):
            _walk_predicate_value(item, fields, f"{path}[{index}]", depth + 1)
        return

    if isinstance(node, str) and node.startswith("$"):
        _check_field_path(node, fields, path)
        return

    # Scalars are literal comparison values.


def _walk_stage(stage: Any, fields: frozenset[str], path: str, depth: int) -> str:
    """Validate one aggregation stage and return its name."""
    _check_depth(depth, path)

    if not isinstance(stage, dict) or len(stage) != 1:
        _fail("each pipeline stage must be an object with exactly one key", path)

    name = next(iter(stage))
    body = stage[name]
    child = f"{path}.{name}"

    if name not in ALLOWED_STAGES:
        _fail(f"stage '{name}' is not permitted", child)

    if name == "$match":
        _walk_predicate(body, fields, child, depth + 1)

    elif name == "$project":
        _walk_projection(body, fields, child, depth + 1)

    elif name in {"$limit", "$skip"}:
        if not isinstance(body, int) or isinstance(body, bool) or body < 0:
            _fail(f"'{name}' expects a non-negative integer", child)

    elif name == "$count":
        if not isinstance(body, str) or not _SAFE_ALIAS.match(body):
            _fail("$count expects a simple output name", child)

    elif name == "$sort":
        if not isinstance(body, dict) or not body:
            _fail("$sort expects a non-empty object", child)
        for key, value in body.items():
            if value not in (1, -1):
                _fail("$sort direction must be 1 or -1", f"{child}.{key}")
            # Sort keys may be output names produced by an earlier stage, so a
            # bare alias is acceptable; anything else must be a real field.
            if not _is_alias(key):
                _check_field_name(key, fields, f"{child}.{key}")

    elif name == "$unwind":
        if isinstance(body, str):
            if not body.startswith("$"):
                _fail("$unwind expects a field path", child)
            _check_field_path(body, fields, child)
        elif isinstance(body, dict):
            source = body.get("path")
            if not isinstance(source, str) or not source.startswith("$"):
                _fail("$unwind requires a 'path' field reference", child)
            _check_field_path(source, fields, child)
            unknown = set(body) - {"path", "preserveNullAndEmptyArrays"}
            if unknown:
                _fail(f"unsupported $unwind options: {sorted(unknown)}", child)
        else:
            _fail("$unwind expects a string or object", child)

    elif name == "$sortByCount":
        _walk_expression(body, fields, child, depth + 1)

    elif name == "$facet":
        if not isinstance(body, dict) or not body:
            _fail("$facet expects a non-empty object", child)
        for key, sub in body.items():
            if not _is_alias(key):
                _fail(f"invalid facet name '{key}'", f"{child}.{key}")
            if not isinstance(sub, list):
                _fail("each facet must be a pipeline array", f"{child}.{key}")
            if len(sub) > MAX_STAGES:
                _fail(f"facet pipeline exceeds {MAX_STAGES} stages", f"{child}.{key}")
            for index, sub_stage in enumerate(sub):
                _walk_stage(sub_stage, fields, f"{child}.{key}[{index}]", depth + 1)

    else:
        # $group, $project, $addFields, $set, $bucket, $replaceRoot
        _walk_expression(body, fields, child, depth + 1)

    return name


# --------------------------------------------------------------------------
# Public entry point
# --------------------------------------------------------------------------


def validate_and_compile(envelope: MongoQueryEnvelope, username: str) -> CompiledQuery:
    """
    Validate an LLM-authored query and return an executable, scoped version.

    Raises QueryRejectedError on any violation. The caller must never fall back to
    executing the original envelope.
    """
    if not username:
        raise QueryRejectedError("no authenticated user to scope the query to")

    fields = COLLECTION_FIELDS.get(envelope.collection)
    if fields is None:
        raise QueryRejectedError(f"collection '{envelope.collection}' is not permitted")

    # Cheap structural guards before walking anything.
    payload = (
        repr(envelope.pipeline) + repr(envelope.filter) + repr(envelope.projection)
    )
    if len(payload) > MAX_SERIALIZED_BYTES:
        raise QueryRejectedError(f"query exceeds {MAX_SERIALIZED_BYTES} bytes")

    limit = max(1, min(int(envelope.limit or 50), MAX_RESULT_LIMIT))

    if envelope.op == "find":
        _walk_predicate(envelope.filter or {}, fields, "filter", 0)

        projection = None
        if envelope.projection:
            for key, value in envelope.projection.items():
                if key.startswith("$"):
                    raise QueryRejectedError(
                        f"operator '{key}' is not permitted in a projection"
                    )
                _check_field_name(key, fields, f"projection.{key}")
                if value not in (0, 1, True, False):
                    raise QueryRejectedError(
                        "projection values must be 0 or 1", f"projection.{key}"
                    )
            projection = dict(envelope.projection)

        sort = None
        if envelope.sort:
            for key, value in envelope.sort.items():
                if value not in (1, -1):
                    raise QueryRejectedError(
                        "sort direction must be 1 or -1", f"sort.{key}"
                    )
                _check_field_name(key, fields, f"sort.{key}")
            sort = [(k, v) for k, v in envelope.sort.items()]

        # Scope is applied here, after validation, and cannot be overridden:
        # the model was forbidden from emitting `username` at all.
        scoped_filter = {SCOPE_FIELD: username, "is_deleted": {"$ne": True}}
        scoped_filter.update(envelope.filter or {})
        scoped_filter[SCOPE_FIELD] = username
        scoped_filter["is_deleted"] = {"$ne": True}

        return CompiledQuery(
            op="find",
            collection=envelope.collection,
            filter=scoped_filter,
            projection=projection,
            sort=sort,
            limit=limit,
        )

    # --- aggregate ---
    stages = envelope.pipeline or []
    if not isinstance(stages, list):
        raise QueryRejectedError("pipeline must be an array")
    if len(stages) > MAX_STAGES:
        raise QueryRejectedError(f"pipeline exceeds {MAX_STAGES} stages")

    for index, stage in enumerate(stages):
        _walk_stage(stage, fields, f"pipeline[{index}]", 0)

    # Hoist any expense_date predicate into the scope stage so the compound
    # (username, expense_date) index is used. Only `expenses` has that index,
    # and only a leading $match can contribute to it.
    scope_match: dict[str, Any] = {SCOPE_FIELD: username, "is_deleted": {"$ne": True}}
    remaining = list(stages)

    if (
        envelope.collection == "expenses"
        and remaining
        and isinstance(remaining[0], dict)
        and set(remaining[0]) == {"$match"}
    ):
        first_body = dict(remaining[0]["$match"])
        date_predicate = first_body.pop("expense_date", None)
        if date_predicate is not None:
            scope_match["expense_date"] = date_predicate
            if first_body:
                remaining[0] = {"$match": first_body}
            else:
                del remaining[0]

    compiled: list[dict] = [{"$match": scope_match}]
    compiled.extend(remaining)

    # A trailing $limit is always appended. An earlier $limit inside the
    # pipeline is legitimate (top-N before a lookup-free projection), so it is
    # left alone — this one bounds what can ever reach the client.
    compiled.append({"$limit": limit})

    return CompiledQuery(
        op="aggregate",
        collection=envelope.collection,
        pipeline=compiled,
        limit=limit,
    )
