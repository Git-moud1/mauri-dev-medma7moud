'use client';

import { useI18n } from '@/i18n/I18nProvider';
import { SITE, whatsappLink } from '@/lib/site';
import { MailIcon, WhatsAppIcon } from './Icons';
import { Logo } from './Logo';

const NAV = [
  { id: 'about', key: 'nav.about' },
  { id: 'projects', key: 'nav.projects' },
  { id: 'process', key: 'nav.process' },
  { id: 'contact', key: 'nav.contact' },
] as const;

export function Footer() {
  const { t } = useI18n();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-surface/40">
      <div className="container-x py-14">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr]">
          {/* Brand */}
          <div>
            <a href="#top" className="flex items-center">
              <Logo size={36} />
            </a>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              {t('footer.tagline')}
            </p>
          </div>

          {/* Nav */}
          <nav aria-label="Footer">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-gold">
              {t('footer.nav')}
            </h3>
            <ul className="space-y-2">
              {NAV.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="text-sm text-muted transition-colors hover:text-fg"
                  >
                    {t(item.key)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Connect */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-gold">
              {t('footer.connect')}
            </h3>
            <div className="flex flex-col gap-3">
              <a
                href={whatsappLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-fg"
              >
                <WhatsAppIcon className="h-4 w-4" /> WhatsApp
              </a>
              <a
                href={`mailto:${SITE.email}`}
                className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-fg"
              >
                <MailIcon className="h-4 w-4" /> {SITE.email}
              </a>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-sm text-muted sm:flex-row">
          <p>
            © {year} {SITE.name}. {t('footer.rights')}
          </p>
          <p>{t('footer.built')}</p>
        </div>
      </div>
    </footer>
  );
}
