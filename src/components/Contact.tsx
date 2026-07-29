import { getT } from '@/i18n/server';
import type { Locale } from '@/i18n/config';
import { Reveal } from './Reveal';
import { ContactForm } from './islands/ContactForm';
import { ContactPills, FollowTiles, type ResolvedLink } from './SocialLinks';

export function Contact({
  locale,
  contact,
  follow,
}: {
  locale: Locale;
  contact: ResolvedLink[];
  follow: ResolvedLink[];
}) {
  const t = getT(locale);

  return (
    <section
      id="contact"
      className="defer-paint defer-contact scroll-mt-24 py-20 sm:py-28"
    >
      <div className="container-x grid gap-12 lg:grid-cols-2 lg:gap-16">
        {/* Left: intro + direct channels */}
        <div>
          <Reveal>
            <span className="section-label">
              <span className="h-px w-6 bg-gold" />
              {t('contact.label')}
            </span>
          </Reveal>
          <Reveal delay={1}>
            <h2 className="mt-4 font-display text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
              {t('contact.title')}{' '}
              <span className="gold-text">{t('contact.titleStrong')}</span>
            </h2>
          </Reveal>
          <Reveal delay={2}>
            <p className="mt-4 max-w-md text-muted">{t('contact.subtitle')}</p>
          </Reveal>

          <Reveal delay={3}>
            <div className="mt-8 max-w-md space-y-8">
              <ContactPills locale={locale} links={contact} />
              <FollowTiles locale={locale} links={follow} />
            </div>
          </Reveal>
        </div>

        {/* Right: form */}
        <Reveal delay={2}>
          <ContactForm />
        </Reveal>
      </div>
    </section>
  );
}
