"""
Adversarial tests for the LLM query guard.

The guard is the security boundary of the analytics agent: a language model
authors real MongoDB here, so these tests are the thing standing between a
prompt-injected query and the users collection. They must pass before the
analytics endpoint is exposed.

Runs standalone (no pytest required):

    python -m tests.test_mongo_guard

or under pytest if it is installed:

    pytest tests/test_mongo_guard.py
"""

from __future__ import annotations

import sys
from pathlib import Path

# Allow `python -m tests.test_mongo_guard` from the repo root.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.models.mongo_query import MongoQueryEnvelope  # noqa: E402
from app.services.mongo_guard import (  # noqa: E402
    MAX_RESULT_LIMIT,
    MAX_TIME_MS,
    QueryRejected,
    validate_and_compile,
)

USER = "alice@example.com"
ATTACKER = "mallory@example.com"


def _agg(pipeline, collection="expenses", **kwargs):
    return MongoQueryEnvelope(
        op="aggregate", collection=collection, pipeline=pipeline, **kwargs
    )


def _find(filter_, collection="expenses", **kwargs):
    return MongoQueryEnvelope(
        op="find", collection=collection, filter=filter_, **kwargs
    )


def _rejects(envelope, because: str) -> None:
    try:
        validate_and_compile(envelope, USER)
    except QueryRejected:
        return
    raise AssertionError(f"SHOULD HAVE BEEN REJECTED ({because}): {envelope!r}")


def _accepts(envelope):
    return validate_and_compile(envelope, USER)


# --------------------------------------------------------------------------
# 1. Forbidden stages and operators
# --------------------------------------------------------------------------

def test_rejects_javascript_execution():
    _rejects(_agg([{"$match": {"$where": "this.amount > 0"}}]), "$where runs JS")
    _rejects(
        _agg([{"$group": {"_id": None, "t": {"$accumulator": {"init": "function(){}"}}}}]),
        "$accumulator runs JS",
    )
    _rejects(
        _agg([{"$project": {"x": {"$function": {"body": "function(){}", "args": []}}}}]),
        "$function runs JS",
    )


def test_rejects_writes():
    _rejects(_agg([{"$out": "expenses"}]), "$out writes")
    _rejects(_agg([{"$merge": {"into": "expenses"}}]), "$merge writes")


def test_rejects_cross_collection_access():
    _rejects(
        _agg([{"$lookup": {"from": "users", "localField": "username",
                           "foreignField": "username", "as": "u"}}]),
        "$lookup can reach the users collection",
    )
    _rejects(_agg([{"$graphLookup": {"from": "users"}}]), "$graphLookup joins")
    _rejects(_agg([{"$unionWith": "users"}]), "$unionWith merges collections")


def test_rejects_server_introspection():
    _rejects(_agg([{"$collStats": {}}]), "$collStats leaks server internals")
    _rejects(_agg([{"$indexStats": {}}]), "$indexStats leaks server internals")


def test_rejects_unknown_collection():
    for collection in ("users", "refresh_tokens", "webauthn_credentials"):
        envelope = _agg([{"$match": {"amount": {"$gt": 0}}}])
        # Bypass the Literal so we exercise the guard, not Pydantic.
        object.__setattr__(envelope, "collection", collection)
        _rejects(envelope, f"{collection} is not an analytics collection")


def test_rejects_unknown_operator_by_default():
    """
    The property that makes an allow-list safe: an operator the guard has
    never heard of is rejected without anyone having to add it to a denylist.
    This is what protects against future MongoDB releases.
    """
    _rejects(_agg([{"$totallyNewOperator": {}}]), "unknown stage")
    _rejects(
        _agg([{"$match": {"amount": {"$brandNewComparison": 5}}}]),
        "unknown query operator",
    )
    _rejects(
        _agg([{"$group": {"_id": None, "x": {"$futureAccumulator": "$amount"}}}]),
        "unknown expression operator",
    )


# --------------------------------------------------------------------------
# 2. Tenant isolation
# --------------------------------------------------------------------------

def test_rejects_any_mention_of_username():
    """The model must never author scoping; the guard owns it exclusively."""
    _rejects(_agg([{"$match": {"username": ATTACKER}}]), "sets username directly")
    _rejects(
        _agg([{"$match": {"$or": [{"username": ATTACKER}, {"amount": {"$gt": 0}}]}}]),
        "widens scope via $or",
    )
    _rejects(_agg([{"$group": {"_id": "$username"}}]), "groups by username")
    _rejects(_agg([{"$project": {"username": 1}}]), "projects username")
    _rejects(_find({"username": ATTACKER}), "find filter sets username")


def test_scope_is_always_stage_zero():
    compiled = _accepts(_agg([{"$group": {"_id": "$category", "total": {"$sum": "$amount"}}}]))
    assert compiled.pipeline[0] == {"$match": {"username": USER}}, compiled.pipeline[0]


def test_scope_survives_a_leading_match():
    compiled = _accepts(_agg([
        {"$match": {"category": "grocery"}},
        {"$group": {"_id": "$vendor", "total": {"$sum": "$amount"}}},
    ]))
    assert compiled.pipeline[0]["$match"]["username"] == USER
    # The user's own predicate is preserved, not dropped.
    assert any(
        s.get("$match", {}).get("category") == "grocery" for s in compiled.pipeline
    ), compiled.pipeline


def test_find_filter_is_scoped():
    compiled = _accepts(_find({"amount": {"$gt": 100}}))
    assert compiled.filter["username"] == USER
    assert compiled.filter["amount"] == {"$gt": 100}


def test_date_predicate_is_hoisted_for_index_use():
    """
    expenses has only (username, expense_date) and (username, bill_type).
    A date predicate must end up in stage 0 beside username or the compound
    index cannot be used.
    """
    compiled = _accepts(_agg([
        {"$match": {"expense_date": {"$gte": "2026-01-01"}}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}}},
    ]))
    stage0 = compiled.pipeline[0]["$match"]
    assert stage0["username"] == USER
    assert "expense_date" in stage0, compiled.pipeline


# --------------------------------------------------------------------------
# 3. Field allow-list
# --------------------------------------------------------------------------

def test_rejects_unknown_fields():
    _rejects(_agg([{"$match": {"password_hash": {"$exists": True}}}]), "not a field")
    _rejects(_agg([{"$match": {"credential_id": "x"}}]), "not a field")
    _rejects(_agg([{"$project": {"secret": 1}}]), "probing for a field")
    _rejects(_agg([{"$group": {"_id": "$totp_secret"}}]), "field path probe")


def test_rejects_system_variables():
    _rejects(_agg([{"$project": {"everything": "$$ROOT"}}]), "$$ROOT dumps the document")


def test_line_items_uses_its_own_field_list():
    # `amount` exists on expenses but not on expense_line_items.
    _rejects(
        _agg([{"$match": {"amount": {"$gt": 0}}}], collection="expense_line_items"),
        "amount is not a line-item field",
    )
    _accepts(_agg([{"$match": {"total": {"$gt": 0}}}], collection="expense_line_items"))


# --------------------------------------------------------------------------
# 4. Structural and resource limits
# --------------------------------------------------------------------------

def test_rejects_oversized_pipelines():
    _rejects(_agg([{"$match": {"amount": {"$gt": 1}}}] * 13), "too many stages")


def test_rejects_deep_nesting():
    node = {"amount": {"$gt": 1}}
    for _ in range(10):
        node = {"$and": [node]}
    _rejects(_agg([{"$match": node}]), "nesting too deep")


def test_rejects_redos_regex():
    _rejects(
        _agg([{"$match": {"vendor": {"$regex": "(a+)+$"}}}]),
        "nested quantifier is a ReDoS vector",
    )
    _rejects(
        _agg([{"$match": {"vendor": {"$regex": "a" * 200}}}]),
        "regex too long",
    )
    _rejects(
        _agg([{"$match": {"vendor": {"$regex": "abc", "$options": "x"}}}]),
        "only the 'i' option is permitted",
    )


def test_limit_is_capped_and_always_appended():
    compiled = _accepts(_agg(
        [{"$group": {"_id": "$vendor", "total": {"$sum": "$amount"}}}],
        limit=200,
    ))
    assert compiled.pipeline[-1] == {"$limit": MAX_RESULT_LIMIT}
    assert compiled.max_time_ms == MAX_TIME_MS


def test_limit_cannot_be_raised_past_the_cap():
    envelope = _agg([{"$group": {"_id": "$vendor", "t": {"$sum": "$amount"}}}])
    object.__setattr__(envelope, "limit", 999999)
    compiled = _accepts(envelope)
    assert compiled.pipeline[-1]["$limit"] <= MAX_RESULT_LIMIT


# --------------------------------------------------------------------------
# 5. Legitimate queries must still work
# --------------------------------------------------------------------------

def test_accepts_realistic_analytics():
    _accepts(_agg([
        {"$match": {"expense_date": {"$gte": "2026-01-01", "$lt": "2026-07-01"}}},
        {"$group": {"_id": "$vendor", "total": {"$sum": "$amount"}}},
        {"$sort": {"total": -1}},
        {"$limit": 10},
    ]))
    _accepts(_agg([
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m", "date": "$expense_date"}},
            "total": {"$sum": "$amount"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
    ]))
    _accepts(_agg([
        {"$match": {"category": {"$in": ["grocery", "utility"]}}},
        {"$group": {"_id": "$category", "avg": {"$avg": "$amount"}}},
    ]))
    _accepts(_find({"amount": {"$gte": 500}}, projection={"amount": 1, "vendor": 1},
                   sort={"expense_date": -1}))
    _accepts(_agg([
        {"$match": {"vendor": {"$regex": "^amazon", "$options": "i"}}},
        {"$count": "matches"},
    ]))


def test_no_authenticated_user_is_rejected():
    try:
        validate_and_compile(_agg([{"$match": {"amount": {"$gt": 0}}}]), "")
    except QueryRejected:
        return
    raise AssertionError("an unauthenticated query must never compile")


# --------------------------------------------------------------------------
# Runner
# --------------------------------------------------------------------------

def _run_all() -> int:
    tests = [
        (name, obj)
        for name, obj in sorted(globals().items())
        if name.startswith("test_") and callable(obj)
    ]

    failures: list[tuple[str, str]] = []
    for name, fn in tests:
        try:
            fn()
            print(f"  PASS  {name}")
        except AssertionError as exc:
            failures.append((name, str(exc)))
            print(f"  FAIL  {name}\n        {exc}")
        except Exception as exc:  # noqa: BLE001
            failures.append((name, f"{type(exc).__name__}: {exc}"))
            print(f"  ERROR {name}\n        {type(exc).__name__}: {exc}")

    print(f"\n{len(tests) - len(failures)}/{len(tests)} passed")
    if failures:
        print("\nFAILURES:")
        for name, detail in failures:
            print(f"  - {name}: {detail}")
        return 1
    return 0


if __name__ == "__main__":
    print("Adversarial guard tests\n")
    raise SystemExit(_run_all())
