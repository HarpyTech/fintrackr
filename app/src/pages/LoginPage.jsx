import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import PasswordInput from '../components/PasswordInput';
import { useWebAuthn } from '../hooks/useWebAuthn';
import { getBoundUsername, getStoredCredentialId, isInstalledPwa } from '../lib/deviceBinding';

export default function LoginPage() {
  const { login, loginWithBiometric } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { isSupported } = useWebAuthn();
  const [biometricUsername, setBiometricUsername] = useState(null);
  const [biometricLoading, setBiometricLoading] = useState(false);

  // Detect stored credential on mount
  useEffect(() => {
    if (!isSupported) return;
    (async () => {
      const [username, credentialId] = await Promise.all([
        getBoundUsername().catch(() => null),
        getStoredCredentialId().catch(() => null),
      ]);
      if (username && credentialId) {
        setBiometricUsername(username);
        // Pre-fill email so user can see which account is bound
        setForm((prev) => ({ ...prev, username }));
        // Auto-login silently if running as installed PWA
        if (isInstalledPwa()) {
          await handleBiometricLogin(username);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupported]);

  async function handleBiometricLogin(username) {
    setBiometricLoading(true);
    setError('');
    try {
      await loginWithBiometric(username);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Biometric login failed. Please use your password.');
    } finally {
      setBiometricLoading(false);
    }
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

          {/* Biometric shortcut – only shown if a credential is stored on this device */}
          {isSupported && biometricUsername && (
            <div className="biometric-login-section">
              <button
                type="button"
                className="biometric-login-btn"
                onClick={() => handleBiometricLogin(biometricUsername)}
                disabled={biometricLoading}
                aria-label={`Sign in as ${biometricUsername} with biometrics`}
              >
                <span aria-hidden="true">🔑</span>
                {biometricLoading ? 'Authenticating…' : `Sign in as ${biometricUsername}`}
              </button>
              <p className="biometric-login-hint">Uses fingerprint, face, or device PIN</p>
            </div>
          )}

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
