import React, { lazy, ReactNode, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from './auth/AuthContext';
import ProtectedLayout from './layouts/ProtectedLayout';
import ThemeToggle from './components/ThemeToggle';
import AppLoader from './components/AppLoader';
import ErrorBoundary from './components/ErrorBoundary';
import RouteMeta from './components/RouteMeta';
import LoginPage from './pages/LoginPage';
import { isBillingEnabled, isAdminEnabled, isSupportPageEnabled } from './lib/featureFlags';
import { isInstalledPwa } from './lib/deviceBinding';

/**
 * Routes are code-split so a visitor on a public page does not download the
 * authenticated screens — or Recharts, which the dashboard pulls in — before
 * first paint. LoginPage stays eager: an installed PWA redirects straight to
 * it on launch, so an extra chunk round-trip there is felt immediately.
 *
 * lazyWithRetry catches failed chunk fetches (stale hashes after a deploy)
 * and reloads the page so the browser picks up the new HTML and fresh URLs,
 * instead of landing on the error-boundary screen.
 */
function lazyWithRetry<T extends React.ComponentType<unknown>>(
  importFn: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return lazy(() =>
    importFn().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      const isChunkError =
        (err instanceof Error && err.name === 'ChunkLoadError') ||
        /Loading chunk \d+ failed/.test(msg) ||
        /Failed to fetch dynamically imported module/.test(msg) ||
        /Importing a module script failed/.test(msg) ||
        /error loading dynamically imported module/i.test(msg);
      if (isChunkError) {
        window.location.reload();
      }
      throw err;
    }),
  );
}

const RegisterPage = lazyWithRetry(() => import('./pages/RegisterPage'));
const VerifyEmailPage = lazyWithRetry(() => import('./pages/VerifyEmailPage'));
const ForgotPasswordPage = lazyWithRetry(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazyWithRetry(() => import('./pages/ResetPasswordPage'));
const DashboardPage = lazyWithRetry(() => import('./pages/DashboardPage'));
const ReportPage = lazyWithRetry(() => import('./pages/ReportPage'));
const AddExpensePage = lazyWithRetry(() => import('./pages/AddExpensePage'));
const LandingPage = lazyWithRetry(() => import('./pages/LandingPage'));
const FeaturesPage = lazyWithRetry(() => import('./pages/FeaturesPage'));
const InsightsPage = lazyWithRetry(() => import('./pages/InsightsPage'));
const SupportPage = lazyWithRetry(() => import('./pages/SupportPage'));
const SettingsPage = lazyWithRetry(() => import('./pages/SettingsPage'));
const AdminUsersPage = lazyWithRetry(() => import('./pages/AdminUsersPage'));
const BillingPage = lazyWithRetry(() => import('./pages/BillingPage'));
const NotFoundPage = lazyWithRetry(() => import('./pages/NotFoundPage'));

function HomeRoute() {
  if (!isInstalledPwa()) {
    return <LandingPage />;
  }

  return <Navigate to="/login" replace />;
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return <AppLoader label="Restoring your session…" full />;
  }

  if (!session.authenticated) {
    return <Navigate to="/login" replace />;
  }

  return <ProtectedLayout>{children}</ProtectedLayout>;
}

function AdminRoute({ children }: { children: ReactNode }) {
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
      <RouteMeta />
      {showFloatingThemeToggle ? <ThemeToggle floating /> : null}
      {/* Resets on pathname change (without remounting — that would also
          tear down the AnimatePresence/Routes tree below and skip the exit
          transition) so a crash on one route does not leave the boundary
          latched open when the user navigates elsewhere. */}
      <ErrorBoundary
        resetKey={location.pathname}
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
          <AnimatePresence mode="wait" initial={false}>
            <Routes location={location} key={location.pathname}>
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
              {isBillingEnabled ? (
                <Route
                  path="/billing"
                  element={
                    <ProtectedRoute>
                      <BillingPage />
                    </ProtectedRoute>
                  }
                />
              ) : null}
              {isAdminEnabled ? (
                <Route
                  path="/admin/users"
                  element={
                    <AdminRoute>
                      <AdminUsersPage />
                    </AdminRoute>
                  }
                />
              ) : null}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </AnimatePresence>
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
