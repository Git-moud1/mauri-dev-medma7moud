import { STORAGE_KEY_THEME } from '@/i18n/config';

export type Theme = 'light' | 'dark';

/**
 * The value the server prerenders with, and the value every client-side
 * resolver falls back to. It has to be one constant: the no-flash script, the
 * provider's initial state and the pre-paint re-apply all default through here,
 * and three copies of it is how they drift.
 */
export const DEFAULT_THEME: Theme = 'dark';

/**
 * Stored choice first, OS preference second, DEFAULT_THEME last.
 *
 * Deliberately does NOT read the `dark` class off <html>. The class is not a
 * source of truth — React strips every attribute from <html> whenever the
 * `[locale]` layout remounts (see ThemeSync) — so anything that derives the
 * theme from the DOM reads whatever survived the last commit rather than what
 * the visitor chose.
 */
export function resolveTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY_THEME);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* Storage can be blocked outright; fall through to the OS preference. */
  }
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return DEFAULT_THEME;
  }
}

/** The single place the theme is written to the document. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  // toggle, not add: this runs more than once per document lifetime, and an
  // `add`-only version can never walk a visitor back from dark to light.
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY_THEME, theme);
  } catch {
    /* ignore */
  }
}
