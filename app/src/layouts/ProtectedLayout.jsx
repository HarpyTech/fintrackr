import Sidebar from '../components/Sidebar';
import AppHeader from '../components/AppHeader';
import ExpenseChatWidget from '../components/ExpenseChatWidget';

/**
 * ProtectedLayout wraps all authenticated pages with:
 * - Desktop: collapsible left sidebar (sidebar-proto) — includes profile/settings in footer
 * - Mobile: fixed bottom nav bar (sidebar-proto-mobile-nav)
 * - AppHeader at both sizes: brand, page title, account menu
 * - ExpenseChatWidget floating in bottom-right
 *
 * The header is mounted here rather than by each page, so every route gets one
 * consistently (Settings previously had none on desktop) and the page title is
 * declared in exactly one place — see lib/pageMeta.js.
 */
export default function ProtectedLayout({ children }) {
  return (
    <div className="protected-layout">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Sidebar />
      <div className="protected-layout-main">
        <AppHeader />
        <div id="main-content" className="protected-layout-content">
          {children}
        </div>
      </div>
      <ExpenseChatWidget />
    </div>
  );
}
