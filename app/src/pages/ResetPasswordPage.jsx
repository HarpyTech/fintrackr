import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import PasswordInput from '../components/PasswordInput';

const STEP_FORM = 'form';
const STEP_DONE = 'done';

export default function ResetPasswordPage() {
  const { requestPasswordReset, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialEmail = useMemo(() => searchParams.get('email') || '', [searchParams]);

  const [step, setStep] = useState(STEP_FORM);
  const [email] = useState(initialEmail);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  async function handleResetPassword(event) {
    event.preventDefault();
    setError('');

    if (!otp) {
      setError('Please enter the OTP code sent to your email.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(email, otp, newPassword);
      setStep(STEP_DONE);
    } catch (err) {
      const msg = err.message || 'Something went wrong. Please try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (!email) return;
    setError('');
    setMessage('');
    setResending(true);
    try {
      await requestPasswordReset(email);
      setOtp('');
      setMessage('A new reset code has been sent to your email.');
    } catch (err) {
      setError(err.message || 'Failed to resend code. Please try again.');
    } finally {
      setResending(false);
    }
  }

  if (step === STEP_DONE) {
    return (
      <main className="auth-layout auth-layout-login">
        <div className="auth-login-shell">
          <div className="auth-login-brand" aria-label="FinTrackr brand">
            <div className="auth-login-brand-badge">
              <img src="/assets/app_logo.png" alt="FinTrackr icon" className="auth-login-brand-icon" />
            </div>
            <img src="/assets/name_logo.svg" alt="FinTrackr" className="auth-login-brand-wordmark" />
          </div>
          <p className="auth-login-kicker">Your smart expense tracking companion</p>
          <section className="auth-card auth-card-login">
            <h1 className="auth-login-title">Password reset</h1>
            <p className="auth-register-copy" style={{ textAlign: 'center' }}>
              Your password has been updated successfully.
            </p>
            <div className="auth-login-links" style={{ marginTop: '20px' }}>
              <Link to="/login">
                <button type="button" style={{ width: '100%' }}>Back to sign in</button>
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
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
          <p className="auth-login-kicker">Set your new password</p>
        </div>

        <section className="auth-card auth-card-login">
          <h1 className="auth-login-title">Reset password</h1>
          <p className="auth-register-copy">
            Enter the OTP sent to your email along with your new password.
          </p>
          <form onSubmit={handleResetPassword} className="stack-form">
            <label>
              Email
              <input
                type="email"
                readOnly
                autoComplete="email"
                value={email}
                style={{ opacity: 0.7, cursor: 'default' }}
              />
            </label>
            <label>
              New Password
              <PasswordInput
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
            <label>
              Confirm Password
              <PasswordInput
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </label>
            <label>
              Reset Password OTP
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                placeholder="Enter 6-digit OTP"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              />
            </label>
            {error ? (
              <p className="error-text auth-inline-error" role="alert" aria-live="polite">{error}</p>
            ) : null}
            {message ? (
              <p className="auth-inline-info" role="status" aria-live="polite">{message}</p>
            ) : null}
            <button disabled={submitting} type="submit">
              {submitting ? 'Resetting password...' : 'Reset password'}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={resending}
              onClick={handleResend}
              style={{ marginTop: '4px' }}
            >
              {resending ? 'Resending...' : 'Resend OTP'}
            </button>
          </form>
          <div className="auth-login-links">
            <Link to="/forgot-password">Change email</Link>
            <Link to="/login">Back to sign in</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
