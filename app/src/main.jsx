import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthContext';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/ToastProvider';
import { PwaProvider } from './pwa/PwaContext';
import { ThemeProvider } from './theme/ThemeContext';
import { FinTrackrMuiThemeProvider } from './theme/MuiThemeProvider';
import { createQueryClient } from './lib/queryClient';
import { ExpenseCacheSync } from './lib/ExpenseCacheSync';
import './styles.css';

// Inter font — loaded here so it's available for both CSS vars and MUI theme
const interLink = document.createElement('link');
interLink.rel = 'stylesheet';
interLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
document.head.appendChild(interLink);

const queryClient = createQueryClient();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Last-resort net: catches errors thrown by the providers below (theme,
        PWA, auth, query client) before the router even mounts. The route-level
        boundary in App.jsx can't see these, since they render above it. No
        router or theme context can be assumed alive here, so the fallback
        reloads the page instead of navigating. */}
    <ErrorBoundary
      label="app root"
      fallback={
        <div className="error-boundary-page">
          <div className="error-boundary" role="alert">
            <p className="error-boundary-title">FinTrackr couldn&apos;t start</p>
            <p className="error-boundary-body">
              Something went wrong loading the app. Reloading usually fixes this.
            </p>
            <button
              type="button"
              className="secondary-button error-boundary-retry"
              onClick={() => window.location.reload()}
            >
              Reload app
            </button>
          </div>
        </div>
      }
    >
      <ThemeProvider>
        <FinTrackrMuiThemeProvider>
          <PwaProvider>
            {/* ToastProvider sits above AuthProvider so session-expiry warnings
                raised during auth bootstrap still have somewhere to render. */}
            <ToastProvider>
              <QueryClientProvider client={queryClient}>
                {/* Bridges the existing `expense:created` window event into cache
                    invalidation, so pages no longer refetch by hand. */}
                <ExpenseCacheSync />
                <BrowserRouter>
                  <AuthProvider>
                    <App />
                  </AuthProvider>
                </BrowserRouter>
              </QueryClientProvider>
            </ToastProvider>
          </PwaProvider>
        </FinTrackrMuiThemeProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
