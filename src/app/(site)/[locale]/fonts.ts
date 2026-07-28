import { Playfair_Display, Inter } from 'next/font/google';
import type { Locale } from '@/i18n/config';

/**
 * The latin families are declared at module scope — `next/font` loaders cannot
 * be called conditionally. Only the active locale's variables are ever applied
 * to <body> (see `fontClassFor`), so only the faces that locale actually
 * renders get fetched. Arabic is self-hosted; see below.
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

/**
 * Arabic is NOT loaded through next/font. Tajawal is self-hosted in
 * globals.css — see the block there for why.
 *
 * Short version: next/font emits a generated `'Tajawal Fallback'` whose src is
 * `local(Arial)`, and Arial has no Arabic glyphs, so Arabic text fell through
 * to an unmeasured system font. `adjustFontFallback: false` does not suppress
 * it on Next 16 (verified against a clean build with every cache cleared), and
 * it sits ahead of any fallback of ours in the variable next/font generates.
 * That mismatch is what produced CLS 0.059 on /ar in production.
 */
const ARABIC_STACK = "'Tajawal', 'Tajawal Arabic Fallback', sans-serif";

/**
 * The className — and for Arabic, the inline style — carrying only the font
 * variables the given locale renders.
 */
export function fontClassFor(locale: Locale): string {
  return locale === 'ar' ? '' : `${playfair.variable} ${inter.variable}`;
}

/** Arabic sets its variables directly, since it has no next/font className. */
export function fontStyleFor(locale: Locale): Record<string, string> | undefined {
  return locale === 'ar'
    ? { '--font-arabic': ARABIC_STACK, '--font-sans': ARABIC_STACK }
    : undefined;
}
