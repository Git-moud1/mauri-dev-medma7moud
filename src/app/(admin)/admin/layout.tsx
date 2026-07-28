import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '../../globals.css';

/**
 * One family, Inter, for headings, labels, data and buttons alike.
 *
 * This is the fix for the first thing the owner rejected. The admin previously
 * set no font variables at all, so Tailwind's `font-sans` resolved through
 * `var(--font-sans, var(--font-arabic))` — both undefined here — and fell all
 * the way to the browser's serif default. That is where the "default serif
 * headings" came from: not a choice, an omission.
 *
 * Display fonts in UI labels are a banned pattern in the product register
 * anyway, so the admin binds BOTH variables to Inter. `font-display` in an
 * admin component now resolves to Inter too, which means no component can
 * accidentally reintroduce a serif.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  // preload: false, and the protected font test is why.
  //
  // With preload on, Next emitted this face's <link rel="preload"> on the
  // PUBLIC Arabic route as well — next/font emits preloads from the route's
  // module graph, not from the classNames a route renders, which is the same
  // behaviour plan 1 task 9 measured. An Arabic visitor was paying for the
  // admin's font. The admin is behind a login and one extra hop there costs
  // nobody anything.
  preload: false,
  adjustFontFallback: true,
});

/**
 * A second root layout in its own route group. The admin owns its own <html>:
 * English, LTR, dark, sharing no provider, font or client island with the
 * public tree — which is what keeps its bundle off the public critical path.
 *
 * It deliberately does not use the public i18n dictionaries. Admin copy is
 * English-only and would otherwise have to be translated into three languages
 * no visitor will ever read.
 */
export const metadata: Metadata = {
  title: 'Admin — Mauri-Dev',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      dir="ltr"
      className={`dark ${inter.variable}`}
      style={{ '--font-display': 'var(--font-sans)' } as React.CSSProperties}
    >
      <body className="min-h-screen bg-bg text-fg antialiased">{children}</body>
    </html>
  );
}
