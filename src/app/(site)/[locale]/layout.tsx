import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import '../../globals.css';
import { NoFlashScript } from '../../no-flash';
import { fontClassFor } from './fonts';
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

  return (
    // suppressHydrationWarning covers the theme class written by NoFlashScript.
    // lang and dir are server-rendered per route and never mutated at runtime.
    <html lang={typed} dir={dirFor(typed)} suppressHydrationWarning>
      <head>
        <NoFlashScript />
      </head>
      <body className={`${fontClassFor(typed)} antialiased`}>
        {props.children}
      </body>
    </html>
  );
}
