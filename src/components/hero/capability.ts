'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * What the visitor's device and preferences will actually tolerate.
 *
 * Every one of these is a hard rule from the plan-3 brief, and each is a
 * separate reason to fall back rather than one blended "is this a good device"
 * score — a visitor who asked for reduced motion has not asked for a *cheaper*
 * animation, they have asked for none, and a save-data visitor on a fast phone
 * is a different case from a slow phone on wifi.
 */
export type HeroCapability =
  | { kind: 'animate' }
  /** Reduced motion: a still, composed frame. Not nothing, and not broken. */
  | { kind: 'still'; reason: 'reduced-motion' }
  /** Static poster only: no canvas is created at all. */
  | {
      kind: 'poster';
      reason: 'save-data' | 'low-end' | 'no-webgl' | 'ssr' | 'light-palette';
    };

/**
 * The concept to render. `a1` is the raw-GLSL shader, `a2` the three.js scene,
 * `a3` the depth-map plane in TSL on `three/webgpu`.
 */
export type HeroConcept = 'a1' | 'a2' | 'a3';

/**
 * Everything except the default. Listing them rather than testing `!== 'a1'`
 * keeps the "unknown value falls back to the default" rule true by construction:
 * a typo in the query string cannot select a concept, and adding a fourth
 * concept cannot accidentally make every misspelling resolve to it.
 */
const ALTERNATES = ['a2', 'a3'] as const satisfies readonly HeroConcept[];

/*
 * Module constants, not objects built per call.
 *
 * `useSyncExternalStore` compares snapshots with `Object.is`, so a `getSnapshot`
 * that returns a fresh object every time re-renders forever. These are the only
 * values the store can ever return.
 */
const ANIMATE: HeroCapability = { kind: 'animate' };
const STILL: HeroCapability = { kind: 'still', reason: 'reduced-motion' };
const SSR: HeroCapability = { kind: 'poster', reason: 'ssr' };
const SAVE_DATA: HeroCapability = { kind: 'poster', reason: 'save-data' };
const LOW_END: HeroCapability = { kind: 'poster', reason: 'low-end' };
const NO_WEBGL: HeroCapability = { kind: 'poster', reason: 'no-webgl' };

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * Every concept is reachable on a deployed build with no rebuild: `?hero=a2`,
 * `?hero=a3`.
 *
 * Read from the browser rather than from the route's `searchParams`,
 * deliberately. Touching `searchParams` in a server component opts `/[locale]`
 * out of static prerendering, and that route being SSG is what the whole
 * architecture rests on — a query param for a design comparison is not worth
 * forfeiting the CDN HTML. The canvas is client-only and post-paint anyway.
 */
export function conceptFromLocation(search: string): HeroConcept {
  const value = new URLSearchParams(search).get('hero');
  return ALTERNATES.find((concept) => concept === value) ?? 'a1';
}

/**
 * WebGL support, asked the only way that is trustworthy: by trying.
 *
 * A `'WebGL2RenderingContext' in window` style check passes on devices that then
 * hand back a null context or a software rasteriser, which is how you ship a
 * black rectangle. The probe context is explicitly released afterwards —
 * browsers cap live WebGL contexts per document, and leaking one here would
 * cost the real canvas its own.
 */
function hasUsableWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function wantsSaveData(): boolean {
  const nav: Navigator & { connection?: { saveData?: boolean } } = navigator;
  return nav.connection?.saveData === true;
}

/**
 * `deviceMemory` is Chromium-only and absent elsewhere, so a missing value must
 * not read as "low end" — that would put every Safari and Firefox visitor on the
 * poster. Only an explicitly small number counts.
 */
function isLowEnd(): boolean {
  const nav: Navigator & { deviceMemory?: number } = navigator;
  const cores = navigator.hardwareConcurrency;
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2) return true;
  return typeof cores === 'number' && cores > 0 && cores <= 2;
}

/**
 * The three hard blocks are probed once per document and cached: creating a
 * throwaway WebGL context on every snapshot read would be absurd, and none of
 * these three can change within a page view. `undefined` means "not yet
 * probed"; `null` means "probed, nothing blocks".
 */
let hardBlock: HeroCapability | null | undefined;

function getSnapshot(): HeroCapability {
  /*
   * Reduced motion is checked first, ahead of the device probes, for two
   * reasons.
   *
   * It is the more truthful answer: a visitor who has asked for reduced motion
   * gets the still frame because they asked, and that stays the operative reason
   * whatever their hardware happens to support — reporting `no-webgl` to someone
   * who would have been given a still frame anyway is just wrong. And it means
   * such a visitor never pays for the WebGL probe, which creates and destroys a
   * real context to answer a question the preference has already settled.
   *
   * It is also read live rather than cached, because unlike the three device
   * facts below it can change mid-session.
   */
  if (window.matchMedia(REDUCED_MOTION).matches) return STILL;

  if (hardBlock === undefined) {
    hardBlock = wantsSaveData()
      ? SAVE_DATA
      : isLowEnd()
        ? LOW_END
        : hasUsableWebGL()
          ? null
          : NO_WEBGL;
  }
  return hardBlock ?? ANIMATE;
}

function getServerSnapshot(): HeroCapability {
  return SSR;
}

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', onChange);
  return () => {
    query.removeEventListener('change', onChange);
  };
}

/**
 * `useSyncExternalStore` rather than `useState` + `useEffect`.
 *
 * Every input here is a browser API, so the value cannot be known during
 * render on the server — but writing it in via `setState` in an effect costs an
 * extra committed render of the wrong value first, and React now flags that
 * pattern. This reads the real value on the first client render and subscribes
 * for the one input that can change.
 */
export function useHeroCapability(): HeroCapability {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * True while the hero is on screen and the tab is visible — the render loop's
 * on/off switch.
 *
 * Both halves matter and neither substitutes for the other: scrolling past the
 * hero leaves the tab visible, and switching tabs leaves the hero intersecting.
 * A loop that only checks one keeps burning frames in the other case.
 */
export function useIsRenderable(target: React.RefObject<Element | null>): boolean {
  const [onScreen, setOnScreen] = useState(true);
  const tabVisible = useSyncExternalStore(
    subscribeToVisibility,
    getVisibilitySnapshot,
    getVisibilityServerSnapshot,
  );

  useEffect(() => {
    const node = target.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setOnScreen(entry?.isIntersecting ?? true);
      },
      // Wakes the loop slightly before the hero is back in view, so the first
      // visible frame is not the one that starts the clock.
      { rootMargin: '96px' },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [target]);

  return onScreen && tabVisible;
}

function subscribeToVisibility(onChange: () => void): () => void {
  document.addEventListener('visibilitychange', onChange);
  return () => {
    document.removeEventListener('visibilitychange', onChange);
  };
}

function getVisibilitySnapshot(): boolean {
  return document.visibilityState === 'visible';
}

function getVisibilityServerSnapshot(): boolean {
  return true;
}

/**
 * Whether the charcoal palette is active.
 *
 * This is a capability question rather than a styling one, and only for A3.
 *
 * A1 paints its whole canvas from `--bg` and A2 reads the token into its fog and
 * materials, so both follow the theme for free. A3's backdrop is a *photograph*
 * with charcoal baked into it. On the light palette that leaves the hero's dark
 * image underneath `--fg` at its light-theme value — near-black text — and the
 * headline stops being readable. Measured, not guessed: see
 * `.hero-measure/a3-en-light-theme.png`.
 *
 * A concept that cannot render legibly in a palette should decline that palette,
 * the same way one that cannot get a GPU context declines the device. The poster
 * is already the answer for every other "not here" case.
 */
export function useIsCharcoalPalette(): boolean {
  return useSyncExternalStore(
    subscribeToPalette,
    getPaletteSnapshot,
    getPaletteServerSnapshot,
  );
}

function subscribeToPalette(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  return () => {
    observer.disconnect();
  };
}

function getPaletteSnapshot(): boolean {
  return document.documentElement.classList.contains('dark');
}

function getPaletteServerSnapshot(): boolean {
  // Unused in practice — the server's capability is always `poster`, so nothing
  // reads this before hydration. It matches no-flash.tsx's own default.
  return true;
}

/**
 * Device-pixel-ratio cap. A 3x phone renders 9x the fragments of a 1x screen for
 * a background that is deliberately soft, so the top of that range buys nothing
 * visible and costs the GPU a great deal.
 */
export const MAX_DPR = 1.75;

export function cappedDpr(): number {
  return Math.min(window.devicePixelRatio || 1, MAX_DPR);
}
