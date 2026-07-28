'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, LazyMotion, domMax, motion, type PanInfo } from 'motion/react';
import { useI18n } from '@/i18n/I18nProvider';
import type { Project } from '@/data/projects';
import { blurFor } from '@/data/blur.generated';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  ExternalLinkIcon,
  ImageIcon,
  SpinnerIcon,
} from './Icons';

interface Props {
  project: Project;
  /** Starting image index. */
  startIndex?: number;
  onClose: () => void;
}

const SWIPE_THRESHOLD = 60; // px of drag distance to trigger a slide

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? '-100%' : '100%', opacity: 0 }),
};

/**
 * Accessible, swipeable image lightbox that shows project screenshots LARGE and
 * centered inside a clean, even dark overlay.
 * - Display mode is driven by category: `app` → large device frame (~82vh),
 *   `web` → large edge-to-edge `object-contain` image (~85vh / 90vw, no mockup).
 * - Chrome (counter, close, arrows, thumbnails, caption) floats over a full-screen
 *   scrim; clicking any empty area closes. The frame is always centered on both axes.
 * - Only the current image loads at full size; the previous/next are preloaded.
 * - Blur (LQIP) placeholder + spinner + error state → never a bare black box.
 * - Keyboard: ← → to navigate (RTL-aware), Esc to close. Touch: swipe.
 */
export function ProjectGallery({ project, startIndex = 0, onClose }: Props) {
  const { t, locale, dir } = useI18n();
  const images = project.images.length ? project.images : [project.cover];
  const total = images.length;
  // Real mobile-app screenshots get a device frame; web screenshots are shown big & flat.
  const useDeviceFrame = project.category === 'app';

  // The browser downloads the right srcSet candidate based on how the image is displayed.
  const stageSizes = useDeviceFrame
    ? '(max-width: 768px) 88vw, 460px'
    : '(max-width: 768px) 96vw, 88vw';

  const [[index, direction], setState] = useState<[number, number]>([startIndex, 0]);
  const [loaded, setLoaded] = useState<Set<string>>(() => new Set());
  const [errored, setErrored] = useState<Set<string>>(() => new Set());
  const [reloadKey, setReloadKey] = useState(0);

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const titleId = useId();
  const descId = useId();

  const currentSrc = images[index];
  const isLoaded = loaded.has(currentSrc);
  const isErrored = errored.has(currentSrc);

  const markLoaded = useCallback((src: string) => {
    setLoaded((prev) => (prev.has(src) ? prev : new Set(prev).add(src)));
  }, []);
  const markErrored = useCallback((src: string) => {
    setErrored((prev) => (prev.has(src) ? prev : new Set(prev).add(src)));
  }, []);
  const retry = useCallback(() => {
    setErrored((prev) => {
      const next = new Set(prev);
      next.delete(currentSrc);
      return next;
    });
    setReloadKey((k) => k + 1);
  }, [currentSrc]);

  const paginate = useCallback(
    (dirStep: number) => {
      setState(([i]) => [(i + dirStep + total) % total, dirStep]);
    },
    [total],
  );

  const goTo = useCallback((target: number) => {
    setState(([i]) => [target, target > i ? 1 : -1]);
  }, []);

  // Preload only the immediate neighbours (never all images at once).
  const neighbors = useMemo(() => {
    if (total <= 1) return [];
    const set = new Set<number>([(index + 1) % total, (index - 1 + total) % total]);
    set.delete(index);
    return [...set];
  }, [index, total]);

  // Keyboard navigation (direction-aware) + Esc + focus trap.
  useEffect(() => {
    const nextKey = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const prevKey = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === nextKey) {
        e.preventDefault();
        paginate(1);
      } else if (e.key === prevKey) {
        e.preventDefault();
        paginate(-1);
      } else if (e.key === 'Tab') {
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, a[href], [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dir, onClose, paginate]);

  // Lock body scroll and move focus to the dialog while open.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Keep the active thumbnail in view as the slide changes.
  useEffect(() => {
    thumbRefs.current[index]?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: 'smooth',
    });
  }, [index]);

  function onDragEnd(_e: unknown, info: PanInfo) {
    const offset = info.offset.x;
    const advance = dir === 'rtl' ? offset > SWIPE_THRESHOLD : offset < -SWIPE_THRESHOLD;
    const back = dir === 'rtl' ? offset < -SWIPE_THRESHOLD : offset > SWIPE_THRESHOLD;
    if (advance) paginate(1);
    else if (back) paginate(-1);
  }

  const blur = blurFor(currentSrc);

  // The sliding image, shared by both framing modes.
  const slide = (
    <AnimatePresence initial={false} custom={direction} mode="popLayout">
      <motion.div
        key={`${index}-${reloadKey}`}
        custom={direction}
        variants={slideVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{
          x: { type: 'spring', stiffness: 300, damping: 30 },
          opacity: { duration: 0.2 },
        }}
        drag={total > 1 ? 'x' : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.18}
        onDragEnd={onDragEnd}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
      >
        {isErrored ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[rgb(20_18_16)] text-white/70">
            <ImageIcon className="h-10 w-10" />
            <p className="text-sm">{t('gallery.error')}</p>
            <button
              type="button"
              onClick={retry}
              className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              {t('gallery.retry')}
            </button>
          </div>
        ) : (
          <Image
            src={currentSrc}
            alt={`${project.title[locale]} — ${index + 1}`}
            fill
            priority
            quality={78}
            sizes={stageSizes}
            placeholder={blur ? 'blur' : 'empty'}
            blurDataURL={blur}
            onLoad={() => markLoaded(currentSrc)}
            onError={() => markErrored(currentSrc)}
            className={useDeviceFrame ? 'object-cover object-top' : 'object-contain'}
            draggable={false}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );

  const spinner = !isLoaded && !isErrored && (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <SpinnerIcon className="h-9 w-9 animate-spin text-white/70" />
    </div>
  );

  const arrows = total > 1 && (
    <>
      <button
        type="button"
        onClick={() => paginate(-1)}
        aria-label={t('gallery.prev')}
        className="pointer-events-auto absolute top-1/2 start-3 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/12 text-white ring-1 ring-white/15 backdrop-blur transition-colors hover:bg-white/25 sm:h-12 sm:w-12"
      >
        {dir === 'rtl' ? <ChevronRightIcon className="h-6 w-6" /> : <ChevronLeftIcon className="h-6 w-6" />}
      </button>
      <button
        type="button"
        onClick={() => paginate(1)}
        aria-label={t('gallery.next')}
        className="pointer-events-auto absolute top-1/2 end-3 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/12 text-white ring-1 ring-white/15 backdrop-blur transition-colors hover:bg-white/25 sm:h-12 sm:w-12"
      >
        {dir === 'rtl' ? <ChevronLeftIcon className="h-6 w-6" /> : <ChevronRightIcon className="h-6 w-6" />}
      </button>
    </>
  );

  return (
    // The lightbox is the only place that drags, and `domAnimation` — the
    // feature set the rest of the app runs on — has no drag or layout code.
    // This component is reached only through `dynamic(..., { ssr: false })`,
    // so `domMax` and the full `motion` component load in its own chunk and
    // never touch the initial bundle. The nested LazyMotion also clears the
    // parent's `strict` flag, which is what allows `motion.*` in here.
    <LazyMotion features={domMax}>
      <AnimatePresence>
        <motion.div
          className="fixed inset-0 z-[100]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Clean, even scrim — clicking any empty area closes. */}
          <div
            className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Hidden neighbour preloaders — fetch prev/next at display resolution. */}
          <div aria-hidden="true" className="pointer-events-none fixed left-0 top-0 h-px w-px overflow-hidden opacity-0">
            {neighbors.map((i) => {
              const b = blurFor(images[i]);
              return (
                <div key={images[i]} className="relative h-px w-px">
                  <Image
                    src={images[i]}
                    alt=""
                    fill
                    loading="eager"
                    quality={78}
                    sizes={stageSizes}
                    placeholder={b ? 'blur' : 'empty'}
                    blurDataURL={b}
                    onLoad={() => markLoaded(images[i])}
                  />
                </div>
              );
            })}
          </div>

          {/* Full-screen layout. pointer-events pass through empty areas to the scrim. */}
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            initial={{ scale: 0.97, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="pointer-events-none absolute inset-0 flex flex-col"
          >
            {/* Counter — top-start, fully padded and visible. */}
            <span
              className="pointer-events-none absolute start-4 top-4 z-30 rounded-full bg-white/12 px-3.5 py-1.5 text-xs font-medium tabular-nums text-white ring-1 ring-white/15 backdrop-blur sm:start-6 sm:top-6"
              aria-live="polite"
            >
              {t('gallery.counter', { current: index + 1, total })}
            </span>

            {/* Close — top-end. */}
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label={t('gallery.close')}
              className="pointer-events-auto absolute end-4 top-4 z-30 grid h-11 w-11 place-items-center rounded-full bg-white/12 text-white ring-1 ring-white/15 backdrop-blur transition-colors hover:bg-white/25 sm:end-6 sm:top-6"
            >
              <CloseIcon className="h-5 w-5" />
            </button>

            {/* Image stage — the frame is centered on both axes and shown LARGE. */}
            <div className="relative flex min-h-0 flex-1 select-none items-center justify-center px-14 pt-16">
              {useDeviceFrame ? (
                <div className="pointer-events-auto relative aspect-[9/19.5] h-full max-h-full">
                  <div className="relative h-full w-full rounded-[2.2rem] bg-[rgb(8_8_10)] p-[8px] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)] ring-1 ring-white/10">
                    <div className="relative h-full w-full overflow-hidden rounded-[1.8rem] bg-[rgb(14_12_12)]">
                      {slide}
                      {spinner}
                      {/* Notch */}
                      <div className="absolute left-1/2 top-2.5 z-10 h-1.5 w-16 -translate-x-1/2 rounded-full bg-black/70" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="pointer-events-auto relative h-full max-h-full w-full max-w-[1400px]">
                  {slide}
                  {spinner}
                </div>
              )}
              {arrows}
            </div>

            {/* Bottom: centered thumbnail strip + contained caption. */}
            <div className="shrink-0 pb-4 pt-3 sm:pb-6">
              {total > 1 && (
                <div className="w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <div
                    className="pointer-events-auto mx-auto flex w-max max-w-full gap-2.5 px-4"
                    role="tablist"
                    aria-label={t('projects.viewGallery')}
                  >
                    {images.map((src, i) => {
                      const b = blurFor(src);
                      return (
                        <button
                          key={src}
                          ref={(el) => {
                            thumbRefs.current[i] = el;
                          }}
                          type="button"
                          role="tab"
                          aria-selected={i === index}
                          aria-label={t('gallery.goToImage', { index: i + 1 })}
                          onClick={() => goTo(i)}
                          className={`relative shrink-0 overflow-hidden rounded-lg transition-all duration-200 ${
                            useDeviceFrame ? 'aspect-[9/19.5] w-11' : 'aspect-[16/10] w-20'
                          } ${
                            i === index
                              ? 'ring-2 ring-gold ring-offset-2 ring-offset-black'
                              : 'opacity-55 ring-1 ring-white/15 hover:opacity-100'
                          }`}
                        >
                          <Image
                            src={src}
                            alt=""
                            fill
                            sizes={useDeviceFrame ? '44px' : '80px'}
                            quality={55}
                            placeholder={b ? 'blur' : 'empty'}
                            blurDataURL={b}
                            className="object-cover object-top"
                            draggable={false}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Caption — centered, contained, legible. */}
              <div className="pointer-events-auto mx-auto mt-3 flex max-w-2xl flex-col items-center gap-1 px-5 text-center">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
                  {project.category === 'web' ? t('projects.filterWeb') : t('projects.filterApp')}
                </span>
                <h3 id={titleId} className="font-display text-base font-bold text-white sm:text-lg">
                  {project.title[locale]}
                </h3>
                <p id={descId} className="line-clamp-2 text-sm leading-relaxed text-white/65">
                  {project.description[locale]}
                </p>
                {project.link ? (
                  <a
                    href={project.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-gold hover:underline"
                  >
                    {t('projects.liveLink')}
                    <ExternalLinkIcon className="h-4 w-4" />
                  </a>
                ) : null}
              </div>
            </div>

            <p className="sr-only">{t('gallery.hint')}</p>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </LazyMotion>
  );
}
