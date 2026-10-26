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

function base64urlToBuffer(base64url: string): ArrayBuffer {
  // Pad to multiple of 4
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer.buffer;
}

function bufferToBase64url(buffer: ArrayBuffer): string {
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

interface SerializedRegistrationCredential {
  id: string;
  rawId: string;
  type: string;
  response: {
    clientDataJSON: string;
    attestationObject: string;
  };
}

interface SerializedAuthenticationCredential {
  id: string;
  rawId: string;
  type: string;
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle: string | null;
  };
}

function serializeRegistrationCredential(
  credential: PublicKeyCredential,
): SerializedRegistrationCredential {
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      attestationObject: bufferToBase64url(response.attestationObject),
    },
  };
}

interface NavigatorUABrand {
  brand: string;
  version: string;
}

interface NavigatorUAData {
  platform?: string;
  brands?: NavigatorUABrand[];
}

function getDeviceLabel(): string {
  if (typeof navigator === 'undefined') {
    return 'This device';
  }

  const uaData = (navigator as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;
  const platform = !!uaData ? (uaData?.platform || navigator.platform) : 'Unknown platform';
  const browserBrand = uaData?.brands?.find((brand) => brand.brand !== 'Not A;Brand')?.brand;
  const browser = browserBrand || 'Browser';

  return `${browser} on ${platform}`;
}

function serializeAuthenticationCredential(
  credential: PublicKeyCredential,
): SerializedAuthenticationCredential {
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      authenticatorData: bufferToBase64url(response.authenticatorData),
      signature: bufferToBase64url(response.signature),
      userHandle: response.userHandle ? bufferToBase64url(response.userHandle) : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Server payload shapes (base64url-encoded fields, before buffer conversion)
// ---------------------------------------------------------------------------

interface PublicKeyCredentialDescriptorJSON {
  id: string;
  type: string;
  transports?: string[];
}

interface RegistrationOptionsJSON extends Omit<PublicKeyCredentialCreationOptions, 'challenge' | 'user' | 'excludeCredentials'> {
  challenge: string;
  user: Omit<PublicKeyCredentialUserEntity, 'id'> & { id: string };
  excludeCredentials?: PublicKeyCredentialDescriptorJSON[];
}

interface AuthenticationOptionsJSON extends Omit<PublicKeyCredentialRequestOptions, 'challenge' | 'allowCredentials'> {
  challenge: string;
  allowCredentials?: PublicKeyCredentialDescriptorJSON[];
}

export interface WebAuthnRegisterResult {
  success: true;
  deviceId: string;
}

const WEBAUTHN_ERROR_MESSAGES: Record<string, string> = {
  NotAllowedError:
    'Biometric setup was cancelled or timed out. Please try again.',
  InvalidStateError:
    'This device is already registered for biometric login.',
  NotSupportedError:
    'Your browser or device does not support biometric login.',
  SecurityError:
    'Biometric login could not be set up due to a security configuration issue. Contact support.',
  AbortError:
    'Biometric setup was interrupted. Please try again.',
};

function friendlyWebAuthnError(err: unknown): string {
  const name = err instanceof Error ? (err as DOMException).name : '';
  return (
    WEBAUTHN_ERROR_MESSAGES[name] ??
    'Something went wrong during biometric setup. Please try again or contact support.'
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWebAuthn() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSupported =
    typeof window !== 'undefined' &&
    Boolean(window.PublicKeyCredential) &&
    Boolean(navigator.credentials);

  /**
   * Register a new biometric credential for `username`.
   * Should be called after a successful email/password login.
   */
  const registerBiometric = useCallback(async (username: string): Promise<WebAuthnRegisterResult> => {
    if (!isSupported) throw new Error('WebAuthn is not supported on this device.');

    setLoading(true);
    setError(null);
    try {
      const deviceId = await getOrCreateDeviceId();
      const deviceName = getDeviceLabel();

      // 1. Get challenge from server
      const optionsJson = await apiRequest<RegistrationOptionsJSON>('/webauthn/register', {
        method: 'POST',
        body: JSON.stringify({ username, device_id: deviceId }),
      });

      // 2. Convert challenge and user.id to ArrayBuffer
      const publicKey: PublicKeyCredentialCreationOptions = {
        ...optionsJson,
        challenge: base64urlToBuffer(optionsJson.challenge),
        user: {
          ...optionsJson.user,
          id: base64urlToBuffer(optionsJson.user.id),
        },
        excludeCredentials: (optionsJson.excludeCredentials || []).map((c) => ({
          ...c,
          id: base64urlToBuffer(c.id),
        })) as PublicKeyCredentialDescriptor[],
      };

      // 3. Invoke browser authenticator
      const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential;
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
      const msg = friendlyWebAuthnError(err);
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
  const authenticateBiometric = useCallback(async (username: string): Promise<unknown> => {
    if (!isSupported) throw new Error('WebAuthn is not supported on this device.');

    setLoading(true);
    setError(null);
    try {
      const deviceId = await getOrCreateDeviceId();
      const isPwa = isInstalledPwa();

      // 1. Get challenge
      const optionsJson = await apiRequest<AuthenticationOptionsJSON>('/webauthn/authenticate', {
        method: 'POST',
        body: JSON.stringify({ username, device_id: deviceId }),
      });

      // 2. Convert challenge + allowCredentials ids
      const publicKey: PublicKeyCredentialRequestOptions = {
        ...optionsJson,
        challenge: base64urlToBuffer(optionsJson.challenge),
        allowCredentials: (optionsJson.allowCredentials || []).map((c) => ({
          ...c,
          id: base64urlToBuffer(c.id),
        })) as PublicKeyCredentialDescriptor[],
      };

      // 3. Browser authentication ceremony
      const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential;
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
      const msg = friendlyWebAuthnError(err);
      setError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  return { isSupported, loading, error, registerBiometric, authenticateBiometric };
}
