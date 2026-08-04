'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { TubesCursorApp } from 'threejs-components/build/cursors/tubes1.min.js';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The tubes cursor effect, as the hero's background layer.
 *
 * This wraps the `threejs-components` tubes cursor, and it renders
 * **no copy of its own**. The hero's headline, subtitle, CTAs and stats are
 * server-rendered by `Hero.tsx` and are already localised — `titleLine1`,
 * `titleHighlight`, `titleLine2` and `subtitle` per locale. Duplicating any of
 * that here would put a second, English-only, client-rendered copy of the LCP
 * text on the page.
 *
 * So the split is: this file owns the canvas, `Hero.tsx` owns the words.
 *
 * --- Four things this does that the library's own demo does not ---
 *
 * 1. **`absolute`, not `fixed`.** A fixed canvas escapes the hero and covers the
 *    whole document, so the projects grid and everything below would scroll
 *    underneath it.
 * 2. **`pointer-events: none`.** The hero has two CTAs and a WhatsApp button in
 *    front of this. A canvas that takes clicks makes them unclickable. The effect
 *    still follows the pointer, because the library listens on the window rather
 *    than on the canvas.
 * 3. **No click-to-randomise.** Random hex has no relationship to the site's
 *    palette, and on a portfolio the colours are a brand decision rather than a
 *    toy. The tubes are initialised from the palette tokens below and stay there.
 * 4. **It declines reduced motion.** A continuous full-width animation behind the
 *    headline is exactly what that preference is asking not to see.
 */

/**
 * Read from the site's own tokens rather than the library's demo palette.
 *
 * `--glow-1` (violet) and `--glow-2` (electric blue) are the hero's one light
 * source, and `--brand-2` sits between them — so the tubes read as the same
 * light the rest of the page is lit by instead of as a third scheme. Values are
 * resolved at runtime so the tubes follow a token edit.
 */
/*
 * Last resort only: they fire when a token cannot be read at all, which means
 * the stylesheet did not apply and the whole page is unstyled. They mirror the
 * DARK values deliberately — the effect is gated to the dark theme, so that is
 * the only palette it can ever be asked for.
 */
const FALLBACK_TUBE_COLORS = ['#8b5cf6', '#6366f1', '#3b82f6'];
const FALLBACK_LIGHT_COLORS = ['#8b5cf6', '#6366f1', '#3b82f6', '#60a5fa'];

/** `--glow-1` etc. are stored as `139 92 246`; the library wants `#8b5cf6`. */
function tokenToHex(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const parts = styles.getPropertyValue(name).trim().split(/\s+/).map(Number);
  const [r, g, b] = parts;
  if (parts.length !== 3 || r === undefined || g === undefined || b === undefined) {
    return fallback;
  }
  if (![r, g, b].every((v) => Number.isFinite(v))) return fallback;
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

function readPalette(): { tubes: string[]; lights: string[] } {
  const styles = getComputedStyle(document.documentElement);
  const glow1 = tokenToHex(styles, '--glow-1', FALLBACK_TUBE_COLORS[0] ?? '#8b5cf6');
  const brand2 = tokenToHex(styles, '--brand-2', FALLBACK_TUBE_COLORS[1] ?? '#6366f1');
  const glow2 = tokenToHex(styles, '--glow-2', FALLBACK_TUBE_COLORS[2] ?? '#3b82f6');
  const brand3 = tokenToHex(styles, '--brand-3', FALLBACK_LIGHT_COLORS[3] ?? '#60a5fa');
  return { tubes: [glow1, brand2, glow2], lights: [glow1, brand2, glow2, brand3] };
}

/**
 * Light intensity. The library's own preset is 200, which on this palette blows
 * the tubes out to white and loses the violet-to-blue read entirely — the colour
 * only survives at a fraction of it.
 */
const LIGHT_INTENSITY = 60;

/**
 * The live scene, parked at module scope so it can outlive a remount.
 *
 * A locale switch re-keys the `[locale]` segment, which unmounts and remounts
 * everything under it — including this component. Rebuilding a three.js app and
 * a WebGL context from scratch on each switch took 1–2s to fade back in, which
 * is the "animation plays late" half of the bug. So the canvas is created once,
 * kept out of React's hands, and re-parented into whatever host is current.
 *
 * Leaving the scene alive forever would be a real leak — navigating to a route
 * with no hero would keep its rAF loop compositing for the life of the tab. So
 * an unmount schedules the dispose instead of performing it, and a remount
 * inside the grace window cancels it. A locale switch remounts within the same
 * frame; a genuine navigation away does not, and pays the dispose.
 */
let scene: { canvas: HTMLCanvasElement; app: TubesCursorApp } | null = null;
let disposeTimer: ReturnType<typeof setTimeout> | null = null;
const RETAIN_MS = 2000;

function disposeScene() {
  disposeTimer = null;
  // Feature-tested: the package publishes no types and no changelog, so a
  // rename would otherwise throw here. Without it the WebGL context and its rAF
  // loop leak for the life of the tab.
  scene?.app.dispose?.();
  scene?.canvas.remove();
  scene = null;
}

export function HeroTubes() {
  const hostRef = useRef<HTMLDivElement>(null);
  /*
   * Already true when a scene is being reclaimed, so the reused canvas is
   * opaque on its very first committed frame instead of re-running the 700ms
   * fade on every locale switch.
   */
  const [ready, setReady] = useState(() => scene !== null);

  /*
   * The gate reads the provider, not `document.documentElement.classList`.
   *
   * The class is not a source of truth: on a locale switch React strips every
   * attribute off <html> during the same commit this component mounts in, so a
   * DOM read here returned false and the effect never ran — that is the
   * "animation doesn't play" half of the bug. The provider's value is resolved
   * from storage and survives the strip. Reading it also makes the gate
   * reactive, so toggling the theme starts or stops the effect instead of
   * leaving whatever was decided at mount.
   *
   * The dark-palette gate itself is not decoration. The tubes are bright
   * strokes on a dark field; on the light theme `--fg` is near-black and the
   * headline would sit on top of them at roughly no contrast. That is the same
   * defect the depth-map hero had (MIGRATION.md §12) and it is why this
   * declines rather than tries to compensate.
   */
  const { theme } = useTheme();
  const [reducedMotion] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const allowed = theme === 'dark' && !reducedMotion;

  /*
   * Layout, not passive: reclaiming an existing scene has to re-parent the
   * canvas before the browser paints, or the hero shows one empty frame on
   * every locale switch. Safe because this component is behind
   * `dynamic(..., { ssr: false })` and never renders on the server.
   */
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!allowed || !host) return;

    if (disposeTimer !== null) {
      clearTimeout(disposeTimer);
      disposeTimer = null;
    }

    let cancelled = false;
    let frame = 0;

    if (scene) {
      // No setReady here: `ready` was already seeded from `scene !== null` in
      // the state initialiser, so the reused canvas is opaque on the first
      // committed frame. Setting it again would only be a cascading render.
      host.appendChild(scene.canvas);
    } else {
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      canvas.className = 'absolute inset-0 h-full w-full';
      host.appendChild(canvas);

      /*
       * One frame, so the canvas has been laid out before the library measures
       * it. Initialised in the same tick its dimensions are still 0 and the
       * library divides by them — which surfaces as `Computed radius is NaN`
       * and a canvas that never draws.
       */
      frame = requestAnimationFrame(() => {
        void import('threejs-components/build/cursors/tubes1.min.js')
          .then(({ default: createTubesCursor }) => {
            const palette = readPalette();
            scene = {
              canvas,
              app: createTubesCursor(canvas, {
                tubes: {
                  colors: palette.tubes,
                  lights: { intensity: LIGHT_INTENSITY, colors: palette.lights },
                },
              }),
            };
            // Unmounted while the chunk was in flight: the scene exists now, so
            // it has to go through the same retain-then-dispose path rather
            // than be abandoned.
            if (cancelled) {
              canvas.remove();
              disposeTimer = setTimeout(disposeScene, RETAIN_MS);
              return;
            }
            setReady(true);
          })
          .catch((error: unknown) => {
            // Visible rather than swallowed: the failure mode is an empty hero,
            // which looks identical to "the effect is subtle".
            console.error('HeroTubes: failed to load the animation module', error);
            canvas.remove();
          });
      });
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (scene) {
        scene.canvas.remove();
        disposeTimer = setTimeout(disposeScene, RETAIN_MS);
      }
    };
  }, [allowed]);

  if (!allowed) return null;

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      // Fades in once the first frame exists, so the handover is a crossfade
      // rather than a pop — and a context that dies after creation leaves the
      // page background rather than a black rectangle.
      className={`absolute inset-0 h-full w-full transition-opacity duration-700 ${
        ready ? 'opacity-100' : 'opacity-0'
      }`}
    />
  );
}
