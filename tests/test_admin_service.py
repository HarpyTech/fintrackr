"""Tests for admin_service — list_users, get_user, update_user."""

import pytest

from app.services import admin_service
from app.services.admin_service import UserNotFoundError


def _seed_user(mongo, username, **fields):
    doc = {
        "username": username,
        "role": "user",
        "plan": "free",
        "expense_limit": 10,
        "disable_rate_limit": False,
        "email_verified": True,
        "tenant_id": username,
    }
    doc.update(fields)
    mongo["users"].insert_one(doc)


def _seed_expense(mongo, username, tenant_id=None):
    from datetime import UTC, datetime
    mongo["expenses"].insert_one({
        "username": username,
        "tenant_id": tenant_id or username,
        "amount": 5.0,
        "category": "food",
        "expense_date": datetime.now(UTC),
        "created_at": datetime.now(UTC),
    })


# ── list_users ─────────────────────────────────────────────────────────────

def test_list_users_empty(mongo):
    result = admin_service.list_users()
    assert result["items"] == []
    assert result["total"] == 0


def test_list_users_returns_all(mongo):
    _seed_user(mongo, "a@x.com")
    _seed_user(mongo, "b@x.com")
    result = admin_service.list_users()
    assert result["total"] == 2
    usernames = {u["username"] for u in result["items"]}
    assert usernames == {"a@x.com", "b@x.com"}


def test_list_users_expense_count(mongo):
    _seed_user(mongo, "u@x.com")
    _seed_expense(mongo, "u@x.com")
    _seed_expense(mongo, "u@x.com")
    result = admin_service.list_users()
    assert result["items"][0]["expense_count"] == 2


def test_list_users_search_filter(mongo):
    _seed_user(mongo, "alice@corp.com")
    _seed_user(mongo, "bob@corp.com")
    result = admin_service.list_users(search="alice")
    assert len(result["items"]) == 1
    assert result["items"][0]["username"] == "alice@corp.com"


def test_list_users_tenant_scoped(mongo):
    _seed_user(mongo, "u@t1.com", tenant_id="t1")
    _seed_user(mongo, "u@t2.com", tenant_id="t2")
    result = admin_service.list_users(tenant_id="t1")
    assert result["total"] == 1
    assert result["items"][0]["username"] == "u@t1.com"


def test_list_users_pagination(mongo):
    for i in range(5):
        _seed_user(mongo, f"u{i}@x.com")
    result = admin_service.list_users(skip=0, limit=2)
    assert len(result["items"]) == 2
    assert result["total"] == 5


def test_list_users_serializes_fields(mongo):
    _seed_user(mongo, "admin@x.com", role="admin", plan="pro", expense_limit=100)
    result = admin_service.list_users()
    user = result["items"][0]
    assert user["role"] == "admin"
    assert user["plan"] == "pro"
    assert user["expense_limit"] == 100
    assert user["email_verified"] is True


# ── get_user ───────────────────────────────────────────────────────────────

def test_get_user_found(mongo):
    _seed_user(mongo, "u@x.com", plan="pro", expense_limit=100)
    user = admin_service.get_user("u@x.com")
    assert user["username"] == "u@x.com"
    assert user["plan"] == "pro"


def test_get_user_not_found_raises(mongo):
    with pytest.raises(UserNotFoundError):
        admin_service.get_user("nobody@x.com")


def test_get_user_tenant_isolation(mongo):
    _seed_user(mongo, "u@x.com", tenant_id="t1")
    with pytest.raises(UserNotFoundError):
        admin_service.get_user("u@x.com", tenant_id="t2")


def test_get_user_expense_count(mongo):
    _seed_user(mongo, "u@x.com")
    _seed_expense(mongo, "u@x.com")
    user = admin_service.get_user("u@x.com")
    assert user["expense_count"] == 1


# ── update_user ────────────────────────────────────────────────────────────

def test_update_user_role(mongo):
    _seed_user(mongo, "u@x.com")
    result = admin_service.update_user("u@x.com", role="admin")
    assert result["role"] == "admin"


def test_update_user_plan_sets_limit(mongo):
    _seed_user(mongo, "u@x.com")
    result = admin_service.update_user("u@x.com", plan="pro")
    assert result["plan"] == "pro"
    assert result["expense_limit"] == 100


def test_update_user_expense_limit_override(mongo):
    _seed_user(mongo, "u@x.com")
    result = admin_service.update_user("u@x.com", expense_limit=50)
    assert result["expense_limit"] == 50
    assert result["disable_rate_limit"] is False


def test_update_user_disable_rate_limit(mongo):
    _seed_user(mongo, "u@x.com")
    result = admin_service.update_user("u@x.com", disable_rate_limit=True)
    assert result["disable_rate_limit"] is True


def test_update_user_not_found_raises(mongo):
    with pytest.raises(UserNotFoundError):
        admin_service.update_user("ghost@x.com", role="admin")


def test_update_user_tenant_isolation(mongo):
    _seed_user(mongo, "u@x.com", tenant_id="t1")
    with pytest.raises(UserNotFoundError):
        admin_service.update_user("u@x.com", role="admin", tenant_id="t2")
