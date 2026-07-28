'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { STORAGE_KEY_THEME } from '@/i18n/config';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
  ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function apply(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Default matches the no-flash inline script (dark).
  const [theme, setThemeState] = useState<Theme>('dark');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY_THEME);
    } catch {
      /* ignore */
    }
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    const next: Theme =
      stored === 'light' || stored === 'dark' ? stored : prefersDark ? 'dark' : 'light';
    setThemeState(next);
    apply(next);
    setReady(true);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    apply(t);
    try {
      localStorage.setItem(STORAGE_KEY_THEME, t);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(
    () => { setTheme(theme === 'dark' ? 'light' : 'dark'); },
    [theme, setTheme],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, toggle, setTheme, ready }),
    [theme, toggle, setTheme, ready],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
