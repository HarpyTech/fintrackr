import logging

from fastapi import APIRouter, HTTPException, Request, Response, status

from app.api.deps import get_current_user
from app.core.ratelimit import WebAuthnRateLimitError, check_webauthn_rate_limit
from app.models.user import (
    WebAuthnAuthenticateRequest,
    WebAuthnAuthenticateVerifyRequest,
    WebAuthnRegisterRequest,
    WebAuthnRegisterVerifyRequest,
)
from app.services.webauthn_service import (
    delete_credential,
    generate_authentication_challenge,
    generate_registration_challenge,
    get_user_credentials,
    verify_authentication,
    verify_registration,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/register", status_code=status.HTTP_200_OK)
def webauthn_register(payload: WebAuthnRegisterRequest, request: Request):
    """
    Issue a WebAuthn registration challenge.
    Call this after a successful email/password login to enrol a biometric credential.
    """
    try:
        check_webauthn_rate_limit(payload.username, "register")
    except WebAuthnRateLimitError as exc:
        resp = Response(status_code=429)
        resp.headers["Retry-After"] = str(exc.retry_after_seconds)
        return resp
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    try:
        options = generate_registration_challenge(
            payload.username,
            payload.device_id,
            request,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        logger.error(
            f"Unexpected error generating registration challenge: {exc}", exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service temporarily unavailable",
        )
    return options


@router.post("/register/verify", status_code=status.HTTP_200_OK)
def webauthn_register_verify(payload: WebAuthnRegisterVerifyRequest):
    """
    Verify a WebAuthn registration response from the browser and store the credential.
    """
    try:
        result = verify_registration(
            payload.username, payload.device_id, payload.credential, payload.device_name
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        logger.error(f"Unexpected error verifying registration: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service temporarily unavailable",
        )
    return {"message": "Biometric credential registered successfully.", **result}


@router.post("/authenticate", status_code=status.HTTP_200_OK)
def webauthn_authenticate(payload: WebAuthnAuthenticateRequest, request: Request):
    """
    Issue a WebAuthn authentication challenge.
    Call this at app launch when a stored device credential is detected.
    """
    try:
        check_webauthn_rate_limit(payload.username, "authenticate")
    except WebAuthnRateLimitError as exc:
        resp = Response(status_code=429)
        resp.headers["Retry-After"] = str(exc.retry_after_seconds)
        return resp
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    try:
        options = generate_authentication_challenge(
            payload.username,
            payload.device_id,
            request,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        logger.error(
            f"Unexpected error generating authentication challenge: {exc}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service temporarily unavailable",
        )
    return options


@router.post("/authenticate/verify", status_code=status.HTTP_200_OK)
def webauthn_authenticate_verify(
    payload: WebAuthnAuthenticateVerifyRequest,
    response: Response,
):
    """
    Verify a WebAuthn authentication response, issue JWT access token
    (and refresh token for installed PWA sessions).
    """
    try:
        result = verify_authentication(
            payload.username,
            payload.device_id,
            payload.credential,
            payload.is_pwa,
            response,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))
    except Exception as exc:
        logger.error(f"Unexpected error verifying authentication: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service temporarily unavailable",
        )
    return result


@router.get("/credentials", status_code=status.HTTP_200_OK)
def list_credentials(request: Request):
    """
    List all registered WebAuthn credentials for the authenticated user.
    """
    username = get_current_user(request)
    creds = get_user_credentials(username)
    return {"credentials": creds}


@router.delete("/credentials/{device_id}", status_code=status.HTTP_200_OK)
def remove_credential(device_id: str, request: Request):
    """
    Remove a specific WebAuthn credential binding (e.g., when user removes a device).
    """
    username = get_current_user(request)
    deleted = delete_credential(username, device_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Credential not found for this device.",
        )
    return {"message": "Credential removed successfully."}
