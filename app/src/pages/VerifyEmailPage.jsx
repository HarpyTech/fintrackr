import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function VerifyEmailPage() {
  const { verifySignupOtp, resendSignupOtp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialEmail = useMemo(() => searchParams.get('email') || '', [searchParams]);

  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  async function handleVerify(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!email || !otp) {
      setError('Please enter both email and verification code');
      return;
    }

    setVerifying(true);

    try {
      await verifySignupOtp(email, otp);
      navigate('/login');
    } catch (err) {
      setError(err.message);
    } finally {
      setVerifying(false);
    }
  }

  async function handleResendOtp() {
    if (!email) {
      setError('Please enter your email first.');
      return;
    }

    setError('');
    setMessage('');
    setResending(true);

    try {
      await resendSignupOtp(email);
      setMessage('A new OTP has been sent to your email.');
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
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
          <p className="auth-login-kicker">Verify your email address</p>
        </div>

        <section className="auth-card auth-card-login">
          <h1 className="auth-login-title">Verify your account</h1>
          <p className="auth-register-copy">
            Enter the verification code sent to your email to activate your account and continue.
          </p>
          <form onSubmit={handleVerify} className="stack-form">
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
            <button disabled={verifying} type="submit">
              {verifying ? 'Verifying...' : 'Verify account'}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={resending}
              onClick={handleResendOtp}
            >
              {resending ? 'Resending OTP...' : 'Resend OTP'}
            </button>
          </form>
          <div className="auth-login-links">
            <Link to="/login">Back to sign in</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
