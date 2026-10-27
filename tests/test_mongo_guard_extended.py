"""Extended coverage for mongo_guard.py internal walker branches.

test_mongo_guard.py covers the top-level acceptance/rejection of common query
patterns. This file focuses on branches inside the individual walker functions
that are not exercised by the adversarial suite.
"""

from __future__ import annotations

import pytest

from app.models.mongo_query import MongoQueryEnvelope
from app.services.mongo_guard import (
    COLLECTION_FIELDS,
    QueryRejectedError,
    _walk_expression,
    validate_and_compile,
)

USER = "test@example.com"


def _agg(pipeline, collection="expenses", **kwargs):
    return MongoQueryEnvelope(
        op="aggregate", collection=collection, pipeline=pipeline, **kwargs
    )


def _find(filter_, collection="expenses", **kwargs):
    return MongoQueryEnvelope(
        op="find", collection=collection, filter=filter_, **kwargs
    )


def _rejects(envelope, because=""):
    with pytest.raises(QueryRejectedError):
        validate_and_compile(envelope, USER)


def _accepts(envelope):
    return validate_and_compile(envelope, USER)


# ── _walk_expression branches ─────────────────────────────────────────────────

def test_expression_numeric_literal_accepted():
    _accepts(_agg([{"$group": {"_id": None, "total": {"$sum": 1}}}]))


def test_expression_bool_literal_accepted():
    _accepts(_agg([{"$group": {"_id": None, "flag": {"$sum": True}}}]))


def test_expression_none_literal_accepted():
    _accepts(_agg([{"$addFields": {"x": {"$ifNull": ["$amount", None]}}}]))


def test_expression_list_recursed():
    _accepts(_agg([{"$addFields": {"x": {"$add": ["$amount", 10]}}}]))


def test_expression_literal_value_not_walked():
    # $literal's value is data — "username" must not be treated as a field ref
    _accepts(_agg([{"$addFields": {"tag": {"$literal": "username"}}}]))


def test_expression_invalid_alias_rejected():
    # Leading underscore (other than "_id") is not a valid alias
    _rejects(_agg([{"$addFields": {"_badName": {"$sum": "$amount"}}}]))


def test_expression_unsupported_type_rejected():
    # Call the walker directly with a bytes value (unsupported type)
    with pytest.raises(QueryRejectedError):
        _walk_expression(b"bytes", COLLECTION_FIELDS["expenses"], "path", 0)


# ── _walk_projection branches ─────────────────────────────────────────────────

def test_projection_id_exclusion_allowed():
    # _id: 0 is valid in find projection even though _id is in the field list
    _accepts(_find({"amount": {"$gt": 0}}, projection={"_id": 0, "amount": 1}))


def test_projection_empty_dict_rejected():
    # $project with an empty body is rejected (must be non-empty)
    _rejects(_agg([{"$project": {}}]))


def test_projection_operator_as_key_rejected():
    # An operator name as a projection key is not allowed (find path)
    env = MongoQueryEnvelope(
        op="find",
        collection="expenses",
        filter={},
        projection={"$group": 1},
    )
    _rejects(env)


def test_projection_invalid_value_rejected():
    # Projection values must be 0, 1, True, or False
    env = MongoQueryEnvelope(
        op="find",
        collection="expenses",
        filter={},
        projection={"amount": 2},
    )
    _rejects(env)


def test_project_stage_computed_alias_accepted():
    # Computed alias (new name := expression) in $project is accepted
    _accepts(_agg([{"$project": {"total_amount": {"$multiply": ["$amount", 1]}}}]))


# ── _walk_predicate branches ──────────────────────────────────────────────────

def test_predicate_and_non_list_rejected():
    _rejects(_agg([{"$match": {"$and": "not-a-list"}}]))


def test_predicate_or_non_list_rejected():
    _rejects(_agg([{"$match": {"$or": {"key": "val"}}}]))


def test_predicate_nor_non_list_rejected():
    _rejects(_agg([{"$match": {"$nor": 42}}]))


def test_predicate_not_operator_works():
    _accepts(_agg([{"$match": {"amount": {"$not": {"$lt": 0}}}}]))


def test_predicate_expr_works():
    _accepts(_agg([{"$match": {"$expr": {"$gt": ["$amount", 100]}}}]))


def test_predicate_non_dict_rejected():
    # $match body must be an object
    _rejects(_agg([{"$match": "not-a-dict"}]))


def test_predicate_and_list_recursed():
    _accepts(
        _agg([
            {"$match": {
                "$and": [
                    {"amount": {"$gt": 0}},
                    {"category": {"$ne": ""}},
                ]
            }}
        ])
    )


# ── _walk_predicate_value branches ────────────────────────────────────────────

def test_predicate_value_list_recursed():
    _accepts(_agg([{"$match": {"category": {"$in": ["grocery", "restaurant"]}}}]))


def test_predicate_value_field_path_reference():
    _accepts(_agg([{"$match": {"$expr": {"$gt": ["$amount", "$line_items_count"]}}}]))


def test_predicate_value_elem_match():
    _accepts(
        _agg(
            [{"$match": {"total": {"$elemMatch": {"$gt": 0}}}}],
            collection="expense_line_items",
        )
    )


def test_predicate_value_non_dollar_key_in_operator_doc_rejected():
    # "gt" without "$" inside an operator document is rejected
    _rejects(_agg([{"$match": {"amount": {"gt": 0}}}]))


# ── _walk_stage branches ──────────────────────────────────────────────────────

def test_stage_limit_bool_rejected():
    _rejects(_agg([{"$limit": True}]))


def test_stage_limit_negative_rejected():
    _rejects(_agg([{"$limit": -1}]))


def test_stage_skip_valid():
    _accepts(_agg([{"$skip": 10}, {"$group": {"_id": "$category"}}]))


def test_stage_skip_bool_rejected():
    _rejects(_agg([{"$skip": False}]))


def test_stage_count_valid():
    _accepts(_agg([{"$count": "total"}]))


def test_stage_count_bad_alias_rejected():
    _rejects(_agg([{"$count": "123bad"}]))


def test_stage_count_non_string_rejected():
    _rejects(_agg([{"$count": 5}]))


def test_stage_sort_valid_alias_key():
    # "total" is an alias created by $group — valid as a sort key
    _accepts(
        _agg([
            {"$group": {"_id": "$category", "total": {"$sum": "$amount"}}},
            {"$sort": {"total": -1}},
        ])
    )


def test_stage_sort_valid_field_key():
    _accepts(_agg([{"$sort": {"amount": 1, "expense_date": -1}}]))


def test_stage_sort_invalid_direction_rejected():
    _rejects(_agg([{"$sort": {"amount": 2}}]))


def test_stage_sort_empty_rejected():
    _rejects(_agg([{"$sort": {}}]))


def test_stage_unwind_string_form():
    _accepts(_agg([{"$unwind": "$category"}]))


def test_stage_unwind_dict_form():
    _accepts(_agg([{"$unwind": {"path": "$category", "preserveNullAndEmptyArrays": True}}]))


def test_stage_unwind_dict_unknown_option_rejected():
    _rejects(_agg([{"$unwind": {"path": "$category", "unknownOpt": True}}]))


def test_stage_unwind_dict_no_path_rejected():
    # path must start with "$"
    _rejects(_agg([{"$unwind": {"path": "category"}}]))


def test_stage_unwind_invalid_type_rejected():
    _rejects(_agg([{"$unwind": 42}]))


def test_stage_sort_by_count_valid():
    _accepts(_agg([{"$sortByCount": "$category"}]))


def test_stage_facet_valid():
    _accepts(
        _agg([{
            "$facet": {
                "byCategory": [{"$group": {"_id": "$category", "total": {"$sum": "$amount"}}}],
                "byVendor": [{"$group": {"_id": "$vendor", "count": {"$sum": 1}}}],
            }
        }])
    )


def test_stage_facet_empty_rejected():
    _rejects(_agg([{"$facet": {}}]))


def test_stage_facet_non_list_pipeline_rejected():
    _rejects(_agg([{"$facet": {"myFacet": "not-a-list"}}]))


def test_stage_facet_invalid_name_rejected():
    _rejects(_agg([{"$facet": {"123bad": [{"$count": "total"}]}}]))


def test_stage_replace_root_valid():
    _accepts(_agg([{"$replaceRoot": {"newRoot": {"total": "$amount"}}}]))


def test_stage_add_fields_valid():
    _accepts(_agg([{"$addFields": {"doubled": {"$multiply": ["$amount", 2]}}}]))


def test_stage_set_valid():
    _accepts(_agg([{"$set": {"category": "$bill_type"}}]))


def test_stage_bucket_valid():
    _accepts(
        _agg([{
            "$bucket": {
                "groupBy": "$amount",
                "boundaries": [0, 100, 500, 1000],
                "default": "Other",
            }
        }])
    )


# ── validate_and_compile — aggregate path specifics ───────────────────────────

def test_expense_date_hoist_date_only_match_stage_deleted():
    # When the first $match contains ONLY expense_date, that stage is deleted
    # after hoisting; compiled pipeline = [scope $match, $limit]
    compiled = _accepts(
        _agg([{"$match": {"expense_date": {"$gte": "2026-01-01"}}}])
    )
    stage0 = compiled.pipeline[0]["$match"]
    assert "expense_date" in stage0
    assert stage0["username"] == USER
    # scope match + $limit only — original stage was deleted
    assert len(compiled.pipeline) == 2


def test_expense_date_hoist_partial_match_preserved():
    # When the first $match has expense_date + other predicates, only
    # expense_date is hoisted; remaining predicates stay in a follow-up stage
    compiled = _accepts(
        _agg([
            {"$match": {"expense_date": {"$gte": "2026-01-01"}, "category": "food"}},
        ])
    )
    stage0 = compiled.pipeline[0]["$match"]
    assert "expense_date" in stage0
    assert stage0["username"] == USER
    # The remaining category predicate survives in a later stage
    remaining_stages = compiled.pipeline[1:]
    has_category = any(
        s.get("$match", {}).get("category") == "food" for s in remaining_stages
    )
    assert has_category


def test_no_date_hoist_for_line_items_collection():
    # Hoisting only applies to the "expenses" collection
    compiled = _accepts(
        _agg(
            [{"$match": {"created_at": {"$gte": "2026-01-01"}}}],
            collection="expense_line_items",
        )
    )
    stage0 = compiled.pipeline[0]["$match"]
    assert "created_at" not in stage0
    assert stage0["username"] == USER


def test_aggregate_always_appends_limit():
    compiled = _accepts(_agg([{"$group": {"_id": "$category", "n": {"$sum": 1}}}]))
    last = compiled.pipeline[-1]
    assert "$limit" in last
    assert 1 <= last["$limit"] <= 200


def test_aggregate_limit_is_respected():
    # Pydantic enforces le=200; guard then applies max(1, min(limit, 200))
    compiled = _accepts(_agg([{"$count": "total"}], limit=5))
    assert compiled.limit == 5


# ── find path specifics ───────────────────────────────────────────────────────

def test_find_sort_invalid_direction_rejected():
    env = MongoQueryEnvelope(
        op="find",
        collection="expenses",
        filter={"amount": {"$gt": 0}},
        sort={"amount": 2},
    )
    _rejects(env)


def test_find_sort_unknown_field_rejected():
    # "password_hash" is not in COLLECTION_FIELDS["expenses"]
    env = MongoQueryEnvelope(
        op="find",
        collection="expenses",
        filter={},
        sort={"password_hash": 1},
    )
    _rejects(env)


def test_find_valid_sort_accepted():
    compiled = _accepts(
        _find({"amount": {"$gt": 0}}, sort={"expense_date": -1, "amount": 1})
    )
    assert compiled.sort is not None
    assert len(compiled.sort) == 2


def test_find_projection_bool_values_accepted():
    compiled = _accepts(
        _find({}, projection={"amount": True, "vendor": False})
    )
    assert compiled.projection is not None


def test_find_scopes_filter_to_user():
    compiled = _accepts(_find({"amount": {"$gt": 0}}))
    assert compiled.filter["username"] == USER
    assert compiled.filter["amount"] == {"$gt": 0}


def test_find_empty_filter_accepted():
    compiled = _accepts(_find({}))
    assert compiled.filter["username"] == USER
    assert compiled.op == "find"


# ── _is_alias / field-name edge cases ────────────────────────────────────────

def test_id_alias_accepted_as_group_id():
    # _id is a reserved alias; $group always uses it as the grouping key
    _accepts(_agg([{"$group": {"_id": "$category", "n": {"$sum": 1}}}]))


def test_system_variable_rejected():
    # $$ROOT-style system variables are not permitted
    _rejects(_agg([{"$group": {"_id": "$$ROOT"}}]))


def test_scope_field_username_rejected_in_match():
    # "username" is the scope field — must never be referenced by the query
    _rejects(_agg([{"$match": {"username": "hacker@evil.com"}}]))


def test_no_user_rejected():
    with pytest.raises(QueryRejectedError):
        validate_and_compile(
            MongoQueryEnvelope(op="aggregate", collection="expenses", pipeline=[]),
            "",
        )
