'use client';

import { useTheme } from '@/theme/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { MoonIcon, SunIcon } from '../Icons';

/**
 * Theme toggle. Nothing it renders depends on the current theme at render time,
 * and that is the whole point.
 *
 * The server cannot know which theme a visitor has stored — only the no-flash
 * script, running before paint, does. So any markup derived from theme state
 * either disagrees with the server HTML (a hydration mismatch, which makes
 * React throw the tree away and re-render) or disagrees with the DOM for a
 * frame (B4). Both were observed here: the original code took the second, and
 * deriving the initial state from the DOM class produced the first — React
 * error #418 on every page load for a light-theme visitor.
 *
 * The way out is to stop branching on theme in the output. Both icons are
 * rendered and CSS picks one through the `dark:` variant, driven by the same
 * class no-flash already set. The accessible name is a single string that
 * describes the action rather than the destination, so it needs no branch
 * either.
 */
export function ThemeToggle() {
  const { toggle } = useTheme();
  const { t } = useI18n();
  const label = t('theme.toggle');

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="relative grid h-10 w-10 place-items-center rounded-full border border-border bg-surface/60 text-fg transition-colors hover:border-gold hover:text-gold"
    >
      {/* Sun while dark (the action leads to light), moon while light. */}
      <SunIcon className="hidden h-5 w-5 dark:block" />
      <MoonIcon className="block h-5 w-5 dark:hidden" />
    </button>
  );
}
