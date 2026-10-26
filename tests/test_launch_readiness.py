"""Launch-readiness regression tests: auth surface, timezone, idempotency,
account rights and platform admin."""

import re
import time
from datetime import UTC, datetime, timedelta, timezone

import mongomock
import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
import jwt

from app.api import deps
from app.api.routes import admin as admin_routes
from app.api.routes import auth as auth_routes
from app.api.routes import expenses as expense_routes
from app.api.routes import users as users_routes
from app.core import admins, idempotency, ratelimit, timeutil
from app.core.config import settings
from app.core.security import hash_password
from app.db import mongo as mongo_module
from app.middleware import timezone as timezone_middleware
from app.middleware.auth import PUBLIC_PATHS
from app.repositories import user_repository
from app.services import account_service, profile_service


def _access_token(username: str) -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "username": username,
            "role": "user",
            "tenant_id": username,
            "type": "access",
            "auth_time": now,
            "exp": now + 900,
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


# ── Test 1: every non-public API route requires a token ───────────────────────


def test_every_protected_route_rejects_anonymous_requests():
    pytest.importorskip("webauthn")
    from app.main import app

    client = TestClient(app, raise_server_exceptions=False)
    checked = 0
    for route in app.routes:
        if not isinstance(route, APIRoute) or not route.path.startswith(
            settings.API_V1_STR
        ):
            continue
        if route.path in PUBLIC_PATHS:
            continue
        path = re.sub(r"\{[^}]+\}", "x", route.path)
        for method in route.methods - {"HEAD", "OPTIONS"}:
            resp = client.request(method, path)
            assert (
                resp.status_code == 401
            ), f"{method} {route.path} -> {resp.status_code}"
            checked += 1
    assert checked > 20


# ── Test 2: passkey enrolment is bound to the session ─────────────────────────


def test_passkey_enrolment_requires_session_and_own_account():
    pytest.importorskip("webauthn")
    from app.main import app

    client = TestClient(app, raise_server_exceptions=False)
    body = {"username": "victim@b.com", "device_id": "device-123456"}

    assert client.post("/api/v1/webauthn/register", json=body).status_code == 401

    client.cookies.set("access_token", _access_token("attacker@b.com"))
    client.cookies.set("csrf_token", "csrf-value")
    headers = {"X-CSRF-Token": "csrf-value"}
    resp = client.post("/api/v1/webauthn/register", json=body, headers=headers)
    assert resp.status_code == 403

    verify_body = {**body, "credential": {}}
    resp = client.post(
        "/api/v1/webauthn/register/verify", json=verify_body, headers=headers
    )
    assert resp.status_code == 403


# ── Test 5: login lockout ignores X-Forwarded-For rotation ────────────────────


def test_login_lockout_survives_rotating_forwarded_for(monkeypatch):
    users = mongomock.MongoClient()["testdb"]["users"]
    monkeypatch.setattr(ratelimit, "get_users_collection", lambda: users)
    monkeypatch.setattr(auth_routes, "authenticate_user", lambda u, p: None)

    app = FastAPI()
    app.include_router(auth_routes.router, prefix="/api/v1/auth")
    client = TestClient(app)
    body = {"username": "victim@b.com", "password": "guess"}

    for attempt in range(10):
        resp = client.post(
            "/api/v1/auth/login",
            json=body,
            headers={"X-Forwarded-For": f"10.0.0.{attempt}"},
        )
        assert resp.status_code == 401

    resp = client.post(
        "/api/v1/auth/login", json=body, headers={"X-Forwarded-For": "10.9.9.9"}
    )
    assert resp.status_code == 429


def test_client_ip_uses_last_forwarded_hop():
    class _Req:
        headers = {"x-forwarded-for": "6.6.6.6, 203.0.113.7"}
        client = None

    assert auth_routes._client_ip(_Req()) == "203.0.113.7"


# ── Per-user timezone ─────────────────────────────────────────────────────────

_EAST = timezone(timedelta(hours=14))
_WEST = timezone(timedelta(hours=-12))


def _fake_zone(name):
    return {"Pacific/Kiritimati": _EAST, "Etc/GMT+12": _WEST}.get(name)


@pytest.fixture
def tz_client(monkeypatch):
    monkeypatch.setattr(timezone_middleware, "resolve_zone", _fake_zone)
    monkeypatch.setattr(settings, "DEFAULT_TIMEZONE", "UTC")
    app = FastAPI()
    app.add_middleware(timezone_middleware.TimezoneMiddleware)

    @app.get("/today")
    def today():  # sync: runs in the threadpool, like most routes
        return {"today": timeutil.local_today().isoformat()}

    return TestClient(app)


def test_header_timezone_decides_today(tz_client):
    for name, zone in (("Pacific/Kiritimati", _EAST), ("Etc/GMT+12", _WEST)):
        resp = tz_client.get("/today", headers={"X-Timezone": name})
        assert (
            resp.json()["today"]
            == datetime.now(UTC).astimezone(zone).date().isoformat()
        )


def test_unknown_header_falls_back_to_default(tz_client):
    resp = tz_client.get("/today", headers={"X-Timezone": "Mars/Olympus"})
    assert resp.json()["today"] == datetime.now(UTC).date().isoformat()


def test_resolve_zone_rejects_garbage():
    assert timeutil.resolve_zone("UTC") is UTC
    assert timeutil.resolve_zone("") is None
    assert timeutil.resolve_zone("../../etc/passwd") is None
    assert timeutil.resolve_zone("Mars/Olympus") is None


def test_profile_timezone_is_validated_and_clearable(monkeypatch):
    users = mongomock.MongoClient()["testdb"]["users"]
    users.insert_one({"username": "u@b.com", "role": "user"})
    monkeypatch.setattr(user_repository, "get_users_collection", lambda: users)

    profile = profile_service.update_user_profile("u@b.com", timezone="UTC")
    assert profile["timezone"] == "UTC"
    with pytest.raises(ValueError):
        profile_service.update_user_profile("u@b.com", timezone="Mars/Olympus")
    assert (
        profile_service.update_user_profile("u@b.com", timezone="")["timezone"] is None
    )


# ── Atomic idempotency ────────────────────────────────────────────────────────


@pytest.fixture
def idem_col(monkeypatch):
    col = mongomock.MongoClient()["testdb"]["idempotency_keys"]
    mongo_module._ensure_unique_idempotency_index(col)
    monkeypatch.setattr(idempotency, "get_idempotency_collection", lambda: col)
    return col


def test_idempotency_reserve_complete_replay(idem_col):
    assert idempotency.reserve("k1", "u@b.com") is None
    with pytest.raises(idempotency.IdempotencyInProgressError):
        idempotency.reserve("k1", "u@b.com")
    idempotency.complete("k1", "u@b.com", {"id": "e1"})
    assert idempotency.reserve("k1", "u@b.com") == {"id": "e1"}
    # Keys are per user.
    assert idempotency.reserve("k1", "other@b.com") is None


def test_idempotency_release_allows_retry(idem_col):
    assert idempotency.reserve("k2", "u@b.com") is None
    idempotency.release("k2", "u@b.com")
    assert idempotency.reserve("k2", "u@b.com") is None


def test_legacy_non_unique_index_is_replaced():
    col = mongomock.MongoClient()["testdb"]["idempotency_keys"]
    col.create_index([("key", 1), ("user_id", 1)])
    mongo_module._ensure_unique_idempotency_index(col)
    unique = [
        info
        for info in col.index_information().values()
        if list(info["key"]) == [("key", 1), ("user_id", 1)]
    ]
    assert len(unique) == 1 and unique[0].get("unique")


@pytest.fixture
def expense_client(monkeypatch, idem_col):
    calls = []

    def fake_add_expense(**kwargs):
        calls.append(kwargs)
        if kwargs["description"] == "fail-once" and len(calls) == 1:
            raise RuntimeError("db down")
        return {"id": f"e{len(calls)}", "amount": kwargs["amount"]}

    monkeypatch.setattr(expense_routes, "add_expense", fake_add_expense)
    monkeypatch.setattr(
        expense_routes, "check_session_expense_limit", lambda *a, **k: None
    )
    app = FastAPI()
    app.include_router(expense_routes.router, prefix="/api/v1/expenses")
    app.dependency_overrides[deps.get_current_user] = lambda: "u@b.com"
    app.dependency_overrides[deps.get_current_tenant] = lambda: "u@b.com"
    client = TestClient(app)
    client.calls = calls
    return client


def _expense(description="lunch"):
    return {"amount": 120, "expense_date": "2026-10-01", "description": description}


def test_retried_create_with_same_key_saves_once(expense_client):
    headers = {"Idempotency-Key": "abc"}
    first = expense_client.post("/api/v1/expenses", json=_expense(), headers=headers)
    second = expense_client.post("/api/v1/expenses", json=_expense(), headers=headers)
    assert first.status_code == second.status_code == 201
    assert first.json() == second.json()
    assert len(expense_client.calls) == 1


def test_failed_create_releases_key_for_retry(expense_client):
    headers = {"Idempotency-Key": "retry-me"}
    failed = expense_client.post(
        "/api/v1/expenses", json=_expense("fail-once"), headers=headers
    )
    assert failed.status_code == 503
    retried = expense_client.post(
        "/api/v1/expenses", json=_expense("fail-once"), headers=headers
    )
    assert retried.status_code == 201
    assert len(expense_client.calls) == 2


def test_in_flight_key_returns_conflict(expense_client, idem_col):
    idempotency.reserve("busy", "u@b.com")
    resp = expense_client.post(
        "/api/v1/expenses", json=_expense(), headers={"Idempotency-Key": "busy"}
    )
    assert resp.status_code == 409
    assert expense_client.calls == []


# ── Account export and deletion ───────────────────────────────────────────────


@pytest.fixture
def account_db(monkeypatch):
    db = mongomock.MongoClient()["testdb"]
    monkeypatch.setattr(account_service, "get_database", lambda: db)
    monkeypatch.setattr(user_repository, "get_users_collection", lambda: db["users"])
    all_data_collections = (
        *account_service._SOFT_DELETE_COLLECTIONS,
        *account_service._HARD_DELETE_COLLECTIONS,
    )
    for user in ("u@b.com", "other@b.com"):
        db["users"].insert_one(
            {
                "username": user,
                "password_hash": hash_password("pw-123456"),
                "role": "user",
            }
        )
        for name in all_data_collections:
            db[name].insert_one({"username": user, "marker": name})
        db["idempotency_keys"].insert_one({"user_id": user, "key": "k"})
        db["login_attempts"].insert_one({"key": user})
        db["llm_call_attempts"].insert_one({"key": f"{user}:analytics"})
    return db


def test_export_contains_data_but_no_credentials(account_db):
    data = account_service.export_account("u@b.com")
    assert data["profile"]["username"] == "u@b.com"
    assert "password_hash" not in data["profile"]
    assert len(data["expenses"]) == 1
    assert all("public_key" not in p for p in data["passkeys"])


def test_delete_soft_deletes_user_and_cascades(account_db):
    account_service.delete_account("u@b.com")

    # User document is retained but flagged.
    user_doc = account_db["users"].find_one({"username": "u@b.com"})
    assert user_doc is not None
    assert user_doc["is_deleted"] is True
    assert "deleted_at" in user_doc

    # Soft-deleted collections retain rows but mark them deleted.
    for name in account_service._SOFT_DELETE_COLLECTIONS:
        doc = account_db[name].find_one({"username": "u@b.com"})
        assert doc is not None, f"{name} row should still exist"
        assert doc["is_deleted"] is True

    # Hard-deleted collections are gone entirely.
    for name in account_service._HARD_DELETE_COLLECTIONS:
        assert account_db[name].count_documents({"username": "u@b.com"}) == 0

    # Other user's data is untouched.
    assert (
        account_db["users"].find_one({"username": "other@b.com"}).get("is_deleted")
        is None
    )
    for name in account_service._SOFT_DELETE_COLLECTIONS:
        assert (
            account_db[name].find_one({"username": "other@b.com"}).get("is_deleted")
            is None
        )

    # Rate-limit and idempotency records are hard-deleted.
    assert account_db["idempotency_keys"].count_documents({"user_id": "u@b.com"}) == 0
    assert account_db["llm_call_attempts"].count_documents({}) == 1
    assert account_db["login_attempts"].count_documents({}) == 1


@pytest.fixture
def users_client(account_db):
    app = FastAPI()
    app.include_router(users_routes.router, prefix="/api/v1/users")
    app.dependency_overrides[deps.get_current_user] = lambda: "u@b.com"
    return TestClient(app)


def test_delete_endpoint_requires_confirmation_and_password(users_client, account_db):
    url = "/api/v1/users/me/delete"
    wrong_email = {"confirm_username": "other@b.com", "password": "pw-123456"}
    assert users_client.post(url, json=wrong_email).status_code == 400
    wrong_pw = {"confirm_username": "u@b.com", "password": "nope"}
    assert users_client.post(url, json=wrong_pw).status_code == 403
    assert account_db["users"].count_documents({"username": "u@b.com"}) == 1

    resp = users_client.post(
        url, json={"confirm_username": "U@b.com", "password": "pw-123456"}
    )
    assert resp.status_code == 204
    assert "access_token" in resp.headers.get("set-cookie", "")
    # Soft-delete: document retained, flagged.
    user_doc = account_db["users"].find_one({"username": "u@b.com"})
    assert user_doc is not None
    assert user_doc.get("is_deleted") is True


def test_export_endpoint_is_a_json_download(users_client):
    resp = users_client.get("/api/v1/users/me/export")
    assert resp.status_code == 200
    assert "attachment" in resp.headers["content-disposition"]
    assert resp.json()["profile"]["username"] == "u@b.com"


# ── Platform admin ────────────────────────────────────────────────────────────


def test_bootstrap_admin_role(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_EMAILS", ["boss@b.com"])
    assert admins.resolve_role("Boss@b.com", "user") == "admin"
    assert admins.resolve_role("u@b.com", "user") == "user"
    assert admins.resolve_role("u@b.com", None) == "user"
    assert admins.is_bootstrap_admin(None) is False


def test_bootstrap_admin_roles_persists(monkeypatch):
    db = mongomock.MongoClient()["testdb"]
    db["users"].insert_many(
        [{"username": "boss@b.com", "role": "user"}, {"username": "u@b.com"}]
    )
    monkeypatch.setattr(settings, "ADMIN_EMAILS", ["boss@b.com"])
    mongo_module.bootstrap_admin_roles(db)
    assert db["users"].find_one({"username": "boss@b.com"})["role"] == "admin"
    assert "role" not in db["users"].find_one({"username": "u@b.com"})


@pytest.fixture
def admin_client(mongo):
    mongo["users"].insert_many(
        [
            {"username": "boss@b.com", "tenant_id": "boss@b.com", "role": "admin"},
            {"username": "a@b.com", "tenant_id": "a@b.com", "role": "user"},
            {"username": "c@b.com", "tenant_id": "c@b.com", "role": "user"},
        ]
    )
    app = FastAPI()
    app.include_router(admin_routes.router, prefix="/api/v1/admin")
    app.dependency_overrides[deps.require_admin] = lambda: "admin"
    app.dependency_overrides[deps.get_current_user] = lambda: "boss@b.com"
    return TestClient(app)


def test_admin_lists_users_across_tenants(admin_client):
    resp = admin_client.get("/api/v1/admin/users")
    assert resp.status_code == 200
    assert {u["username"] for u in resp.json()["items"]} == {
        "boss@b.com",
        "a@b.com",
        "c@b.com",
    }


def test_admin_search_is_literal(admin_client):
    resp = admin_client.get("/api/v1/admin/users", params={"search": "a@b.com"})
    assert {u["username"] for u in resp.json()["items"]} == {"a@b.com"}
    assert (
        admin_client.get("/api/v1/admin/users", params={"search": "(.*"}).status_code
        == 200
    )


def test_admin_cannot_change_own_role(admin_client):
    resp = admin_client.patch("/api/v1/admin/users/boss@b.com", json={"role": "user"})
    assert resp.status_code == 400
    resp = admin_client.patch("/api/v1/admin/users/a@b.com", json={"role": "admin"})
    assert resp.status_code == 200
    assert resp.json()["role"] == "admin"
