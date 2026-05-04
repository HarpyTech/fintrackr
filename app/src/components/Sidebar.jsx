import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  FileText,
  PlusCircle,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Settings,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { isSupportPageEnabled } from '../lib/featureFlags';
import ThemeToggle from './ThemeToggle';
import ProfileEditModal from './ProfileEditModal';

const MENU_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/insights', icon: MessageSquare, label: 'Insights' },
  { to: '/report', icon: FileText, label: 'Report' },
  { to: '/add-expense', icon: PlusCircle, label: 'Add Expense' },
  ...(isSupportPageEnabled
    ? [{ to: '/support', icon: HelpCircle, label: 'Support' }]
    : []),
];

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const settingsRef = useRef(null);
  const { session, profile, logout } = useAuth();

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
      if (isSettingsOpen && settingsRef.current && !settingsRef.current.contains(event.target)) {
        setIsSettingsOpen(false);
      }
    }
    function handleEscape(event) {
      if (event.key === 'Escape') {
        setIsSettingsOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isSettingsOpen]);

  async function handleLogout() {
    await logout();
  }

  const sidebarClass = `sidebar-proto${isCollapsed ? ' collapsed' : ' expanded'}`;

  return (
    <>
      {/* Desktop sidebar */}
      <aside className={sidebarClass} aria-label="Main navigation">
        {/* Logo */}
        <div className="sidebar-proto-logo">
          <img src="/assets/app_logo.png" alt="App Logo" className="sidebar-proto-logo-icon" style={{ padding: '0', background: 'transparent' }} />
          <img
            src="/assets/name_logo.svg"
            alt="FinTrackr"
            className="sidebar-proto-logo-img"
          />
        </div>

        {/* Navigation links */}
        <nav className="sidebar-proto-nav">
          {MENU_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `sidebar-proto-link${isActive ? ' active' : ''}`
              }
              title={isCollapsed ? label : undefined}
            >
              <Icon size={20} className="sidebar-proto-link-icon" />
              <span className="sidebar-proto-link-label">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer: profile + settings + logout */}
        <div className="sidebar-proto-footer">
          {/* Profile / Settings section */}
          <div className="sidebar-proto-profile" ref={settingsRef}>
            <button
              type="button"
              className="sidebar-proto-profile-trigger"
              onClick={() => setIsSettingsOpen((prev) => !prev)}
              aria-expanded={isSettingsOpen}
              title={isCollapsed ? 'Settings' : undefined}
              aria-label={isCollapsed ? 'Settings' : 'Settings and profile'}
            >
              <span className="sidebar-proto-avatar" aria-hidden="true">{initials}</span>
              <div className="sidebar-proto-profile-info">
                <span className="sidebar-proto-profile-name">{displayName}</span>
                <span className="sidebar-proto-profile-email">{session?.user}</span>
              </div>
              <Settings size={15} className="sidebar-proto-settings-icon" />
            </button>
            {isSettingsOpen && (
              <div className="sidebar-proto-settings-panel">
                <ThemeToggle />
                <button
                  type="button"
                  className="sidebar-proto-settings-edit"
                  onClick={() => {
                    setIsProfileModalOpen(true);
                    setIsSettingsOpen(false);
                  }}
                >
                  Edit Profile
                </button>
              </div>
            )}
          </div>

          {/* Logout */}
          <button
            type="button"
            className="sidebar-proto-logout"
            onClick={handleLogout}
            title={isCollapsed ? 'Logout' : undefined}
          >
            <LogOut size={20} className="sidebar-proto-link-icon" />
            <span className="sidebar-proto-link-label">Logout</span>
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          type="button"
          className="sidebar-proto-toggle"
          onClick={() => setIsCollapsed((prev) => !prev)}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </aside>

      {/* Mobile bottom navigation */}
      <nav className="sidebar-proto-mobile-nav" aria-label="Mobile navigation">
        {MENU_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `sidebar-proto-mobile-link${isActive ? ' active' : ''}`
            }
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className="sidebar-proto-mobile-logout"
          onClick={handleLogout}
          aria-label="Logout"
        >
          <LogOut size={20} />
          <span>Logout</span>
        </button>
      </nav>

      {/* Profile edit modal */}
      <ProfileEditModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />
    </>
  );
}

