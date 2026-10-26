import re
from datetime import UTC, datetime

import mongomock
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import bcrypt

from app.repositories import user_repository
from app.services import account_service


def hash_password(plain: str) -> str:
    """Local bcrypt helper — avoids the jwt import chain in app.core.security."""
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_db(monkeypatch):
    """Return a fresh mongomock DB with account_service and user_repository patched."""
    db = mongomock.MongoClient()["testdb"]
    monkeypatch.setattr(account_service, "get_database", lambda: db)
    monkeypatch.setattr(user_repository, "get_users_collection", lambda: db["users"])
    return db


def _seed_user(db, username="u@b.com", password="pw-123456", verified=True):
    doc = {
        "username": username,
        "password_hash": hash_password(password),
        "role": "user",
        "email_verified": verified,
    }
    db["users"].insert_one(doc)
    for name in (*account_service._SOFT_DELETE_COLLECTIONS, *account_service._HARD_DELETE_COLLECTIONS):
        db[name].insert_one({"username": username, "marker": name})
    return doc


# ── Fix 3: msgpack version pin ────────────────────────────────────────────────


def test_msgpack_meets_minimum_fixed_version():
    """Installed msgpack must be >= 1.2.1 to clear GHSA-v7p-g79w-8934."""
    msgpack = pytest.importorskip("msgpack", reason="msgpack not installed in venv")
    from packaging.version import Version

    raw = getattr(msgpack, "__version__", None) or msgpack.version.__version__
    installed = Version(raw)
    assert installed >= Version("1.2.1"), (
        f"msgpack {installed} is still vulnerable — upgrade to >= 1.2.1"
    )


# ── Fix 4a: soft-delete — user document ──────────────────────────────────────


def test_delete_account_soft_deletes_user(monkeypatch):
    db = _make_db(monkeypatch)
    _seed_user(db)

    account_service.delete_account("u@b.com")

    doc = db["users"].find_one({"username": "u@b.com"})
    assert doc is not None, "User document must not be hard-deleted"
    assert doc["is_deleted"] is True
    assert isinstance(doc["deleted_at"], datetime)
    assert doc["deleted_by"] == "self"


def test_delete_account_sets_deleted_at_to_utc_now(monkeypatch):
    db = _make_db(monkeypatch)
    _seed_user(db)

    # Use second-level precision: mongomock may truncate sub-second digits.
    before = datetime.now(UTC).replace(microsecond=0)
    account_service.delete_account("u@b.com")
    after = datetime.now(UTC)

    deleted_at = db["users"].find_one({"username": "u@b.com"})["deleted_at"]
    if deleted_at.tzinfo is None:
        deleted_at = deleted_at.replace(tzinfo=UTC)
    assert before <= deleted_at <= after


# ── Fix 4b: cascade soft-delete ──────────────────────────────────────────────


def test_soft_delete_cascades_to_data_collections(monkeypatch):
    db = _make_db(monkeypatch)
    _seed_user(db)

    account_service.delete_account("u@b.com")

    for name in account_service._SOFT_DELETE_COLLECTIONS:
        docs = list(db[name].find({"username": "u@b.com"}))
        assert docs, f"{name}: row must be retained after soft-delete"
        assert all(d.get("is_deleted") is True for d in docs), (
            f"{name}: every row must have is_deleted=True"
        )


def test_hard_delete_removes_credentials_and_tokens(monkeypatch):
    db = _make_db(monkeypatch)
    _seed_user(db)

    account_service.delete_account("u@b.com")

    for name in account_service._HARD_DELETE_COLLECTIONS:
        assert db[name].count_documents({"username": "u@b.com"}) == 0, (
            f"{name}: credential/token rows must be hard-deleted"
        )


def test_delete_does_not_affect_other_users(monkeypatch):
    db = _make_db(monkeypatch)
    _seed_user(db, "u@b.com")
    _seed_user(db, "other@b.com")

    account_service.delete_account("u@b.com")

    other_user = db["users"].find_one({"username": "other@b.com"})
    assert other_user.get("is_deleted") is None

    for name in account_service._SOFT_DELETE_COLLECTIONS:
        docs = list(db[name].find({"username": "other@b.com"}))
        assert all(d.get("is_deleted") is None for d in docs), (
            f"{name}: other user's rows must be untouched"
        )


# ── Fix 4c: export blocked for deleted accounts ───────────────────────────────


def test_export_raises_permission_error_for_deleted_account(monkeypatch):
    db = _make_db(monkeypatch)
    _seed_user(db)
    account_service.delete_account("u@b.com")

    with pytest.raises(PermissionError, match="deleted"):
        account_service.export_account("u@b.com")


def test_export_endpoint_returns_403_for_deleted_account(monkeypatch):
    users_routes = pytest.importorskip("app.api.routes.users", reason="PyJWT not installed")
    deps = pytest.importorskip("app.api.deps", reason="PyJWT not installed")

    db = _make_db(monkeypatch)
    _seed_user(db)
    account_service.delete_account("u@b.com")

    app = FastAPI()
    app.include_router(users_routes.router, prefix="/api/v1/users")
    app.dependency_overrides[deps.get_current_user] = lambda: "u@b.com"
    client = TestClient(app)

    resp = client.get("/api/v1/users/me/export")
    assert resp.status_code == 403
    assert "deleted" in resp.json()["detail"].lower()


def test_export_succeeds_for_active_account(monkeypatch):
    db = _make_db(monkeypatch)
    _seed_user(db)

    data = account_service.export_account("u@b.com")
    assert data["profile"]["username"] == "u@b.com"
    assert "password_hash" not in data["profile"]


def test_export_filters_soft_deleted_expense_rows(monkeypatch):
    db = _make_db(monkeypatch)
    _seed_user(db)
    # Add a second expense that is already soft-deleted.
    db["expenses"].insert_one({"username": "u@b.com", "marker": "stale", "is_deleted": True})

    data = account_service.export_account("u@b.com")
    assert all(not e.get("is_deleted") for e in data["expenses"]), (
        "Export must not include soft-deleted expense rows"
    )


# ── Fix 4d: is_deleted_account helper ────────────────────────────────────────


def test_is_deleted_account_returns_true_after_delete(monkeypatch):
    db = _make_db(monkeypatch)
    _seed_user(db)
    assert account_service.is_deleted_account("u@b.com") is False
    account_service.delete_account("u@b.com")
    assert account_service.is_deleted_account("u@b.com") is True


def test_is_deleted_account_returns_false_for_unknown_email(monkeypatch):
    db = _make_db(monkeypatch)
    assert account_service.is_deleted_account("nobody@b.com") is False


# ── Fix 4e: re-registration blocked ──────────────────────────────────────────


@pytest.fixture
def reg_db(monkeypatch):
    auth_service = pytest.importorskip("app.services.auth_service", reason="PyJWT not installed")
    db = mongomock.MongoClient()["testdb"]
    monkeypatch.setattr(account_service, "get_database", lambda: db)
    monkeypatch.setattr(user_repository, "get_users_collection", lambda: db["users"])
    monkeypatch.setattr(auth_service, "check_and_record_otp_request", lambda email: None)
    monkeypatch.setattr(auth_service, "deliver_signup_otp", lambda email, otp: None)
    return db


def test_register_raises_for_soft_deleted_email(monkeypatch, reg_db):
    auth_service = pytest.importorskip("app.services.auth_service", reason="PyJWT not installed")
    _seed_user(reg_db)
    account_service.delete_account("u@b.com")

    with pytest.raises(ValueError, match="ACCOUNT_DELETED"):
        auth_service.register_user("u@b.com", "new-password-123")


def test_register_does_not_create_new_doc_for_deleted_email(monkeypatch, reg_db):
    auth_service = pytest.importorskip("app.services.auth_service", reason="PyJWT not installed")
    _seed_user(reg_db)
    account_service.delete_account("u@b.com")

    try:
        auth_service.register_user("u@b.com", "new-password-123")
    except ValueError:
        pass

    assert reg_db["users"].count_documents({"username": "u@b.com"}) == 1, (
        "No second user document must be created for a soft-deleted email"
    )


def test_register_endpoint_returns_409_for_deleted_email(monkeypatch, reg_db):
    auth_routes = pytest.importorskip("app.api.routes.auth", reason="PyJWT not installed")

    _seed_user(reg_db)
    account_service.delete_account("u@b.com")

    app = FastAPI()
    app.include_router(auth_routes.router, prefix="/api/v1/auth")
    client = TestClient(app)

    resp = client.post(
        "/api/v1/auth/register",
        json={"username": "u@b.com", "password": "new-password-123"},
    )
    assert resp.status_code == 409
    detail = resp.json()["detail"].lower()
    assert "deleted" in detail or "reactivat" in detail


def test_register_works_for_fresh_email(monkeypatch, reg_db):
    auth_service = pytest.importorskip("app.services.auth_service", reason="PyJWT not installed")
    result = auth_service.register_user("fresh@b.com", "password-123456")
    assert result is not None


# ── Fix 4f: reactivation ─────────────────────────────────────────────────────


def test_reactivate_restores_user_document(monkeypatch):
    db = _make_db(monkeypatch)
    _seed_user(db)
    account_service.delete_account("u@b.com")

    result = account_service.reactivate_account("u@b.com")

    assert result is True
    doc = db["users"].find_one({"username": "u@b.com"})
    assert doc.get("is_deleted") is None
    assert doc.get("deleted_at") is None
    assert doc.get("deleted_by") is None


def test_reactivate_restores_soft_deleted_data(monkeypatch):
    db = _make_db(monkeypatch)
    _seed_user(db)
    account_service.delete_account("u@b.com")

    account_service.reactivate_account("u@b.com")

    for name in account_service._SOFT_DELETE_COLLECTIONS:
        docs = list(db[name].find({"username": "u@b.com"}))
        assert docs, f"{name}: rows must exist after reactivation"
        assert all(d.get("is_deleted") is None for d in docs), (
            f"{name}: is_deleted must be cleared after reactivation"
        )


def test_reactivate_returns_false_for_active_account(monkeypatch):
    db = _make_db(monkeypatch)
    _seed_user(db)

    result = account_service.reactivate_account("u@b.com")
    assert result is False


def test_reactivate_returns_false_for_unknown_email(monkeypatch):
    db = _make_db(monkeypatch)

    result = account_service.reactivate_account("nobody@b.com")
    assert result is False


def test_export_works_after_reactivation(monkeypatch):
    db = _make_db(monkeypatch)
    _seed_user(db)
    account_service.delete_account("u@b.com")
    account_service.reactivate_account("u@b.com")

    data = account_service.export_account("u@b.com")
    assert data["profile"]["username"] == "u@b.com"


def test_register_works_after_reactivation(monkeypatch, reg_db):
    auth_service = pytest.importorskip("app.services.auth_service", reason="PyJWT not installed")
    _seed_user(reg_db)
    account_service.delete_account("u@b.com")
    account_service.reactivate_account("u@b.com")

    # Mark unverified so register_user can refresh the OTP on the existing doc.
    reg_db["users"].update_one({"username": "u@b.com"}, {"$set": {"email_verified": False}})
    result = auth_service.register_user("u@b.com", "new-password-123")
    assert result is not None
