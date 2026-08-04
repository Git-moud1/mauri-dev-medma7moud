import { getT } from '@/i18n/server';
import { dirFor } from '@/i18n/locale';
import type { Locale } from '@/i18n/config';

import { ArrowRightIcon, WhatsAppIcon, CodeIcon, SmartphoneIcon } from './Icons';
import { HeroTubesLayer } from './hero/HeroTubesLayer';

/**
 * Above-the-fold hero — fully server-rendered, no client JS.
 *
 * The staggered `motion` entrance this used to have was deliberately dropped:
 * it started the h1 (the LCP element) at opacity 0 and only revealed it once
 * the animation library had loaded and hydrated, which is exactly the cost this
 * plan is trying to remove. Ambient grain and the pulsing status dot are CSS and
 * are untouched.
 *
 * The animated background layer is gone as of this commit — concepts A1, A2 and
 * A3 were all removed at the owner's request. They are recoverable from git at
 * `a6a2996` / `fbe2e2a` if any of them is ever wanted back; the measured case
 * against A3 is in MIGRATION.md §12.
 */
export function Hero({
  locale,
  stats: figures,
  availableForWork,
  whatsappUrl,
}: {
  locale: Locale;
  /** Admin-managed. Falls back to the bundled values when the store is cold. */
  stats: { years: number; projects: number; stacks: number };
  availableForWork: boolean;
  whatsappUrl?: string;
}) {
  const t = getT(locale);
  const dir = dirFor(locale);

  const stats = [
    { value: `${figures.years}+`, label: t('hero.stats.years') },
    { value: `${figures.projects}+`, label: t('hero.stats.projects') },
    { value: `${figures.stacks}+`, label: t('hero.stats.stacks') },
  ];

  return (
    <section id="top" className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
      {/*
        The hero's background layer.

        `absolute inset-0` inside this `relative` section, so it contributes no
        size of its own and cannot move the headline whatever it renders — the
        box is reserved by construction rather than by a fixed height that would
        be wrong at some viewport.

        `pointer-events-none` is load-bearing: the two CTAs and the WhatsApp
        button sit in front of this, and a canvas that accepted clicks would make
        them unclickable. The tubes still follow the pointer, because the library
        listens on the window.

        `-z-10` keeps the whole layer behind the text. The headline is
        server-rendered above it and never waits for it.
      */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <HeroTubesLayer />
        <div className="grain absolute inset-0 opacity-60" />
      </div>

      <div className="container-x">
        <div className="mx-auto max-w-4xl text-center">
          {/*
            Toggled from the admin. Hidden rather than reworded when the owner
            is not taking work: an "available" badge that is not true costs more
            than no badge at all.
          */}
          {availableForWork ? (
            <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium text-fg">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-ok opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-status-ok" />
              </span>
              {t('hero.badge')}
            </span>
          ) : null}

          {/* `font-hero` puts the preloaded Arabic face first for /ar; on a
              latin locale its unicode-range never matches and the stack falls
              through to Playfair unchanged. */}
          <h1 className="font-hero mt-6 text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl lg:text-7xl">
            {t('hero.titleLine1')}{' '}
            <span className="gold-text">{t('hero.titleHighlight')}</span>
            <br />
            {t('hero.titleLine2')}
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
            {t('hero.subtitle')}
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href="#projects" className="btn-gold w-full sm:w-auto">
              {t('hero.ctaWork')}
              <ArrowRightIcon
                className={`h-4 w-4 ${dir === 'rtl' ? 'rotate-180' : ''}`}
              />
            </a>
            {/*
              Dropped entirely when no number is published — unlike the header
              CTA there is already a second button beside it, so falling back
              to `#contact` here would be two buttons pointing at the same
              place.
            */}
            {whatsappUrl ? (
              <a
                href={`${whatsappUrl}?text=${encodeURIComponent("Hi Mauri-Dev, I'd like to discuss a project.")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline w-full sm:w-auto"
              >
                <WhatsAppIcon className="h-4 w-4" />
                {t('hero.ctaWhatsapp')}
              </a>
            ) : null}
          </div>

          {/* Web + App emphasis chips */}
          <div className="mt-8 flex items-center justify-center gap-3 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <CodeIcon className="h-4 w-4 text-gold" /> Web Apps
            </span>
            <span className="h-1 w-1 rounded-full bg-border" />
            <span className="inline-flex items-center gap-1.5">
              <SmartphoneIcon className="h-4 w-4 text-gold" /> Mobile Apps
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="mx-auto mt-16 grid max-w-2xl grid-cols-3 divide-x divide-border rtl:divide-x-reverse">
          {stats.map((s) => (
            <div key={s.label} className="px-2 text-center">
              <div className="font-display text-3xl font-bold gold-text sm:text-4xl">
                {s.value}
              </div>
              <div className="mt-1 text-xs text-muted sm:text-sm">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
