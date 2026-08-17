import json
import logging
import os
from typing import Any

from pydantic import field_validator, model_validator
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

    # Deployment environment. Drives docs exposure and security headers.
    # Accepted values: development | staging | production
    #
    # Left empty by default, which means "auto-detect". The Cloud Run deploy
    # pipeline builds its env file from a fixed allow-list of secrets and has
    # no entry for this key, so it can never be supplied there — detection
    # falls back to the K_SERVICE name Cloud Run injects. See is_production.
    ENVIRONMENT: str = ""

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

    # Set True in production (HTTPS); False for local HTTP development
    COOKIE_SECURE: bool = False

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

    @property
    def cloud_run_service(self) -> str:
        """
        Cloud Run injects K_SERVICE into every container it starts. Empty
        string when running anywhere else (local, docker-compose, CI).
        """
        return os.getenv("K_SERVICE", "")

    @property
    def is_cloud_run(self) -> bool:
        return bool(self.cloud_run_service)

    @property
    def is_production(self) -> bool:
        """
        True when running in a production deployment.

        An explicit ENVIRONMENT always wins. When it is unset the value is
        inferred from the Cloud Run service name, which the deploy workflow
        suffixes with -prod on main and -dev on develop.
        """
        explicit = self.ENVIRONMENT.strip().lower()
        if explicit:
            return explicit in {"production", "prod"}

        return self.cloud_run_service.endswith("-prod")

    @model_validator(mode="after")
    def _harden_cookies_when_deployed(self) -> "Settings":
        """
        Force Secure cookies on Cloud Run.

        Cloud Run terminates TLS in front of every revision, so the service is
        only ever reachable over HTTPS. COOKIE_SECURE cannot be delivered
        through the deploy pipeline, and its False default would otherwise
        leave the session and WebAuthn cookies without the Secure flag in a
        deployed environment.
        """
        if self.is_cloud_run and not self.COOKIE_SECURE:
            self.COOKIE_SECURE = True
            logger.info("Cloud Run detected — forcing COOKIE_SECURE=True")
        return self

    model_config = {
        "env_file": ".env",
        "case_sensitive": True,
        # The .env file is shared with the Vite frontend (VITE_*) and holds
        # keys consumed outside this model, so unknown entries must not fail
        # startup.
        "extra": "ignore",
    }


try:
    settings = Settings()
    logger.info("Configuration loaded successfully")
    logger.info(f"Project: {settings.PROJECT_NAME}")
    logger.info(f"MongoDB Database: {settings.MONGODB_DB}")
    logger.info(f"Build Version: {settings.BUILD_VERSION}")
except Exception as exc:
    logger.error(f"Failed to load configuration: {str(exc)}", exc_info=True)
    raise
