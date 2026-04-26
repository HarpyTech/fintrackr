import Sidebar from '../components/Sidebar';
import ExpenseChatWidget from '../components/ExpenseChatWidget';

/**
 * ProtectedLayout wraps all authenticated pages with:
 * - Desktop: collapsible left sidebar (sidebar-proto)
 * - Mobile: fixed bottom nav bar (sidebar-proto-mobile-nav)
 * - ExpenseChatWidget floating in bottom-right
 *
 * Pages inside this layout no longer need their own dashboard-header /
 * TopNavigation / Logout button — those are handled here.
 * Exception: DashboardPage, ReportPage, AddExpensePage, InsightsPage
 * currently render their own header; this layout sits around them without
 * conflict because the sidebar and bottom-nav are independent of the
 * per-page header area.
 */
export default function ProtectedLayout({ children }) {
  return (
    <div className="protected-layout">
      <Sidebar />
      <div className="protected-layout-main">
        {children}
      </div>
      <ExpenseChatWidget />
    </div>
  );
}
