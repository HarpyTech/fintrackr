import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import SiteFooter from '../components/SiteFooter';

export default function NotFoundPage() {
  const { pathname } = useLocation();
  const { session } = useAuth();
  const signedIn = Boolean(session?.authenticated);

  useEffect(() => {
    document.title = 'Page not found · FinTrackr';
  }, []);

  return (
    <div className="not-found-page">
      <main className="not-found-main">
        <Link to="/" className="not-found-brand" aria-label="FinTrackr home">
          <img src="/assets/app_logo.png" alt="" width="40" height="40" />
          <img src="/assets/name_logo.svg" alt="FinTrackr" height="24" />
        </Link>
        <p className="not-found-code">404</p>
        <h1 className="not-found-title">Page not found</h1>
        <p className="not-found-body">
          We couldn’t find <code className="not-found-path">{pathname}</code>. It may have moved or never existed.
        </p>
        <Link to={signedIn ? '/dashboard' : '/'} className="auth-link-button">
          {signedIn ? 'Go to Dashboard' : 'Go home'}
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
