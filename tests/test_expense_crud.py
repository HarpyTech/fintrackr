"""Tests for expense CRUD service functions (mongomock-backed)."""

from app.services import expense_service


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
    """Insert a raw expense document and return its string ID."""
    from datetime import UTC, datetime
    doc = {
        "username": username,
        "amount": 10.0,
        "category": "food",
        "bill_type": "other",
        "input_type": "manual",
        "invoice_number": "",
        "vendor": "Test Vendor",
        "description": "Test",
        "expense_date": datetime(2024, 1, 15),
        "llm_model": None,
        "line_items_count": 0,
        "created_at": datetime.now(UTC),
    }
    doc.update(fields)
    result = mongo["expenses"].insert_one(doc)
    return str(result.inserted_id)


# ------ list_expenses (pagination) ------

def test_list_empty_returns_envelope(mongo):
    _seed_user(mongo, "u@x.com")
    result = expense_service.list_expenses("u@x.com")
    assert result["items"] == []
    assert result["total"] == 0
    assert result["limit"] == 50
    assert result["offset"] == 0


def test_list_pagination_limit(mongo):
    _seed_user(mongo, "u@x.com")
    for _ in range(5):
        _seed_expense(mongo, "u@x.com")
    result = expense_service.list_expenses("u@x.com", limit=2, offset=0)
    assert len(result["items"]) == 2
    assert result["total"] == 5
    assert result["limit"] == 2


def test_list_pagination_offset(mongo):
    _seed_user(mongo, "u@x.com")
    for _ in range(5):
        _seed_expense(mongo, "u@x.com")
    result = expense_service.list_expenses("u@x.com", limit=10, offset=4)
    assert len(result["items"]) == 1
    assert result["total"] == 5


def test_list_cap_at_200(mongo):
    _seed_user(mongo, "u@x.com")
    result = expense_service.list_expenses("u@x.com", limit=9999)
    assert result["limit"] == 200


def test_list_does_not_cross_users(mongo):
    _seed_user(mongo, "a@x.com")
    _seed_user(mongo, "b@x.com")
    _seed_expense(mongo, "b@x.com")
    result = expense_service.list_expenses("a@x.com")
    assert result["total"] == 0
    assert result["items"] == []


# ------ get_expense ------

def test_get_expense_found(mongo):
    _seed_user(mongo, "u@x.com")
    eid = _seed_expense(mongo, "u@x.com", vendor="ACME")
    result = expense_service.get_expense("u@x.com", eid)
    assert result is not None
    assert result["id"] == eid
    assert result["vendor"] == "ACME"


def test_get_expense_not_found_returns_none(mongo):
    _seed_user(mongo, "u@x.com")
    result = expense_service.get_expense("u@x.com", "000000000000000000000000")
    assert result is None


def test_get_expense_wrong_user_returns_none(mongo):
    _seed_user(mongo, "a@x.com")
    _seed_user(mongo, "b@x.com")
    eid = _seed_expense(mongo, "a@x.com")
    result = expense_service.get_expense("b@x.com", eid)
    assert result is None


def test_get_expense_bad_id_returns_none(mongo):
    result = expense_service.get_expense("u@x.com", "not-an-object-id")
    assert result is None


# ------ update_expense ------

def test_update_expense_vendor(mongo):
    _seed_user(mongo, "u@x.com")
    eid = _seed_expense(mongo, "u@x.com", vendor="Old")
    updated = expense_service.update_expense("u@x.com", eid, {"vendor": "New"})
    assert updated is not None
    assert updated["vendor"] == "New"


def test_update_expense_not_found_returns_none(mongo):
    result = expense_service.update_expense(
        "u@x.com", "000000000000000000000000", {"vendor": "x"}
    )
    assert result is None


def test_update_expense_wrong_owner_returns_none(mongo):
    _seed_user(mongo, "a@x.com")
    _seed_user(mongo, "b@x.com")
    eid = _seed_expense(mongo, "a@x.com")
    result = expense_service.update_expense("b@x.com", eid, {"vendor": "hacked"})
    assert result is None
    original = expense_service.get_expense("a@x.com", eid)
    assert original["vendor"] == "Test Vendor"


def test_update_expense_empty_payload_returns_original(mongo):
    _seed_user(mongo, "u@x.com")
    eid = _seed_expense(mongo, "u@x.com", vendor="Same")
    updated = expense_service.update_expense("u@x.com", eid, {})
    assert updated is not None
    assert updated["vendor"] == "Same"


# ------ delete_expense ------

def test_delete_expense_returns_true(mongo):
    _seed_user(mongo, "u@x.com")
    eid = _seed_expense(mongo, "u@x.com")
    deleted = expense_service.delete_expense("u@x.com", eid)
    assert deleted is True
    assert expense_service.get_expense("u@x.com", eid) is None


def test_delete_expense_not_found_returns_false(mongo):
    result = expense_service.delete_expense("u@x.com", "000000000000000000000000")
    assert result is False


def test_delete_expense_wrong_owner_returns_false(mongo):
    _seed_user(mongo, "a@x.com")
    _seed_user(mongo, "b@x.com")
    eid = _seed_expense(mongo, "a@x.com")
    result = expense_service.delete_expense("b@x.com", eid)
    assert result is False
    assert expense_service.get_expense("a@x.com", eid) is not None


def test_delete_removes_line_items(mongo):
    _seed_user(mongo, "u@x.com")
    eid = _seed_expense(mongo, "u@x.com")
    mongo["line_items"].insert_many([
        {"expense_id": eid, "username": "u@x.com", "name": "item1"},
        {"expense_id": eid, "username": "u@x.com", "name": "item2"},
    ])
    expense_service.delete_expense("u@x.com", eid)
    remaining = list(mongo["line_items"].find({"expense_id": eid}))
    assert remaining == []
