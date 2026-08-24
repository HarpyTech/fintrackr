import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import AppLoader from '../components/AppLoader';
import PasswordInput from '../components/PasswordInput';
import { useWebAuthn } from '../hooks/useWebAuthn';
import { getBoundUsername, getStoredCredentialId, isInstalledPwa } from '../lib/deviceBinding';

export default function LoginPage() {
  const { session, login, loginWithBiometric, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkingBackgroundAuth, setCheckingBackgroundAuth] = useState(true);

  const { isSupported } = useWebAuthn();

  useEffect(() => {
    if (session.authenticated) {
      return;
    }

    let active = true;

    (async () => {
      if (!isInstalledPwa() || !isSupported) {
        if (active) {
          setCheckingBackgroundAuth(false);
        }
        return;
      }

      const [username, credentialId] = await Promise.all([
        getBoundUsername().catch(() => null),
        getStoredCredentialId().catch(() => null),
      ]);

      if (!active) {
        return;
      }

      if (!username || !credentialId) {
        setCheckingBackgroundAuth(false);
        return;
      }

      try {
        await loginWithBiometric(username);
        navigate('/dashboard', { replace: true });
      } catch (_) {
        // Fall through to the password form without exposing device-specific UI.
      } finally {
        if (active) {
          setCheckingBackgroundAuth(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [isSupported, loginWithBiometric, navigate, session.authenticated]);

  if (session.authenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  if (checkingBackgroundAuth) {
    return <AppLoader label="Signing you in…" full />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(form.username, form.password);
      navigate('/dashboard');
    } catch (err) {
      if ((err.message || '').toLowerCase().includes('email not verified')) {
        const encodedEmail = encodeURIComponent(form.username);
        navigate(`/verify-email?email=${encodedEmail}`);
        return;
      }
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-layout auth-layout-login">
      <div className="auth-login-shell">
        <div className="auth-login-brand" aria-label="FinTrackr brand">
          <div className="auth-login-brand-badge">
            <img src="/assets/app_logo.png" alt="FinTrackr icon" className="auth-login-brand-icon" />
          </div>
          <img
            src="/assets/name_logo.svg"
            alt="FinTrackr"
            className="auth-login-brand-wordmark"
          />
        </div>
        <p className="auth-login-kicker">Your smart expense tracking companion</p>
        <section className="auth-card auth-card-login">
          <h1 className="auth-login-title">Sign in</h1>
          {sessionExpired ? (
            <p className="session-expired-banner" role="status">
              <AlertTriangle size={16} aria-hidden="true" />
              Your session expired. Please sign in again to continue.
            </p>
          ) : null}
          <form onSubmit={handleSubmit} className="stack-form">
            <label>
              Email
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={form.username}
                onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
              />
            </label>
            <label>
              Password
              <PasswordInput
                required
                autoComplete="current-password"
                placeholder="********"
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              />
            </label>
            {error ? (
              <p className="error-text auth-inline-error" role="alert" aria-live="polite">{error}</p>
            ) : null}
            <button disabled={submitting} type="submit">
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
          <div className="auth-divider">
            <span>or</span>
          </div>
          <a
            href="/api/v1/auth/google"
            className="btn-google-signin"
            aria-label="Sign in with Google"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"/>
            </svg>
            Sign in with Google
          </a>
          <div className="auth-login-links">
            <Link to="/register">Create account</Link>
            <Link to="/verify-email">Verify account</Link>
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
