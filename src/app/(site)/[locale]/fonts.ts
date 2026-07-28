import { Playfair_Display, Inter, Tajawal } from 'next/font/google';
import type { Locale } from '@/i18n/config';

/**
 * All three families must be declared at module scope — `next/font` loaders
 * cannot be called conditionally. Only the active locale's variables are ever
 * applied to <body> (see `fontClassFor`), so only the faces that locale
 * actually renders get fetched.
 *
 * `preload: false` is load-bearing, not an oversight. Next emits its font
 * preload links from the route's module graph, not from the classNames the
 * route renders: with `preload: true` every locale preloaded all five woff2
 * files (111 KB) regardless of which variables were applied — measured, not
 * assumed. Turning preloading off makes the browser discover each face through
 * the stylesheet instead, so it fetches only the faces the rendered CSS
 * references. `display: 'swap'` plus `adjustFontFallback` keeps the text
 * visible and the metrics stable during that extra hop.
 */

// Latin locales: Playfair for display, Inter for body.
const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-display',
  display: 'swap',
  preload: false,
  adjustFontFallback: true,
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  preload: false,
  adjustFontFallback: true,
});

// Arabic: Tajawal covers both body and display (Playfair has no Arabic glyphs).
const tajawal = Tajawal({
  subsets: ['arabic'],
  weight: ['400', '500', '700'],
  variable: '--font-arabic',
  display: 'swap',
  preload: false,
  adjustFontFallback: true,
});

/** The className carrying only the font variables the given locale renders. */
export function fontClassFor(locale: Locale): string {
  return locale === 'ar' ? tajawal.variable : `${playfair.variable} ${inter.variable}`;
}
