import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
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
  CreditCard,
  Menu,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { isBillingAdminEnabled, isSupportPageEnabled } from '../lib/featureFlags';
import { resolveDisplayName, resolveInitials } from '../lib/userDisplay';


const PLAN_BADGE_LABELS = { go: 'Go', max: 'Max' };

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const drawerRef = useRef(null);
  const location = useLocation();
  const { session, profile, logout } = useAuth();
  const isAdmin = session?.role === 'admin';
  const plan = profile?.plan || 'free';
  const planBadge = PLAN_BADGE_LABELS[plan] || null;

  const menuItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/insights', icon: MessageSquare, label: 'Insights' },
    { to: '/report', icon: FileText, label: 'Report' },
    { to: '/add-expense', icon: PlusCircle, label: 'Add Expense' },
    { to: '/settings', icon: Settings, label: 'Settings' },
    ...(isBillingAdminEnabled && plan !== 'max' ? [{ to: '/billing', icon: CreditCard, label: 'Billing' }] : []),
    ...(isSupportPageEnabled ? [{ to: '/support', icon: HelpCircle, label: 'Support' }] : []),
    ...(isBillingAdminEnabled && isAdmin ? [{ to: '/admin/users', icon: Users, label: 'Admin' }] : []),
  ];

  const PRIMARY_PATHS = ['/dashboard', '/insights', '/add-expense', '/report'];
  const primaryItems = menuItems.filter((m) => PRIMARY_PATHS.includes(m.to));
  const moreItems = menuItems.filter((m) => !PRIMARY_PATHS.includes(m.to));
  const moreActive = moreItems.some((m) => location.pathname.startsWith(m.to));

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!moreOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawerRef.current?.querySelector('a, button')?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  const displayName = resolveDisplayName(profile, session?.user);
  const initials = resolveInitials(profile, session?.user);

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  }

  const sidebarClass = `sidebar-proto${isCollapsed ? ' collapsed' : ' expanded'}`;

  return (
    <>
      {/* Desktop sidebar */}
      <aside className={sidebarClass} aria-label="Main navigation">
        {/* Logo */}
        <Link to="/dashboard" className="sidebar-proto-logo" aria-label="FinTrackr home">
          <img src="/assets/app_logo.png" alt="" className="sidebar-proto-logo-icon" style={{ padding: '0', background: 'transparent' }} />
          <img
            src="/assets/name_logo.svg"
            alt="FinTrackr"
            className="sidebar-proto-logo-img"
          />
        </Link>

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
              aria-label={isCollapsed ? label : undefined}
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
                <span className="sidebar-proto-profile-name">
                  {displayName}
                  {planBadge && (
                    <span className="sidebar-proto-plan-badge" aria-label={`Plan: ${planBadge}`}>
                      {planBadge}
                    </span>
                  )}
                </span>
                <span className="sidebar-proto-profile-email">{session?.user}</span>
              </div>
            </NavLink>
          </div>

          {/* Logout */}
          <button
            type="button"
            className="sidebar-proto-logout"
            onClick={handleLogout}
            disabled={isLoggingOut}
            title="Logout"
            aria-label="Logout"
          >
            <LogOut size={20} className="sidebar-proto-link-icon" />
            <span className="sidebar-proto-link-label">
              {isLoggingOut ? 'Logging out…' : 'Logout'}
            </span>
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
        {primaryItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            aria-label={label}
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
          className={`sidebar-proto-mobile-more${moreActive || moreOpen ? ' active' : ''}`}
          onClick={() => setMoreOpen((open) => !open)}
          aria-label="More"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
        >
          <Menu size={20} />
          <span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <>
          <div className="sidebar-proto-drawer-backdrop" onClick={() => setMoreOpen(false)} aria-hidden="true" />
          <div ref={drawerRef} className="sidebar-proto-drawer" role="dialog" aria-modal="true" aria-label="More navigation">
            {moreItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `sidebar-proto-drawer-link${isActive ? ' active' : ''}`}
              >
                <Icon size={20} />
                <span>{label}</span>
              </NavLink>
            ))}
            <button
              type="button"
              className="sidebar-proto-drawer-logout"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              <LogOut size={20} />
              <span>{isLoggingOut ? 'Logging out…' : 'Logout'}</span>
            </button>
          </div>
        </>
      )}
    </>
  );
}
