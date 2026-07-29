/** Matches the return type of `dirFor`, which has no exported alias. */
export type Direction = 'rtl' | 'ltr';

/**
 * The hero's still frame: one lattice, folded twice — once into a wide viewport,
 * once into a phone.
 *
 * This is not a placeholder. It is the composed frame the whole hero resolves
 * to, and it does four jobs:
 *
 *   1. It is server-rendered HTML, so it paints with the headline. Nothing
 *      waits for it and it cannot be the reason the `<h1>` is late.
 *   2. It sits underneath the canvas permanently, so there is no flash of empty
 *      hero before the animated layer arrives — and no flash of empty hero if
 *      the canvas never arrives.
 *   3. It is what `prefers-reduced-motion` gets. The brief asks for a still,
 *      composed frame rather than nothing, and this is the same composition the
 *      animation passes through at rest.
 *   4. It is the save-data / low-end / no-WebGL fallback.
 *
 * Inline SVG rather than an image file: it is a few hundred bytes of geometry
 * that themes itself from the CSS tokens, where a rendered PNG would need two
 * exports for the two palettes and would still be wrong at the third one.
 */
export function LatticePoster({ dir }: { dir: Direction }) {
  return (
    <svg
      viewBox="0 0 1200 620"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      className="h-full w-full"
      // The whole composition mirrors in Arabic, so the fold reads in the same
      // direction the language does and the phone stays on the reading-side
      // edge. A directional composition that does not mirror is the tell that
      // RTL was a port.
      style={dir === 'rtl' ? { transform: 'scaleX(-1)' } : undefined}
    >
      <defs>
        {/* The shared lattice. One pattern, referenced by both frames — the
            metaphor only works if it is visibly the same grid. */}
        <pattern id="hp-grid" width="44" height="44" patternUnits="userSpaceOnUse">
          <path
            d="M44 0H0V44"
            fill="none"
            stroke="rgb(var(--brand-3))"
            strokeWidth="1"
            strokeOpacity="0.42"
          />
        </pattern>
        <pattern id="hp-grid-dense" width="22" height="22" patternUnits="userSpaceOnUse">
          <path
            d="M22 0H0V22"
            fill="none"
            stroke="rgb(var(--brand-1))"
            strokeWidth="0.75"
            strokeOpacity="0.5"
          />
        </pattern>

        {/* One light source. Violet at the core bleeding to electric blue, off
            to one side so the two frames are lit from the same place. */}
        <radialGradient id="hp-glow" cx="34%" cy="26%" r="62%">
          <stop offset="0%" stopColor="rgb(var(--glow-1))" stopOpacity="0.5" />
          <stop offset="45%" stopColor="rgb(var(--glow-2))" stopOpacity="0.22" />
          <stop offset="100%" stopColor="rgb(var(--glow-2))" stopOpacity="0" />
        </radialGradient>

        <linearGradient id="hp-edge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgb(var(--brand-1))" />
          <stop offset="100%" stopColor="rgb(var(--brand-3))" />
        </linearGradient>

        {/* Fades the lattice out before it reaches the headline, so text never
            sits on the busiest part of the drawing. */}
        <linearGradient id="hp-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="hp-mask">
          <rect width="1200" height="620" fill="url(#hp-fade)" />
        </mask>
      </defs>

      <rect width="1200" height="620" fill="url(#hp-glow)" />

      <g mask="url(#hp-mask)">
        {/* The unfolded ground plane the two frames rise out of. */}
        <rect y="300" width="1200" height="320" fill="url(#hp-grid)" opacity="0.5" />

        {/* Folded up on the light side: a wide viewport. The matrix is a shear
            plus a vertical squash — a plane standing away from the viewer. */}
        <g transform="matrix(1 0 -0.32 0.86 232 96)">
          <rect
            width="520"
            height="330"
            rx="14"
            fill="url(#hp-grid-dense)"
            stroke="url(#hp-edge)"
            strokeWidth="2"
          />
          <path d="M0 34H520" stroke="url(#hp-edge)" strokeWidth="1.5" opacity="0.75" />
          <circle cx="26" cy="17" r="4.5" fill="rgb(var(--brand-1))" opacity="0.85" />
          <circle cx="44" cy="17" r="4.5" fill="rgb(var(--brand-2))" opacity="0.7" />
          <circle cx="62" cy="17" r="4.5" fill="rgb(var(--brand-3))" opacity="0.55" />
        </g>

        {/* The same plane, folded the other way and narrowed: a phone. Same
            lattice pitch, same edge gradient, no second grid. */}
        <g transform="matrix(1 0 0.3 0.9 838 128)">
          <rect
            width="176"
            height="352"
            rx="26"
            fill="url(#hp-grid-dense)"
            stroke="url(#hp-edge)"
            strokeWidth="2"
          />
          <rect
            x="62"
            y="14"
            width="52"
            height="8"
            rx="4"
            fill="rgb(var(--brand-3))"
            opacity="0.6"
          />
        </g>

        {/* The seam. The lattice is continuous through the fold, which is the
            entire claim: not two products, one structure seen twice. */}
        <path
          d="M596 470C676 452 742 430 812 396"
          fill="none"
          stroke="url(#hp-edge)"
          strokeWidth="1.5"
          strokeDasharray="5 7"
          opacity="0.65"
        />
      </g>
    </svg>
  );
}
