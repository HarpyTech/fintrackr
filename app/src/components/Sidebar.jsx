import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  FileText,
  PlusCircle,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { isSupportPageEnabled } from '../lib/featureFlags';

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
  const { logout } = useAuth();

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

        {/* Logout */}
        <div className="sidebar-proto-footer">
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
          onClick={() => setIsCollapsed(prev => !prev)}
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
      </nav>
    </>
  );
}

