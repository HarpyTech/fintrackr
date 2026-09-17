"""Tests for Google OAuth authorization, domain checking, URL formatting, and API endpoints."""

from urllib.parse import parse_qs, urlparse
import pytest
from fastapi.testclient import TestClient
from mongomock import MongoClient

from app.core.config import settings
from app.main import app
from app.services.oauth_service import (
    build_google_auth_url,
    oauth_login_or_create,
)


@pytest.fixture
def mock_users_repo(monkeypatch):
    """Patch user_repository collection getters to use mongomock."""
    client = MongoClient()
    users_col = client["testdb"]["users"]
    import app.repositories.user_repository as user_repo

    monkeypatch.setattr(
        user_repo, "get_users_collection", lambda: users_col, raising=False
    )
    return users_col


def test_build_google_auth_url():
    """Verify build_google_auth_url creates a valid, percent-encoded URL query string."""
    state = "test_state_123"
    url = build_google_auth_url(state)

    parsed = urlparse(url)
    assert parsed.scheme == "https"
    assert parsed.netloc == "accounts.google.com"
    assert parsed.path == "/o/oauth2/v2/auth"

    params = parse_qs(parsed.query)
    assert params["response_type"] == ["code"]
    assert params["scope"] == ["openid email profile"]
    assert params["state"] == [state]
    assert params["prompt"] == ["select_account"]


def test_oauth_login_or_create_new_user(mock_users_repo):
    """Verify new user document creation via Google userinfo."""
    userinfo = {
        "sub": "google-sub-12345",
        "email": "jane.doe@example.com",
        "given_name": "Jane",
    }
    user = oauth_login_or_create(userinfo)

    assert user["username"] == "jane.doe@example.com"
    assert user["email_verified"] is True
    assert user["oauth_provider"] == "google"
    assert user["google_sub"] == "google-sub-12345"


def test_oauth_login_allowed_domains(monkeypatch, mock_users_repo):
    """Verify domain restriction enforcement in oauth_login_or_create."""
    monkeypatch.setattr(settings, "GOOGLE_ALLOWED_DOMAINS", ["allowed.com"])

    userinfo_allowed = {"sub": "1", "email": "alice@allowed.com"}
    user = oauth_login_or_create(userinfo_allowed)
    assert user["username"] == "alice@allowed.com"

    userinfo_disallowed = {"sub": "2", "email": "bob@disallowed.com"}
    with pytest.raises(PermissionError) as exc_info:
        oauth_login_or_create(userinfo_disallowed)
    assert "Sign-in not allowed for @disallowed.com" in str(exc_info.value)


def test_google_auth_endpoint_unconfigured(monkeypatch):
    """Verify /api/v1/auth/google returns 503 when credentials are not set."""
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", None)
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", None)

    client = TestClient(app)
    response = client.get("/api/v1/auth/google", follow_redirects=False)
    assert response.status_code == 503
    assert response.json()["message"] == "Google OAuth is not configured"


def test_google_auth_endpoint_redirect(monkeypatch):
    """Verify /api/v1/auth/google sets state cookie and redirects to Google consent page."""
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "mock-client-id")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "mock-client-secret")

    client = TestClient(app)
    response = client.get("/api/v1/auth/google", follow_redirects=False)
    assert response.status_code == 302
    assert "accounts.google.com" in response.headers["location"]
    assert "oauth_state" in response.cookies


def test_google_auth_callback_error_query():
    """Verify OAuth error response redirects to /login?error=oauth_denied."""
    client = TestClient(app)
    response = client.get("/api/v1/auth/google/callback?error=access_denied", follow_redirects=False)
    assert response.status_code == 302
    assert response.headers["location"] == "/login?error=oauth_denied"
