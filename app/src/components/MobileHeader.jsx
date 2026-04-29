import { Link, useLocation } from 'react-router-dom';

const PAGE_TITLES = [
  { prefix: '/dashboard', title: 'Dashboard' },
  { prefix: '/report', title: 'Report' },
  { prefix: '/add-expense', title: 'Add Expense' },
  { prefix: '/insights', title: 'Insights' },
];

function resolveTitle(pathname) {
  const match = PAGE_TITLES.find((entry) => pathname.startsWith(entry.prefix));
  return match ? match.title : 'FinTrackr';
}

export default function MobileHeader() {
  const location = useLocation();
  const title = resolveTitle(location.pathname);

  return (
    <header className="mobile-header-proto" aria-label="Mobile page header">
      <div className="mobile-header-proto-inner">
        <Link to="/dashboard" className="mobile-header-proto-brand" aria-label="Go to dashboard">
          <img src="/assets/app_logo.png" alt="FinTrackr logo" className="mobile-header-proto-icon" />
          <img src="/assets/name_logo.svg" alt="FinTrackr" className="mobile-header-proto-wordmark" />
        </Link>
        <span className="mobile-header-proto-title">{title}</span>
      </div>
    </header>
  );
}