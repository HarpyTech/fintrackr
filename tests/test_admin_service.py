"""Tests for admin user-management service (mongomock-backed)."""

import pytest

from app.services import admin_service


def _seed(mongo, username, **fields):
    doc = {"username": username, "role": "user", "plan": "free",
           "expense_limit": 10, "disable_rate_limit": False,
           "email_verified": True}
    doc.update(fields)
    mongo["users"].insert_one(doc)


def test_list_users_returns_usage(mongo):
    _seed(mongo, "a@x.com")
    _seed(mongo, "b@x.com", plan="pro", expense_limit=100)
    mongo["expenses"].insert_many(
        [{"username": "a@x.com"}, {"username": "a@x.com"}]
    )

    result = admin_service.list_users()
    assert result["total"] == 2
    by_name = {u["username"]: u for u in result["items"]}
    assert by_name["a@x.com"]["expense_count"] == 2
    assert by_name["b@x.com"]["plan"] == "pro"
    assert by_name["b@x.com"]["expense_count"] == 0


def test_list_users_search_and_pagination(mongo):
    for i in range(5):
        _seed(mongo, f"user{i}@x.com")
    _seed(mongo, "admin@corp.com", role="admin")

    filtered = admin_service.list_users(search="corp")
    assert filtered["total"] == 1
    assert filtered["items"][0]["username"] == "admin@corp.com"

    page = admin_service.list_users(skip=0, limit=2)
    assert len(page["items"]) == 2
    assert page["total"] == 6


def test_get_user_found_and_missing(mongo):
    _seed(mongo, "a@x.com")
    assert admin_service.get_user("a@x.com")["username"] == "a@x.com"
    with pytest.raises(admin_service.UserNotFoundError):
        admin_service.get_user("missing@x.com")


def test_update_user_plan_sets_derived_limit(mongo):
    _seed(mongo, "a@x.com")
    updated = admin_service.update_user("a@x.com", plan="pro")
    assert updated["plan"] == "pro"
    assert updated["expense_limit"] == 100
    assert updated["disable_rate_limit"] is False


def test_update_user_enterprise_plan_is_unlimited(mongo):
    _seed(mongo, "a@x.com")
    updated = admin_service.update_user("a@x.com", plan="enterprise")
    assert updated["disable_rate_limit"] is True


def test_update_user_explicit_limit_override(mongo):
    _seed(mongo, "a@x.com")
    updated = admin_service.update_user("a@x.com", expense_limit=42)
    assert updated["expense_limit"] == 42
    assert updated["disable_rate_limit"] is False


def test_update_user_role(mongo):
    _seed(mongo, "a@x.com")
    assert admin_service.update_user("a@x.com", role="admin")["role"] == "admin"


def test_update_user_missing_raises(mongo):
    with pytest.raises(admin_service.UserNotFoundError):
        admin_service.update_user("missing@x.com", role="admin")
