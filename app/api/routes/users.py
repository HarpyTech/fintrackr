from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_user
from app.models.user import UserProfileUpdate
from app.services.auth_service import get_user_profile, update_user_profile

router = APIRouter()


@router.get("/me")
def read_profile(user: str = Depends(get_current_user)):
    profile = get_user_profile(user)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found",
        )
    return profile


@router.patch("/me")
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
