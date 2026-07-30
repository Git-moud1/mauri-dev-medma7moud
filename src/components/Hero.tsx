import { getT } from '@/i18n/server';
import { dirFor } from '@/i18n/locale';
import type { Locale } from '@/i18n/config';

import { ArrowRightIcon, WhatsAppIcon, CodeIcon, SmartphoneIcon } from './Icons';
import { HeroCanvas } from './hero/HeroCanvas';
import { LatticePoster } from './hero/LatticePoster';

/**
 * Above-the-fold hero — fully server-rendered, no client JS.
 *
 * The staggered `motion` entrance this used to have was deliberately dropped:
 * it started the h1 (the LCP element) at opacity 0 and only revealed it once
 * the animation library had loaded and hydrated, which is exactly the cost this
 * plan is trying to remove. Keeping a client island purely for that would also
 * be throwaway work — the Prism Stack hero replaces this markup wholesale in a
 * later plan. Ambient blur/grain layers and the pulsing status dot are CSS and
 * are untouched.
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
        The hero's animated layer, and the reason it cannot hurt the headline.

        Everything in here is `absolute inset-0` inside this `relative` section,
        so the layer has no size of its own to contribute: the box is reserved by
        construction and no concept can shift the text, whatever it renders.

        Order matters. `LatticePoster` is server-rendered and therefore paints
        with the `<h1>`; `HeroCanvas` mounts over it after hydration and fades in
        only once it has drawn a frame. A visitor whose device declines WebGL,
        asks for reduced motion, or has save-data on keeps the poster and never
        learns there was supposed to be a canvas.

        The two 120px-blur circles that used to live here are gone. They were a
        second and third light source, which is exactly what the brief's "one
        light source, used sparingly" rules out — the glow now comes from inside
        the composition, where it can actually be attributed to the structure.
      */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <LatticePoster dir={dir} />
        <HeroCanvas dir={dir} locale={locale} />
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
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
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
