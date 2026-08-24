import { useMemo, useState } from 'react';
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
  Users,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { isSupportPageEnabled } from '../lib/featureFlags';


export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { session, profile, logout } = useAuth();
  const isAdmin = session?.role === 'admin';

  const menuItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/insights', icon: MessageSquare, label: 'Insights' },
    { to: '/report', icon: FileText, label: 'Report' },
    { to: '/add-expense', icon: PlusCircle, label: 'Add Expense' },
    { to: '/settings', icon: Settings, label: 'Settings' },
    ...(isSupportPageEnabled ? [{ to: '/support', icon: HelpCircle, label: 'Support' }] : []),
    ...(isAdmin ? [{ to: '/admin/users', icon: Users, label: 'Admin' }] : []),
  ];

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
          {menuItems.map(({ to, icon: Icon, label }) => (
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

        {/* Footer: profile link + logout */}
        <div className="sidebar-proto-footer">
          <div className="sidebar-proto-profile">
            <NavLink
              to="/settings"
              className="sidebar-proto-profile-trigger"
              title={isCollapsed ? 'Settings' : undefined}
              aria-label={isCollapsed ? 'Go to settings' : undefined}
            >
              <span className="sidebar-proto-avatar" aria-hidden="true">{initials}</span>
              <div className="sidebar-proto-profile-info">
                <span className="sidebar-proto-profile-name">{displayName}</span>
                <span className="sidebar-proto-profile-email">{session?.user}</span>
              </div>
            </NavLink>
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
        {menuItems.map(({ to, icon: Icon, label }) => (
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
      </nav>
    </>
  );
}

