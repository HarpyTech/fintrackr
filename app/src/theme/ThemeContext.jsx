import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'fintrackr-theme';
const ThemeContext = createContext(null);

function isValidTheme(value) {
  return value === 'light' || value === 'dark' || value === 'system';
}

function getSystemTheme() {
  if (typeof window === 'undefined') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function getPreferredTheme() {
  if (typeof window === 'undefined') {
    return 'system';
  }

  const storedTheme = window.localStorage.getItem(STORAGE_KEY);
  if (isValidTheme(storedTheme)) {
    return storedTheme;
  }

  return 'system';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getPreferredTheme);
  const [effectiveTheme, setEffectiveTheme] = useState(() =>
    getPreferredTheme() === 'system' ? getSystemTheme() : getPreferredTheme()
  );

  useEffect(() => {
    function applyThemeSelection() {
      const resolvedTheme = theme === 'system' ? getSystemTheme() : theme;

      setEffectiveTheme(resolvedTheme);
      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.style.colorScheme = resolvedTheme;
      document.documentElement.dataset.themeSetting = theme;
      window.localStorage.setItem(STORAGE_KEY, theme);
    }

    applyThemeSelection();

    if (theme !== 'system') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => applyThemeSelection();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      isDark: effectiveTheme === 'dark',
      effectiveTheme,
      setTheme,
      toggleTheme: () => {
        setTheme((currentTheme) =>
          (currentTheme === 'dark' || (currentTheme === 'system' && effectiveTheme === 'dark'))
            ? 'light'
            : 'dark'
        );
      },
    }),
    [effectiveTheme, theme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }

  return context;
}