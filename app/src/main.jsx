import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import App from './App';
import { ToastProvider } from './components/ToastProvider';
import { PwaProvider } from './pwa/PwaContext';
import { ThemeProvider } from './theme/ThemeContext';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <PwaProvider>
        {/* ToastProvider sits above AuthProvider so session-expiry warnings
            raised during auth bootstrap still have somewhere to render. */}
        <ToastProvider>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </ToastProvider>
      </PwaProvider>
    </ThemeProvider>
  </React.StrictMode>
);
