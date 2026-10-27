import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isSupportPageEnabled } from '../lib/featureFlags';
import { SUPPORT_EMAIL } from '../lib/supportEmail';

export default function SiteFooter() {
  const { session, loading } = useAuth();
  const authenticated = !loading && session.authenticated;

  return (
    <footer className="site-footer">
      <nav className="site-footer-links" aria-label="Footer">
        {authenticated ? <Link to="/dashboard">Dashboard</Link> : <Link to="/">Home</Link>}
        <Link to="/features">Features</Link>
        {isSupportPageEnabled ? <Link to="/support">Support</Link> : null}
        {loading || authenticated ? null : <Link to="/login">Sign in</Link>}
        <a href={`mailto:${SUPPORT_EMAIL}`}>Contact</a>
      </nav>
      <p className="site-footer-copy">© {new Date().getFullYear()} FinTrackr. All rights reserved.</p>
    </footer>
  );
}
