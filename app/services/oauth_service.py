"""Google OAuth2 integration.

Functions
---------
build_google_auth_url(state)          — build redirect URL for Google consent screen
exchange_google_code(code)            — exchange auth code for userinfo dict
oauth_login_or_create(userinfo)       — find or create a user from Google userinfo
"""
from __future__ import annotations

import logging
import secrets
from datetime import UTC, datetime

import httpx
from pymongo.errors import PyMongoError

from app.core.config import settings
from app.core.plans import DEFAULT_PLAN, plan_user_fields
from app.core.security import hash_password
from app.repositories import user_repository

logger = logging.getLogger(__name__)

_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


def _utcnow() -> datetime:
    return datetime.now(UTC)


def build_google_auth_url(state: str) -> str:
    """Construct the Google OAuth2 authorization URL to redirect the user to."""
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"{_GOOGLE_AUTH_URL}?{query}"


def exchange_google_code(code: str) -> dict:
    """Exchange an authorization code for tokens and return the userinfo dict."""
    resp = httpx.post(
        _GOOGLE_TOKEN_URL,
        data={
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        },
        timeout=10,
    )
    resp.raise_for_status()
    access_token = resp.json()["access_token"]

    userinfo_resp = httpx.get(
        _GOOGLE_USERINFO_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    userinfo_resp.raise_for_status()
    return userinfo_resp.json()


def oauth_login_or_create(userinfo: dict) -> dict:
    """Find or create a user from Google userinfo and return their DB document.

    If GOOGLE_ALLOWED_DOMAINS is configured, the email domain must be in the list.
    New users are created with email_verified=True (Google has already verified it).
    Returns the user document dict (with _id converted to string).
    """
    email: str = userinfo.get("email", "").lower().strip()
    if not email:
        raise ValueError("Google account has no email address")

    if settings.GOOGLE_ALLOWED_DOMAINS:
        domain = email.split("@")[-1]
        if domain not in settings.GOOGLE_ALLOWED_DOMAINS:
            raise PermissionError(
                f"Sign-in not allowed for @{domain}. "
                f"Allowed: {', '.join(settings.GOOGLE_ALLOWED_DOMAINS)}"
            )

    try:
        user = user_repository.find_by_username(email)
        if user is None:
            now = _utcnow()
            doc = {
                "username": email,
                "tenant_id": email,
                "password_hash": hash_password(secrets.token_hex(32)),
                "role": "user",
                "email_verified": True,
                "oauth_provider": "google",
                "google_sub": userinfo.get("sub"),
                **plan_user_fields(DEFAULT_PLAN),
                "created_at": now,
                "updated_at": now,
            }
            user_repository.create(doc)
            logger.info("Created new user via Google OAuth: %s", email)
            user = user_repository.find_by_username(email)
        else:
            if not user.get("email_verified"):
                user_repository.update_by_id(
                    user["_id"],
                    set_fields={"email_verified": True, "updated_at": _utcnow()},
                )
            logger.info("Existing user signed in via Google OAuth: %s", email)

        return user
    except PyMongoError as exc:
        logger.error("Database error during Google OAuth login: %s", str(exc), exc_info=True)
        raise RuntimeError("Failed to complete Google sign-in due to database error") from exc
