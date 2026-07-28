'use client';

import { LazyMotion, domAnimation } from 'motion/react';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { Locale } from '@/i18n/config';

export function Providers({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <I18nProvider locale={locale}>
        {/*
          `domAnimation` carries animations, variants, exit animations and
          hover/tap/focus gestures — everything the page-level islands use —
          without motion's drag and layout-projection code. `strict` turns any
          surviving full `motion.*` component into a render-time error, so the
          saving cannot silently regress.

          ProjectGallery is the one subtree that needs more: it drags, so it
          wraps itself in `domMax` inside its own lazy chunk.

          Deliberate trade-off: `domMax` here would restore ProjectsGrid's
          `layout`/`layoutId` animations (the filter pill slides rather than
          jumps) but measured +12.0 KB gzipped on first load — enough to push
          the page back above its pre-LazyMotion baseline. Not worth it.
        */}
        <LazyMotion features={domAnimation} strict>
          {children}
        </LazyMotion>
      </I18nProvider>
    </ThemeProvider>
  );
}
