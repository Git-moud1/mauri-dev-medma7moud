import type { Metadata, Viewport } from 'next';
import ReactDOM from 'react-dom';
import { notFound } from 'next/navigation';
import '../../globals.css';
import { NoFlashScript } from '../../no-flash';
import { fontClassFor, fontStyleFor } from './fonts';
import { LOCALES, type Locale } from '@/i18n/config';
import { isLocale, dirFor } from '@/i18n/locale';
import { dictionaries } from '@/i18n/dictionaries';
import { SITE, SITE_URL } from '@/lib/site';

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};
  const dict = dictionaries[locale];

  return {
    metadataBase: new URL(SITE_URL),
    title: { default: dict.meta.title, template: `%s — ${SITE.name}` },
    description: dict.meta.description,
    alternates: {
      canonical: `/${locale}`,
      languages: { ar: '/ar', en: '/en', fr: '/fr', 'x-default': '/ar' },
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f9fc' },
    { media: '(prefers-color-scheme: dark)', color: '#08080c' },
  ],
};

export default async function LocaleLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  const typed: Locale = locale;

  /**
   * One preload, Arabic only, for the single face the hero headline renders.
   *
   * This is the narrow version of reverting `preload: false`: the other five
   * Tajawal faces stay discovered through CSS, so plan 1's font-byte win
   * survives, while the face that decides whether the LCP element reflows
   * arrives before first paint. A latin locale must not preload it — it renders
   * no Arabic glyphs and would pay 9 KB for nothing.
   *
   * `ReactDOM.preload` rather than a hand-written <link>: React hoists and
   * deduplicates it. A raw <link> in <head> was emitted twice, because React
   * hoisted its own copy alongside ours.
   */
  if (typed === 'ar') {
    ReactDOM.preload('/fonts/tajawal-700-arabic.woff2', {
      as: 'font',
      type: 'font/woff2',
      crossOrigin: 'anonymous',
    });
  }

  return (
    // suppressHydrationWarning covers the theme class written by NoFlashScript.
    // lang and dir are server-rendered per route and never mutated at runtime.
    <html lang={typed} dir={dirFor(typed)} suppressHydrationWarning>
      <head>
        <NoFlashScript />
        {/*
          Without JavaScript nothing ever adds `.reveal-in`, so every revealed
          element stays at `opacity: 0` and the page renders blank — content
          present in the HTML, invisible to the reader. A crawler that does not
          execute JS sees the same thing.

          `[data-anim-in]` covers the second half of the same problem: a motion
          element with `initial={{ opacity: 0 }}` server-renders that zero as an
          inline style and only leaves it when the library hydrates. Carry the
          attribute on any element that animates in from hidden and is present
          in the server HTML — the project cards, the floating WhatsApp button,
          the theme icon. Elements that only exist after an interaction (the
          lightbox, the drawer, the language menu) do not need it.

          The browser applies this only when scripting is disabled, so it costs
          a scripted visitor nothing and cannot race the observer.
        */}
        <noscript>
          <style>{`.reveal,[data-anim-in]{opacity:1!important;transform:none!important;transition:none!important}`}</style>
        </noscript>
      </head>
      <body className={`${fontClassFor(typed)} antialiased`} style={fontStyleFor(typed)}>
        {props.children}
      </body>
    </html>
  );
}
