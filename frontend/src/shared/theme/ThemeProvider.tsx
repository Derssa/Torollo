import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import {
  readThemePreference,
  resolveTheme,
  THEME_MEDIA_QUERY,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from './theme';
import { ThemeContext, type ThemeContextValue } from './themeContext';

interface ThemeProviderProps {
  children: ReactNode;
}

function getSystemPrefersDark() {
  return window.matchMedia(THEME_MEDIA_QUERY).matches;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [preference, setPreference] = useState<ThemePreference>(() =>
    readThemePreference(window.localStorage)
  );
  const [systemPrefersDark, setSystemPrefersDark] = useState(getSystemPrefersDark);

  const resolvedTheme = resolveTheme(preference, systemPrefersDark);
  const setThemePreference = useCallback((nextPreference: ThemePreference) => {
    if (nextPreference === 'system') {
      setSystemPrefersDark(getSystemPrefersDark());
    }
    setPreference(nextPreference);
  }, []);

  useEffect(() => {
    if (preference !== 'system') return;

    const mediaQuery = window.matchMedia(THEME_MEDIA_QUERY);
    const handleChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);

    setSystemPrefersDark(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [preference]);

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Storage can be disabled; the in-memory preference still works for this session.
    }
  }, [preference]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolvedTheme, setThemePreference }),
    [preference, resolvedTheme, setThemePreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
