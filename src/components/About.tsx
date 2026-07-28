import { getT } from '@/i18n/server';
import type { Locale } from '@/i18n/config';
import { SKILLS } from '@/lib/site';
import { Reveal } from './Reveal';
import { CodeIcon, ServerIcon, SmartphoneIcon } from './Icons';

function SkillGroup({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-gold">
        {title}
      </h3>
      <div className="flex flex-wrap gap-2">
        {items.map((s) => (
          <span
            key={s}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-fg transition-colors hover:border-gold hover:text-gold"
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

export function About({ locale }: { locale: Locale }) {
  const t = getT(locale);

  const highlights = [
    { icon: CodeIcon, key: 'web' as const },
    { icon: SmartphoneIcon, key: 'mobile' as const },
    { icon: ServerIcon, key: 'backend' as const },
  ];

  return (
    <section
      id="about"
      className="defer-paint defer-about relative scroll-mt-24 py-20 sm:py-28"
    >
      <div className="container-x grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        {/* Left: copy */}
        <div>
          <Reveal>
            <span className="section-label">
              <span className="h-px w-6 bg-gold" />
              {t('about.label')}
            </span>
          </Reveal>
          <Reveal delay={1}>
            <h2 className="mt-4 font-display text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
              {t('about.title')} <span className="gold-text">{t('about.titleStrong')}</span>
            </h2>
          </Reveal>
          <Reveal delay={2}>
            <p className="mt-5 text-base leading-relaxed text-muted">{t('about.p1')}</p>
          </Reveal>
          <Reveal delay={3}>
            <p className="mt-3 text-base leading-relaxed text-muted">{t('about.p2')}</p>
          </Reveal>

          <Reveal delay={4}>
            <div className="mt-8 space-y-6">
              <SkillGroup title={t('about.languagesTitle')} items={SKILLS.languages} />
              <SkillGroup title={t('about.frameworksTitle')} items={SKILLS.frameworks} />
              <SkillGroup title={t('about.mobileTitle')} items={SKILLS.mobile} />
            </div>
          </Reveal>
        </div>

        {/* Right: highlight cards */}
        <div className="grid gap-4 sm:grid-cols-2">
          {highlights.map((h, i) => (
            <Reveal
              key={h.key}
              delay={i}
              className={`glass rounded-3xl p-6 card-hover hover:-translate-y-1 hover:shadow-card ${
                i === 0 ? 'sm:col-span-2' : ''
              }`}
            >
              <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-gold/12 text-gold">
                <h.icon className="h-6 w-6" />
              </div>
              <h3 className="font-display text-xl font-bold">
                {t(`about.highlights.${h.key}.title` as const)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {t(`about.highlights.${h.key}.desc` as const)}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
