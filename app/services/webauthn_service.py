"""
WebAuthn / FIDO2 service layer.

Handles:
- Challenge generation and storage (registration + authentication)
- Credential storage and lookup
- Registration and authentication verification
- Refresh token issuance, validation, and revocation
"""

import base64
import json
import logging
from datetime import datetime, timedelta, timezone
from ipaddress import ip_address
from urllib.parse import urlparse

from fastapi import Request

from webauthn import (
    generate_registration_options,
    verify_registration_response,
    generate_authentication_options,
    verify_authentication_response,
    options_to_json,
    base64url_to_bytes,
)


def _bytes_to_base64url(val: bytes) -> str:
    return base64.urlsafe_b64encode(val).rstrip(b"=").decode("utf-8")


from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    UserVerificationRequirement,
    ResidentKeyRequirement,
    PublicKeyCredentialDescriptor,
    RegistrationCredential,
    AuthenticationCredential,
    AuthenticatorAttestationResponse,
    AuthenticatorAssertionResponse,
    PublicKeyCredentialType,
)
from webauthn.helpers.exceptions import (
    InvalidCBORData,
    InvalidAuthenticatorDataStructure,
)

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_token,
)
from app.db.mongo import (
    get_users_collection,
    get_webauthn_credentials_collection,
    get_webauthn_challenges_collection,
    get_refresh_tokens_collection,
)

logger = logging.getLogger(__name__)

_CHALLENGE_TTL_MINUTES = 5


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _is_ip_address(value: str) -> bool:
    try:
        ip_address(value)
        return True
    except ValueError:
        return False


def _parse_origin(origin: str) -> tuple[str, str] | None:
    """Parse an Origin header value into (origin, rp_id)."""
    parsed = urlparse(origin.strip())
    if not parsed.scheme or not parsed.hostname:
        return None
    rp_id = parsed.hostname.lower().rstrip(".")
    if not rp_id:
        return None
    normalized_origin = f"{parsed.scheme}://{parsed.netloc}"
    return normalized_origin, rp_id


def _derive_webauthn_context(request: Request | None) -> tuple[str, str]:
    """Derive (origin, rp_id) from request headers, with config fallback."""
    if request is not None:
        origin_header = request.headers.get("origin")
        if origin_header:
            parsed = _parse_origin(origin_header)
            if parsed:
                return parsed

        forwarded_proto = request.headers.get("x-forwarded-proto", "")
        scheme = forwarded_proto.split(",")[0].strip() or request.url.scheme or "https"
        forwarded_host = request.headers.get("x-forwarded-host", "")
        host = forwarded_host.split(",")[0].strip() or request.headers.get("host", "")
        if host:
            parsed = _parse_origin(f"{scheme}://{host}")
            if parsed:
                return parsed

    configured_origin = settings.WEBAUTHN_ORIGIN.strip()
    parsed = _parse_origin(configured_origin)
    if parsed:
        origin, rp_id = parsed
        configured_rp = settings.WEBAUTHN_RP_ID.strip().lower().rstrip(".")
        if configured_rp and (configured_rp == rp_id or _is_ip_address(configured_rp)):
            return origin, configured_rp
        return origin, rp_id

    return settings.WEBAUTHN_ORIGIN, settings.WEBAUTHN_RP_ID


# ---------------------------------------------------------------------------
# Challenge helpers
# ---------------------------------------------------------------------------


def _store_challenge(
    username: str,
    challenge_b64: str,
    device_id: str,
    challenge_type: str,
    rp_id: str,
    origin: str,
) -> None:
    """Persist a WebAuthn challenge; replaces any existing pending challenge of the same type."""
    col = get_webauthn_challenges_collection()
    expires_at = _utcnow() + timedelta(minutes=_CHALLENGE_TTL_MINUTES)
    col.replace_one(
        {"username": username, "type": challenge_type},
        {
            "username": username,
            "type": challenge_type,
            "challenge": challenge_b64,
            "device_id": device_id,
            "rp_id": rp_id,
            "origin": origin,
            "expires_at": expires_at,
        },
        upsert=True,
    )


def _pop_challenge(username: str, challenge_type: str) -> dict | None:
    """Retrieve and delete the pending challenge for a user. Returns None if expired/missing."""
    col = get_webauthn_challenges_collection()
    doc = col.find_one_and_delete({"username": username, "type": challenge_type})
    if not doc:
        return None
    expires_at = doc["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if _utcnow() > expires_at:
        return None
    return doc


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


def generate_registration_challenge(
    username: str, device_id: str, request: Request | None = None
) -> dict:
    """
    Issue a WebAuthn registration challenge for `username`.
    Returns a dict that can be passed directly to the browser as JSON.
    """
    users = get_users_collection()
    user_doc = users.find_one({"username": username})
    if not user_doc:
        raise ValueError("User not found")
    if not user_doc.get("email_verified", False):
        raise ValueError("Email not verified")

    # Build user_id as UTF-8 bytes of the username
    user_id_bytes = username.encode("utf-8")

    expected_origin, expected_rp_id = _derive_webauthn_context(request)

    options = generate_registration_options(
        rp_id=expected_rp_id,
        rp_name=settings.WEBAUTHN_RP_NAME,
        user_id=user_id_bytes,
        user_name=username,
        user_display_name=username,
        authenticator_selection=AuthenticatorSelectionCriteria(
            user_verification=UserVerificationRequirement.PREFERRED,
            resident_key=ResidentKeyRequirement.PREFERRED,
        ),
        timeout=60000,
    )

    options_dict = json.loads(options_to_json(options))
    challenge_b64 = options_dict["challenge"]
    _store_challenge(
        username,
        challenge_b64,
        device_id,
        "registration",
        expected_rp_id,
        expected_origin,
    )
    logger.info(f"WebAuthn registration challenge issued for: {username}")
    return options_dict


def verify_registration(
    username: str,
    device_id: str,
    credential_data: dict,
    device_name: str | None = None,
) -> dict:
    """
    Verify the registration response from the browser and persist the credential.
    Returns stored credential metadata.
    """
    challenge_doc = _pop_challenge(username, "registration")
    if not challenge_doc:
        raise ValueError(
            "No valid registration challenge found. Please request a new one."
        )
    if challenge_doc["device_id"] != device_id:
        raise ValueError("Device ID mismatch during registration.")

    expected_rp_id = challenge_doc.get("rp_id") or settings.WEBAUTHN_RP_ID
    expected_origin = challenge_doc.get("origin") or settings.WEBAUTHN_ORIGIN

    challenge_bytes = base64url_to_bytes(challenge_doc["challenge"])

    try:
        credential = RegistrationCredential(
            id=credential_data["id"],
            raw_id=base64url_to_bytes(credential_data["rawId"]),
            response=AuthenticatorAttestationResponse(
                client_data_json=base64url_to_bytes(
                    credential_data["response"]["clientDataJSON"]
                ),
                attestation_object=base64url_to_bytes(
                    credential_data["response"]["attestationObject"]
                ),
            ),
            type=PublicKeyCredentialType.PUBLIC_KEY,
        )

        verified = verify_registration_response(
            credential=credential,
            expected_challenge=challenge_bytes,
            expected_rp_id=expected_rp_id,
            expected_origin=expected_origin,
            require_user_verification=False,
        )
    except (InvalidCBORData, InvalidAuthenticatorDataStructure, Exception) as exc:
        logger.warning(
            f"WebAuthn registration verification failed for {username}: {exc}"
        )
        raise ValueError(f"Registration verification failed: {exc}") from exc

    credential_id_b64 = _bytes_to_base64url(verified.credential_id)
    public_key_b64 = _bytes_to_base64url(verified.credential_public_key)

    credentials_col = get_webauthn_credentials_collection()

    # One credential per (username, device_id) – replace if re-registering same device
    credentials_col.replace_one(
        {"username": username, "device_id": device_id},
        {
            "username": username,
            "credential_id": credential_id_b64,
            "public_key": public_key_b64,
            "device_id": device_id,
            "device_name": device_name or f"Device {device_id[:8]}",
            "sign_count": verified.sign_count,
            "aaguid": str(verified.aaguid),
            "created_at": _utcnow(),
            "last_used_at": _utcnow(),
        },
        upsert=True,
    )

    logger.info(
        f"WebAuthn credential registered for {username} on device {device_id[:8]}…"
    )
    return {
        "credential_id": credential_id_b64,
        "device_id": device_id,
        "device_name": device_name or f"Device {device_id[:8]}",
    }


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


def generate_authentication_challenge(
    username: str, device_id: str, request: Request | None = None
) -> dict:
    """
    Issue a WebAuthn authentication challenge.
    Returns a dict for the browser.
    """
    credentials_col = get_webauthn_credentials_collection()
    cred_doc = credentials_col.find_one({"username": username, "device_id": device_id})
    if not cred_doc:
        raise ValueError(
            "No WebAuthn credential found for this device. Please register first."
        )

    allow_credentials = [
        PublicKeyCredentialDescriptor(id=base64url_to_bytes(cred_doc["credential_id"]))
    ]

    expected_origin, expected_rp_id = _derive_webauthn_context(request)

    options = generate_authentication_options(
        rp_id=expected_rp_id,
        allow_credentials=allow_credentials,
        user_verification=UserVerificationRequirement.PREFERRED,
        timeout=60000,
    )

    options_dict = json.loads(options_to_json(options))
    challenge_b64 = options_dict["challenge"]
    _store_challenge(
        username,
        challenge_b64,
        device_id,
        "authentication",
        expected_rp_id,
        expected_origin,
    )
    logger.info(f"WebAuthn authentication challenge issued for: {username}")
    return options_dict


def verify_authentication(
    username: str,
    device_id: str,
    credential_data: dict,
    is_pwa: bool,
    response_obj,  # FastAPI Response for cookie setting
) -> dict:
    """
    Verify a WebAuthn authentication response, issue access + optional refresh token.
    Returns token payload.
    """
    challenge_doc = _pop_challenge(username, "authentication")
    if not challenge_doc:
        raise ValueError(
            "No valid authentication challenge found. Please request a new one."
        )
    if challenge_doc["device_id"] != device_id:
        raise ValueError("Device ID mismatch during authentication.")

    expected_rp_id = challenge_doc.get("rp_id") or settings.WEBAUTHN_RP_ID
    expected_origin = challenge_doc.get("origin") or settings.WEBAUTHN_ORIGIN

    challenge_bytes = base64url_to_bytes(challenge_doc["challenge"])

    credentials_col = get_webauthn_credentials_collection()
    cred_doc = credentials_col.find_one({"username": username, "device_id": device_id})
    if not cred_doc:
        raise ValueError("WebAuthn credential not found. Please re-register.")

    try:
        credential = AuthenticationCredential(
            id=credential_data["id"],
            raw_id=base64url_to_bytes(credential_data["rawId"]),
            response=AuthenticatorAssertionResponse(
                client_data_json=base64url_to_bytes(
                    credential_data["response"]["clientDataJSON"]
                ),
                authenticator_data=base64url_to_bytes(
                    credential_data["response"]["authenticatorData"]
                ),
                signature=base64url_to_bytes(credential_data["response"]["signature"]),
                user_handle=(
                    base64url_to_bytes(credential_data["response"]["userHandle"])
                    if credential_data["response"].get("userHandle")
                    else None
                ),
            ),
            type=PublicKeyCredentialType.PUBLIC_KEY,
        )

        verified = verify_authentication_response(
            credential=credential,
            expected_challenge=challenge_bytes,
            expected_rp_id=expected_rp_id,
            expected_origin=expected_origin,
            credential_public_key=base64url_to_bytes(cred_doc["public_key"]),
            credential_current_sign_count=cred_doc["sign_count"],
            require_user_verification=False,
        )
    except Exception as exc:
        logger.warning(f"WebAuthn authentication failed for {username}: {exc}")
        raise ValueError(f"Authentication verification failed: {exc}") from exc

    # Update sign count
    credentials_col.update_one(
        {"username": username, "device_id": device_id},
        {"$set": {"sign_count": verified.new_sign_count, "last_used_at": _utcnow()}},
    )

    # Fetch user role
    users = get_users_collection()
    user_doc = users.find_one({"username": username}, {"role": 1})
    role = user_doc.get("role", "user") if user_doc else "user"

    # Issue access token
    token_data = {"username": username, "role": role}
    access_token = create_access_token(token_data)

    # Set access token cookie (same as password login)
    from app.api.routes.auth import _set_session_cookie

    _set_session_cookie(response_obj, access_token)

    result: dict = {"access_token": access_token, "token_type": "bearer", "role": role}

    # Issue refresh token only for installed PWA
    if is_pwa:
        refresh_token = create_refresh_token({**token_data, "device_id": device_id})
        _store_refresh_token(username, device_id, refresh_token)
        response_obj.set_cookie(
            key="refresh_token",
            value=refresh_token,
            httponly=True,
            secure=settings.COOKIE_SECURE,
            samesite="lax",
            max_age=60 * 60 * 24 * settings.REFRESH_TOKEN_EXPIRE_DAYS,
        )
        result["refresh_token_issued"] = True

    logger.info(f"WebAuthn authentication successful for {username}")
    return result


# ---------------------------------------------------------------------------
# Refresh token management
# ---------------------------------------------------------------------------


def _store_refresh_token(username: str, device_id: str, token: str) -> None:
    """Persist a refresh token (one per device; revoke previous)."""
    col = get_refresh_tokens_collection()
    expires_at = _utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    col.replace_one(
        {"username": username, "device_id": device_id},
        {
            "token_hash": hash_token(token),
            "username": username,
            "device_id": device_id,
            "expires_at": expires_at,
            "created_at": _utcnow(),
        },
        upsert=True,
    )


def exchange_refresh_token(token: str, response_obj) -> dict:
    """
    Validate a refresh token and issue a new access token (sliding expiry).
    Only valid for installed PWA sessions.
    """
    payload = decode_refresh_token(token)
    if not payload:
        raise ValueError("Invalid or expired refresh token.")

    username = payload.get("username")
    device_id = payload.get("device_id")
    if not username or not device_id:
        raise ValueError("Malformed refresh token payload.")

    col = get_refresh_tokens_collection()
    token_hash = hash_token(token)
    doc = col.find_one({"token_hash": token_hash})
    if not doc:
        raise ValueError("Refresh token has been revoked.")

    expires_at = doc["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if _utcnow() > expires_at:
        col.delete_one({"token_hash": token_hash})
        raise ValueError("Refresh token expired.")

    # Fetch role
    users = get_users_collection()
    user_doc = users.find_one({"username": username}, {"role": 1})
    role = user_doc.get("role", "user") if user_doc else "user"

    token_data = {"username": username, "role": role}
    access_token = create_access_token(token_data)

    # Sliding expiry: issue a new refresh token and revoke the old one
    new_refresh = create_refresh_token({**token_data, "device_id": device_id})
    col.delete_one({"token_hash": token_hash})
    _store_refresh_token(username, device_id, new_refresh)

    from app.api.routes.auth import _set_session_cookie

    _set_session_cookie(response_obj, access_token)
    response_obj.set_cookie(
        key="refresh_token",
        value=new_refresh,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=60 * 60 * 24 * settings.REFRESH_TOKEN_EXPIRE_DAYS,
    )

    logger.info(f"Refresh token exchanged for user: {username}")
    return {"access_token": access_token, "token_type": "bearer", "role": role}


def revoke_refresh_token(token: str) -> None:
    """Delete a refresh token from the store (logout)."""
    col = get_refresh_tokens_collection()
    col.delete_one({"token_hash": hash_token(token)})


def get_user_credentials(username: str) -> list[dict]:
    """Return all registered WebAuthn credentials for a user (metadata only)."""
    col = get_webauthn_credentials_collection()
    docs = list(col.find({"username": username}, {"public_key": 0, "_id": 0}))
    return docs


def delete_credential(username: str, device_id: str) -> bool:
    """Remove a specific credential binding. Returns True if deleted."""
    col = get_webauthn_credentials_collection()
    result = col.delete_one({"username": username, "device_id": device_id})
    if result.deleted_count:
        # Also revoke refresh tokens for that device
        get_refresh_tokens_collection().delete_many(
            {"username": username, "device_id": device_id}
        )
        return True
    return False
