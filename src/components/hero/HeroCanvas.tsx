'use client';

import dynamic from 'next/dynamic';
import { useRef } from 'react';

import { useHeroCapability, useIsRenderable } from './capability';
import type { Direction } from './LatticePoster';

/**
 * The concept is code-split and is not in the page bundle. It is fetched only
 * after this island has mounted and decided the device can take it — so the
 * download cannot compete with the headline's paint.
 */
const ShaderLattice = dynamic(
  () => import('./ShaderLattice').then((mod) => mod.ShaderLattice),
  { ssr: false },
);

export interface HeroLayerProps {
  dir: Direction;
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
export function HeroCanvas({ dir }: { dir: Direction }) {
  const capability = useHeroCapability();
  const hostRef = useRef<HTMLDivElement>(null);
  const active = useIsRenderable(hostRef);
  const animating = capability.kind === 'animate';

  return (
    <div
      ref={hostRef}
      // Exposed so a measurement run can tell *why* it got the poster instead
      // of inferring it. A fallback that cannot be distinguished from a broken
      // canvas is a fallback you cannot verify.
      data-hero-layer={animating ? 'a1' : capability.kind}
      data-hero-reason={capability.kind === 'animate' ? undefined : capability.reason}
      className="absolute inset-0"
    >
      {animating ? <ShaderLattice dir={dir} active={active} /> : null}
    </div>
  );
}
