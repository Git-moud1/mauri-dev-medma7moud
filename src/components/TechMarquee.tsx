import { getT } from '@/i18n/server';
import type { Locale } from '@/i18n/config';
import { TECH_STACK } from '@/lib/site';

/** Infinite tech marquee. Duplicated track keeps the loop seamless.
 *  Pure CSS animation, so it needs no client JS at all. */
export function TechMarquee({ locale }: { locale: Locale }) {
  const t = getT(locale);
  const items = [...TECH_STACK, ...TECH_STACK];

  return (
    <section aria-label={t('marquee.label')} className="border-y border-border bg-surface/40 py-6">
      <div className="relative overflow-hidden">
        {/* edge fades */}
        <div className="pointer-events-none absolute inset-y-0 start-0 z-10 w-16 bg-gradient-to-r from-bg to-transparent rtl:bg-gradient-to-l" />
        <div className="pointer-events-none absolute inset-y-0 end-0 z-10 w-16 bg-gradient-to-l from-bg to-transparent rtl:bg-gradient-to-r" />
        <div className="flex w-max animate-marquee gap-10 motion-reduce:animate-none">
          {items.map((tech, i) => (
            <span
              key={`${tech}-${i}`}
              className="flex items-center gap-3 whitespace-nowrap font-display text-xl font-semibold text-muted"
            >
              {tech}
              <span className="h-1.5 w-1.5 rounded-full bg-gold/60" />
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
