import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
              <input
                type="password"
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
          </div>
        </section>
      </div>
    </main>
  );
}
