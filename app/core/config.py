import json
import logging
from typing import Any

from pydantic import field_validator
from pydantic_settings import BaseSettings

# Configure logging before any other code runs
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    PROJECT_NAME: str = "Secure FastAPI"
    API_V1_STR: str = "/api/v1"

    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    ALGORITHM: str = "HS256"

    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]

    MONGODB_URI: str = "mongodb://localhost:27017"
    MONGODB_DB: str = "my_finance"

    # WebAuthn / FIDO2
    WEBAUTHN_RP_ID: str = "localhost"
    WEBAUTHN_RP_NAME: str = "FinTrackr"
    WEBAUTHN_ORIGIN: str = "http://localhost:5173"

    # Refresh tokens (issued only for installed PWA sessions)
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    GEMINI_API_KEY: str | None = None
    GEMINI_MODEL: str = "gemini-2.5-flash"
    BUILD_VERSION: str = "dev"

    SIGNUP_OTP_EXPIRY_MINUTES: int = 2
    SIGNUP_OTP_LENGTH: int = 6

    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_USE_TLS: bool = True
    SMTP_USE_SSL: bool = False
    SMTP_TIMEOUT_SECONDS: int = 15
    SMTP_FROM_EMAIL: str = "no-reply@my-finance.local"
    SMTP_BCC_EMAILS: list[str] = ["no-reply@harpytechco.in"]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: Any) -> Any:
        if not isinstance(value, str):
            return value

        normalized = value.strip()
        if not normalized:
            return []

        if normalized.startswith("["):
            parsed = json.loads(normalized)
            if not isinstance(parsed, list):
                raise ValueError("CORS_ORIGINS JSON value must be a list of origins")
            return [
                origin.strip()
                for origin in parsed
                if isinstance(origin, str) and origin.strip()
            ]

        return [origin.strip() for origin in normalized.split(",") if origin.strip()]

    @field_validator("SMTP_BCC_EMAILS", mode="before")
    @classmethod
    def parse_smtp_bcc_emails(cls, value: Any) -> Any:
        if value is None:
            return []

        if not isinstance(value, str):
            return value

        normalized = value.strip()
        if not normalized:
            return []

        if normalized.startswith("["):
            parsed = json.loads(normalized)
            if not isinstance(parsed, list):
                raise ValueError(
                    "SMTP_BCC_EMAILS JSON value must be " "a list of email addresses"
                )
            return [
                email.strip()
                for email in parsed
                if isinstance(email, str) and email.strip()
            ]

        return [email.strip() for email in normalized.split(",") if email.strip()]

    model_config = {"env_file": ".env", "case_sensitive": True}


try:
    settings = Settings()
    logger.info("Configuration loaded successfully")
    logger.info(f"Project: {settings.PROJECT_NAME}")
    logger.info(f"MongoDB Database: {settings.MONGODB_DB}")
    logger.info(f"Build Version: {settings.BUILD_VERSION}")
except Exception as exc:
    logger.error(f"Failed to load configuration: {str(exc)}", exc_info=True)
    raise
