import json

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, EmailStr

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.plans import DEFAULT_PLAN, is_valid_plan, plan_user_fields
from app.core.security import verify_password
from app.db.mongo import get_users_collection
from app.models.user import UserProfile, UserProfileUpdate
from app.repositories import user_repository
from app.services.account_service import delete_account, export_account
from app.services.auth_service import get_user_profile, update_user_profile

router = APIRouter()


class PlanUpdateRequest(BaseModel):
    plan: str


class DeleteAccountRequest(BaseModel):
    confirm_username: EmailStr
    password: str | None = None


@router.get("/me/export")
def export_me(user: str = Depends(get_current_user)):
    """Download everything FinTrackr stores about the caller, as JSON."""
    try:
        data = export_account(user)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return Response(
        content=json.dumps(data, default=str, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="fintrackr-export.json"'},
    )


@router.post("/me/delete", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(
    payload: DeleteAccountRequest,
    response: Response,
    user: str = Depends(get_current_user),
):
    """Permanently delete the caller's account and all of their data."""
    account = user_repository.find_by_username(user)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if payload.confirm_username.strip().lower() != user.strip().lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Type your email address to confirm.",
        )
    # Google-created accounts hold a random password, so only password
    # accounts must re-enter one.
    if not account.get("oauth_provider") and not verify_password(
        payload.password or "", account["password_hash"]
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Password is incorrect.")
    delete_account(user)
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")


@router.get("/me", response_model=UserProfile)
def read_profile(user: str = Depends(get_current_user)):
    profile = get_user_profile(user)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found",
        )
    return profile


@router.patch("/me", response_model=UserProfile)
def patch_profile(
    payload: UserProfileUpdate,
    user: str = Depends(get_current_user),
):
    try:
        updated = update_user_profile(
            user,
            first_name=payload.first_name,
            last_name=payload.last_name,
            phone=payload.phone,
            address=payload.address,
            timezone=payload.timezone,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found",
        )
    return updated


@router.post("/me/plan", response_model=UserProfile)
def update_plan(
    payload: PlanUpdateRequest,
    user: str = Depends(get_current_user),
):
    """Self-service plan change. Until checkout exists users may only move to
    the free plan; paid plans are granted by an admin."""
    if not settings.FEATURE_BILLING_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Not Found"
        )
    plan_key = payload.plan.strip().lower()
    if not is_valid_plan(plan_key):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown plan '{plan_key}'. Valid plans: free, go, max.",
        )
    if plan_key != DEFAULT_PLAN:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Upgrades require payment and are not available yet.",
        )
    fields = plan_user_fields(plan_key)
    get_users_collection().update_one({"username": user}, {"$set": fields})
    profile = get_user_profile(user)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return profile
