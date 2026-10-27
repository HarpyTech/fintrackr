import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';
import { clearOfflineQueue, requestBackgroundSync } from '../pwa/offlineQueue';
import { setPreferredTimezone } from '../lib/timezone';
import { UNAUTHORIZED_EVENT, notifyWarning } from '../lib/notify';
import { useWebAuthn } from '../hooks/useWebAuthn';
import {
  getBoundUsername,
  getOrCreateDeviceId,
  getStoredCredentialId,
  clearDeviceBinding,
  isInstalledPwa,
} from '../lib/deviceBinding';
import type { Session, UserProfile, WebAuthnCredentialSummary } from '../types';

const BiometricPromptLazy = lazy(() => import('../components/BiometricPrompt'));

type Profile = UserProfile;

interface AuthContextValue {
  session: Session;
  profile: Profile | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  loginWithBiometric: (username: string) => Promise<void>;
  requestSignupOtp: (username: string, password: string) => Promise<void>;
  verifySignupOtp: (username: string, otp: string) => Promise<void>;
  resendSignupOtp: (username: string) => Promise<void>;
  requestPasswordReset: (username: string) => Promise<void>;
  resetPassword: (username: string, otp: string, new_password: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: (confirmUsername: string, password?: string) => Promise<void>;
  refreshSession: () => Promise<void>;
  refreshProfile: () => Promise<Profile | null>;
  updateProfile: (payload: Partial<Profile>) => Promise<Profile>;
  showBiometricPrompt: boolean;
  setShowBiometricPrompt: (show: boolean) => void;
  sessionExpired: boolean;
  clearSessionExpired: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ authenticated: false, user: null, role: null });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const authenticatedRef = useRef(false);
  const queryClient = useQueryClient();

  const { authenticateBiometric } = useWebAuthn();

  const refreshProfile = useCallback(async (): Promise<Profile | null> => {
    if (!session.authenticated) {
      setProfile(null);
      return null;
    }
    try {
      const data = await apiRequest<Profile>('/users/me');
      setProfile(data);
      return data;
    } catch {
      setProfile(null);
      return null;
    }
  }, [session.authenticated]);

  const refreshSession = useCallback(async (): Promise<void> => {
    try {
      const data = await apiRequest<Session>('/auth/session');
      setSession(data);
    } catch {
      setSession({ authenticated: false, user: null, role: null });
    } finally {
      setLoading(false);
    }
  }, []);

  const tryAutoLogin = useCallback(async (): Promise<boolean> => {
    if (!isInstalledPwa()) return false;

    const boundUsername = await getBoundUsername().catch(() => null);
    const credentialId = await getStoredCredentialId().catch(() => null);
    if (!boundUsername || !credentialId) return false;

    try {
      await apiRequest('/auth/refresh', { method: 'POST' });
      await refreshSession();
      return true;
    } catch {
      return false;
    }
  }, [refreshSession]);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiRequest<Session>('/auth/session');
        setSession(data);
        setLoading(false);
        return;
      } catch {
        // no valid session – try auto-login
      }

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

  // Every API call sends X-Timezone; keep it in step with the saved choice.
  useEffect(() => {
    setPreferredTimezone(profile?.timezone);
  }, [profile?.timezone]);

  // The session slides only when a request reaches the server. Someone filling
  // in a long form makes no requests, so ping /auth/session (at most every
  // five minutes) while they are interacting to keep the cookie fresh.
  useEffect(() => {
    if (!session.authenticated) return undefined;
    const KEEPALIVE_MS = 5 * 60 * 1000;
    let lastPing = Date.now();

    function onActivity() {
      if (Date.now() - lastPing < KEEPALIVE_MS) return;
      lastPing = Date.now();
      apiRequest('/auth/session').catch(() => {});
    }

    window.addEventListener('pointerdown', onActivity);
    window.addEventListener('keydown', onActivity);
    return () => {
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
    };
  }, [session.authenticated]);

  useEffect(() => {
    function handleUnauthorized() {
      if (!authenticatedRef.current) return;
      authenticatedRef.current = false;
      queryClient.clear();
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
  }, [queryClient]);

  const login = async (username: string, password: string): Promise<void> => {
    await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setSessionExpired(false);
    await refreshSession();
    // Replay anything queued while signed out or offline.
    requestBackgroundSync().catch(() => {});

    const currentDeviceId = await getOrCreateDeviceId().catch(() => null);
    if (!currentDeviceId) return;

    try {
      const data = await apiRequest<{ credentials: WebAuthnCredentialSummary[] }>('/webauthn/credentials');
      const hasCredentialForCurrentDevice = (data.credentials || []).some(
        (credential) => credential.device_id === currentDeviceId,
      );
      setShowBiometricPrompt(!hasCredentialForCurrentDevice);
    } catch {
      const existingCred = await getStoredCredentialId().catch(() => null);
      setShowBiometricPrompt(!existingCred);
    }
  };

  const loginWithBiometric = async (username: string): Promise<void> => {
    await authenticateBiometric(username);
    setSessionExpired(false);
    await refreshSession();
  };

  const requestSignupOtp = async (username: string, password: string): Promise<void> => {
    await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  };

  const verifySignupOtp = async (username: string, otp: string): Promise<void> => {
    await apiRequest('/auth/register/verify', {
      method: 'POST',
      body: JSON.stringify({ username, otp }),
    });
  };

  const resendSignupOtp = async (username: string): Promise<void> => {
    await apiRequest('/auth/register/resend-otp', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
  };

  const requestPasswordReset = async (username: string): Promise<void> => {
    await apiRequest('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
  };

  const resetPassword = async (
    username: string,
    otp: string,
    new_password: string,
  ): Promise<void> => {
    await apiRequest('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ username, otp, new_password }),
    });
  };

  /** Drop everything the previous user loaded from this device. */
  const clearLocalUserState = async (): Promise<void> => {
    queryClient.clear();
    await clearOfflineQueue().catch(() => {});
    setPreferredTimezone(null);
    setSession({ authenticated: false, user: null, role: null });
    setProfile(null);
  };

  const logout = async (): Promise<void> => {
    await clearDeviceBinding().catch(() => {});
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } finally {
      // Clear even if the server call failed.
      await clearLocalUserState();
    }
  };

  const deleteAccount = async (confirmUsername: string, password?: string): Promise<void> => {
    await apiRequest('/users/me/delete', {
      method: 'POST',
      body: JSON.stringify({ confirm_username: confirmUsername, password: password || null }),
    });
    await clearDeviceBinding().catch(() => {});
    await clearLocalUserState();
  };

  const updateProfile = async (payload: Partial<Profile>): Promise<Profile> => {
    const data = await apiRequest<Profile>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    setProfile(data);
    return data;
  };

  const value = useMemo<AuthContextValue>(
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
      deleteAccount,
      refreshSession,
      refreshProfile,
      updateProfile,
      showBiometricPrompt,
      setShowBiometricPrompt,
      sessionExpired,
      clearSessionExpired: () => setSessionExpired(false),
    }),
    [session, profile, loading, refreshSession, refreshProfile, showBiometricPrompt, sessionExpired],
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

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
