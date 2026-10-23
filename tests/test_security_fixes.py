"""Regression tests for the production-readiness security fixes."""

import time
from datetime import UTC, datetime, timedelta

import mongomock
import pytest
from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient
from jose import jwt

from app.api.routes import users as users_routes
from app.core.config import settings
from app.core.security import hash_password
from app.middleware.auth import PUBLIC_PATHS, AuthenticationMiddleware
from app.repositories import user_repository
from app.services import auth_service, email_service

# ── Auth middleware: token type + sliding session ─────────────────────────────


def _token(**overrides) -> str:
    now = int(time.time())
    payload = {
        "username": "u@b.com",
        "role": "user",
        "tenant_id": "u@b.com",
        "type": "access",
        "auth_time": now,
        "exp": now + settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }
    payload.update(overrides)
    payload = {k: v for k, v in payload.items() if v is not None}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


@pytest.fixture
def client():
    app = FastAPI()
    app.add_middleware(AuthenticationMiddleware)

    @app.get("/api/v1/expenses")
    def protected(request: Request):
        return {"user": request.state.user}

    return TestClient(app, raise_server_exceptions=False)


def test_refresh_token_rejected_as_bearer(client):
    resp = client.get(
        "/api/v1/expenses", headers={"Authorization": f"Bearer {_token(type='refresh')}"}
    )
    assert resp.status_code == 401


def test_token_without_type_rejected(client):
    resp = client.get(
        "/api/v1/expenses", headers={"Authorization": f"Bearer {_token(type=None)}"}
    )
    assert resp.status_code == 401


def test_fresh_cookie_is_not_renewed(client):
    client.cookies.set("access_token", _token())
    resp = client.get("/api/v1/expenses")
    assert resp.status_code == 200
    assert "access_token" not in resp.headers.get("set-cookie", "")


def test_cookie_past_half_life_is_renewed_and_keeps_auth_time(client):
    now = int(time.time())
    client.cookies.set("access_token", _token(auth_time=now - 600, exp=now + 60))
    resp = client.get("/api/v1/expenses")
    assert resp.status_code == 200
    cookie = resp.headers["set-cookie"]
    assert cookie.startswith("access_token=")
    renewed = cookie.split(";")[0].split("=", 1)[1]
    claims = jwt.decode(renewed, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    assert claims["auth_time"] == now - 600
    assert claims["type"] == "access"


def test_session_is_not_renewed_past_absolute_cap(client):
    now = int(time.time())
    old = now - (settings.SESSION_MAX_HOURS * 3600 + 60)
    client.cookies.set("access_token", _token(auth_time=old, exp=now + 60))
    resp = client.get("/api/v1/expenses")
    assert resp.status_code == 200
    assert "access_token" not in resp.headers.get("set-cookie", "")


def test_bearer_requests_are_never_renewed(client):
    now = int(time.time())
    resp = client.get(
        "/api/v1/expenses",
        headers={"Authorization": f"Bearer {_token(exp=now + 30)}"},
    )
    assert resp.status_code == 200
    assert "set-cookie" not in resp.headers


def test_passkey_enrolment_endpoints_are_not_public():
    assert "/api/v1/webauthn/register" not in PUBLIC_PATHS
    assert "/api/v1/webauthn/register/verify" not in PUBLIC_PATHS
    assert "/api/v1/webauthn/authenticate" in PUBLIC_PATHS


# ── OTP attempt budget ────────────────────────────────────────────────────────


@pytest.fixture
def users_col(monkeypatch):
    col = mongomock.MongoClient()["testdb"]["users"]
    refresh = mongomock.MongoClient()["testdb"]["refresh_tokens"]
    monkeypatch.setattr(user_repository, "get_users_collection", lambda: col)
    monkeypatch.setattr(auth_service, "get_refresh_tokens_collection", lambda: refresh)
    monkeypatch.setattr(auth_service, "clear_otp_attempts", lambda email: None)
    col.refresh = refresh
    return col


def _reset_user(col, otp="123456"):
    col.insert_one(
        {
            "username": "u@b.com",
            "password_hash": hash_password("old-password"),
            "reset_otp_hash": hash_password(otp),
            "reset_otp_expires_at": datetime.now(UTC) + timedelta(minutes=2),
            "reset_otp_attempts": 0,
        }
    )


def test_reset_otp_is_burned_after_attempt_budget(users_col):
    _reset_user(users_col)
    for _ in range(settings.SIGNUP_OTP_MAX_ATTEMPTS):
        result = auth_service.reset_password_with_otp("u@b.com", "000000", "new-password-1")
        assert result == {"error": "Invalid OTP"}

    # Even the correct code no longer works once the budget is spent.
    result = auth_service.reset_password_with_otp("u@b.com", "123456", "new-password-1")
    assert result == {"error": "OTP expired"}
    assert "reset_otp_hash" not in users_col.find_one({"username": "u@b.com"})


def test_correct_reset_otp_changes_password_and_revokes_refresh_tokens(users_col):
    _reset_user(users_col)
    users_col.refresh.insert_one({"username": "u@b.com", "token_hash": "x"})
    users_col.refresh.insert_one({"username": "other@b.com", "token_hash": "y"})

    result = auth_service.reset_password_with_otp("u@b.com", "123456", "new-password-1")

    assert result == {"reset": True}
    assert users_col.refresh.count_documents({"username": "u@b.com"}) == 0
    assert users_col.refresh.count_documents({"username": "other@b.com"}) == 1
    doc = users_col.find_one({"username": "u@b.com"})
    assert "reset_otp_attempts" not in doc


def test_signup_otp_is_burned_after_attempt_budget(users_col):
    users_col.insert_one(
        {
            "username": "u@b.com",
            "email_verified": False,
            "signup_otp_hash": hash_password("123456"),
            "signup_otp_expires_at": datetime.now(UTC) + timedelta(minutes=2),
            "signup_otp_attempts": 0,
        }
    )
    for _ in range(settings.SIGNUP_OTP_MAX_ATTEMPTS):
        assert auth_service.verify_user_signup_otp("u@b.com", "000000") == {
            "error": "Invalid OTP"
        }
    assert auth_service.verify_user_signup_otp("u@b.com", "123456") == {
        "error": "OTP expired"
    }
    assert users_col.find_one({"username": "u@b.com"})["email_verified"] is False


# ── OTP delivery never logs the code when deployed ────────────────────────────


@pytest.mark.parametrize("deliver", ["deliver_signup_otp", "deliver_reset_otp"])
def test_otp_not_logged_on_cloud_run(monkeypatch, caplog, deliver):
    monkeypatch.setenv("K_SERVICE", "finance-prod")
    monkeypatch.setattr(settings, "SMTP_HOST", None)
    with pytest.raises(RuntimeError):
        getattr(email_service, deliver)("u@b.com", "987654")
    assert "987654" not in caplog.text


def test_otp_console_fallback_still_works_locally(monkeypatch, caplog):
    monkeypatch.delenv("K_SERVICE", raising=False)
    monkeypatch.setattr(settings, "SMTP_HOST", None)
    email_service.deliver_signup_otp("u@b.com", "987654")
    assert "987654" in caplog.text


# ── Plan self-service ─────────────────────────────────────────────────────────


def test_plan_endpoint_hidden_when_billing_disabled(monkeypatch):
    monkeypatch.setattr(settings, "FEATURE_BILLING_ENABLED", False)
    with pytest.raises(HTTPException) as exc:
        users_routes.update_plan(users_routes.PlanUpdateRequest(plan="max"), user="u@b.com")
    assert exc.value.status_code == 404


@pytest.mark.parametrize("plan", ["go", "max"])
def test_paid_plans_require_payment(monkeypatch, plan):
    monkeypatch.setattr(settings, "FEATURE_BILLING_ENABLED", True)
    with pytest.raises(HTTPException) as exc:
        users_routes.update_plan(users_routes.PlanUpdateRequest(plan=plan), user="u@b.com")
    assert exc.value.status_code == 402
