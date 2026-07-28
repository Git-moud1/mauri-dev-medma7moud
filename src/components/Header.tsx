import { getT } from '@/i18n/server';
import type { Locale } from '@/i18n/config';
import { whatsappLink } from '@/lib/site';
import { ThemeToggle } from './islands/ThemeToggle';
import { LanguageSwitcher } from './islands/LanguageSwitcher';
import { HeaderShell, DrawerPanel, DrawerToggle } from './islands/MobileDrawer';
import { WhatsAppIcon } from './Icons';
import { Logo } from './Logo';

const NAV = [
  { id: 'about', key: 'nav.about' },
  { id: 'projects', key: 'nav.projects' },
  { id: 'process', key: 'nav.process' },
  { id: 'contact', key: 'nav.contact' },
] as const;

const CTA_MESSAGE = "Hi Mauri-Dev, I'd like to discuss a project.";

/**
 * Server-rendered header. Only three pieces are client code: the shell (scroll
 * class + drawer state), the language switcher, and the theme toggle. Nav
 * labels are resolved here and handed to the drawer as plain strings.
 */
export function Header({ locale }: { locale: Locale }) {
  const t = getT(locale);
  const links = NAV.map((item) => ({ id: item.id, label: t(item.key) }));
  const ctaHref = whatsappLink(CTA_MESSAGE);
  const ctaLabel = t('nav.cta');

  return (
    <HeaderShell>
      <nav
        className="container-x flex items-center justify-between gap-4"
        aria-label="Primary"
      >
        {/* Logo */}
        <a href="#top" className="group flex items-center" aria-label="Mauri-Dev — home">
          <Logo size={40} />
        </a>

        {/* Desktop nav */}
        <ul className="hidden items-center gap-1 lg:flex">
          {links.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="rounded-full px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
          <a
            href={ctaHref}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-2 rounded-full bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 sm:inline-flex"
          >
            <WhatsAppIcon className="h-4 w-4" />
            {ctaLabel}
          </a>

          <DrawerToggle />
        </div>
      </nav>

      {/* Mobile menu */}
      <DrawerPanel links={links} ctaHref={ctaHref} ctaLabel={ctaLabel} />
    </HeaderShell>
  );
}
