import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState({ authenticated: false, user: null, role: null });
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    if (session.authenticated) {
      refreshProfile();
      return;
    }
    setProfile(null);
  }, [session.authenticated, refreshProfile]);

  const login = async (username, password) => {
    await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
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
      requestSignupOtp,
      verifySignupOtp,
      resendSignupOtp,
      requestPasswordReset,
      resetPassword,
      logout,
      refreshSession,
      refreshProfile,
      updateProfile,
    }),
    [session, profile, loading, refreshSession, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
