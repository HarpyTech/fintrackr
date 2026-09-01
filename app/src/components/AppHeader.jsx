import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Tooltip from '@mui/material/Tooltip';
import { useAuth } from '../auth/AuthContext';
import ThemeToggle from './ThemeToggle';
import ProfileEditModal from './ProfileEditModal';
import { resolvePageMeta } from '../lib/pageMeta';
import { resolveDisplayName, resolveInitials } from '../lib/userDisplay';

/**
 * The single application header for authenticated pages.
 *
 * Replaces TopNavigation (mounted separately by each page, desktop) and
 * MobileHeader (mounted by the layout, mobile). Those rendered the page title
 * in addition to the page's own <h1>, so every screen showed its title twice —
 * and Settings, which never called TopNavigation, had no desktop header at
 * all.
 *
 * This is mounted once by ProtectedLayout. It owns the <h1>, so each page has
 * exactly one, its text matches what is on screen, and pages get back the
 * ~68px their duplicate heading was using.
 *
 * One component rather than two hidden by breakpoint: CSS switches density at
 * 767px, which keeps the avatar menu behaviour identical at both sizes.
 */
export default function AppHeader() {
  const location = useLocation();
  const { session, profile } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const menuRef = useRef(null);

  const meta = resolvePageMeta(location.pathname);

  const displayName = useMemo(
    () => resolveDisplayName(profile, session?.user),
    [profile, session?.user],
  );
  const initials = useMemo(
    () => resolveInitials(profile, session?.user),
    [profile, session?.user],
  );

  // Close the menu on outside click or Escape.
  useEffect(() => {
    if (!isMenuOpen) return undefined;

    function handlePointerDown(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    }
    function handleEscape(event) {
      if (event.key === 'Escape') setIsMenuOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isMenuOpen]);

  // Route change should never leave a dropdown hanging open.
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/dashboard" className="app-header-brand" aria-label="Go to dashboard">
            <img
              src="/assets/app_logo.png"
              alt=""
              className="app-header-brand-icon"
              aria-hidden="true"
            />
            <img src="/assets/name_logo.svg" alt="FinTrackr" className="app-header-wordmark" />
          </Link>

          <div className="app-header-titles">
            {/* The page's only <h1>. */}
            <h1 className="app-header-title">{meta.title}</h1>
            {meta.subtitle ? (
              <p className="app-header-subtitle">{meta.subtitle}</p>
            ) : null}
          </div>

          <div className="app-header-menu" ref={menuRef}>
            <Tooltip title="Account menu" placement="bottom-end">
              <button
                type="button"
                className="app-header-avatar"
                onClick={() => setIsMenuOpen((open) => !open)}
                aria-expanded={isMenuOpen}
                aria-haspopup="menu"
                aria-label="Account menu"
              >
                <span aria-hidden="true">{initials}</span>
              </button>
            </Tooltip>

            {isMenuOpen ? (
              <div className="app-header-dropdown" role="menu">
                <div className="app-header-dropdown-user">
                  <span className="app-header-dropdown-name">{displayName}</span>
                  <span className="app-header-dropdown-email">{session?.user}</span>
                </div>
                <div className="app-header-dropdown-divider" />
                <div className="app-header-dropdown-theme">
                  <span className="app-header-dropdown-label">Theme</span>
                  <ThemeToggle />
                </div>
                <button
                  type="button"
                  className="app-header-dropdown-action"
                  role="menuitem"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsProfileModalOpen(true);
                  }}
                >
                  Edit Profile
                </button>
                <Link
                  to="/settings"
                  className="app-header-dropdown-action"
                  role="menuitem"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Settings
                </Link>
              </div>
            ) : null}
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
