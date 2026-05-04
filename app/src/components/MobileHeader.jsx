import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import ThemeToggle from './ThemeToggle';
import ProfileEditModal from './ProfileEditModal';

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
  const { session, profile } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const dropdownRef = useRef(null);

  const displayName = useMemo(() => {
    const firstName = profile?.first_name?.trim();
    const lastName = profile?.last_name?.trim();
    if (firstName || lastName) {
      return [firstName, lastName].filter(Boolean).join(' ');
    }
    return session?.user || 'User';
  }, [profile, session?.user]);

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

  useEffect(() => {
    function handlePointerDown(event) {
      if (isDropdownOpen && dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }
    function handleEscape(event) {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isDropdownOpen]);

  return (
    <>
      <header className="mobile-header-proto" aria-label="Mobile page header">
        <div className="mobile-header-proto-inner">
          <Link to="/dashboard" className="mobile-header-proto-brand" aria-label="Go to dashboard">
            <img src="/assets/app_logo.png" alt="FinTrackr logo" className="mobile-header-proto-icon" />
            <img src="/assets/name_logo.svg" alt="FinTrackr" className="mobile-header-proto-wordmark" />
          </Link>
          <span className="mobile-header-proto-title">{title}</span>
          <div className="mobile-header-avatar-menu" ref={dropdownRef}>
            <button
              type="button"
              className="mobile-header-avatar-button"
              onClick={() => setIsDropdownOpen((prev) => !prev)}
              aria-expanded={isDropdownOpen}
              aria-label="Profile menu"
            >
              <span aria-hidden="true">{initials}</span>
            </button>
            {isDropdownOpen && (
              <div className="header-avatar-dropdown header-avatar-dropdown--mobile" role="menu">
                <div className="header-avatar-dropdown-user">
                  <span className="header-avatar-dropdown-name">{displayName}</span>
                  <span className="header-avatar-dropdown-email">{session?.user}</span>
                </div>
                <div className="header-avatar-dropdown-divider" />
                <div className="header-avatar-dropdown-theme">
                  <span className="header-avatar-dropdown-label">Theme</span>
                  <ThemeToggle />
                </div>
                <button
                  type="button"
                  className="header-avatar-dropdown-action"
                  onClick={() => {
                    setIsDropdownOpen(false);
                    setIsProfileModalOpen(true);
                  }}
                >
                  Edit Profile
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <ProfileEditModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />
    </>
  );
}