"""Tests for all four middleware classes using starlette TestClient."""

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from jose import jwt

from app.core.config import settings
from app.middleware.auth import AuthenticationMiddleware
from app.middleware.csrf import CSRFProtectionMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.middleware.tracing import TraceIDMiddleware


def _make_jwt(username: str = "u@b.com", role: str = "user") -> str:
    payload = {"username": username, "role": role, "tenant_id": username}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


# ── TraceIDMiddleware ──────────────────────────────────────────────────────────


@pytest.fixture
def trace_client():
    app = FastAPI()
    app.add_middleware(TraceIDMiddleware)

    @app.get("/ping")
    def ping():
        return {"ok": True}

    return TestClient(app, raise_server_exceptions=False)


def test_trace_id_header_in_response(trace_client):
    resp = trace_client.get("/ping")
    assert resp.status_code == 200
    assert "x-trace-id" in resp.headers
    assert len(resp.headers["x-trace-id"]) > 0


def test_trace_id_is_unique_per_request(trace_client):
    r1 = trace_client.get("/ping")
    r2 = trace_client.get("/ping")
    assert r1.headers["x-trace-id"] != r2.headers["x-trace-id"]


# ── SecurityHeadersMiddleware ─────────────────────────────────────────────────


@pytest.fixture
def sec_client():
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware)

    @app.get("/page")
    def page():
        return {"ok": True}

    @app.get("/api/v1/data")
    def api_data():
        return {"ok": True}

    return TestClient(app, raise_server_exceptions=False)


def test_security_headers_on_non_api_path(sec_client):
    resp = sec_client.get("/page")
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.headers["x-frame-options"] == "DENY"
    assert "content-security-policy" in resp.headers
    assert "referrer-policy" in resp.headers
    assert "cross-origin-opener-policy" in resp.headers
    assert "permissions-policy" in resp.headers


def test_cache_control_set_on_api_path(sec_client):
    resp = sec_client.get("/api/v1/data")
    assert resp.headers.get("cache-control") == "no-store"


def test_no_cache_control_on_non_api_path(sec_client):
    resp = sec_client.get("/page")
    assert "cache-control" not in resp.headers or resp.headers.get("cache-control") != "no-store"


# ── CSRFProtectionMiddleware ──────────────────────────────────────────────────


@pytest.fixture
def csrf_client():
    app = FastAPI()
    app.add_middleware(CSRFProtectionMiddleware)

    @app.get("/api/v1/data")
    def get_data():
        return {"ok": True}

    @app.post("/api/v1/data")
    def post_data():
        return {"ok": True}

    @app.post("/api/v1/auth/login")
    def login():
        return {"ok": True}

    @app.get("/page")
    def non_api():
        return {"ok": True}

    return TestClient(app, raise_server_exceptions=False)


def test_csrf_get_sets_csrf_cookie(csrf_client):
    resp = csrf_client.get("/api/v1/data")
    assert resp.status_code == 200
    assert "csrf_token" in resp.cookies


def test_csrf_post_no_cookie_returns_403(csrf_client):
    resp = csrf_client.post("/api/v1/data")
    assert resp.status_code == 403


def test_csrf_post_no_header_returns_403(csrf_client):
    get_resp = csrf_client.get("/api/v1/data")
    token = get_resp.cookies["csrf_token"]
    resp = csrf_client.post("/api/v1/data", cookies={"csrf_token": token})
    assert resp.status_code == 403


def test_csrf_post_mismatched_token_returns_403(csrf_client):
    get_resp = csrf_client.get("/api/v1/data")
    token = get_resp.cookies["csrf_token"]
    resp = csrf_client.post(
        "/api/v1/data",
        headers={"x-csrf-token": "wrong-token-value"},
        cookies={"csrf_token": token},
    )
    assert resp.status_code == 403


def test_csrf_post_matching_tokens_passes(csrf_client):
    get_resp = csrf_client.get("/api/v1/data")
    token = get_resp.cookies["csrf_token"]
    resp = csrf_client.post(
        "/api/v1/data",
        headers={"x-csrf-token": token},
        cookies={"csrf_token": token},
    )
    assert resp.status_code == 200


def test_csrf_exempt_path_skips_check(csrf_client):
    resp = csrf_client.post("/api/v1/auth/login")
    assert resp.status_code == 200


def test_csrf_non_api_path_passes_without_token(csrf_client):
    resp = csrf_client.get("/page")
    assert resp.status_code == 200
    assert "csrf_token" in resp.cookies


# ── AuthenticationMiddleware ──────────────────────────────────────────────────


@pytest.fixture
def auth_client():
    app = FastAPI()
    app.add_middleware(AuthenticationMiddleware)

    @app.get("/api/v1/expenses")
    def protected(request: Request):
        return {"user": request.state.user}

    @app.get("/api/v1/auth/login")
    def login():
        return {"ok": True}

    @app.get("/static/app.js")
    def static_file():
        return {"ok": True}

    @app.get("/health")
    def health():
        return {"status": "UP"}

    return TestClient(app, raise_server_exceptions=False)


def test_auth_public_api_path_no_token_passes(auth_client):
    resp = auth_client.get("/api/v1/auth/login")
    assert resp.status_code == 200


def test_auth_static_path_no_token_passes(auth_client):
    resp = auth_client.get("/static/app.js")
    assert resp.status_code == 200


def test_auth_health_path_passes(auth_client):
    resp = auth_client.get("/health")
    assert resp.status_code == 200


def test_auth_protected_without_token_returns_401(auth_client):
    resp = auth_client.get("/api/v1/expenses")
    assert resp.status_code == 401
    assert "Missing" in resp.json()["detail"] or "401" in str(resp.status_code)


def test_auth_protected_with_valid_cookie_passes(auth_client):
    token = _make_jwt()
    resp = auth_client.get("/api/v1/expenses", cookies={"access_token": token})
    assert resp.status_code == 200
    assert resp.json()["user"] == "u@b.com"


def test_auth_protected_with_bearer_token_passes(auth_client):
    token = _make_jwt()
    resp = auth_client.get(
        "/api/v1/expenses",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200


def test_auth_protected_with_invalid_token_returns_401(auth_client):
    resp = auth_client.get(
        "/api/v1/expenses",
        headers={"Authorization": "Bearer this.is.notvalid"},
    )
    assert resp.status_code == 401
    assert "Invalid" in resp.json()["detail"]


def test_auth_malformed_bearer_header_returns_401(auth_client):
    resp = auth_client.get(
        "/api/v1/expenses",
        headers={"Authorization": "Basicnotbearer"},
    )
    assert resp.status_code == 401
