'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { dirFor } from '@/i18n/locale';
import type { Locale } from '@/i18n/config';
import type { Project, ProjectCategory } from '@/data/projects';
import { blurFor } from '@/data/blur.generated';
import { Reveal } from '../Reveal';
import { ArrowRightIcon, ExternalLinkIcon, SmartphoneIcon } from '../Icons';

// Code-split the lightbox: its code (and motion's drag/gesture paths) load
// only when a visitor actually opens a project, not on first paint.
const ProjectGallery = dynamic(
  () => import('../ProjectGallery').then((m) => m.ProjectGallery),
  { ssr: false },
);

type Filter = 'all' | ProjectCategory;

/**
 * Every string this island renders is resolved on the server and handed down,
 * so the island itself never touches a dictionary.
 */
export interface ProjectsGridLabels {
  filterAll: string;
  filterWeb: string;
  filterApp: string;
  viewGallery: string;
  liveLink: string;
  empty: string;
}

function ProjectCard({
  project,
  locale,
  dir,
  labels,
  onOpen,
}: {
  project: Project;
  locale: Locale;
  dir: 'rtl' | 'ltr';
  labels: ProjectsGridLabels;
  onOpen: () => void;
}) {
  const isPhone = project.frame === 'phone';

  return (
    <m.article
      layout
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="group relative flex flex-col overflow-hidden rounded-3xl border border-border bg-surface/50"
    >
      {/* Clickable cover -> opens gallery */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${project.title[locale]} — ${labels.viewGallery}`}
        className="relative block aspect-[4/3] w-full overflow-hidden"
      >
        {isPhone ? (
          // Device showcase: a phone screenshot rising out of a soft gradient.
          <div className="relative flex h-full items-end justify-center overflow-hidden bg-gradient-to-br from-[rgb(38_26_34)] via-[rgb(26_20_26)] to-[rgb(18_16_14)]">
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(70% 55% at 50% 15%, rgba(255,255,255,0.10), transparent 70%)',
              }}
            />
            <div className="relative aspect-[9/19.5] h-[128%] translate-y-2 overflow-hidden rounded-[1.4rem] border-x border-t border-white/15 bg-black shadow-[0_20px_45px_-15px_rgba(0,0,0,0.7)] transition-transform duration-500 group-hover:-translate-y-0 group-hover:scale-[1.03]">
              <Image
                src={project.cover}
                alt={project.title[locale]}
                fill
                quality={70}
                sizes="(max-width: 640px) 60vw, (max-width: 1024px) 30vw, 200px"
                placeholder={blurFor(project.cover) ? 'blur' : 'empty'}
                blurDataURL={blurFor(project.cover)}
                className="object-cover object-top"
              />
            </div>
          </div>
        ) : (
          <Image
            src={project.cover}
            alt={project.title[locale]}
            fill
            quality={70}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            placeholder={blurFor(project.cover) ? 'blur' : 'empty'}
            blurDataURL={blurFor(project.cover)}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )}
        {/* Gradient + hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 backdrop-blur-[2px] transition-opacity duration-300 group-hover:opacity-100">
          <span className="btn-gold pointer-events-none scale-95 transition-transform duration-300 group-hover:scale-100">
            {labels.viewGallery}
            <ArrowRightIcon className={`h-4 w-4 ${dir === 'rtl' ? 'rotate-180' : ''}`} />
          </span>
        </div>
        {/* Category badge */}
        <span className="absolute start-3 top-3 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white backdrop-blur">
          {project.category === 'web' ? labels.filterWeb : labels.filterApp}
        </span>
        {/* image count hint */}
        <span className="absolute end-3 top-3 inline-flex items-center gap-1 rounded-full bg-gold px-2.5 py-1 text-xs font-bold text-[rgb(20_18_14)]">
          {isPhone && <SmartphoneIcon className="h-3.5 w-3.5" />}
          {project.images.length}
        </span>
      </button>

      {/* Body */}
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-lg font-bold">{project.title[locale]}</h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">
          {project.description[locale]}
        </p>
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold transition-colors hover:text-gold-soft"
          >
            {labels.viewGallery}
            <ArrowRightIcon className={`h-4 w-4 ${dir === 'rtl' ? 'rotate-180' : ''}`} />
          </button>
          {project.link ? (
            <a
              href={project.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg"
            >
              {labels.liveLink}
              <ExternalLinkIcon className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
      </div>
    </m.article>
  );
}

/** Filter pills, the animated grid, and the lightbox trigger. */
export function ProjectsGrid({
  projects,
  locale,
  labels,
}: {
  projects: readonly Project[];
  locale: Locale;
  labels: ProjectsGridLabels;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [active, setActive] = useState<Project | null>(null);
  const dir = dirFor(locale);

  const filtered = useMemo(
    () => (filter === 'all' ? projects : projects.filter((p) => p.category === filter)),
    [filter, projects],
  );

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: labels.filterAll },
    { id: 'web', label: labels.filterWeb },
    { id: 'app', label: labels.filterApp },
  ];

  return (
    <>
      {/* Filter pills */}
      <Reveal delay={2} className="mb-10 flex justify-center">
        <div className="inline-flex rounded-full border border-border bg-surface p-1">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`relative rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                filter === f.id ? 'text-[rgb(20_18_14)]' : 'text-muted hover:text-fg'
              }`}
            >
              {filter === f.id && (
                <m.span
                  layoutId="filter-pill"
                  className="absolute inset-0 -z-10 rounded-full bg-gold-grad"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              {f.label}
            </button>
          ))}
        </div>
      </Reveal>

      {/* Grid */}
      {filtered.length > 0 ? (
        <m.div layout className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                locale={locale}
                dir={dir}
                labels={labels}
                onOpen={() => setActive(project)}
              />
            ))}
          </AnimatePresence>
        </m.div>
      ) : (
        <p className="py-16 text-center text-muted">{labels.empty}</p>
      )}

      {/* Lightbox */}
      {active && (
        <ProjectGallery project={active} startIndex={0} onClose={() => setActive(null)} />
      )}
    </>
  );
}
