"""Core authentication service: login, registration, OTP, password reset.

Everything else has been split into focused modules:
  app/services/email_service.py    — OTP email delivery
  app/services/profile_service.py  — user profile read/write
  app/services/oauth_service.py    — Google OAuth2 flow
  app/repositories/user_repository.py — thin DB seam

Re-exports at the bottom of this file keep the routes layer unchanged.
"""

from __future__ import annotations

import logging
import secrets
from datetime import UTC, datetime, timedelta

from pymongo.errors import PyMongoError

from app.core.config import settings
from app.core.plans import DEFAULT_PLAN, plan_user_fields
from app.core.ratelimit import (
    OtpRateLimitError,
    check_and_record_otp_request,
    clear_otp_attempts,
)
from app.core.security import hash_password, verify_password
from app.repositories import user_repository
from app.services.email_service import deliver_reset_otp, deliver_signup_otp

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _is_otp_expired(expires_at: datetime | None) -> bool:
    if not expires_at:
        return True
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    return _utcnow() > expires_at


def _generate_signup_otp() -> str:
    digits = max(4, min(settings.SIGNUP_OTP_LENGTH, 8))
    return "".join(str(secrets.randbelow(10)) for _ in range(digits))


# ---------------------------------------------------------------------------
# Public auth functions
# ---------------------------------------------------------------------------


def authenticate_user(username: str, password: str):
    """Authenticate a user with username and password."""
    logger.info("Authentication attempt initiated")
    try:
        user = user_repository.find_by_username(username)
        if not user:
            logger.warning("Authentication failed: User not found")
            return None

        if not verify_password(password, user["password_hash"]):
            logger.warning("Authentication failed: Invalid password")
            return None

        if not user.get("email_verified", False):
            logger.warning("Authentication failed: Email not verified")
            return {"requires_verification": True}

        # Record the login timestamp to enable per-session rate limiting.
        user_repository.update_by_id(
            user["_id"], set_fields={"last_login_at": _utcnow()}
        )

        logger.info("User authenticated successfully")
        return {
            "username": user["username"],
            "role": user.get("role", "user"),
        }
    except PyMongoError as exc:
        logger.error(
            f"Database error during authentication: {str(exc)}",
            exc_info=True,
        )
        raise RuntimeError("Failed to authenticate user due to database error") from exc
    except Exception as exc:
        logger.error(
            f"Unexpected error during authentication: {str(exc)}",
            exc_info=True,
        )
        raise


def register_user(username: str, password: str, role: str = "user"):
    """Create or refresh an unverified user and send signup OTP."""
    logger.info("User registration OTP request initiated")
    try:
        check_and_record_otp_request(username)
        existing_user = user_repository.find_by_username(username)
        if existing_user and existing_user.get("email_verified", False):
            logger.warning("Registration failed: User already exists and is verified")
            return None

        otp = _generate_signup_otp()
        otp_expires_at = _utcnow() + timedelta(
            minutes=settings.SIGNUP_OTP_EXPIRY_MINUTES
        )
        update_doc = {
            "username": username,
            "password_hash": hash_password(password),
            "role": role,
            "email_verified": False,
            **plan_user_fields(DEFAULT_PLAN),
            "signup_otp_hash": hash_password(otp),
            "signup_otp_expires_at": otp_expires_at,
            "updated_at": _utcnow(),
        }

        if existing_user:
            user_repository.update_by_id(existing_user["_id"], set_fields=update_doc)
        else:
            user_repository.create(
                {
                    **update_doc,
                    "tenant_id": username,
                    "created_at": _utcnow(),
                }
            )

        deliver_signup_otp(username, otp)

        logger.info(f"OTP generated for user registration with role: {role}")
        return {
            "username": username,
            "role": role,
            "verification_required": True,
        }
    except OtpRateLimitError:
        logger.warning(f"OTP rate limit exceeded for {username}")
        raise
    except PyMongoError as exc:
        logger.error(
            f"Database error during registration: {str(exc)}",
            exc_info=True,
        )
        raise RuntimeError("Failed to register user due to database error") from exc
    except Exception as exc:
        logger.error(
            f"Unexpected error during registration: {str(exc)}",
            exc_info=True,
        )
        raise


def resend_signup_otp(username: str):
    """Resend OTP for users who registered but are still unverified."""
    logger.info("Signup OTP resend request initiated")
    try:
        check_and_record_otp_request(username)
        user = user_repository.find_by_username(username)
        if not user:
            logger.warning("OTP resend failed: User not found")
            return None

        if user.get("email_verified", False):
            logger.warning("OTP resend failed: User already verified")
            return {"error": "already_verified"}

        otp = _generate_signup_otp()
        otp_expires_at = _utcnow() + timedelta(
            minutes=settings.SIGNUP_OTP_EXPIRY_MINUTES
        )

        user_repository.update_by_id(
            user["_id"],
            set_fields={
                "signup_otp_hash": hash_password(otp),
                "signup_otp_expires_at": otp_expires_at,
                "updated_at": _utcnow(),
            },
        )

        deliver_signup_otp(username, otp)
        logger.info("OTP resend successful")
        return {
            "username": username,
            "verification_required": True,
        }
    except OtpRateLimitError:
        logger.warning(f"OTP resend rate limit exceeded for {username}")
        raise
    except PyMongoError as exc:
        logger.error(
            f"Database error during OTP resend: {str(exc)}",
            exc_info=True,
        )
        raise RuntimeError("Failed to resend OTP due to database error") from exc
    except Exception as exc:
        logger.error(
            f"Unexpected error during OTP resend: {str(exc)}",
            exc_info=True,
        )
        raise


def verify_user_signup_otp(username: str, otp: str):
    """Verify user OTP and activate account for login."""
    logger.info("Signup OTP verification attempt initiated")
    try:
        user = user_repository.find_by_username(username)
        if not user:
            logger.warning("Signup OTP verification failed: User not found")
            return None

        if user.get("email_verified", False):
            logger.info("Signup OTP verification skipped: User already verified")
            return {
                "username": user["username"],
                "role": user.get("role", "user"),
                "already_verified": True,
            }

        otp_hash = user.get("signup_otp_hash")
        otp_expires_at = user.get("signup_otp_expires_at")
        if not otp_hash or _is_otp_expired(otp_expires_at):
            logger.warning("Signup OTP verification failed: OTP expired or missing")
            return {"error": "OTP expired"}

        if not verify_password(otp, otp_hash):
            logger.warning("Signup OTP verification failed: Invalid OTP")
            return {"error": "Invalid OTP"}

        user_repository.update_by_id(
            user["_id"],
            set_fields={
                "email_verified": True,
                "updated_at": _utcnow(),
            },
            unset_fields={
                "signup_otp_hash": "",
                "signup_otp_expires_at": "",
            },
        )

        clear_otp_attempts(username)
        logger.info("User email verified successfully")
        return {
            "username": user["username"],
            "role": user.get("role", "user"),
            "email_verified": True,
        }
    except PyMongoError as exc:
        logger.error(
            f"Database error during signup OTP verification: {str(exc)}",
            exc_info=True,
        )
        raise RuntimeError("Failed to verify user due to database error") from exc
    except Exception as exc:
        logger.error(
            f"Unexpected error during signup OTP verification: {str(exc)}",
            exc_info=True,
        )
        raise


def request_password_reset(username: str):
    """Generate a password-reset OTP, store its hash, and email it to the user.

    Always returns a generic success indicator even when the user is not found,
    to prevent user-enumeration attacks.
    """
    logger.info("Password reset OTP request initiated for %s", username)
    try:
        check_and_record_otp_request(username)
        user = user_repository.find_by_username(username)

        if not user or not user.get("email_verified", False):
            # Do not reveal whether the account exists or is unverified.
            logger.warning(
                "Password reset requested for unknown/unverified account: %s", username
            )
            return {"sent": True}

        otp = _generate_signup_otp()
        otp_expires_at = _utcnow() + timedelta(
            minutes=settings.SIGNUP_OTP_EXPIRY_MINUTES
        )

        user_repository.update_by_id(
            user["_id"],
            set_fields={
                "reset_otp_hash": hash_password(otp),
                "reset_otp_expires_at": otp_expires_at,
                "updated_at": _utcnow(),
            },
        )

        deliver_reset_otp(username, otp)
        logger.info("Password reset OTP sent to %s", username)
        return {"sent": True}

    except OtpRateLimitError:
        logger.warning("OTP rate limit exceeded for password reset: %s", username)
        raise
    except PyMongoError as exc:
        logger.error(
            "Database error during password reset request: %s", str(exc), exc_info=True
        )
        raise RuntimeError(
            "Failed to process password reset due to database error"
        ) from exc
    except Exception as exc:
        logger.error(
            "Unexpected error during password reset request: %s",
            str(exc),
            exc_info=True,
        )
        raise


def reset_password_with_otp(username: str, otp: str, new_password: str):
    """Verify the password-reset OTP and update the user's password."""
    logger.info("Password reset attempt for %s", username)
    try:
        user = user_repository.find_by_username(username)

        if not user:
            logger.warning("Password reset failed: user not found %s", username)
            return {"error": "not_found"}

        otp_hash = user.get("reset_otp_hash")
        otp_expires_at = user.get("reset_otp_expires_at")

        if not otp_hash or _is_otp_expired(otp_expires_at):
            logger.warning(
                "Password reset failed: OTP expired or missing for %s", username
            )
            return {"error": "OTP expired"}

        if not verify_password(otp, otp_hash):
            logger.warning("Password reset failed: invalid OTP for %s", username)
            return {"error": "Invalid OTP"}

        user_repository.update_by_id(
            user["_id"],
            set_fields={
                "password_hash": hash_password(new_password),
                "updated_at": _utcnow(),
            },
            unset_fields={
                "reset_otp_hash": "",
                "reset_otp_expires_at": "",
            },
        )

        clear_otp_attempts(username)
        logger.info("Password reset successful for %s", username)
        return {"reset": True}

    except PyMongoError as exc:
        logger.error(
            "Database error during password reset: %s", str(exc), exc_info=True
        )
        raise RuntimeError("Failed to reset password due to database error") from exc
    except Exception as exc:
        logger.error(
            "Unexpected error during password reset: %s", str(exc), exc_info=True
        )
        raise


# ---------------------------------------------------------------------------
# Re-exports for backward compatibility — routes import from here
# ---------------------------------------------------------------------------

from app.services.profile_service import (  # noqa: E402, F401, I001
    get_user,
    get_user_profile,
    update_user_profile,
)
from app.services.oauth_service import (  # noqa: E402, F401, I001
    build_google_auth_url,
    exchange_google_code,
    oauth_login_or_create,
)
