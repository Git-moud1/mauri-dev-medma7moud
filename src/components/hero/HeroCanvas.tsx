'use client';

import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';

import {
  conceptFromLocation,
  useHeroCapability,
  useIsRenderable,
  type HeroConcept,
} from './capability';
import type { Direction } from './LatticePoster';

/**
 * Both concepts are code-split and neither is in the page bundle. Only the one a
 * visitor's URL selects is ever fetched, and only after this island has mounted
 * and decided the device can take it — so neither download can compete with the
 * headline's paint, and choosing A2 cannot make A1's first load worse.
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
  // Read once, in the initialiser rather than in an effect. It is safe for this
  // to differ from the server because nothing renders until `capability` says
  // `animate`, and the server's capability is always `poster` — so the value
  // cannot reach the first commit and cannot cause a hydration mismatch.
  const [concept] = useState<HeroConcept>(() =>
    typeof window === 'undefined' ? 'a1' : conceptFromLocation(window.location.search),
  );
  const animating = capability.kind === 'animate';

  return (
    <div
      ref={hostRef}
      // Exposed so a measurement run can tell *why* it got the poster instead
      // of inferring it. A fallback that cannot be distinguished from a broken
      // canvas is a fallback you cannot verify.
      data-hero-layer={animating ? concept : capability.kind}
      data-hero-reason={capability.kind === 'animate' ? undefined : capability.reason}
      className="absolute inset-0"
    >
      {animating ? (
        concept === 'a2' ? (
          <MeshLattice dir={dir} active={active} />
        ) : (
          <ShaderLattice dir={dir} active={active} />
        )
      ) : null}
    </div>
  );
}
