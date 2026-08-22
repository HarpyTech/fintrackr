"""Unit tests for subscription plan definitions (pure logic, no DB)."""

from app.core import plans


def test_default_plan_is_free():
    assert plans.DEFAULT_PLAN == "free"
    assert plans.get_plan(plans.DEFAULT_PLAN).expense_limit == 10


def test_normalize_plan_key_falls_back_to_default():
    assert plans.normalize_plan_key("PRO") == "pro"
    assert plans.normalize_plan_key("  enterprise ") == "enterprise"
    assert plans.normalize_plan_key("nonsense") == "free"
    assert plans.normalize_plan_key(None) == "free"


def test_is_valid_plan():
    assert plans.is_valid_plan("free")
    assert plans.is_valid_plan("Pro")
    assert not plans.is_valid_plan("platinum")
    assert not plans.is_valid_plan(None)


def test_plan_user_fields_for_limited_plans():
    assert plans.plan_user_fields("free") == {
        "plan": "free",
        "expense_limit": 10,
        "disable_rate_limit": False,
    }
    assert plans.plan_user_fields("pro") == {
        "plan": "pro",
        "expense_limit": 100,
        "disable_rate_limit": False,
    }


def test_plan_user_fields_for_unlimited_plan():
    fields = plans.plan_user_fields("enterprise")
    assert fields["plan"] == "enterprise"
    assert fields["disable_rate_limit"] is True
    assert fields["expense_limit"] == 0


def test_plan_user_fields_unknown_falls_back_to_default():
    assert plans.plan_user_fields("bogus")["plan"] == "free"


def test_plan_catalog_shape():
    catalog = plans.plan_catalog()
    keys = {p["key"] for p in catalog}
    assert keys == {"free", "pro", "enterprise"}
    enterprise = next(p for p in catalog if p["key"] == "enterprise")
    assert enterprise["unlimited"] is True
    assert enterprise["expense_limit"] is None
