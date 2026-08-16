/**
 * BiometricPrompt – shown after a successful email/password login
 * to invite the user to register a biometric credential on this device.
 *
 * Dismissed automatically if:
 *   • WebAuthn is not supported
 *   • user clicks "Not now"
 *   • registration succeeds
 */
import { useState } from 'react';
import { useWebAuthn } from '../hooks/useWebAuthn';
import { useFocusTrap } from '../hooks/useFocusTrap';

export default function BiometricPrompt({ username, onDismiss }) {
  const { isSupported, loading, registerBiometric } = useWebAuthn();
  const [status, setStatus] = useState('idle'); // 'idle' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

  // Called before the early return so hook order stays stable across renders.
  const dialogRef = useFocusTrap(isSupported, onDismiss);

  if (!isSupported) return null;

  async function handleEnable() {
    setStatus('idle');
    setErrorMsg('');
    try {
      await registerBiometric(username);
      setStatus('success');
      setTimeout(onDismiss, 1500);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message);
    }
  }

  return (
    <div className="biometric-prompt-overlay" role="presentation">
      <div
        ref={dialogRef}
        className="biometric-prompt-card"
        role="dialog"
        aria-modal="true"
        aria-label="Enable biometric login"
      >
        <div className="biometric-prompt-icon" aria-hidden="true">🔑</div>
        <h2 className="biometric-prompt-title">Enable biometric login?</h2>
        <p className="biometric-prompt-body">
          Use your fingerprint, face, or device PIN to sign in faster on this device.
        </p>

        {status === 'success' && (
          <p className="biometric-prompt-success" role="status">
            Biometric login enabled!
          </p>
        )}

        {status === 'error' && (
          <p className="biometric-prompt-error" role="alert">
            {errorMsg}
          </p>
        )}

        {status !== 'success' && (
          <div className="biometric-prompt-actions">
            <button
              className="biometric-prompt-enable"
              onClick={handleEnable}
              disabled={loading}
            >
              {loading ? 'Setting up…' : 'Enable biometric login'}
            </button>
            <button
              className="biometric-prompt-skip"
              onClick={onDismiss}
              disabled={loading}
            >
              Not now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
