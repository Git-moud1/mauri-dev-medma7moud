import { getT } from '@/i18n/server';
import type { Locale } from '@/i18n/config';
import { SITE } from '@/lib/site';
import { ContactPills, FollowTiles, type ResolvedLink } from './SocialLinks';
import { Logo } from './Logo';

const NAV = [
  { id: 'about', key: 'nav.about' },
  { id: 'projects', key: 'nav.projects' },
  { id: 'process', key: 'nav.process' },
  { id: 'contact', key: 'nav.contact' },
] as const;

export function Footer({
  locale,
  contact,
  follow,
}: {
  locale: Locale;
  /** Admin-managed, already filtered: an unfilled platform never arrives here. */
  contact: ResolvedLink[];
  follow: ResolvedLink[];
}) {
  const t = getT(locale);
  // Server-rendered, so this is the build date. The stale-year problem is B6,
  // owned by Task 14 — but the hydration-mismatch half of it is gone already:
  // the footer no longer runs on the client at all.
  const year = new Date().getFullYear();

  return (
    <footer className="defer-paint defer-footer border-t border-border bg-surface/40">
      <div className="container-x py-14">
        {/*
          The connect column carries six 44px tiles plus their gaps — about
          320px — and the old `1fr` third gave it 293, so the last tile wrapped
          onto a line of its own. Widened until the row fits whole, which also
          stops the longer Arabic labels wrapping inside the pills.
        */}
        <div className="grid gap-10 md:grid-cols-[1.2fr_0.8fr_1.4fr]">
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

          {/*
            Connect. Two independent blocks, each of which disappears entirely
            when the owner has published nothing in it — heading included, so
            an empty group leaves no orphaned title behind.
          */}
          <div className="space-y-6">
            <ContactPills locale={locale} links={contact} />
            <FollowTiles locale={locale} links={follow} />
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
