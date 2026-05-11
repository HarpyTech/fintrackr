from datetime import datetime, timedelta
from jose import jwt
from passlib.context import CryptContext
import logging
import hashlib

from app.core.config import settings
import secrets

logger = logging.getLogger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

REFRESH_TOKEN_COOKIE_NAME = "refresh_token"


def create_csrf_token():
    """Generate a CSRF token"""
    token = secrets.token_urlsafe(32)
    logger.debug("CSRF token created")
    return token


def create_access_token(data: dict):
    """Create a JWT access token"""
    try:
        to_encode = data.copy()
        expire = datetime.utcnow() + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
        to_encode.update({"exp": expire, "type": "access"})
        token = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        logger.debug(
            f"Access token created for user: {data.get('username', 'unknown')}"
        )
        return token
    except Exception as exc:
        logger.error(f"Failed to create access token: {str(exc)}", exc_info=True)
        raise


def create_refresh_token(data: dict) -> str:
    """Create a JWT refresh token (for installed PWA sessions only)"""
    try:
        to_encode = data.copy()
        expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        to_encode.update({"exp": expire, "type": "refresh"})
        token = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        logger.debug(
            f"Refresh token created for user: {data.get('username', 'unknown')}"
        )
        return token
    except Exception as exc:
        logger.error(f"Failed to create refresh token: {str(exc)}", exc_info=True)
        raise


def decode_refresh_token(token: str) -> dict | None:
    """Decode and validate a refresh token. Returns payload or None."""
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        if payload.get("type") != "refresh":
            return None
        return payload
    except Exception:
        return None


def hash_token(token: str) -> str:
    """Return a SHA-256 hex digest of a token for revocation storage."""
    return hashlib.sha256(token.encode()).hexdigest()


def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    try:
        hashed = pwd_context.hash(password)
        logger.debug("Password hashed successfully")
        return hashed
    except Exception as exc:
        logger.error(f"Failed to hash password: {str(exc)}", exc_info=True)
        raise


def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against a hash"""
    try:
        result = pwd_context.verify(password, hashed)
        logger.debug(f"Password verification: {'successful' if result else 'failed'}")
        return result
    except Exception as exc:
        logger.error(f"Error during password verification: {str(exc)}", exc_info=True)
        return False
