'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { applyTheme, resolveTheme, storeTheme, type Theme } from './theme';

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  /**
   * B4. The state is resolved from storage-then-OS-preference — the same
   * `resolveTheme()` the no-flash script and ThemeSync use — rather than from a
   * hardcoded 'dark' corrected later in an effect. The old version guessed
   * 'dark' and fixed itself after mount, which showed a light-theme visitor the
   * wrong toggle icon for a frame.
   *
   * It deliberately does not read the `dark` class off <html> either, which is
   * what it used to do. This provider is inside the `[locale]` segment, so it
   * remounts on every locale switch — and on that same commit React strips
   * every attribute from <html> (see ThemeSync). Deriving the initial state
   * from the class made this provider's correctness depend on whether its
   * initialiser happened to run before or after that strip.
   *
   * On the server `resolveTheme()` returns DEFAULT_THEME, which is what
   * no-flash falls back to as well, so the prerendered HTML stays consistent.
   */
  const [theme, setThemeState] = useState<Theme>(resolveTheme);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    applyTheme(t);
    storeTheme(t);
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
