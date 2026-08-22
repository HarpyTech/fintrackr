from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.core.plans import is_valid_plan

_ALLOWED_ROLES = {"admin", "user"}


class AdminUserUpdate(BaseModel):
    """Admin-editable fields on a user account.

    At least one field must be provided. ``expense_limit`` /
    ``disable_rate_limit`` override the limit derived from ``plan``.
    """

    role: str | None = None
    plan: str | None = None
    expense_limit: int | None = Field(default=None, ge=1)
    disable_rate_limit: bool | None = None

    @field_validator("role")
    @classmethod
    def _validate_role(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        if normalized not in _ALLOWED_ROLES:
            raise ValueError("role must be one of: admin, user")
        return normalized

    @field_validator("plan")
    @classmethod
    def _validate_plan(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        if not is_valid_plan(normalized):
            raise ValueError("unknown plan")
        return normalized

    @model_validator(mode="after")
    def _require_one_field(self) -> "AdminUserUpdate":
        if (
            self.role is None
            and self.plan is None
            and self.expense_limit is None
            and self.disable_rate_limit is None
        ):
            raise ValueError("at least one field must be provided")
        return self


class AdminUserSummary(BaseModel):
    username: EmailStr
    role: str
    plan: str
    expense_limit: int
    disable_rate_limit: bool
    email_verified: bool
    expense_count: int
