import Link from 'next/link';

import { getT } from '@/i18n/server';
import { dirFor } from '@/i18n/locale';
import type { Locale } from '@/i18n/config';
import type { StoredProject } from '@/lib/content/types';
import { ArrowRightIcon } from './Icons';
import { Reveal } from './Reveal';
import { ProjectsGrid } from './islands/ProjectsGrid';

/**
 * Section heading is server-rendered; the filter pills, the animated grid and
 * the lightbox trigger live in the ProjectsGrid island. The project list and
 * every label cross the boundary as serialized props, so the island carries no
 * dictionary of its own.
 *
 * Used twice, with different shapes:
 *
 *   - on the homepage, as a preview — `limit` projects, no filters, and a link
 *     to the full page;
 *   - on `/[locale]/projects`, as the whole thing — every project, filters on,
 *     no link, because it is already there.
 */
export function Projects({
  locale,
  projects,
  limit,
  showFilters = true,
  showViewAll = false,
  heading = 'default',
}: {
  locale: Locale;
  /** From the content store, with the bundled catalogue as its fallback. */
  projects: StoredProject[];
  /** Cap the number shown. Omit to show every project. */
  limit?: number;
  showFilters?: boolean;
  /** Render the "view all projects" link under the grid. */
  showViewAll?: boolean;
  /** Which set of heading strings to use. */
  heading?: 'default' | 'all';
}) {
  const t = getT(locale);
  const dir = dirFor(locale);

  /*
   * Sliced on the server, not hidden with CSS. The homepage then ships markup
   * for six cards instead of for all of them — each card carries an image URL,
   * a base64 blur placeholder and a localized title, so the difference is real
   * bytes in the HTML rather than just DOM nodes.
   */
  const shown = typeof limit === 'number' ? projects.slice(0, limit) : projects;
  const hasMore = shown.length < projects.length;

  const isAll = heading === 'all';
  const title = isAll ? t('projects.allTitle') : t('projects.title');
  const titleStrong = isAll ? t('projects.allTitleStrong') : t('projects.titleStrong');
  const subtitle = isAll ? t('projects.allSubtitle') : t('projects.subtitle');

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
            <h2 className="font-display mt-4 text-3xl font-bold sm:text-4xl lg:text-5xl">
              {title} <span className="gold-text">{titleStrong}</span>
            </h2>
          </Reveal>
          <Reveal delay={2}>
            <p className="mt-4 text-muted">{subtitle}</p>
          </Reveal>
        </div>

        <ProjectsGrid
          projects={shown}
          locale={locale}
          showFilters={showFilters}
          labels={{
            filterAll: t('projects.filterAll'),
            filterWeb: t('projects.filterWeb'),
            filterApp: t('projects.filterApp'),
            viewGallery: t('projects.viewGallery'),
            liveLink: t('projects.liveLink'),
            empty: t('projects.empty'),
          }}
        />

        {/*
          Rendered only when something is actually being withheld. A "view all"
          that leads to the set the visitor is already looking at is a dead end
          dressed as a promise — so on a catalogue of six or fewer this
          disappears on its own, with no configuration to remember.

          A real `<Link>` rather than a scripted scroll: it works before
          hydration, prefetches on hover, and lands in browser history.
        */}
        {showViewAll && hasMore ? (
          <Reveal delay={3} className="mt-14 flex flex-col items-center gap-3">
            <Link
              href={`/${locale}/projects`}
              className="btn-gold focus-visible:ring-offset-bg focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              {t('projects.viewAll')}
              <ArrowRightIcon
                className={`h-4 w-4 ${dir === 'rtl' ? 'rotate-180' : ''}`}
              />
            </Link>
            <p className="text-sm text-muted">
              {t('projects.viewAllCount', { count: projects.length })}
            </p>
          </Reveal>
        ) : null}
      </div>
    </section>
  );
}
