import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { notifyError } from '../lib/notify';

export default function PublicHeader() {
  const { session, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  const authenticated = !loading && session.authenticated;

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      navigate('/', { replace: true });
    } catch {
      notifyError('Unable to log out. Please try again.');
      setLoggingOut(false);
    }
  }

  return (
    <header className="features-proto-header">
      <div className="features-proto-header-inner">
        <Link
          to={authenticated ? '/dashboard' : '/'}
          className="features-proto-brand"
          aria-label={authenticated ? 'FinTrackr dashboard' : 'FinTrackr home'}
        >
          <img src="/assets/name_logo.svg" alt="FinTrackr" className="features-proto-brand-logo" />
        </Link>
        {/* Nothing renders until the session resolves, so Sign In never flashes for a logged-in user. */}
        {loading ? null : authenticated ? (
          <button
            type="button"
            className="features-proto-signin"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? 'Logging out…' : 'Logout'}
          </button>
        ) : (
          <Link to="/login" className="features-proto-signin">Sign In</Link>
        )}
      </div>
    </header>
  );
}
