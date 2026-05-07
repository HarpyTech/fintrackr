import Sidebar from '../components/Sidebar';
import MobileHeader from '../components/MobileHeader';
import ExpenseChatWidget from '../components/ExpenseChatWidget';

/**
 * ProtectedLayout wraps all authenticated pages with:
 * - Desktop: collapsible left sidebar (sidebar-proto) — includes profile/settings in footer
 * - Mobile: fixed bottom nav bar (sidebar-proto-mobile-nav) + MobileHeader with avatar
 * - ExpenseChatWidget floating in bottom-right
 */
export default function ProtectedLayout({ children }) {
  return (
    <div className="protected-layout">
      <Sidebar />
      <div className="protected-layout-main">
        <MobileHeader />
        <div className="protected-layout-content">
          {children}
        </div>
      </div>
      <ExpenseChatWidget />
    </div>
  );
}
