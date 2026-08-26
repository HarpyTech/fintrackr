"""Subscription tier / plan definitions.

Each user is assigned a plan that determines their total expense limit.
Admins may override the derived limit per user via ``expense_limit`` /
``disable_rate_limit`` without changing the plan.
"""

from dataclasses import dataclass

DEFAULT_PLAN = "free"


@dataclass(frozen=True)
class Plan:
    key: str
    label: str
    # None means unlimited (rate limiting disabled for the user).
    expense_limit: int | None


PLANS: dict[str, Plan] = {
    "Free": Plan("Free", "Free", 15),
    "Go": Plan("Go", "Go", 100),
    "Max": Plan("Max", "Max", None),
}


def normalize_plan_key(key: str | None) -> str:
    """Return a valid plan key, falling back to the default."""
    candidate = (key or "").strip().lower()
    return candidate if candidate in PLANS else DEFAULT_PLAN


def is_valid_plan(key: str | None) -> bool:
    return (key or "").strip().lower() in PLANS


def get_plan(key: str | None) -> Plan:
    """Return the Plan for ``key`` (default plan when unknown)."""
    return PLANS[normalize_plan_key(key)]


def plan_user_fields(key: str | None) -> dict:
    """Return the user-document fields derived from a plan.

    ``expense_limit`` is set to the plan's limit; unlimited plans instead
    enable ``disable_rate_limit`` and pin the stored limit to 0.
    """
    plan = get_plan(key)
    if plan.expense_limit is None:
        return {"plan": plan.key, "expense_limit": 0, "disable_rate_limit": True}
    return {
        "plan": plan.key,
        "expense_limit": plan.expense_limit,
        "disable_rate_limit": False,
    }


def plan_catalog() -> list[dict]:
    """Return the public catalog of plans for admin / billing UIs."""
    return [
        {
            "key": plan.key,
            "label": plan.label,
            "expense_limit": plan.expense_limit,
            "unlimited": plan.expense_limit is None,
        }
        for plan in PLANS.values()
    ]
