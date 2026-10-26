"""Bootstrap admins: emails in ADMIN_EMAILS always carry the admin role.

This is how the first admin exists without editing the database, and it keeps
them admin even if someone demotes them in the UI.
"""

from app.core.config import settings


def is_bootstrap_admin(username: str | None) -> bool:
    if not username:
        return False
    return username.strip().lower() in settings.ADMIN_EMAILS


def resolve_role(username: str | None, stored_role: str | None) -> str:
    """Role to put in a token: admin for bootstrap admins, else the stored role."""
    if is_bootstrap_admin(username):
        return "admin"
    return stored_role or "user"
