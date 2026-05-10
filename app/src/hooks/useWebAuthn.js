/**
 * useWebAuthn – React hook wrapping the WebAuthn browser API.
 *
 * Exposes:
 *   registerBiometric(username)       – enrol a new biometric credential
 *   authenticateBiometric(username)   – sign in with an existing credential
 *   isSupported                        – true when WebAuthn is available
 */
import { useState, useCallback } from 'react';
import { apiRequest } from '../lib/api';
import {
  getOrCreateDeviceId,
  storeCredentialId,
  storeBindingUsername,
  isInstalledPwa,
} from '../lib/deviceBinding';

// ---------------------------------------------------------------------------
// Base64url helpers (WebAuthn API uses ArrayBuffer; server uses base64url)
// ---------------------------------------------------------------------------

function base64urlToBuffer(base64url) {
  // Pad to multiple of 4
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer.buffer;
}

function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ---------------------------------------------------------------------------
// Serialise a PublicKeyCredential into a plain JSON-able object
// ---------------------------------------------------------------------------

function serializeRegistrationCredential(credential) {
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
      attestationObject: bufferToBase64url(credential.response.attestationObject),
    },
  };
}

function getDeviceLabel() {
  if (typeof navigator === 'undefined') {
    return 'This device';
  }

  const platform = navigator.userAgentData?.platform || navigator.platform || 'Unknown platform';
  const browserBrand = navigator.userAgentData?.brands?.find((brand) => brand.brand !== 'Not A;Brand')?.brand;
  const browser = browserBrand || 'Browser';

  return `${browser} on ${platform}`;
}

function serializeAuthenticationCredential(credential) {
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
      authenticatorData: bufferToBase64url(credential.response.authenticatorData),
      signature: bufferToBase64url(credential.response.signature),
      userHandle: credential.response.userHandle
        ? bufferToBase64url(credential.response.userHandle)
        : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWebAuthn() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isSupported =
    typeof window !== 'undefined' &&
    Boolean(window.PublicKeyCredential) &&
    Boolean(navigator.credentials);

  /**
   * Register a new biometric credential for `username`.
   * Should be called after a successful email/password login.
   */
  const registerBiometric = useCallback(async (username) => {
    if (!isSupported) throw new Error('WebAuthn is not supported on this device.');

    setLoading(true);
    setError(null);
    try {
      const deviceId = await getOrCreateDeviceId();
      const deviceName = getDeviceLabel();

      // 1. Get challenge from server
      const optionsJson = await apiRequest('/webauthn/register', {
        method: 'POST',
        body: JSON.stringify({ username, device_id: deviceId }),
      });

      // 2. Convert challenge and user.id to ArrayBuffer
      const publicKey = {
        ...optionsJson,
        challenge: base64urlToBuffer(optionsJson.challenge),
        user: {
          ...optionsJson.user,
          id: base64urlToBuffer(optionsJson.user.id),
        },
        excludeCredentials: (optionsJson.excludeCredentials || []).map((c) => ({
          ...c,
          id: base64urlToBuffer(c.id),
        })),
      };

      // 3. Invoke browser authenticator
      const credential = await navigator.credentials.create({ publicKey });
      const credentialJson = serializeRegistrationCredential(credential);

      // 4. Verify with server
      await apiRequest('/webauthn/register/verify', {
        method: 'POST',
        body: JSON.stringify({
          username,
          device_id: deviceId,
          device_name: deviceName,
          credential: credentialJson,
        }),
      });

      // 5. Persist to IndexedDB
      await storeCredentialId(credential.id);
      await storeBindingUsername(username);

      return { success: true, deviceId };
    } catch (err) {
      const msg = err?.message || 'Biometric registration failed.';
      setError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  /**
   * Authenticate using a stored biometric credential for `username`.
   * Returns the server token response on success.
   */
  const authenticateBiometric = useCallback(async (username) => {
    if (!isSupported) throw new Error('WebAuthn is not supported on this device.');

    setLoading(true);
    setError(null);
    try {
      const deviceId = await getOrCreateDeviceId();
      const isPwa = isInstalledPwa();

      // 1. Get challenge
      const optionsJson = await apiRequest('/webauthn/authenticate', {
        method: 'POST',
        body: JSON.stringify({ username, device_id: deviceId }),
      });

      // 2. Convert challenge + allowCredentials ids
      const publicKey = {
        ...optionsJson,
        challenge: base64urlToBuffer(optionsJson.challenge),
        allowCredentials: (optionsJson.allowCredentials || []).map((c) => ({
          ...c,
          id: base64urlToBuffer(c.id),
        })),
      };

      // 3. Browser authentication ceremony
      const credential = await navigator.credentials.get({ publicKey });
      const credentialJson = serializeAuthenticationCredential(credential);

      // 4. Verify with server → receive tokens
      const result = await apiRequest('/webauthn/authenticate/verify', {
        method: 'POST',
        body: JSON.stringify({
          username,
          device_id: deviceId,
          credential: credentialJson,
          is_pwa: isPwa,
        }),
      });

      return result;
    } catch (err) {
      const msg = err?.message || 'Biometric authentication failed.';
      setError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  return { isSupported, loading, error, registerBiometric, authenticateBiometric };
}
