import { createTheme, ThemeOptions } from '@mui/material/styles';

const sharedOptions: ThemeOptions = {
  typography: {
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontSize: 14,
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: { borderRadius: 10 }, // mirrors --radius-md
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 10, fontWeight: 600 },
        containedPrimary: {
          background: 'linear-gradient(120deg, #23408e, #162d71)',
          '&:hover': { background: 'linear-gradient(120deg, #162d71, #0f2260)' },
        },
      },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 6, fontWeight: 500 } },
    },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: 16 } }, // --radius-lg
    },
    MuiTextField: {
      defaultProps: { size: 'small', variant: 'outlined' },
    },
    MuiTooltip: {
      defaultProps: { arrow: true },
    },
    // Let base.css own the body background/color so the existing gradient
    // and CSS variable transitions remain active.
    MuiCssBaseline: {
      styleOverrides: {
        body: { background: 'unset', backgroundColor: 'unset', color: 'unset' },
      },
    },
  },
};

export function createFinTrackrTheme(mode: 'light' | 'dark') {
  return createTheme({
    ...sharedOptions,
    palette: {
      mode,
      primary: {
        main: '#23408e',    // --brand
        dark: '#162d71',    // --brand-strong
        light: '#edf3ff',   // --brand-soft
        contrastText: '#ffffff',
      },
      secondary: {
        main: '#2b8a3e',    // --teal
        contrastText: '#ffffff',
      },
      error: {
        main: mode === 'dark' ? '#ff8a9c' : '#b42339', // --danger
      },
      success: {
        main: mode === 'dark' ? '#4fd1a0' : '#0d6b4f', // --success
      },
      warning: {
        main: '#ff7a00',    // --warm
        contrastText: mode === 'dark' ? '#1a0e00' : '#ffffff',
      },
      text: {
        primary:   mode === 'dark' ? '#edf4ff' : '#12213d',  // --ink
        secondary: mode === 'dark' ? '#a8b6cf' : '#516079',  // --muted
        disabled:  mode === 'dark' ? '#a8b6cf' : '#516079',
      },
      divider: mode === 'dark' ? '#29354c' : '#dbe2f0',      // --line
      background: {
        default: mode === 'dark' ? '#0d1424' : '#f3f5fb',    // --mist
        paper:   mode === 'dark' ? '#121a2b' : '#ffffff',    // --surface
      },
    },
  });
}
