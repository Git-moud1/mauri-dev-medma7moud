'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { STORAGE_KEY_THEME } from '@/i18n/config';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function apply(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  /**
   * B4. The state starts from the class the no-flash script has already written
   * onto <html>, not from a hardcoded 'dark'.
   *
   * The old version guessed 'dark', then corrected itself from storage in an
   * effect. For a visitor who had chosen light that produced a first client
   * render disagreeing with the DOM — a hydration mismatch, and a toggle icon
   * showing the wrong state for a frame. Reading the DOM is also what makes the
   * effect unnecessary: no-flash has already resolved stored-theme-then-OS
   * preference before React runs, so re-deriving it here would only duplicate
   * that logic and risk the two drifting apart.
   *
   * On the server there is no document; 'dark' matches no-flash's own default,
   * which keeps the prerendered HTML consistent.
   */
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof document === 'undefined') return 'dark';
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  });

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    apply(t);
    try {
      localStorage.setItem(STORAGE_KEY_THEME, t);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, toggle, setTheme }),
    [theme, toggle, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
