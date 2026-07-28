# v2 Progress

One block per task. Bundle figures are gzipped, measured with
`node scripts/measure-bundle.mjs` against `next start` on a fresh build —
`next start` serves uncompressed, so the script gzips locally to stay
comparable with Netlify.

Tasks 0–10a are recorded in their commit messages; this log starts at 10b.
State at that point (commit `f955f21`): `/ar` and `/en` both 238.7 KB JS;
fonts 55.7 KB on `/ar`, 84.8 KB on `/en`.

---

## Task 10b — Reveal without the animation library

**What changed**

- `src/components/Reveal.tsx` rewritten: IntersectionObserver plus a CSS class
  flip, no `motion` import. Holds no React state — the reveal is one class
  added imperatively to a node that never re-renders, which also avoids
  `react-hooks/set-state-in-effect`.
- `src/app/globals.css`: `.reveal` / `.reveal-in` added under
  `@layer components`, declared **after** `.card-hover` because both land on the
  same elements and `transition` is a shorthand — last declaration wins, so the
  hover properties are repeated in `.reveal`.
- `src/components/islands/ProjectsGrid.tsx`: comment recording the filter-pill
  decision (jumps rather than slides; `domAnimation` has no layout projection
  and `domMax` costs 12.0 KB — not taken).
- `tests/smoke.spec.ts`: two tests added. One is protected (see below).

**Bundle**

| Route | Before (f955f21) | After | Delta |
|---|---|---|---|
| `/ar` | 238.7 KB | **235.6 KB** | −3.1 KB |
| `/en` | 238.7 KB | **235.6 KB** | −3.1 KB |

Fonts unchanged: 55.7 KB `/ar`, 84.8 KB `/en`, 0 preloaded on both.

The drop is small on purpose. `motion` was never Reveal's cost alone — the `m`
core plus `domAnimation` still ship for LanguageSwitcher, ThemeToggle, the
drawer, ProjectsGrid, FloatingWhatsApp and ContactForm. Removing Reveal drops
only its own variants. Owner decision stands: the remaining islands keep their
motion, and the final JS target is set in plan 3 once the new hero lands.
**Still over the original 150 KB figure at 235.6 KB.**

**Bugs**

- B3 partially closed: every reveal on the page now honours
  `prefers-reduced-motion: reduce`, twice over — the CSS renders `.reveal`
  visible and transition-less under the media query (which also covers a
  visitor mid-hydration), and the effect reveals immediately instead of waiting
  for a scroll. The rest of B3 belongs to Task 14.

**Protected test added**

`every section ends up with a revealed element at opacity > 0` — Playwright
counts an `opacity: 0` element as visible, so a page whose reveals never fire
renders blank and still passes every other assertion in the suite. The test
reads computed opacity per section, and first asserts that `#contact` starts at
0, so a build where Tailwind purged `.reveal` entirely cannot pass either. Do
not weaken it to `toBeVisible()`.

**Build status**

`npx tsc --noEmit` clean · `npm run lint` 0 errors, 1 pre-existing warning
(`ThemeProvider` set-state-in-effect, that is B4, fixed in Task 14) ·
`npm run build` passes, three routes still SSG · `npm run test:e2e` 48/48 pass.

**Known gap, not a regression**

With JavaScript disabled, `.reveal` stays at `opacity: 0` outside the
reduced-motion query, so the page renders blank for that visitor. Same for a
hydration failure. Worth closing with a `<noscript>` rule; carried into Task 11.

**Next:** Task 11 — defer paint for below-the-fold sections.
