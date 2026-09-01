import { ReactNode } from 'react';
import { ThemeProvider as MuiThemeProvider, CssBaseline } from '@mui/material';
import { useTheme } from './ThemeContext';
import { createFinTrackrTheme } from './muiTheme';

/**
 * Bridges FinTrackr's existing ThemeContext (light/dark/system) with MUI's
 * ThemeProvider. Must be rendered inside <ThemeProvider> from ThemeContext.jsx.
 *
 * CssBaseline is included for the enableColorScheme meta-tag benefit, but the
 * MuiCssBaseline body override in muiTheme.ts ensures base.css retains control
 * over background and color so existing styles are not affected.
 */
export function FinTrackrMuiThemeProvider({ children }: { children: ReactNode }) {
  const { effectiveTheme } = useTheme();
  const muiTheme = createFinTrackrTheme(effectiveTheme as 'light' | 'dark');

  return (
    <MuiThemeProvider theme={muiTheme}>
      <CssBaseline enableColorScheme />
      {children}
    </MuiThemeProvider>
  );
}
