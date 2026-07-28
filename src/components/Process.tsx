import { getT } from '@/i18n/server';
import type { Locale } from '@/i18n/config';
import { Reveal } from './Reveal';

const STEPS = ['s1', 's2', 's3', 's4'] as const;

export function Process({ locale }: { locale: Locale }) {
  const t = getT(locale);

  return (
    <section
      id="process"
      className="defer-paint defer-process scroll-mt-24 py-20 sm:py-28"
    >
      <div className="container-x">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <Reveal>
            <span className="section-label">
              <span className="h-px w-6 bg-gold" />
              {t('process.label')}
              <span className="h-px w-6 bg-gold" />
            </span>
          </Reveal>
          <Reveal delay={1}>
            <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl lg:text-5xl">
              {t('process.title')}{' '}
              <span className="gold-text">{t('process.titleStrong')}</span>
            </h2>
          </Reveal>
        </div>

        <div className="relative grid gap-6 md:grid-cols-4">
          {/* connecting line (desktop) */}
          <div className="pointer-events-none absolute inset-x-0 top-9 hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block" />
          {STEPS.map((step, i) => (
            <Reveal
              key={step}
              delay={i}
              className="relative rounded-3xl border border-border bg-surface/50 p-6 text-center card-hover hover:-translate-y-1 hover:border-gold/40"
            >
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gold-grad font-display text-xl font-bold text-[rgb(20_18_14)] shadow-gold">
                {i + 1}
              </div>
              <h3 className="font-display text-lg font-bold">
                {t(`process.steps.${step}.title` as const)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {t(`process.steps.${step}.desc` as const)}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
