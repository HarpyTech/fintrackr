import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import ProtectedLayout from './layouts/ProtectedLayout';
import ThemeToggle from './components/ThemeToggle';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import DashboardPage from './pages/DashboardPage';
import ReportPage from './pages/ReportPage';
import AddExpensePage from './pages/AddExpensePage';
import LandingPage from './pages/LandingPage';
import FeaturesPage from './pages/FeaturesPage';
import InsightsPage from './pages/InsightsPage';
import SupportPage from './pages/SupportPage';
import SettingsPage from './pages/SettingsPage';
import { isSupportPageEnabled } from './lib/featureFlags';
import { isInstalledPwa } from './lib/deviceBinding';

function HomeRoute() {
  if (!isInstalledPwa()) {
    return <LandingPage />;
  }

  return <Navigate to="/login" replace />;
}

function ProtectedRoute({ children }) {
  const { session, loading } = useAuth();

  if (loading) {
    return <div className="page-shell"><p>Loading session...</p></div>;
  }

  if (!session.authenticated) {
    return <Navigate to="/login" replace />;
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
