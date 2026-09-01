import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import get_current_tenant, require_admin
from app.core.plans import plan_catalog
from app.models.admin import AdminUserSummary, AdminUserUpdate
from app.services.admin_service import (
    UserNotFoundError,
    get_user,
    list_users,
    update_user,
)

router = APIRouter(dependencies=[Depends(require_admin)])
logger = logging.getLogger(__name__)


@router.get("/plans")
def get_plans():
    """Return the catalog of subscription plans."""
    return {"plans": plan_catalog()}


@router.get("/users")
def get_users(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    search: str | None = Query(default=None, max_length=120),
    tenant_id: str = Depends(get_current_tenant),
):
    """List users with plan and usage (admin only)."""
    return list_users(skip=skip, limit=limit, search=search, tenant_id=tenant_id)


@router.get("/users/{username}", response_model=AdminUserSummary)
def get_single_user(username: str, tenant_id: str = Depends(get_current_tenant)):
    """Fetch a single user's admin view."""
    try:
        return get_user(username, tenant_id=tenant_id)
    except UserNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )


@router.patch("/users/{username}", response_model=AdminUserSummary)
def patch_user(
    username: str,
    payload: AdminUserUpdate,
    tenant_id: str = Depends(get_current_tenant),
):
    """Update a user's role, plan, or expense limit (admin only)."""
    try:
        return update_user(
            username,
            role=payload.role,
            plan=payload.plan,
            expense_limit=payload.expense_limit,
            disable_rate_limit=payload.disable_rate_limit,
            tenant_id=tenant_id,
        )
    except UserNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
