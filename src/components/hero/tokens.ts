'use client';

export type Rgb01 = readonly [number, number, number];

/**
 * Reads a design token like `--glow-1` (stored as `139 92 246`) into 0..1
 * floats, which is what both WebGL and three.js want.
 *
 * Shared by both concepts on purpose: the canvas colours have to come from the
 * same tokens the rest of the site uses, or the hero drifts away from the
 * palette the moment either is edited. Two copies of this parser would be two
 * chances to disagree about the fallback.
 *
 * Destructured rather than indexed so it type-checks without non-null
 * assertions — `parts[0]!` would be asserting exactly the thing the length
 * check above it already establishes, and the compiler cannot see the link.
 */
export function readRgbToken(
  styles: CSSStyleDeclaration,
  name: string,
  fallback: Rgb01,
): Rgb01 {
  const [r, g, b, ...rest] = styles
    .getPropertyValue(name)
    .trim()
    .split(/\s+/)
    .map(Number);
  if (
    rest.length > 0 ||
    r === undefined ||
    g === undefined ||
    b === undefined ||
    !Number.isFinite(r) ||
    !Number.isFinite(g) ||
    !Number.isFinite(b)
  ) {
    return fallback;
  }
  return [r / 255, g / 255, b / 255];
}

/** Re-reads tokens whenever the `dark` class flips on `<html>`. */
export function observeTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  return () => {
    observer.disconnect();
  };
}
