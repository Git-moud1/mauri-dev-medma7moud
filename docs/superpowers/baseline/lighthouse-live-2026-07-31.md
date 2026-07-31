# Lighthouse — live site after plan 3, 2026-07-31

Measured against `https://medmoudsite.netlify.app` **after `main` was merged and
deployed at `1209017`** — the first production deploy of the v2 architecture
(locale routes, tubes hero, six-project preview, the SEO surface).

Same method as the 2026-07-28 baseline, so the two are comparable: Lighthouse
13.x, mobile form factor, simulated throttling, headless Chrome. Three runs on
`/ar`, one on `/en`.

```bash
npx -y lighthouse https://medmoudsite.netlify.app/ar \
  --form-factor=mobile --screenEmulation.mobile \
  --throttling-method=simulate --output=json \
  --output-path=./docs/superpowers/baseline/lh-plan3-ar-run1.json \
  --chrome-flags="--headless=new --no-sandbox" --quiet
```

The CLI exits non-zero on Windows with `EPERM ... Temp\lighthouse.*` while
deleting its temp profile. That happens **after** the report is written; the
JSON is complete. Do not read it as a failed run.

## Scores

| Category       | Target | v1 live (07-28) | v2 live `/ar` | v2 live `/en` |
| -------------- | ------ | --------------- | ------------- | ------------- |
| Performance    | >= 95  | 96              | **61-63**     | **61**        |
| Accessibility  | >= 95  | 100             | 100           | 100           |
| Best Practices | >= 95  | 96              | **100**       | **100**       |
| SEO            | 100    | 100             | **100**       | **100**       |

| Metric | Target   | v1 live | v2 `/ar` (3 runs)   | v2 `/en` |
| ------ | -------- | ------- | ------------------- | -------- |
| LCP    | < 2.0 s  | 2.7 s   | 2.7 s               | 2.8 s    |
| CLS    | < 0.05   | 0       | 0.001               | 0        |
| TBT    | < 200 ms | 40 ms   | **3,360-3,890 ms**  | 3,990 ms |
| FCP    | —        | 1.1 s   | 1.6-1.9 s           | —        |

Raw reports: `lh-plan3-ar-run{1,2,3}.json`, `lh-plan3-en-run1.json`
(git-ignored — regenerate with the command above).

## The one regression, and what it is

**SEO is 100 and Best Practices went 96 to 100.** Accessibility held at 100.
Those are the plan-3 targets and they are met on the live site.

**Performance fell 96 to 61, and all of it is Total Blocking Time.** LCP and CLS
are unchanged; TBT went from 40 ms to ~3.6 s, which is ninety times the budget.

It is the tubes hero, attributed by Lighthouse rather than guessed:

- `/_next/static/chunks/2ozfefydyz1ku.js` — **762 KB**, 5,843 ms of scripting,
  6,291 ms total bootup, the largest entry by an order of magnitude. Fetching it
  and grepping finds `WebGLRenderer` and `BufferGeometry`: it is
  `threejs-components` and the three.js it carries.
- Long tasks of 927 ms, 778 ms, 482 ms and 480 ms, all on hydration chunks.

This is the cost class MIGRATION.md §12 already recorded for a 3D hero — A2
(three.js mesh) measured +1,365 ms TBT and A3 (`three/webgpu`) +2,347 ms on the
deploy preview, which is why both were withdrawn. The tubes hero is the same
purchase, made again, and on production hardware emulation it is worse than
either.

`next/dynamic` is doing its job — first-load JS is unaffected and the canvas is
code-split — but a dynamic import still executes on the main thread once it
lands. Splitting moves the cost; it does not remove it.

## What has to be decided

The hero is the owner's own design decision, taken after three other concepts
were withdrawn, so this is a report and not a change. The options, cheapest
first:

1. **Gate the canvas on capability.** Render it only for `(pointer: fine)` and a
   viewport above the mobile breakpoint. Lighthouse's mobile run — and most real
   phone visits — would then never load the chunk, and desktop keeps the effect.
   The gate belongs in `HeroTubes.tsx`, next to the reduced-motion decision it
   already makes.
2. **Defer it past interaction.** Mount the canvas on `requestIdleCallback` or
   after first scroll, so the main thread is free while the page becomes usable.
   Cheaper, less effective: a phone still eventually pays 5.8 s of scripting.
3. **Drop the tubes.** Returns performance to the v1 numbers, and MIGRATION.md
   §12's cost table says any replacement in this class buys the same bill.

LCP at 2.7 s is a separate, older miss — it was 2.7 s before this work too, and
it is not a plan-3 regression.
