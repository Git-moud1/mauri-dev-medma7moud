'use client';

import dynamic from 'next/dynamic';

/**
 * The lazy boundary for the hero's tubes effect.
 *
 * This wrapper exists only to hold the `next/dynamic` call, and it has to be its
 * own client file: `Hero.tsx` is a server component, and `ssr: false` is not
 * allowed from one.
 *
 * The boundary is the whole reason this is affordable. `tubes1.min.js` is ~760 KB
 * with three.js bundled inside it — nearly twice the depth-map hero that was
 * rejected on weight (MIGRATION.md §12). Behind `ssr: false` none of it reaches
 * the entry chunk or the server render, so the headline still paints from static
 * HTML with no JavaScript involved, and the effect arrives afterwards or not at
 * all. There is deliberately no `loading` component: the hero underneath is
 * already complete, so there is nothing to spin for.
 */
const HeroTubes = dynamic(() => import('./HeroTubes').then((mod) => mod.HeroTubes), {
  ssr: false,
});

export function HeroTubesLayer() {
  return <HeroTubes />;
}
