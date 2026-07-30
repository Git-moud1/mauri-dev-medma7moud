'use client';

import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';

import type { Locale } from '@/i18n/config';

import {
  conceptFromLocation,
  useHeroCapability,
  useIsCharcoalPalette,
  useIsRenderable,
  type HeroConcept,
} from './capability';
import type { Direction } from './LatticePoster';

/**
 * All three concepts are code-split and none is in the page bundle. Only the one
 * a visitor's URL selects is ever fetched, and only after this island has mounted
 * and decided the device can take it — so no download can compete with the
 * headline's paint, and choosing A2 or A3 cannot make A1's first load worse.
 *
 * This matters most for A3. `three/webgpu` is by far the heaviest of the three
 * (the node-material layer alone is ~414 KB gzipped before tree-shaking, on top
 * of the `three.core.js` it shares with A2), so it is only affordable at all
 * because nothing on the critical path references it. There is deliberately no
 * `prefetch` and no `preload` hint: warming this chunk on `/ar`'s first paint
 * would put it in competition with the headline, which is the one thing the
 * lazy boundary exists to prevent.
 */
const ShaderLattice = dynamic(
  () => import('./ShaderLattice').then((mod) => mod.ShaderLattice),
  { ssr: false },
);
const MeshLattice = dynamic(
  () => import('./MeshLattice').then((mod) => mod.MeshLattice),
  {
    ssr: false,
  },
);
const DepthField = dynamic(() => import('./DepthField').then((mod) => mod.DepthField), {
  ssr: false,
});

export interface HeroLayerProps {
  dir: Direction;
  /**
   * Needed by A3, whose text overlay has to gate `uppercase` per locale and pull
   * real copy from the dictionary. `dir` alone cannot do it: /en and /fr share a
   * direction but not a language, and Arabic's case-insensitivity is a property
   * of the script rather than of the direction.
   */
  locale: Locale;
  /** False whenever the hero is off-screen or the tab is hidden. */
  active: boolean;
}

/**
 * Hosts the animated hero layer over the server-rendered poster.
 *
 * This component deliberately renders **nothing** in the common case — the
 * poster underneath it is already the composed image, so there is no empty box
 * to fill and no spinner to show. It adds a canvas only when the visitor's
 * device and preferences allow one.
 *
 * It also never affects layout. The wrapper is `absolute inset-0` inside the
 * hero's own reserved, `relative` box, so the canvas has no size of its own to
 * contribute and cannot shift anything — the reason the brief's "reserve its
 * box" rule is satisfied by construction rather than by a fixed height that
 * would then be wrong at some viewport.
 */
export function HeroCanvas({ dir, locale }: { dir: Direction; locale: Locale }) {
  const capability = useHeroCapability();
  const hostRef = useRef<HTMLDivElement>(null);
  const active = useIsRenderable(hostRef);
  // Read once, in the initialiser rather than in an effect. It is safe for this
  // to differ from the server because nothing renders until `capability` says
  // `animate`, and the server's capability is always `poster` — so the value
  // cannot reach the first commit and cannot cause a hydration mismatch.
  const [concept] = useState<HeroConcept>(() =>
    typeof window === 'undefined' ? 'a1' : conceptFromLocation(window.location.search),
  );

  /*
   * A3, and only A3, declines the light palette.
   *
   * Its backdrop is a photograph with charcoal baked in, so on the light theme
   * the hero's near-black `--fg` headline ends up on a dark image and stops being
   * readable — a legibility failure, not a style mismatch. A1 and A2 both read
   * `--bg` live and are unaffected.
   *
   * Checked *after* `capability`, not folded into it, so a reduced-motion visitor
   * on the light theme is still told `reduced-motion`. That is the same ordering
   * principle the probe itself follows: report the reason that would have applied
   * anyway, not the one that happened to be evaluated last.
   */
  const charcoal = useIsCharcoalPalette();
  const paletteBlocked = concept === 'a3' && !charcoal;
  const animating = capability.kind === 'animate' && !paletteBlocked;
  const reason =
    capability.kind !== 'animate'
      ? capability.reason
      : paletteBlocked
        ? 'light-palette'
        : undefined;

  return (
    <div
      ref={hostRef}
      // Exposed so a measurement run can tell *why* it got the poster instead
      // of inferring it. A fallback that cannot be distinguished from a broken
      // canvas is a fallback you cannot verify.
      data-hero-layer={
        animating ? concept : capability.kind === 'animate' ? 'poster' : capability.kind
      }
      data-hero-reason={reason}
      className="absolute inset-0"
    >
      {/*
        Switched on the concept, with A1 as the `default` rather than as one more
        branch. An unrecognised `?hero=` value has already been resolved to `a1`
        by `conceptFromLocation`, so this only has to keep faith with that: there
        is exactly one arm that renders nothing new, and it renders A1.
      */}
      {animating ? (
        concept === 'a3' ? (
          <DepthField dir={dir} locale={locale} active={active} />
        ) : concept === 'a2' ? (
          <MeshLattice dir={dir} locale={locale} active={active} />
        ) : (
          <ShaderLattice dir={dir} locale={locale} active={active} />
        )
      ) : null}
    </div>
  );
}
