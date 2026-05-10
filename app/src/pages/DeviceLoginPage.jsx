import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useWebAuthn } from '../hooks/useWebAuthn';
import { getBoundUsername, getStoredCredentialId, isInstalledPwa } from '../lib/deviceBinding';

export default function DeviceLoginPage() {
  const { session, loginWithBiometric } = useAuth();
  const navigate = useNavigate();
  const { isSupported } = useWebAuthn();
  const [boundUsername, setBoundUsername] = useState(null);
  const [loadingBinding, setLoadingBinding] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    (async () => {
      if (!isInstalledPwa()) {
        if (active) {
          setLoadingBinding(false);
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
        setLoadingBinding(false);
        return;
      }

      setBoundUsername(username);
      setLoadingBinding(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  async function handleDeviceLogin() {
    if (!boundUsername) {
      return;
    }

    setAuthenticating(true);
    setError('');
    try {
      await loginWithBiometric(boundUsername);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Device login failed. Use email and password instead.');
    } finally {
      setAuthenticating(false);
    }
  }

  if (session.authenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  if (loadingBinding) {
    return <div className="page-shell"><p>Loading device sign-in...</p></div>;
  }

  if (!isSupported || !boundUsername) {
    return <Navigate to="/login" replace />;
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
        <p className="auth-login-kicker">Unlock with this device</p>
        <section className="auth-card auth-card-login">
          <h1 className="auth-login-title">Device sign-in</h1>
          <p className="help-text" style={{ marginBottom: '1rem' }}>
            Sign in using the device that was previously registered for {boundUsername}.
          </p>

          <button
            type="button"
            className="biometric-login-btn"
            onClick={handleDeviceLogin}
            disabled={authenticating}
          >
            <span aria-hidden="true">🔑</span>
            {authenticating ? 'Authenticating…' : 'Continue with this device'}
          </button>

          {error ? (
            <p className="error-text auth-inline-error" role="alert" aria-live="polite">
              {error}
            </p>
          ) : null}

          <div className="auth-login-links">
            <Link to="/login">Use email and password instead</Link>
          </div>
        </section>
      </div>
    </main>
  );
}