'use client';

import { useEffect, useRef, useState } from 'react';
import type { TubesCursorApp } from 'threejs-components/build/cursors/tubes1.min.js';

/**
 * The tubes cursor effect, as the hero's background layer.
 *
 * This is the same library as `components/ui/tubes-curor.tsx`, but it renders
 * **no copy of its own**. The hero's headline, subtitle, CTAs and stats are
 * server-rendered by `Hero.tsx` and are already localised — `titleLine1`,
 * `titleHighlight`, `titleLine2` and `subtitle` per locale. Duplicating any of
 * that here would put a second, English-only, client-rendered copy of the LCP
 * text on the page.
 *
 * So the split is: this file owns the canvas, `Hero.tsx` owns the words.
 *
 * --- Four things this does that the demo component does not ---
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

export function HeroTubes() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<TubesCursorApp | null>(null);
  const [ready, setReady] = useState(false);

  /*
   * Both preferences are read in the state initialiser rather than in an effect.
   * Neither can change what has already been mounted, and writing them from
   * inside an effect costs a committed render of the wrong value first.
   *
   * The dark-palette gate is not decoration. The tubes are bright strokes on a
   * dark field; on the light theme `--fg` is near-black and the headline would
   * sit on top of them at roughly no contrast. That is the same defect the
   * depth-map hero had (MIGRATION.md §12) and it is why this declines rather than
   * tries to compensate.
   */
  const [allowed] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    return document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;

    /*
     * One frame, so the canvas has been laid out before the library measures it.
     * Initialised in the same tick its dimensions are still 0 and the library
     * divides by them — which surfaces as `Computed radius is NaN` and a canvas
     * that never draws.
     */
    const frame = requestAnimationFrame(() => {
      void import('threejs-components/build/cursors/tubes1.min.js')
        .then(({ default: createTubesCursor }) => {
          if (cancelled || !canvasRef.current) return;
          const palette = readPalette();
          appRef.current = createTubesCursor(canvasRef.current, {
            tubes: {
              colors: palette.tubes,
              lights: { intensity: LIGHT_INTENSITY, colors: palette.lights },
            },
          });
          setReady(true);
        })
        .catch((error: unknown) => {
          // Visible rather than swallowed: the failure mode is an empty hero,
          // which looks identical to "the effect is subtle".
          console.error('HeroTubes: failed to load the animation module', error);
        });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      // Feature-tested: the package publishes no types and no changelog, so a
      // rename would otherwise throw inside a cleanup. Without it the WebGL
      // context and its rAF loop leak for the life of the tab.
      appRef.current?.dispose?.();
      appRef.current = null;
    };
  }, [allowed]);

  if (!allowed) return null;

  return (
    <canvas
      ref={canvasRef}
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
