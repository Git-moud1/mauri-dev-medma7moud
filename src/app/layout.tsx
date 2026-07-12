import type { Metadata, Viewport } from 'next';
import { Playfair_Display, Inter, Tajawal } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { NoFlashScript } from './no-flash';
import { SITE } from '@/lib/site';

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const tajawal = Tajawal({
  subsets: ['arabic'],
  weight: ['400', '500', '700'],
  variable: '--font-arabic',
  display: 'swap',
});

const SITE_URL = 'https://baycheikh.netlify.app';

// Default (Arabic) SEO metadata. Per-language <title>/<meta> is updated at
// runtime by DocumentMeta.tsx when the visitor switches languages.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Mauri-Dev — تطوير حلول ويب وموبايل احترافية',
    template: `%s — ${SITE.name}`,
  },
  description:
    'Mauri-Dev — تطوير حلول ويب وتطبيقات موبايل احترافية من البداية إلى النهاية. خبرة أكثر من 5 سنوات وأكثر من 120 مشروعاً.',
  keywords: [
    'Mauri-Dev',
    'Mauri Dev',
    'Bay Cheikh',
    'Med Moud',
    'Full Stack Developer',
    'Mobile App Developer',
    'React',
    'React Native',
    'Flutter',
    'Next.js',
    'مطور ويب',
    'مطور تطبيقات',
  ],
  authors: [{ name: SITE.name }],
  alternates: {
    languages: {
      ar: '/',
      en: '/',
      fr: '/',
    },
  },
  openGraph: {
    type: 'website',
    title: 'Mauri-Dev — Develop Solutions',
    description:
      'Premium web applications and mobile apps built end-to-end. 5+ years, 120+ projects.',
    siteName: SITE.name,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mauri-Dev — Develop Solutions',
    description: 'Premium web applications and mobile apps built end-to-end.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f9fc' },
    { media: '(prefers-color-scheme: dark)', color: '#08080c' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // lang/dir are set by NoFlashScript before paint and kept in sync by I18nProvider.
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <NoFlashScript />
      </head>
      <body
        className={`${playfair.variable} ${inter.variable} ${tajawal.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
