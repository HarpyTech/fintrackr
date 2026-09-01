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

interface Session {
  authenticated: boolean;
  user: string | null;
  role: string | null;
}

interface Profile {
  username: string;
  role: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  address?: string | null;
}

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

  const { authenticateBiometric } = useWebAuthn();

  const refreshProfile = useCallback(async (): Promise<Profile | null> => {
    if (!session.authenticated) {
      setProfile(null);
      return null;
    }
    try {
      const data = (await apiRequest('/users/me')) as Profile;
      setProfile(data);
      return data;
    } catch {
      setProfile(null);
      return null;
    }
  }, [session.authenticated]);

  const refreshSession = useCallback(async (): Promise<void> => {
    try {
      const data = (await apiRequest('/auth/session')) as Session;
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
        const data = (await apiRequest('/auth/session')) as Session;
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

  useEffect(() => {
    function handleUnauthorized() {
      if (!authenticatedRef.current) return;
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

  const login = async (username: string, password: string): Promise<void> => {
    await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setSessionExpired(false);
    await refreshSession();

    const currentDeviceId = await getOrCreateDeviceId().catch(() => null);
    if (!currentDeviceId) return;

    try {
      const data = (await apiRequest('/webauthn/credentials')) as { credentials: { device_id: string }[] };
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

  const logout = async (): Promise<void> => {
    await clearDeviceBinding().catch(() => {});
    await apiRequest('/auth/logout', { method: 'POST' });
    setSession({ authenticated: false, user: null, role: null });
    setProfile(null);
  };

  const updateProfile = async (payload: Partial<Profile>): Promise<Profile> => {
    const data = (await apiRequest('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })) as Profile;
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
