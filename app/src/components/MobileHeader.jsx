import { useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const PAGE_TITLES = [
  { prefix: '/dashboard', title: 'Dashboard' },
  { prefix: '/report', title: 'Report' },
  { prefix: '/add-expense', title: 'Add Expense' },
  { prefix: '/insights', title: 'Insights' },
  { prefix: '/settings', title: 'Settings' },
];

function resolveTitle(pathname) {
  const match = PAGE_TITLES.find((entry) => pathname.startsWith(entry.prefix));
  return match ? match.title : 'FinTrackr';
}

export default function MobileHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const title = resolveTitle(location.pathname);
  const { session, profile } = useAuth();

  const initials = useMemo(() => {
    const firstName = profile?.first_name?.trim();
    const lastName = profile?.last_name?.trim();
    if (firstName && lastName) {
      return (firstName.charAt(0) + lastName.charAt(0)).toUpperCase();
    }
    if (firstName) {
      const fallback = session?.user || '';
      return (firstName.charAt(0) + fallback.charAt(0)).replace(/\s/g, '').toUpperCase().slice(0, 2) || 'U';
    }
    const emailCandidate = (session?.user || '').trim();
    if (emailCandidate.includes('@')) {
      const localPart = emailCandidate.split('@')[0] || '';
      const localChars = localPart.replace(/[^a-zA-Z]/g, '');
      return localChars.slice(0, 2).toUpperCase() || 'U';
    }
    return emailCandidate.slice(0, 2).toUpperCase() || 'U';
  }, [profile, session?.user]);

  return (
    <>
      <header className="mobile-header-proto" aria-label="Mobile page header">
        <div className="mobile-header-proto-inner">
          <Link to="/dashboard" className="mobile-header-proto-brand" aria-label="Go to dashboard">
            <img src="/assets/app_logo.png" alt="FinTrackr logo" className="mobile-header-proto-icon" />
            <img src="/assets/name_logo.svg" alt="FinTrackr" className="mobile-header-proto-wordmark" />
          </Link>
          <span className="mobile-header-proto-title">{title}</span>
          <button
            type="button"
            className="mobile-header-avatar-button"
            onClick={() => navigate('/settings')}
            aria-label="Go to settings"
          >
            <span aria-hidden="true">{initials}</span>
          </button>
        </div>
      </header>
    </>
  );
}