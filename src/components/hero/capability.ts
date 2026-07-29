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
  | { kind: 'poster'; reason: 'save-data' | 'low-end' | 'no-webgl' | 'ssr' };

/** The concept to render. `a1` is the shader, `a2` the three.js scene. */
export type HeroConcept = 'a1' | 'a2';

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
 * Both concepts are reachable on a deployed build with no rebuild: `?hero=a2`.
 *
 * Read from the browser rather than from the route's `searchParams`,
 * deliberately. Touching `searchParams` in a server component opts `/[locale]`
 * out of static prerendering, and that route being SSG is what the whole
 * architecture rests on — a query param for a design comparison is not worth
 * forfeiting the CDN HTML. The canvas is client-only and post-paint anyway.
 */
export function conceptFromLocation(search: string): HeroConcept {
  return new URLSearchParams(search).get('hero') === 'a2' ? 'a2' : 'a1';
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
  if (hardBlock === undefined) {
    hardBlock = wantsSaveData()
      ? SAVE_DATA
      : isLowEnd()
        ? LOW_END
        : hasUsableWebGL()
          ? null
          : NO_WEBGL;
  }
  if (hardBlock !== null) return hardBlock;
  // Reduced motion *can* change mid-session, which is why it is read live here
  // rather than folded into the cached probe above.
  return window.matchMedia(REDUCED_MOTION).matches ? STILL : ANIMATE;
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
 * Device-pixel-ratio cap. A 3x phone renders 9x the fragments of a 1x screen for
 * a background that is deliberately soft, so the top of that range buys nothing
 * visible and costs the GPU a great deal.
 */
export const MAX_DPR = 1.75;

export function cappedDpr(): number {
  return Math.min(window.devicePixelRatio || 1, MAX_DPR);
}
