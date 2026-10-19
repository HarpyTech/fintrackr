import { Link } from 'react-router-dom';
import { isSupportPageEnabled } from '../lib/featureFlags';
import { SUPPORT_EMAIL } from '../lib/supportEmail';

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav className="site-footer-links" aria-label="Footer">
        <Link to="/">Home</Link>
        <Link to="/features">Features</Link>
        {isSupportPageEnabled ? <Link to="/support">Support</Link> : null}
        <Link to="/login">Sign in</Link>
        <a href={`mailto:${SUPPORT_EMAIL}`}>Contact</a>
      </nav>
      <p className="site-footer-copy">© {new Date().getFullYear()} FinTrackr. All rights reserved.</p>
    </footer>
  );
}
