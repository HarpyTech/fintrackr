from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from app.core.config import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

def get_current_tenant(request: Request):
    """Get the current user's tenant_id from request state.

    Falls back to username for tokens issued before tenant_id was added.
    """
    tenant_id = getattr(request.state, "tenant_id", None)
    if not tenant_id:
        user = getattr(request.state, "user", None)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated",
            )
        return user
    return tenant_id


def get_current_user(request: Request):
    """
    Get the current authenticated user from request state.
    This is populated by the AuthenticationMiddleware.
    """
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    return user


def get_current_user_role(request: Request):
    """
    Get the current user's role from request state.
    This is populated by the AuthenticationMiddleware.
    """
    role = getattr(request.state, "role", None)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    return role


def require_admin(request: Request):
    """
    Dependency to require admin role.
    Use this in endpoints that should only be accessible to admins.
    
    Example:
        @router.get("/admin-only")
        def admin_endpoint(user: str = Depends(require_admin)):
            ...
    """
    role = getattr(request.state, "role", None)
    if role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return role


def require_role(required_role: str):
    """
    Factory function to create a role-based authorization dependency.
    
    Example:
        @router.get("/moderator-only")
        def moderator_endpoint(user: str = Depends(require_role("moderator"))):
            ...
    """
    def check_role(request: Request):
        role = getattr(request.state, "role", None)
        if role != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"{required_role.capitalize()} access required"
            )
        return role
    
    return check_role
