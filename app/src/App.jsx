import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import ProtectedLayout from './layouts/ProtectedLayout';
import ThemeToggle from './components/ThemeToggle';
import AppLoader from './components/AppLoader';
import ErrorBoundary from './components/ErrorBoundary';
import LoginPage from './pages/LoginPage';
import { isSupportPageEnabled } from './lib/featureFlags';
import { isInstalledPwa } from './lib/deviceBinding';

/**
 * Routes are code-split so a visitor on a public page does not download the
 * authenticated screens — or Recharts, which the dashboard pulls in — before
 * first paint. LoginPage stays eager: an installed PWA redirects straight to
 * it on launch, so an extra chunk round-trip there is felt immediately.
 */
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ReportPage = lazy(() => import('./pages/ReportPage'));
const AddExpensePage = lazy(() => import('./pages/AddExpensePage'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const FeaturesPage = lazy(() => import('./pages/FeaturesPage'));
const InsightsPage = lazy(() => import('./pages/InsightsPage'));
const SupportPage = lazy(() => import('./pages/SupportPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage'));

function HomeRoute() {
  if (!isInstalledPwa()) {
    return <LandingPage />;
  }

  return <Navigate to="/login" replace />;
}

function ProtectedRoute({ children }) {
  const { session, loading } = useAuth();

  if (loading) {
    return <AppLoader label="Restoring your session…" full />;
  }

  if (!session.authenticated) {
    return <Navigate to="/login" replace />;
  }

  return <ProtectedLayout>{children}</ProtectedLayout>;
}

function AdminRoute({ children }) {
  const { session, loading } = useAuth();

  if (loading) {
    return <AppLoader label="Restoring your session…" full />;
  }

  if (!session.authenticated) {
    return <Navigate to="/login" replace />;
  }

  if (session.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <ProtectedLayout>{children}</ProtectedLayout>;
}

export default function App() {
  const location = useLocation();
  const floatingThemeRoutes = ['/', '/login', '/register', '/verify-email', '/features', '/forgot-password', '/reset-password'];
  if (isSupportPageEnabled) {
    floatingThemeRoutes.push('/support');
  }
  const showFloatingThemeToggle = floatingThemeRoutes.includes(location.pathname);

  return (
    <>
      {showFloatingThemeToggle ? <ThemeToggle floating /> : null}
      {/* Keyed on pathname so a crash on one route does not leave the
          boundary latched open when the user navigates elsewhere. */}
      <ErrorBoundary
        key={location.pathname}
        label={`route ${location.pathname}`}
        fallback={
          <div className="error-boundary-page">
            <div className="error-boundary" role="alert">
              <p className="error-boundary-title">This page could not be displayed</p>
              <p className="error-boundary-body">
                An unexpected error occurred while rendering this screen. Try reloading,
                or head back to your dashboard.
              </p>
              <a className="secondary-button error-boundary-retry" href="/dashboard">
                Go to Dashboard
              </a>
            </div>
          </div>
        }
      >
        <Suspense fallback={<AppLoader full />}>
          <Routes>
            <Route path="/" element={<HomeRoute />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/report"
              element={
                <ProtectedRoute>
                  <ReportPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/add-expense"
              element={
                <ProtectedRoute>
                  <AddExpensePage />
                </ProtectedRoute>
              }
            />
            <Route path="/features" element={<FeaturesPage />} />
            {isSupportPageEnabled ? <Route path="/support" element={<SupportPage />} /> : null}
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/insights"
              element={
                <ProtectedRoute>
                  <InsightsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <AdminRoute>
                  <AdminUsersPage />
                </AdminRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
