import { getT } from '@/i18n/server';
import type { Locale } from '@/i18n/config';
import type { StoredProject } from '@/lib/content/types';
import { Reveal } from './Reveal';
import { ProjectsGrid } from './islands/ProjectsGrid';

/**
 * Section heading is server-rendered; the filter pills, the animated grid and
 * the lightbox trigger live in the ProjectsGrid island. The project list and
 * every label cross the boundary as serialized props, so the island carries no
 * dictionary of its own.
 */
export function Projects({
  locale,
  projects,
}: {
  locale: Locale;
  /** From the content store, with the bundled catalogue as its fallback. */
  projects: StoredProject[];
}) {
  const t = getT(locale);

  return (
    <section id="projects" className="scroll-mt-24 bg-surface-2/30 py-20 sm:py-28">
      <div className="container-x">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <Reveal>
            <span className="section-label">
              <span className="h-px w-6 bg-gold" />
              {t('projects.label')}
              <span className="h-px w-6 bg-gold" />
            </span>
          </Reveal>
          <Reveal delay={1}>
            <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl lg:text-5xl">
              {t('projects.title')}{' '}
              <span className="gold-text">{t('projects.titleStrong')}</span>
            </h2>
          </Reveal>
          <Reveal delay={2}>
            <p className="mt-4 text-muted">{t('projects.subtitle')}</p>
          </Reveal>
        </div>

        <ProjectsGrid
          projects={projects}
          locale={locale}
          labels={{
            filterAll: t('projects.filterAll'),
            filterWeb: t('projects.filterWeb'),
            filterApp: t('projects.filterApp'),
            viewGallery: t('projects.viewGallery'),
            liveLink: t('projects.liveLink'),
            empty: t('projects.empty'),
          }}
        />
      </div>
    </section>
  );
}
