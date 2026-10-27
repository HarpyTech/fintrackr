"""Unit tests for subscription plan definitions (pure logic, no DB)."""

from app.core import plans


def test_default_plan_is_free():
    assert plans.DEFAULT_PLAN == "free"
    assert plans.get_plan(plans.DEFAULT_PLAN).expense_limit == 15


def test_normalize_plan_key_falls_back_to_default():
    assert plans.normalize_plan_key("GO") == "go"
    assert plans.normalize_plan_key("  max ") == "max"
    assert plans.normalize_plan_key("nonsense") == "free"
    assert plans.normalize_plan_key(None) == "free"


def test_is_valid_plan():
    assert plans.is_valid_plan("free")
    assert plans.is_valid_plan("Go")
    assert plans.is_valid_plan("MAX")
    assert not plans.is_valid_plan("platinum")
    assert not plans.is_valid_plan(None)


def test_plan_user_fields_for_free_plan():
    assert plans.plan_user_fields("free") == {
        "plan": "free",
        "expense_limit": 15,
        "disable_rate_limit": False,
    }


def test_plan_user_fields_for_go_plan():
    assert plans.plan_user_fields("go") == {
        "plan": "go",
        "expense_limit": 100,
        "disable_rate_limit": False,
    }


def test_plan_user_fields_for_unlimited_plan():
    fields = plans.plan_user_fields("max")
    assert fields["plan"] == "max"
    assert fields["disable_rate_limit"] is True
    assert fields["expense_limit"] == 0


def test_plan_user_fields_unknown_falls_back_to_default():
    result = plans.plan_user_fields("bogus")
    assert result["plan"] == "free"
    assert result["expense_limit"] == 15


def test_plan_catalog_shape():
    catalog = plans.plan_catalog()
    keys = {p["key"] for p in catalog}
    assert keys == {"free", "go", "max"}
    max_plan = next(p for p in catalog if p["key"] == "max")
    assert max_plan["unlimited"] is True
    assert max_plan["expense_limit"] is None
    go_plan = next(p for p in catalog if p["key"] == "go")
    assert go_plan["expense_limit"] == 100


def test_get_plan_case_insensitive():
    assert plans.get_plan("FREE").key == "free"
    assert plans.get_plan("Go").key == "go"
    assert plans.get_plan("MAX").key == "max"
