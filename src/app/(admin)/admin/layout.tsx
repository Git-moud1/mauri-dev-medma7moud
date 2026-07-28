import type { Metadata } from 'next';
import '../../globals.css';

/**
 * A second root layout, in its own route group.
 *
 * The admin owns its own <html>: English, LTR, dark, and sharing no provider,
 * font or client island with the public tree. That separation is what keeps the
 * admin bundle off the public page's critical path — the brief's requirement is
 * that it must not add a single byte to the visitor-facing first load, and
 * task 11 measures it.
 *
 * It deliberately does not use the public i18n dictionaries. Admin copy is
 * English-only and would otherwise have to be translated into three languages
 * that no visitor will ever read.
 */
export const metadata: Metadata = {
  title: 'Admin — Mauri-Dev',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" className="dark">
      <body className="min-h-screen bg-bg text-fg antialiased">{children}</body>
    </html>
  );
}
