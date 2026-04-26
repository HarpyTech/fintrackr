import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function RegisterPage() {
  const { requestSignupOtp, verifySignupOtp } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '', confirmPassword: '' });
  const [otp, setOtp] = useState('');
  const [otpStep, setOtpStep] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleRequestOtp(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      await requestSignupOtp(form.username, form.password);
      setOtpStep(true);
      setMessage('Verification OTP sent to your email. Enter it below to activate your account.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyOtp(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);

    try {
      await verifySignupOtp(form.username, otp);
      navigate('/login');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-layout auth-layout-register">
      <div className="auth-login-shell">
        <div className="auth-register-brand" aria-label="FinTrackr brand">
          <div className="auth-register-brand-row">
            <div className="auth-login-brand-badge">
              <img src="/assets/app_logo.png" alt="FinTrackr icon" className="auth-login-brand-icon" />
            </div>
            <h1 className="auth-register-brand-title">FinTrackr</h1>
          </div>
          <p className="auth-login-kicker">Create your account</p>
        </div>

        <section className="auth-card auth-card-login">
          <h1 className="auth-login-title">
            {otpStep ? 'Verify your email' : 'Create your account'}
          </h1>
          <p className="auth-register-copy">
            {otpStep
              ? 'Enter the verification code sent to your inbox to complete account setup.'
              : 'Start tracking expenses and unlock monthly insights in a few steps.'}
          </p>

          {!otpStep ? (
            <form onSubmit={handleRequestOtp} className="stack-form">
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
                  minLength={8}
                  required
                  autoComplete="new-password"
                  placeholder="********"
                  value={form.password}
                  onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                />
                <span className="help-text">Minimum 8 characters.</span>
              </label>
              <label>
                Confirm Password
                <input
                  type="password"
                  minLength={8}
                  required
                  autoComplete="new-password"
                  placeholder="********"
                  value={form.confirmPassword}
                  onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                />
              </label>
              {message ? <p className="auth-inline-info" role="status" aria-live="polite">{message}</p> : null}
              {error ? <p className="error-text auth-inline-error" role="alert" aria-live="polite">{error}</p> : null}
              <button disabled={submitting} type="submit">
                {submitting ? 'Sending OTP...' : 'Send OTP'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="stack-form">
              <label>
                Email
                <input type="email" value={form.username} disabled />
              </label>
              <label>
                Verification Code
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  placeholder="Enter 6-digit code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                />
              </label>
              {message ? <p className="auth-inline-info" role="status" aria-live="polite">{message}</p> : null}
              {error ? <p className="error-text auth-inline-error" role="alert" aria-live="polite">{error}</p> : null}
              <button disabled={submitting} type="submit">
                {submitting ? 'Verifying OTP...' : 'Verify & Create Account'}
              </button>
            </form>
          )}

          <div className="auth-login-links">
            <Link to="/login">Already have an account? Sign in</Link>
            <Link to="/verify-email">Verify existing account</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
