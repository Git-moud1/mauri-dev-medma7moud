'use client';

import { useI18n } from '@/i18n/I18nProvider';
import { SITE, whatsappLink } from '@/lib/site';
import { Reveal } from './Reveal';
import { ContactForm } from './ContactForm';
import { MailIcon, WhatsAppIcon } from './Icons';

export function Contact() {
  const { t } = useI18n();

  return (
    <section id="contact" className="scroll-mt-24 py-20 sm:py-28">
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
              {t('contact.title')} <span className="gold-text">{t('contact.titleStrong')}</span>
            </h2>
          </Reveal>
          <Reveal delay={2}>
            <p className="mt-4 max-w-md text-muted">{t('contact.subtitle')}</p>
          </Reveal>

          <Reveal delay={3}>
            <div className="mt-8 space-y-3">
              <a
                href={whatsappLink("Hi Mauri-Dev, I'd like to discuss a project.")}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 rounded-2xl border border-border bg-surface/50 p-4 transition-colors hover:border-[#25D366]"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#25D366]/15 text-[#25D366]">
                  <WhatsAppIcon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{t('contact.whatsapp')}</span>
                  <span className="block text-sm text-muted" dir="ltr">
                    +{SITE.whatsappNumber}
                  </span>
                </span>
              </a>

              <a
                href={`mailto:${SITE.email}`}
                className="flex items-center gap-4 rounded-2xl border border-border bg-surface/50 p-4 transition-colors hover:border-gold"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-gold/15 text-gold">
                  <MailIcon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{t('contact.emailLabel')}</span>
                  <span className="block text-sm text-muted" dir="ltr">
                    {SITE.email}
                  </span>
                </span>
              </a>
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
