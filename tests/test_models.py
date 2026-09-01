"""Tests for Pydantic models in app/models/ — pure validation, no DB."""

import json

import pytest
from pydantic import ValidationError

from app.models.admin import AdminUserSummary, AdminUserUpdate
from app.models.expense import (
    ExpenseChatCreateRequest,
    ExpenseCreate,
    ExpenseLineItem,
    ExpenseUpdate,
)
from app.models.mongo_query import MongoQueryEnvelopeLLM
from app.models.user import (
    ForgotPasswordRequest,
    ResetPasswordPayload,
    UserCreate,
    UserProfileUpdate,
    UserVerifySignup,
    WebAuthnAuthenticateRequest,
    WebAuthnRegisterRequest,
)

from datetime import date


# ── AdminUserUpdate ────────────────────────────────────────────────────────────

def test_admin_update_role_valid():
    u = AdminUserUpdate(role="admin")
    assert u.role == "admin"


def test_admin_update_role_normalized():
    u = AdminUserUpdate(role="  USER  ")
    assert u.role == "user"


def test_admin_update_role_invalid():
    with pytest.raises(ValidationError):
        AdminUserUpdate(role="superuser")


def test_admin_update_plan_valid():
    u = AdminUserUpdate(plan="go")
    assert u.plan == "go"


def test_admin_update_plan_case_insensitive():
    u = AdminUserUpdate(plan="GO")
    assert u.plan == "go"


def test_admin_update_plan_invalid():
    with pytest.raises(ValidationError):
        AdminUserUpdate(plan="platinum")


def test_admin_update_expense_limit_valid():
    u = AdminUserUpdate(expense_limit=50)
    assert u.expense_limit == 50


def test_admin_update_expense_limit_zero_invalid():
    with pytest.raises(ValidationError):
        AdminUserUpdate(expense_limit=0)


def test_admin_update_requires_at_least_one_field():
    with pytest.raises(ValidationError):
        AdminUserUpdate()


def test_admin_update_disable_rate_limit():
    u = AdminUserUpdate(disable_rate_limit=True)
    assert u.disable_rate_limit is True


# ── AdminUserSummary ───────────────────────────────────────────────────────────

def test_admin_summary_valid():
    s = AdminUserSummary(
        username="user@example.com",
        role="user",
        plan="free",
        expense_limit=10,
        disable_rate_limit=False,
        email_verified=True,
        expense_count=3,
    )
    assert s.username == "user@example.com"
    assert s.expense_count == 3


def test_admin_summary_invalid_email():
    with pytest.raises(ValidationError):
        AdminUserSummary(
            username="not-an-email",
            role="user",
            plan="free",
            expense_limit=10,
            disable_rate_limit=False,
            email_verified=True,
            expense_count=0,
        )


# ── ExpenseLineItem ────────────────────────────────────────────────────────────

def test_line_item_valid():
    item = ExpenseLineItem(name="Coffee", quantity=2, unit_price=3.5, total=7.0)
    assert item.quantity == 2.0


def test_line_item_quantity_must_be_positive():
    with pytest.raises(ValidationError):
        ExpenseLineItem(name="x", quantity=0, unit_price=1.0, total=0.0)


def test_line_item_unit_price_must_be_positive():
    with pytest.raises(ValidationError):
        ExpenseLineItem(name="x", quantity=1, unit_price=0.0, total=1.0)


def test_line_item_total_must_be_positive():
    with pytest.raises(ValidationError):
        ExpenseLineItem(name="x", quantity=1, unit_price=1.0, total=0.0)


def test_line_item_name_too_long():
    with pytest.raises(ValidationError):
        ExpenseLineItem(name="x" * 129, quantity=1, unit_price=1.0, total=1.0)


# ── ExpenseCreate ──────────────────────────────────────────────────────────────

def test_expense_create_valid():
    e = ExpenseCreate(amount=10.5, expense_date=date(2024, 1, 15))
    assert e.bill_type == "other"
    assert e.input_type == "manual"


def test_expense_create_zero_amount_invalid():
    with pytest.raises(ValidationError):
        ExpenseCreate(amount=0, expense_date=date(2024, 1, 15))


def test_expense_create_category_too_short():
    with pytest.raises(ValidationError):
        ExpenseCreate(amount=1.0, category="x", expense_date=date(2024, 1, 15))


def test_expense_create_invalid_bill_type():
    with pytest.raises(ValidationError):
        ExpenseCreate(amount=1.0, bill_type="unknown", expense_date=date(2024, 1, 15))


def test_expense_create_valid_bill_types():
    for bt in ("grocery", "restaurant", "service", "utility", "other"):
        e = ExpenseCreate(amount=1.0, bill_type=bt, expense_date=date(2024, 1, 15))
        assert e.bill_type == bt


# ── ExpenseChatCreateRequest ──────────────────────────────────────────────────

def test_chat_request_valid():
    r = ExpenseChatCreateRequest(message="Hello there world")
    assert r.message == "Hello there world"


def test_chat_request_too_short():
    with pytest.raises(ValidationError):
        ExpenseChatCreateRequest(message="Hi")


def test_chat_request_too_long():
    with pytest.raises(ValidationError):
        ExpenseChatCreateRequest(message="x" * 1001)


# ── ExpenseUpdate ─────────────────────────────────────────────────────────────

def test_expense_update_all_optional():
    u = ExpenseUpdate()
    assert u.amount is None
    assert u.vendor is None


def test_expense_update_amount_zero_invalid():
    with pytest.raises(ValidationError):
        ExpenseUpdate(amount=0)


def test_expense_update_vendor_too_long():
    with pytest.raises(ValidationError):
        ExpenseUpdate(vendor="x" * 129)


# ── UserCreate ────────────────────────────────────────────────────────────────

def test_user_create_valid():
    u = UserCreate(username="test@example.com", password="securepassword")
    assert u.username == "test@example.com"


def test_user_create_invalid_email():
    with pytest.raises(ValidationError):
        UserCreate(username="not-email", password="securepassword")


def test_user_create_password_too_short():
    with pytest.raises(ValidationError):
        UserCreate(username="u@x.com", password="short")


# ── UserVerifySignup ──────────────────────────────────────────────────────────

def test_verify_signup_otp_length():
    u = UserVerifySignup(username="u@x.com", otp="123456")
    assert u.otp == "123456"


def test_verify_signup_otp_too_short():
    with pytest.raises(ValidationError):
        UserVerifySignup(username="u@x.com", otp="123")


def test_verify_signup_otp_too_long():
    with pytest.raises(ValidationError):
        UserVerifySignup(username="u@x.com", otp="123456789")


# ── ForgotPasswordRequest / ResetPasswordPayload ──────────────────────────────

def test_forgot_password_valid():
    r = ForgotPasswordRequest(username="u@x.com")
    assert r.username == "u@x.com"


def test_reset_password_valid():
    r = ResetPasswordPayload(username="u@x.com", otp="654321", new_password="newpass123")
    assert r.new_password == "newpass123"


def test_reset_password_too_short():
    with pytest.raises(ValidationError):
        ResetPasswordPayload(username="u@x.com", otp="123456", new_password="short")


# ── UserProfileUpdate ─────────────────────────────────────────────────────────

def test_profile_update_all_none():
    u = UserProfileUpdate()
    assert u.first_name is None


def test_profile_update_first_name_too_long():
    with pytest.raises(ValidationError):
        UserProfileUpdate(first_name="x" * 81)


# ── WebAuthn models ───────────────────────────────────────────────────────────

def test_webauthn_register_valid():
    r = WebAuthnRegisterRequest(username="u@x.com", device_id="a" * 10)
    assert r.device_id == "a" * 10


def test_webauthn_register_device_id_too_short():
    with pytest.raises(ValidationError):
        WebAuthnRegisterRequest(username="u@x.com", device_id="short")


def test_webauthn_authenticate_valid():
    r = WebAuthnAuthenticateRequest(username="u@x.com", device_id="b" * 20)
    assert r.username == "u@x.com"


# ── MongoQueryEnvelopeLLM.to_envelope() ───────────────────────────────────────

def _llm_base(**overrides):
    defaults = dict(
        op="aggregate",
        collection="expenses",
        pipeline_json='[{"$count": "total"}]',
        filter_json="{}",
        projection_json="{}",
        sort_json="{}",
        limit=50,
        chart="table",
        encoding_x="",
        encoding_value="",
        encoding_series="",
        encoding_name="",
        encoding_x_label="",
        chart_title="",
        chart_size="md",
        explain="",
        confidence=0.8,
        assumptions=[],
        clarification="",
    )
    defaults.update(overrides)
    return MongoQueryEnvelopeLLM(**defaults)


def test_to_envelope_valid_aggregate():
    llm = _llm_base()
    env = llm.to_envelope()
    assert env.op == "aggregate"
    assert env.collection == "expenses"
    assert env.pipeline == [{"$count": "total"}]


def test_to_envelope_valid_find():
    llm = _llm_base(
        op="find",
        filter_json='{"amount": {"$gt": 0}}',
        pipeline_json="[]",
    )
    env = llm.to_envelope()
    assert env.op == "find"
    assert env.filter == {"amount": {"$gt": 0}}


def test_to_envelope_empty_json_strings():
    llm = _llm_base(pipeline_json="", filter_json="", projection_json="", sort_json="")
    env = llm.to_envelope()
    assert env.pipeline == []
    assert env.filter == {}


def test_to_envelope_null_json_strings():
    llm = _llm_base(pipeline_json="null", filter_json="null")
    env = llm.to_envelope()
    assert env.pipeline == []
    assert env.filter == {}


def test_to_envelope_chart_hint_propagated():
    llm = _llm_base(chart="trend_bar", encoding_x="expense_date", chart_title="Spend over time")
    env = llm.to_envelope()
    assert env.chart_hint.chart == "trend_bar"
    assert env.chart_hint.encoding.x == "expense_date"
    assert env.chart_hint.title == "Spend over time"


def test_to_envelope_invalid_pipeline_json_raises():
    llm = _llm_base(pipeline_json="not json")
    with pytest.raises(ValueError, match="not valid JSON"):
        llm.to_envelope()


def test_to_envelope_pipeline_non_list_raises():
    llm = _llm_base(pipeline_json='{"key": "val"}')
    with pytest.raises(ValueError, match="must be a JSON array"):
        llm.to_envelope()


def test_to_envelope_filter_non_dict_raises():
    llm = _llm_base(filter_json='["item"]')
    with pytest.raises(ValueError, match="must be a JSON object"):
        llm.to_envelope()


def test_to_envelope_limit_clamped():
    llm = _llm_base(limit=0)
    env = llm.to_envelope()
    assert env.limit >= 1


def test_to_envelope_assumptions_propagated():
    llm = _llm_base(assumptions=["assumes current year", "assumes USD"])
    env = llm.to_envelope()
    assert len(env.assumptions) == 2
