from fastapi import Request


def get_csrf_token(request: Request) -> str | None:
    """
    Get CSRF token from request cookies.
    Use this in templates to access the token.

    Example in Jinja2 template:
        <input type="hidden" name="csrf_token" value="{{ csrf_token }}">
    """
    return request.cookies.get("csrf_token")
