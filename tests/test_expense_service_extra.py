"""Additional expense_service coverage: soft-delete, limit status, limit check."""

from datetime import UTC, datetime

import pytest

from app.services import expense_service
from app.services.expense_service import SessionExpenseLimitError


def _seed_user(mongo, username, **fields):
    doc = {
        "username": username,
        "plan": "free",
        "expense_limit": 10,
        "disable_rate_limit": False,
    }
    doc.update(fields)
    mongo["users"].insert_one(doc)


def _seed_expense(mongo, username, **fields):
    doc = {
        "username": username,
        "amount": 10.0,
        "category": "food",
        "bill_type": "other",
        "input_type": "manual",
        "invoice_number": "",
        "vendor": "Vendor",
        "description": "Test",
        "expense_date": datetime(2024, 1, 15),
        "llm_model": None,
        "line_items_count": 0,
        "created_at": datetime.now(UTC),
    }
    doc.update(fields)
    result = mongo["expenses"].insert_one(doc)
    return str(result.inserted_id)


# ── soft-delete ────────────────────────────────────────────────────────────

def test_delete_expense_sets_is_deleted(mongo):
    _seed_user(mongo, "u@x.com")
    eid = _seed_expense(mongo, "u@x.com")
    deleted = expense_service.delete_expense("u@x.com", eid)
    assert deleted is True
    doc = mongo["expenses"].find_one({"username": "u@x.com"})
    assert doc["is_deleted"] is True
    assert "deleted_at" in doc


def test_delete_expense_hides_from_list(mongo):
    _seed_user(mongo, "u@x.com")
    eid = _seed_expense(mongo, "u@x.com")
    expense_service.delete_expense("u@x.com", eid)
    result = expense_service.list_expenses("u@x.com")
    assert result["total"] == 0
    assert result["items"] == []


def test_delete_expense_hides_from_get(mongo):
    _seed_user(mongo, "u@x.com")
    eid = _seed_expense(mongo, "u@x.com")
    expense_service.delete_expense("u@x.com", eid)
    found = expense_service.get_expense("u@x.com", eid)
    assert found is None


def test_delete_expense_already_deleted_returns_false(mongo):
    _seed_user(mongo, "u@x.com")
    eid = _seed_expense(mongo, "u@x.com")
    expense_service.delete_expense("u@x.com", eid)
    second = expense_service.delete_expense("u@x.com", eid)
    assert second is False


def test_delete_expense_wrong_user_returns_false(mongo):
    _seed_user(mongo, "a@x.com")
    _seed_user(mongo, "b@x.com")
    eid = _seed_expense(mongo, "a@x.com")
    result = expense_service.delete_expense("b@x.com", eid)
    assert result is False


def test_delete_expense_invalid_id_returns_false(mongo):
    _seed_user(mongo, "u@x.com")
    result = expense_service.delete_expense("u@x.com", "not-an-object-id")
    assert result is False


def test_deleted_expense_excluded_from_limit_count(mongo):
    _seed_user(mongo, "u@x.com", expense_limit=2)
    eid = _seed_expense(mongo, "u@x.com")
    _seed_expense(mongo, "u@x.com")
    expense_service.delete_expense("u@x.com", eid)
    status = expense_service.get_expense_limit_status("u@x.com")
    assert status["count"] == 1


# ── get_expense_limit_status ───────────────────────────────────────────────

def test_limit_status_no_expenses(mongo):
    _seed_user(mongo, "u@x.com", expense_limit=5)
    status = expense_service.get_expense_limit_status("u@x.com")
    assert status["count"] == 0
    assert status["limit"] == 5
    assert status["remaining"] == 5
    assert status["reached"] is False


def test_limit_status_at_limit(mongo):
    _seed_user(mongo, "u@x.com", expense_limit=2)
    _seed_expense(mongo, "u@x.com")
    _seed_expense(mongo, "u@x.com")
    status = expense_service.get_expense_limit_status("u@x.com")
    assert status["reached"] is True
    assert status["remaining"] == 0


def test_limit_status_disable_rate_limit(mongo):
    _seed_user(mongo, "u@x.com", disable_rate_limit=True)
    for _ in range(15):
        _seed_expense(mongo, "u@x.com")
    status = expense_service.get_expense_limit_status("u@x.com")
    assert status["reached"] is False
    assert status["remaining"] is None


# ── check_session_expense_limit ────────────────────────────────────────────

def test_check_limit_raises_when_exceeded(mongo):
    _seed_user(mongo, "u@x.com", expense_limit=1)
    _seed_expense(mongo, "u@x.com")
    with pytest.raises(SessionExpenseLimitError):
        expense_service.check_session_expense_limit("u@x.com")


def test_check_limit_passes_under_limit(mongo):
    _seed_user(mongo, "u@x.com", expense_limit=5)
    _seed_expense(mongo, "u@x.com")
    expense_service.check_session_expense_limit("u@x.com")  # no exception


def test_check_limit_skipped_when_disabled(mongo):
    _seed_user(mongo, "u@x.com", expense_limit=1, disable_rate_limit=True)
    _seed_expense(mongo, "u@x.com")
    _seed_expense(mongo, "u@x.com")
    expense_service.check_session_expense_limit("u@x.com")  # no exception


# ── update_expense excludes soft-deleted ───────────────────────────────────

def test_update_soft_deleted_returns_none(mongo):
    _seed_user(mongo, "u@x.com")
    eid = _seed_expense(mongo, "u@x.com")
    expense_service.delete_expense("u@x.com", eid)
    result = expense_service.update_expense("u@x.com", eid, {"amount": 99.0})
    assert result is None
