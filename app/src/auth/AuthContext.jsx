import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../lib/api';
import { UNAUTHORIZED_EVENT, notifyWarning } from '../lib/notify';
import { useWebAuthn } from '../hooks/useWebAuthn';
import {
  getBoundUsername,
  getOrCreateDeviceId,
  getStoredCredentialId,
  clearDeviceBinding,
  isInstalledPwa,
} from '../lib/deviceBinding';

const BiometricPromptLazy = lazy(() => import('../components/BiometricPrompt'));

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState({ authenticated: false, user: null, role: null });
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Mirrors session.authenticated so the global 401 listener can read the
  // current value without being torn down and re-subscribed on every change.
  const authenticatedRef = useRef(false);

  const { authenticateBiometric } = useWebAuthn();

  const refreshProfile = useCallback(async () => {
    if (!session.authenticated) {
      setProfile(null);
      return null;
    }

    try {
      const data = await apiRequest('/users/me');
      setProfile(data);
      return data;
    } catch (error) {
      setProfile(null);
      return null;
    }
  }, [session.authenticated]);

  const refreshSession = useCallback(async () => {
    try {
      const data = await apiRequest('/auth/session');
      setSession(data);
    } catch (error) {
      setSession({ authenticated: false, user: null, role: null });
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Attempt silent auto-login for installed PWA.
   * Only tries refresh-token exchange; device login is handled explicitly on the device-login page.
   */
  const tryAutoLogin = useCallback(async () => {
    if (!isInstalledPwa()) return false;

    const boundUsername = await getBoundUsername().catch(() => null);
    const credentialId = await getStoredCredentialId().catch(() => null);
    if (!boundUsername || !credentialId) return false;

    try {
      await apiRequest('/auth/refresh', { method: 'POST' });
      await refreshSession();
      return true;
    } catch (_) {
      return false;
    }
  }, [refreshSession]);

  useEffect(() => {
    (async () => {
      // First try existing session (valid access token cookie)
      try {
        const data = await apiRequest('/auth/session');
        setSession(data);
        setLoading(false);
        return;
      } catch (_) {
        // no valid session – try auto-login
      }

      // Then try auto-login (PWA only)
      const didAutoLogin = await tryAutoLogin();
      if (!didAutoLogin) {
        setSession({ authenticated: false, user: null, role: null });
        setLoading(false);
      }
    })();
  }, [tryAutoLogin]);

  useEffect(() => {
    if (session.authenticated) {
      refreshProfile();
      return;
    }
    setProfile(null);
  }, [session.authenticated, refreshProfile]);

  useEffect(() => {
    authenticatedRef.current = session.authenticated;
  }, [session.authenticated]);

  /**
   * Global session-expiry handling.
   *
   * apiRequest emits this event when a protected endpoint answers 401.
   * Only a user who was already signed in can have a session expire — for
   * everyone else the 401 is expected and must be ignored, otherwise the
   * login page would bounce on its own failed requests.
   */
  useEffect(() => {
    function handleUnauthorized() {
      if (!authenticatedRef.current) {
        return;
      }

      authenticatedRef.current = false;
      setSession({ authenticated: false, user: null, role: null });
      setProfile(null);
      setShowBiometricPrompt(false);
      setSessionExpired(true);
      notifyWarning('Your session has expired. Please sign in again.');
    }

    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, []);

  const login = async (username, password) => {
    await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setSessionExpired(false);
    await refreshSession();

    // Offer biometric enrolment only when this logged-in device has no server-side credential record.
    const currentDeviceId = await getOrCreateDeviceId().catch(() => null);
    if (!currentDeviceId) {
      return;
    }

    try {
      const data = await apiRequest('/webauthn/credentials');
      const hasCredentialForCurrentDevice = (data.credentials || []).some(
        (credential) => credential.device_id === currentDeviceId
      );
      setShowBiometricPrompt(!hasCredentialForCurrentDevice);
    } catch {
      // If we cannot verify server records, preserve prior behavior as a fallback.
      const existingCred = await getStoredCredentialId().catch(() => null);
      setShowBiometricPrompt(!existingCred);
    }
  };

  const loginWithBiometric = async (username) => {
    await authenticateBiometric(username);
    setSessionExpired(false);
    await refreshSession();
  };

  const requestSignupOtp = async (username, password) => {
    await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  };

  const verifySignupOtp = async (username, otp) => {
    await apiRequest('/auth/register/verify', {
      method: 'POST',
      body: JSON.stringify({ username, otp }),
    });
  };

  const resendSignupOtp = async (username) => {
    await apiRequest('/auth/register/resend-otp', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
  };

  const requestPasswordReset = async (username) => {
    await apiRequest('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
  };

  const resetPassword = async (username, otp, new_password) => {
    await apiRequest('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ username, otp, new_password }),
    });
  };

  const logout = async () => {
    // Clear biometric binding from IndexedDB on explicit logout
    await clearDeviceBinding().catch(() => {});
    await apiRequest('/auth/logout', { method: 'POST' });
    setSession({ authenticated: false, user: null, role: null });
    setProfile(null);
  };

  const updateProfile = async (payload) => {
    const data = await apiRequest('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    setProfile(data);
    return data;
  };

  const value = useMemo(
    () => ({
      session,
      profile,
      loading,
      login,
      loginWithBiometric,
      requestSignupOtp,
      verifySignupOtp,
      resendSignupOtp,
      requestPasswordReset,
      resetPassword,
      logout,
      refreshSession,
      refreshProfile,
      updateProfile,
      showBiometricPrompt,
      setShowBiometricPrompt,
      sessionExpired,
      clearSessionExpired: () => setSessionExpired(false),
    }),
    [session, profile, loading, refreshSession, refreshProfile, showBiometricPrompt, sessionExpired]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {showBiometricPrompt && session.authenticated && session.user && (
        <Suspense fallback={null}>
          <BiometricPromptLazy
            username={session.user}
            onDismiss={() => setShowBiometricPrompt(false)}
          />
        </Suspense>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
