import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import PasswordInput from '../components/PasswordInput';

const STEP_OTP = 'otp';
const STEP_PASSWORD = 'password';
const STEP_DONE = 'done';

export default function ResetPasswordPage() {
  const { requestPasswordReset, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialEmail = useMemo(() => searchParams.get('email') || '', [searchParams]);

  const [step, setStep] = useState(STEP_OTP);
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  async function handleVerifyOtp(event) {
    event.preventDefault();
    setError('');
    if (!email || !otp) {
      setError('Please enter both your email and the OTP code.');
      return;
    }
    // Advance to password step — actual OTP verification happens on final submit
    setStep(STEP_PASSWORD);
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    setError('');

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
      // If OTP-related error, go back to the OTP step
      if (msg.toLowerCase().includes('otp') || msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('expired')) {
        setStep(STEP_OTP);
        setOtp('');
      }
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (!email) {
      setError('Please enter your email address first.');
      return;
    }
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
          <p className="auth-login-kicker">
            {step === STEP_OTP ? 'Enter the code sent to your email' : 'Set your new password'}
          </p>
        </div>

        <section className="auth-card auth-card-login">
          {step === STEP_OTP ? (
            <>
              <h1 className="auth-login-title">Verify reset code</h1>
              <p className="auth-register-copy">
                Enter the 6-digit code we sent to your email address to continue.
              </p>
              <form onSubmit={handleVerifyOtp} className="stack-form">
                <label>
                  Email
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label>
                  Reset Code
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
                {error ? (
                  <p className="error-text auth-inline-error" role="alert" aria-live="polite">{error}</p>
                ) : null}
                {message ? (
                  <p className="auth-inline-info" role="status" aria-live="polite">{message}</p>
                ) : null}
                <button type="submit" disabled={!otp || !email}>
                  Continue
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={resending}
                  onClick={handleResend}
                  style={{ marginTop: '4px' }}
                >
                  {resending ? 'Resending...' : 'Resend code'}
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="auth-login-title">New password</h1>
              <p className="auth-register-copy">
                Choose a strong password for your account.
              </p>
              <form onSubmit={handleResetPassword} className="stack-form">
                <label>
                  New password
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
                  Confirm new password
                  <PasswordInput
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </label>
                {error ? (
                  <p className="error-text auth-inline-error" role="alert" aria-live="polite">{error}</p>
                ) : null}
                <button disabled={submitting} type="submit">
                  {submitting ? 'Resetting password...' : 'Reset password'}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => { setStep(STEP_OTP); setError(''); }}
                  style={{ marginTop: '4px' }}
                >
                  Back
                </button>
              </form>
            </>
          )}
          <div className="auth-login-links">
            <Link to="/login">Back to sign in</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
