from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.deps import get_current_tenant, get_current_user
from app.core.plans import is_valid_plan, plan_user_fields
from app.db.mongo import get_users_collection
from app.models.user import UserProfile, UserProfileUpdate
from app.services.admin_service import create_upgrade_request
from app.services.auth_service import get_user_profile, update_user_profile
from app.services.email_service import deliver_upgrade_request

router = APIRouter()


class PlanUpdateRequest(BaseModel):
    plan: str


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
    updated = update_user_profile(
        user,
        first_name=payload.first_name,
        last_name=payload.last_name,
        phone=payload.phone,
        address=payload.address,
    )
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
    tenant_id: str = Depends(get_current_tenant),
):
    """Handle self-service plan changes and paid-plan requests."""
    plan_key = payload.plan.strip().lower()
    if not is_valid_plan(plan_key):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown plan '{plan_key}'. Valid plans: free, go, max.",
        )
    profile = get_user_profile(user)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if plan_key == "go" and profile.get("plan", "free") == "free":
        create_upgrade_request(
            user,
            current_plan=profile.get("plan", "free"),
            first_name=profile.get("first_name"),
            last_name=profile.get("last_name"),
            tenant_id=tenant_id,
        )
        deliver_upgrade_request(
            requester_email=user,
            requested_plan=plan_key,
            current_plan=profile.get("plan", "free"),
            first_name=profile.get("first_name"),
            last_name=profile.get("last_name"),
        )
        return profile

    fields = plan_user_fields(plan_key)
    get_users_collection().update_one({"username": user}, {"$set": fields})
    return get_user_profile(user)
