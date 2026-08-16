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
