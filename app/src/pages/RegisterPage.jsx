import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import PasswordInput from '../components/PasswordInput';

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
                <PasswordInput
                  minLength={8}
                  required
                  autoComplete="new-password"
                  placeholder="Min. 8 characters"
                  value={form.password}
                  onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                />
                <span className="help-text">Minimum 8 characters.</span>
              </label>
              <label>
                Confirm Password
                <PasswordInput
                  minLength={8}
                  required
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
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

          {!otpStep && (
            <>
              <div className="auth-divider">
                <span>or</span>
              </div>
              <a
                href="/api/v1/auth/google"
                className="btn-google-signin"
                aria-label="Sign up with Google"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                  <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>
                  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"/>
                </svg>
                Sign up with Google
              </a>
            </>
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
