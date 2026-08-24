import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthContext';
import App from './App';
import { ToastProvider } from './components/ToastProvider';
import { PwaProvider } from './pwa/PwaContext';
import { ThemeProvider } from './theme/ThemeContext';
import { FinTrackrMuiThemeProvider } from './theme/MuiThemeProvider';
import { createQueryClient } from './lib/queryClient';
import { ExpenseCacheSync } from './lib/ExpenseCacheSync';
import './styles.css';

const queryClient = createQueryClient();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
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
  </React.StrictMode>
);
