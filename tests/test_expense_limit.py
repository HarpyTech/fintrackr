"""Tests for per-user total expense-limit enforcement (mongomock-backed)."""

import pytest

from app.services import expense_service


def _seed_user(mongo, username, **fields):
    doc = {"username": username, "plan": "free",
           "expense_limit": 10, "disable_rate_limit": False}
    doc.update(fields)
    mongo["users"].insert_one(doc)


def _add_expenses(mongo, username, count):
    mongo["expenses"].insert_many([{"username": username} for _ in range(count)])


def test_status_for_new_user(mongo):
    _seed_user(mongo, "a@x.com")
    status = expense_service.get_expense_limit_status("a@x.com")
    assert status["limit"] == 10
    assert status["count"] == 0
    assert status["remaining"] == 10
    assert status["reached"] is False


def test_limit_not_reached_below_cap(mongo):
    _seed_user(mongo, "a@x.com")
    _add_expenses(mongo, "a@x.com", 9)
    expense_service.check_session_expense_limit("a@x.com")  # must not raise
    assert expense_service.get_expense_limit_status("a@x.com")["remaining"] == 1


def test_limit_reached_raises(mongo):
    _seed_user(mongo, "a@x.com")
    _add_expenses(mongo, "a@x.com", 10)
    with pytest.raises(expense_service.SessionExpenseLimitError):
        expense_service.check_session_expense_limit("a@x.com")
    assert expense_service.get_expense_limit_status("a@x.com")["reached"] is True


def test_unlimited_user_never_reaches_cap(mongo):
    _seed_user(mongo, "a@x.com", disable_rate_limit=True, expense_limit=0)
    _add_expenses(mongo, "a@x.com", 25)
    expense_service.check_session_expense_limit("a@x.com")  # must not raise
    status = expense_service.get_expense_limit_status("a@x.com")
    assert status["reached"] is False
    assert status["remaining"] is None


def test_higher_limit_from_admin_override(mongo):
    _seed_user(mongo, "a@x.com", expense_limit=15)
    _add_expenses(mongo, "a@x.com", 12)
    expense_service.check_session_expense_limit("a@x.com")  # must not raise
    assert expense_service.get_expense_limit_status("a@x.com")["remaining"] == 3


def test_legacy_user_without_limit_fields_gets_defaults(mongo):
    mongo["users"].insert_one({"username": "legacy@x.com"})
    status = expense_service.get_expense_limit_status("legacy@x.com")
    assert status["limit"] == expense_service.SESSION_EXPENSE_LIMIT
    stored = mongo["users"].find_one({"username": "legacy@x.com"})
    assert stored["plan"] == "free"
    assert stored["expense_limit"] == expense_service.SESSION_EXPENSE_LIMIT
