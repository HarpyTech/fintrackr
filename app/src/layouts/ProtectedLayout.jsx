import Sidebar from '../components/Sidebar';
import ExpenseChatWidget from '../components/ExpenseChatWidget';
import SettingsWidget from '../components/SettingsWidget';

/**
 * ProtectedLayout wraps all authenticated pages with:
 * - Desktop: collapsible left sidebar (sidebar-proto)
 * - Mobile: fixed bottom nav bar (sidebar-proto-mobile-nav)
 * - ExpenseChatWidget floating in bottom-right
 * - SettingsWidget floating near chat widget
 */
export default function ProtectedLayout({ children }) {
  return (
    <div className="protected-layout">
      <Sidebar />
      <div className="protected-layout-main">
        {children}
      </div>
      <ExpenseChatWidget />
      <SettingsWidget />
    </div>
  );
}
